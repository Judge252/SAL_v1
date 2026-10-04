const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
  const response = await fetch(
    `${url}/rest/v1/clinic_specialties?select=id&limit=1`,
    {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000),
    },
  );
  console.log(`Supabase catalogue: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
} catch {
  console.log("Supabase: network unavailable");
  process.exitCode = 1;
}

// A model can still appear in discovery after access is withdrawn. Probe an
// actual small generation, without sending any patient data or logging keys.
for (const model of [
  process.env.AI_MODEL || "gemini-3.8-flash",
  process.env.AI_FALLBACK_MODEL || "gemini-3.5-flash-lite",
]) {
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    console.log("Invalid model configuration");
    process.exitCode = 1;
    continue;
  }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with the word ready." }] }],
          generationConfig: {
            maxOutputTokens: 128,
            thinkingConfig: model.startsWith("gemini-2.")
              ? { thinkingBudget: 0 }
              : { thinkingLevel: model.includes("lite") ? "minimal" : "low" },
          },
        }),
        signal: AbortSignal.timeout(25000),
      },
    );
    const payload = await response.json();
    const ready =
      response.ok &&
      !!payload.candidates?.[0]?.content?.parts?.some(
        (part) => part.text && !part.thought,
      );
    console.log(
      `Gemini ${model}: HTTP ${response.status}; response ${ready ? "received" : "unavailable"}`,
    );
    if (!ready) process.exitCode = 1;
  } catch {
    console.log(`Gemini ${model}: network unavailable`);
    process.exitCode = 1;
  }
}

// Exercise a real ephemeral-token Live connection and audio response. Never log
// token values, prompts, captions, or audio. This is synthetic provider health data.
const liveModel = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
let session;
let finished = false;
let timer;
try {
  const { GoogleGenAI, Modality } = await import("@google/genai");
  const server = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { apiVersion: "v1beta", timeout: 20000 },
  });
  const token = await server.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(Date.now() + 60000).toISOString(),
      expireTime: new Date(Date.now() + 5 * 60000).toISOString(),
      liveConnectConstraints: {
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: "Reply briefly to a synthetic connectivity check.",
        },
      },
    },
  });
  if (!token.name) throw new Error("LIVE_UNAVAILABLE");
  const client = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: "v1beta" },
  });
  let audioBytes = 0;
  let transcript = false;
  const response = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("LIVE_TIMEOUT")), 25000);
    void client.live
      .connect({
        model: liveModel,
        callbacks: {
          onmessage: (message) => {
            const content = message.serverContent;
            if (content?.outputTranscription?.text) transcript = true;
            for (const part of content?.modelTurn?.parts || []) {
              if (
                part.inlineData?.mimeType?.startsWith("audio/pcm") &&
                part.inlineData.data
              )
                audioBytes += Buffer.from(
                  part.inlineData.data,
                  "base64",
                ).byteLength;
            }
            if (content?.turnComplete) {
              if (audioBytes && transcript) resolve(audioBytes);
              else reject(new Error("LIVE_EMPTY_RESPONSE"));
            }
          },
          onerror: () => reject(new Error("LIVE_UNAVAILABLE")),
          onclose: () => {
            if (!finished) reject(new Error("LIVE_DISCONNECTED"));
          },
        },
      })
      .then((socket) => {
        session = socket;
        if (finished) socket.close();
        else socket.sendRealtimeInput({ text: "Please say ready." });
      })
      .catch(() => reject(new Error("LIVE_UNAVAILABLE")));
  });
  const bytes = await response;
  console.log(
    `Gemini Live ${liveModel}: ephemeral connection, transcription and ${bytes} PCM audio bytes received`,
  );
} catch {
  console.log(`Gemini Live ${liveModel}: unavailable`);
  process.exitCode = 1;
} finally {
  finished = true;
  clearTimeout(timer);
  session?.close();
}
