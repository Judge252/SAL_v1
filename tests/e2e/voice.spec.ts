import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3000";

// Only the microphone source is synthetic. All SDK connections, provider
// transcription/audio, tool requests, database rows and playback are real.
type Harness = {
  nativeCalls: number;
  contexts: AudioContext[];
  streams: MediaStream[];
  sources: AudioBufferSourceNode[];
  sockets: WebSocket[];
  speak: (name: string) => Promise<void>;
  silence: () => void;
};
declare global {
  interface Window {
    voiceTest: Harness;
  }
}
test.use({
  launchOptions: {
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

async function rememberSession(id: string) {
  const f = JSON.parse(await readFile("work/e2e-fixtures.json", "utf8"));
  f.guestSessionIds.push(id);
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
}
async function microphoneHarness(page: Page) {
  const fixtures: Record<string, string> = {};
  for (const name of [
    "speech-en",
    "interrupt-en",
    "speech-ar",
    "urgent-en",
    "context-en",
  ])
    fixtures[name] = (await readFile(`tests/fixtures/${name}.wav`)).toString(
      "base64",
    );
  await page.addInitScript(
    ({ fixtures }) => {
      const Audio = window.AudioContext;
      const h: Harness = {
        nativeCalls: 0,
        contexts: [],
        streams: [],
        sources: [],
        sockets: [],
        speak: async () => {},
        silence: () => {},
      };
      window.voiceTest = h;
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          if (
            String(url).startsWith("wss://generativelanguage.googleapis.com/")
          )
            h.sockets.push(this);
        }
      };
      window.AudioContext = class extends Audio {
        constructor(options?: AudioContextOptions) {
          super(options);
          h.contexts.push(this);
        }
      };
      const getMedia = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        h.nativeCalls++;
        const bridge = new AudioContext();
        const resumed = bridge.resume();
        const native = await getMedia(constraints);
        await resumed;
        const destination = bridge.createMediaStreamDestination();
        h.streams.push(native, destination.stream);
        for (const track of destination.stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            native.getTracks().forEach((t) => t.stop());
            void bridge.close();
          };
        }
        h.silence = () => {
          for (const source of h.sources) {
            try {
              source.stop();
            } catch {}
          }
          h.sources = [];
        };
        h.speak = async (name) => {
          h.silence();
          const binary = atob(fixtures[name]);
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          const buffer = await bridge.decodeAudioData(bytes.buffer);
          const source = bridge.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          h.sources.push(source);
          source.start();
        };
        return destination.stream;
      };
    },
    { fixtures },
  );
}
function watchLive(page: Page) {
  const protocol: { at: number; event: string }[] = [];
  const started = Date.now();
  const mark = (event: string) =>
    protocol.push({ at: Date.now() - started, event });
  const stats = {
    setup: 0,
    input: 0,
    output: 0,
    audio: 0,
    inputChunks: 0,
    tools: 0,
    interrupted: 0,
    closed: 0,
    resumed: 0,
    urgentSpeech: false,
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith("wss://generativelanguage.googleapis.com/"))
      return;
    socket.on("framereceived", (frame) => {
      try {
        const body = JSON.parse(frame.payload.toString());
        const content = body.serverContent || body.server_content;
        if (body.setupComplete || body.setup_complete) {
          stats.setup++;
          mark("setup");
        }
        if (
          body.sessionResumptionUpdate?.resumable ||
          body.session_resumption_update?.resumable
        )
          stats.resumed++;
        if (
          content?.inputTranscription?.text ||
          content?.input_transcription?.text
        )
          stats.input++;
        const spoken =
          content?.outputTranscription?.text ||
          content?.output_transcription?.text;
        if (spoken) {
          stats.output++;
          if (/emergency|urgent medical|طوارئ|طارئة/i.test(spoken))
            stats.urgentSpeech = true;
        }
        for (const part of content?.modelTurn?.parts ||
          content?.model_turn?.parts ||
          [])
          if (part.inlineData?.data || part.inline_data?.data) stats.audio++;
        if (content?.interrupted) stats.interrupted++;
        if (body.toolCall || body.tool_call) {
          stats.tools++;
          for (const call of (body.toolCall || body.tool_call).functionCalls ||
            [])
            mark(`tool:${call.name}`);
        }
        if (body.toolCallCancellation || body.tool_call_cancellation)
          mark("tool-cancel");
        if (content?.interrupted) mark("interrupted");
        if (content?.turnComplete || content?.turn_complete)
          mark("turn-complete");
      } catch {}
    });
    socket.on("framesent", (frame) => {
      try {
        const body = JSON.parse(frame.payload.toString());
        if (body.realtimeInput?.audio || body.realtime_input?.audio)
          stats.inputChunks++;
        if (body.realtimeInput?.text || body.realtime_input?.text)
          mark("text-sent");
        if (
          body.realtimeInput?.audioStreamEnd ||
          body.realtime_input?.audio_stream_end
        )
          mark("audio-end");
        if (body.toolResponse || body.tool_response) mark("tool-response-sent");
      } catch {}
    });
    socket.on("close", () => {
      stats.closed++;
      mark("closed");
    });
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/sal/")) mark(`${path}:${response.status()}`);
  });
  return { stats, errors, protocol };
}
async function startCall(page: Page, locale = "en") {
  const bootResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/sal/live-session"),
  );
  const tokenResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/sal/live-token"),
  );
  await page
    .getByRole("button", {
      name: locale === "ar" ? "تحدث مع سال" : "Talk to SAL",
      exact: true,
    })
    .click();
  const boot = await bootResponse;
  expect(boot.status()).toBe(200);
  const id = (await boot.json()).sessionId;
  await rememberSession(id);
  const response = await tokenResponse;
  expect(response.status()).toBe(200);
  expect(Object.keys(await response.json())).toEqual(["token"]);
  await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
    "data-live-connected",
    "true",
    { timeout: 35000 },
  );
  expect(new URL(page.url()).searchParams.get("session")).toBe(id);
  return id;
}

test("Live voice: actual microphone PCM, transcripts, playback, speech interruption, real tools, context and booking", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await microphoneHarness(page);
  const { stats, errors, protocol } = watchLive(page);
  const searches: { doctors: { specialties: { slug: string }[] }[] }[] = [];
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/sal/live-tools") &&
      response.request().postDataJSON().call.name === "find_doctors" &&
      response.ok()
    )
      searches.push(await response.json());
  });
  await page.goto("/");
  await expect(page.locator(".voice-mascot img")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your message to SAL" }),
  ).toHaveCount(0);
  const id = await startCall(page);
  expect(await page.evaluate(() => window.voiceTest.nativeCalls)).toBe(1);
  await expect.poll(() => stats.audio, { timeout: 35000 }).toBeGreaterThan(0);
  await expect.poll(() => stats.output).toBeGreaterThan(0);
  await expect(page.locator(".voice-caption-sal")).toContainText(
    /SAL|help|bother|feel/i,
  );
  await page.getByRole("button", { name: "Captions", exact: true }).click();
  await expect(page.locator(".voice-captions")).toHaveCount(0);
  await page.getByRole("button", { name: "Captions", exact: true }).click();
  await expect(page.locator(".voice-captions")).toBeVisible();
  await page.evaluate(() => window.voiceTest.speak("speech-en"));
  await expect.poll(() => stats.input, { timeout: 45000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page
          .locator(".sal-voice-experience")
          .evaluate((el) =>
            Number((el as HTMLElement).style.getPropertyValue("--user-level")),
          ),
      { timeout: 10000 },
    )
    .toBeGreaterThan(0.01);
  await expect(page.locator(".voice-caption-user")).toContainText(
    /routine appointment/i,
    { timeout: 40000 },
  );
  await page.evaluate(() => window.voiceTest.silence());
  await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
    "data-voice-state",
    "speaking",
    { timeout: 30000 },
  );
  const oldInterruption = stats.interrupted;
  await page.evaluate(() => window.voiceTest.speak("interrupt-en"));
  await expect
    .poll(() => stats.interrupted, { timeout: 25000 })
    .toBeGreaterThan(oldInterruption);
  await expect(page.locator(".voice-caption-user")).toContainText(
    /after meals/i,
    { timeout: 25000 },
  );
  await page.evaluate(() => window.voiceTest.silence());
  await page
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
    "data-mic-muted",
    "true",
  );
  await page.locator(".voice-text-toggle").click();
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill(
      "There are no other symptoms. Please show gastroenterology profiles from your directory in Cairo. Clearly label any demo profiles. Use your doctor search tool.",
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(
      () =>
        searches.some((result) =>
          result.doctors.some((d) =>
            d.specialties.some((s) => s.slug === "gastroenterology"),
          ),
        ),
      { timeout: 45000 },
    )
    .toBe(true)
    .catch(async (error) => {
      await writeFile(
        "work/voice-protocol-metadata.json",
        JSON.stringify({ stats, protocol }, null, 2),
      );
      throw error;
    });
  const data = searches.find((result) =>
    result.doctors.some((d) =>
      d.specialties.some((s) => s.slug === "gastroenterology"),
    ),
  )!;
  expect(data.doctors.length).toBeGreaterThan(0);
  expect(
    data.doctors.every((d: { specialties: { slug: string }[] }) =>
      d.specialties.some((s) => s.slug === "gastroenterology"),
    ),
  ).toBe(true);
  await expect(
    page.locator(".voice-recommendations .doctor-card").first(),
  ).toBeVisible();
  await expect(page.locator(".voice-recommendations")).toContainText(
    "Demo profile",
  );
  expect(stats.tools).toBeGreaterThan(0);
  expect(stats.inputChunks).toBeGreaterThan(0);
  await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
    "data-live-connected",
    "true",
  );
  const before = stats.output;
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill(
      "How long have I told you the discomfort has lasted? Please answer using our conversation.",
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(() => stats.output, { timeout: 30000 })
    .toBeGreaterThan(before);
  await expect(page.locator(".voice-caption-sal")).toContainText(
    /two weeks|2 weeks/i,
    { timeout: 30000 },
  );
  await page
    .getByRole("button", { name: "Unmute microphone", exact: true })
    .click();
  expect(await page.evaluate(() => window.voiceTest.nativeCalls)).toBe(1);
  await expect.poll(() => stats.resumed, { timeout: 20000 }).toBeGreaterThan(0);
  const setups = stats.setup;
  await page.evaluate(() => window.voiceTest.sockets.at(-1)!.close());
  await expect
    .poll(() => stats.setup, { timeout: 35000 })
    .toBeGreaterThan(setups);
  await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
    "data-live-connected",
    "true",
  );
  expect(new URL(page.url()).searchParams.get("session")).toBe(id);
  expect(await page.evaluate(() => window.voiceTest.nativeCalls)).toBe(1);
  await page.evaluate(() => window.voiceTest.speak("context-en"));
  await expect(page.locator(".voice-caption-user")).toContainText(
    /makes it worse/i,
    { timeout: 20000 },
  );
  await page.evaluate(() => window.voiceTest.silence());
  await expect(page.locator(".voice-caption-sal")).toContainText(
    /two weeks|2 weeks/i,
    { timeout: 30000 },
  );
  await expect(page.locator(".voice-caption-sal")).toContainText(
    /after meals|after eating/i,
    { timeout: 30000 },
  );
  await expect
    .poll(
      async () => {
        const response = await context.request.get(`/api/sal/sessions/${id}`);
        const body = await response.json();
        return body.messages.filter((m: { role: string }) => m.role === "user")
          .length;
      },
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(3);
  const saved = await (
    await context.request.get(`/api/sal/sessions/${id}`)
  ).json();
  expect(saved.messages.length).toBeLessThanOrEqual(20);
  expect(
    new Set(
      saved.messages.map(
        (m: { request_id: string; role: string }) =>
          `${m.request_id}:${m.role}`,
      ),
    ).size,
  ).toBe(saved.messages.length);
  await page.screenshot({
    path: "work/voice-live-recommendations.png",
    fullPage: true,
  });
  const book = page
    .locator(".voice-recommendations a[href^='/booking/']")
    .first();
  await book.click();
  await expect(page).toHaveURL(/\/booking\//);
  await expect(page.locator(".time-option").first()).toBeVisible();
  await expect.poll(() => stats.closed).toBeGreaterThan(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.voiceTest.streams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ) && window.voiceTest.contexts.every((c) => c.state === "closed"),
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
  await writeFile(
    "work/voice-protocol-metadata.json",
    JSON.stringify({ stats, protocol }, null, 2),
  );
});

test("Arabic microphone speech returns actual Arabic audio/captions in RTL and stops tracks/contexts on end", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await microphoneHarness(page);
  const { stats, errors } = watchLive(page);
  await context.addCookies([
    { name: "clinic-locale", value: "ar", url: origin },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sal");
  await startCall(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect.poll(() => stats.audio, { timeout: 30000 }).toBeGreaterThan(0);
  await expect(page.locator(".voice-caption-sal")).toContainText(
    /[\u0600-\u06ff]/,
  );
  await page.evaluate(() => window.voiceTest.speak("speech-ar"));
  await expect(page.locator(".voice-caption-user")).toContainText(
    /معد|أكل|اكل|أسبوع|اسبوع/,
    { timeout: 50000 },
  );
  await page.evaluate(() => window.voiceTest.silence());
  const audioBefore = stats.audio;
  await expect
    .poll(() => stats.audio, { timeout: 30000 })
    .toBeGreaterThan(audioBefore);
  await page.screenshot({ path: "work/voice-live-arabic.png", fullPage: true });
  await page
    .getByRole("button", { name: "إنهاء الاتصال", exact: true })
    .click();
  await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
    "data-voice-state",
    "ended",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.voiceTest.streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.voiceTest.contexts.every((c) => c.state === "closed"),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("granted site permission with system-blocked capture offers browser recovery in both languages", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"], { origin });
  await microphoneHarness(page);
  const { errors } = watchLive(page);
  let liveRequests = 0;
  page.on("request", (r) => {
    if (/\/api\/sal\/live-(session|token)$/.test(r.url())) liveRequests++;
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied by system", "NotAllowedError");
    };
  });
  for (const locale of ["en", "ar"] as const) {
    await context.addCookies([
      { name: "clinic-locale", value: locale, url: origin },
    ]);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/sal");
    expect(
      await page.evaluate(
        async () =>
          (
            await navigator.permissions.query({
              name: "microphone" as PermissionName,
            })
          ).state,
      ),
    ).toBe("granted");
    await page
      .getByRole("button", {
        name: locale === "en" ? "Talk to SAL" : "تحدث مع سال",
        exact: true,
      })
      .click();
    await expect(page.locator(".voice-error[role=alert]")).toContainText(
      locale === "en"
        ? "Open SAL in your regular browser"
        : "افتح سال في متصفحك المعتاد",
    );
    await expect(
      page.getByRole("textbox", {
        name: locale === "en" ? "Your message to SAL" : "رسالتك إلى سال",
      }),
    ).toBeEnabled();
    await expect(page.locator(".sal-voice-experience")).toHaveAttribute(
      "data-voice-state",
      "error",
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.voiceTest.contexts.every((c) => c.state === "closed"),
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(liveRequests).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "work/microphone-system-blocked-ar.png",
    fullPage: true,
  });
});

test("audio-processing SecurityError after microphone grant releases capture without blaming permission", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"], { origin });
  await microphoneHarness(page);
  const { errors } = watchLive(page);
  let liveRequests = 0;
  page.on("request", (r) => {
    if (/\/api\/sal\/live-(session|token)$/.test(r.url())) liveRequests++;
  });
  await page.addInitScript(() => {
    AudioWorklet.prototype.addModule = async () => {
      throw new DOMException("Audio processing blocked", "SecurityError");
    };
  });
  await page.goto("/sal");
  await page.getByRole("button", { name: "Talk to SAL", exact: true }).click();
  await expect(page.locator(".voice-error[role=alert]")).toContainText(
    "We couldn’t start audio capture",
  );
  await expect(page.locator(".voice-error[role=alert]")).not.toContainText(
    "permission",
  );
  await expect(
    page.getByRole("textbox", { name: "Your message to SAL" }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.voiceTest.nativeCalls)).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.voiceTest.streams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ) && window.voiceTest.contexts.every((c) => c.state === "closed"),
      ),
    )
    .toBe(true);
  expect(liveRequests).toBe(0);
  expect(errors).toEqual([]);
});

test("microphone denial falls back to real text and voice retry retains its context", async ({
  page,
}) => {
  test.setTimeout(120000);
  await microphoneHarness(page);
  const { stats, errors } = watchLive(page);
  let tokens = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/sal/live-token")) tokens++;
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const queryPermission = navigator.permissions.query.bind(
      navigator.permissions,
    );
    let denied = false;
    navigator.permissions.query = async (descriptor) => {
      if (descriptor.name === ("microphone" as PermissionName) && denied)
        return { state: "denied" } as PermissionStatus;
      return queryPermission(descriptor);
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!denied) {
        denied = true;
        throw new DOMException("Denied", "NotAllowedError");
      }
      return original(constraints);
    };
  });
  await page.goto("/sal");
  await page.getByRole("button", { name: "Talk to SAL", exact: true }).click();
  await expect(page.locator(".voice-error[role=alert]")).toContainText(
    "Microphone access is blocked",
  );
  await expect(
    page.getByRole("textbox", { name: "Your message to SAL" }),
  ).toBeVisible();
  expect(tokens).toBe(0);
  const reply = page.waitForResponse((r) =>
    r.url().endsWith("/api/sal/message"),
  );
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill(
      "I have mild knee discomfort for three days without any injury. Which specialty may be appropriate?",
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const response = await reply;
  expect(response.status()).toBe(200);
  const previousId = (await response.json()).sessionId;
  await expect(page.locator(".voice-caption-sal")).not.toBeEmpty();
  const voiceId = await startCall(page);
  expect(voiceId).toBe(previousId);
  await expect.poll(() => stats.audio, { timeout: 30000 }).toBeGreaterThan(0);
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill("How many days have I already said my knee discomfort has lasted?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".voice-caption-sal")).toContainText(
    /three days|3 days/i,
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "End call", exact: true }).click();
  expect(errors).toEqual([]);
});

test("voice endpoints enforce origins, session ownership, tool schemas and idempotent finalized turns", async ({
  context,
  browser,
}) => {
  const boot = await context.request.post("/api/sal/live-session", {
    headers: { Origin: origin },
    data: { requestId: randomUUID(), locale: "en" },
  });
  expect(boot.status()).toBe(200);
  const { sessionId } = await boot.json();
  await rememberSession(sessionId);
  const stranger = await browser.newContext();
  for (const route of ["live-token", "live-tools", "live-turns"]) {
    const body =
      route === "live-tools"
        ? {
            call: {
              name: "find_doctors",
              args: { specialty: "general-practice" },
            },
          }
        : route === "live-turns"
          ? {
              turns: [
                { requestId: randomUUID(), role: "user", content: "test" },
              ],
            }
          : {};
    expect(
      (
        await stranger.request.post(`${origin}/api/sal/${route}`, {
          headers: { Origin: origin },
          data: { sessionId, locale: "en", ...body },
        })
      ).status(),
    ).toBe(404);
  }
  await stranger.close();
  expect(
    (
      await context.request.post("/api/sal/live-token", {
        headers: { Origin: "https://evil.example" },
        data: { sessionId, locale: "en" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/sal/live-tools", {
        headers: { Origin: origin },
        data: {
          sessionId,
          locale: "en",
          call: {
            name: "find_doctors",
            args: { specialty: "general-practice", privileged: true },
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.post("/api/sal/live-tools", {
        headers: { Origin: origin },
        data: {
          sessionId,
          locale: "en",
          call: {
            name: "get_doctor_details",
            args: { doctorId: randomUUID() },
          },
        },
      })
    ).status(),
  ).toBe(404);
  const requestId = randomUUID();
  const body = {
    sessionId,
    locale: "en",
    turns: [
      {
        requestId,
        role: "user",
        content: "A finalized software verification transcript.",
      },
    ],
  };
  for (let i = 0; i < 2; i++)
    expect(
      (
        await context.request.post("/api/sal/live-turns", {
          headers: { Origin: origin },
          data: body,
        })
      ).status(),
    ).toBe(200);
  const saved = await (
    await context.request.get(`/api/sal/sessions/${sessionId}`)
  ).json();
  expect(saved.messages).toHaveLength(1);
  expect(saved.messages[0].request_id).toBe(requestId);
});

test("urgent voice symptoms show and speak emergency guidance and suppress doctor recommendations", async ({
  page,
}) => {
  test.setTimeout(120000);
  await microphoneHarness(page);
  const { stats, errors } = watchLive(page);
  await page.goto("/");
  const id = await startCall(page);
  await expect.poll(() => stats.audio, { timeout: 30000 }).toBeGreaterThan(0);
  await page.evaluate(() => window.voiceTest.speak("urgent-en"));
  await expect(page.locator(".voice-urgent")).toBeVisible({ timeout: 35000 });
  expect((await page.locator(".voice-urgent").boundingBox())!.y).toBeLessThan(
    400,
  );
  await expect(page.locator(".journey-strip")).toBeHidden();
  await expect(
    page.locator("main > section .doctor-card").first(),
  ).toBeHidden();
  await page.evaluate(() => window.voiceTest.silence());
  await expect(page.locator(".voice-caption-sal")).toHaveCount(0);
  await expect(page.locator(".voice-recommendations")).toHaveCount(0);
  await expect.poll(() => stats.urgentSpeech, { timeout: 30000 }).toBe(true);
  await expect
    .poll(
      async () =>
        (
          await (
            await page.context().request.get(`/api/sal/sessions/${id}`)
          ).json()
        ).messages.some(
          (m: { structured_data?: { safety?: { urgent: boolean } } }) =>
            m.structured_data?.safety?.urgent,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.getByRole("button", { name: "End call", exact: true }).click();
  await page.screenshot({
    path: "work/voice-urgent-production.png",
    fullPage: false,
  });
  expect(errors).toEqual([]);
});
