import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { doctorProfileInput } from "../../lib/validation/management";
const origin = "http://127.0.0.1:3000";
async function fixture() {
  return JSON.parse(await readFile("work/e2e-fixtures.json", "utf8")) as {
    run: string;
    users: Record<
      string,
      { id: string; email: string; password: string; name: string }
    >;
    doctorId: string;
    guestSessionIds: string[];
    initialRequestIds?: string[];
    extraDoctorIds?: string[];
    extraSpecialtySlugs?: string[];
    extraDocumentIds?: string[];
  };
}
async function admin() {
  const rows = (await readFile(".env", "utf8")).split(/\r?\n/),
    env: Record<string, string> = {};
  for (const row of rows) {
    const m = row.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function login(context: BrowserContext, role = "patient") {
  const f = await fixture(),
    user = f.users[role];
  const r = await context.request.post("/api/auth", {
    headers: { Origin: origin },
    data: { mode: "login", email: user.email, password: user.password },
  });
  expect(r.status()).toBe(200);
}
function monitor(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
test("security: oversized JSON is rejected before changing locale", async ({
  context,
}) => {
  const response = await context.request.post("/api/locale", {
    headers: { Origin: origin },
    data: { locale: "ar", padding: "x".repeat(48000) },
  });
  expect(response.status()).toBe(413);
  expect((await response.json()).error).toBe("INPUT_TOO_LARGE");
});

test("security: private doctor account links stay hidden while doctor edits and patient appointments work", async ({
  page,
  context,
}) => {
  const errors = monitor(page),
    f = await fixture(),
    db = await admin();
  const { data: doctor, error } = await db
    .from("clinic_doctors")
    .select("*")
    .eq("id", f.doctorId)
    .single();
  expect(error).toBeNull();
  await login(context, "doctor");
  const updatedBio = "Fictional profile updated during security verification.";
  const edited = await context.request.post("/api/doctor", {
    headers: { Origin: origin },
    data: {
      action: "profile.update",
      data: doctorProfileInput.parse({ ...doctor, bio: updatedBio }),
    },
  });
  expect(edited.status()).toBe(200);
  expect(
    (
      await db
        .from("clinic_doctors")
        .select("bio")
        .eq("id", f.doctorId)
        .single()
    ).data?.bio,
  ).toBe(updatedBio);
  const start_at = new Date(Date.now() + 5 * 86400000).toISOString();
  const end_at = new Date(Date.parse(start_at) + 1800000).toISOString();
  const added = await context.request.post("/api/doctor", {
    headers: { Origin: origin },
    data: {
      action: "availability.add",
      data: { start_at, end_at, consultation_type: "in_person" },
    },
  });
  expect(added.status()).toBe(200);
  const { data: slot } = await db
    .from("clinic_doctor_availability")
    .select("id")
    .eq("doctor_id", f.doctorId)
    .eq("start_at", start_at)
    .single();
  expect(slot).not.toBeNull();
  await context.clearCookies();
  await login(context);
  const booked = await context.request.post("/api/appointments", {
    headers: { Origin: origin },
    data: {
      slotId: slot!.id,
      reason: "Fictional security verification appointment.",
    },
  });
  expect(booked.status()).toBe(201);
  const appointmentId = (await booked.json()).appointment.id;
  await page.goto("/patient");
  await expect(page.locator("body")).toContainText(doctor!.name);
  expect(await page.content()).not.toContain(f.users.doctor.id);
  await page.goto(`/patient/appointments/${appointmentId}`);
  await expect(page.locator("body")).toContainText(doctor!.name);
  expect(await page.content()).not.toContain(f.users.doctor.id);
  expect(errors).toEqual([]);
});

for (const locale of ["en", "ar"] as const)
  test(`booking recovery: failed availability reload clears stale slots (${locale})`, async ({
    page,
    context,
  }) => {
    const errors = monitor(page),
      f = await fixture(),
      db = await admin();
    const { data: doctor } = await db
      .from("clinic_doctors")
      .select("slug")
      .eq("id", f.doctorId)
      .single();
    const start_at = new Date(
      Date.now() + (locale === "ar" ? 9 : 8) * 86400000,
    ).toISOString();
    const end_at = new Date(Date.parse(start_at) + 1800000).toISOString();
    const { data: slot, error } = await db
      .from("clinic_doctor_availability")
      .insert({
        doctor_id: f.doctorId,
        start_at,
        end_at,
        consultation_type: "in_person",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    await login(context);
    expect(
      (
        await context.request.post("/api/locale", {
          headers: { Origin: origin },
          data: { locale },
        })
      ).status(),
    ).toBe(200);
    await page.route("**/api/appointments", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "SLOT_UNAVAILABLE" }),
      }),
    );
    await page.route(`**/api/doctors/${f.doctorId}/availability`, (route) =>
      route.abort("failed"),
    );
    await page.goto(`/booking/${doctor!.slug}?slot=${slot!.id}`);
    await page
      .getByLabel(
        locale === "ar"
          ? "ما الذي تودّ مناقشته مع الطبيب؟"
          : "What would you like help with?",
        { exact: true },
      )
      .fill("Fictional failure-recovery test.");
    await page
      .getByRole("button", {
        name: locale === "ar" ? "متابعة" : "Continue",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: locale === "ar" ? "أكّد الموعد" : "Confirm appointment",
        exact: true,
      })
      .click();
    await expect(page.locator('.error-notice[role="alert"]')).toContainText(
      locale === "ar" ? "حدّث الصفحة" : "Refresh this page",
    );
    await expect(page.locator(".time-option")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: locale === "ar" ? "متابعة" : "Continue",
        exact: true,
      }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
    await page.unroute("**/api/appointments");
    await page.unroute(`**/api/doctors/${f.doctorId}/availability`);
    await page.reload();
    await expect(
      page.getByLabel(
        locale === "ar"
          ? "ما الذي تودّ مناقشته مع الطبيب؟"
          : "What would you like help with?",
        { exact: true },
      ),
    ).toBeVisible();
  });

test("guest starts a real SAL conversation, resumes booking after login, and finds it in their care space", async ({
  page,
  context,
  browser,
}) => {
  const errors = monitor(page),
    f = await fixture(),
    db = await admin();
  await page.goto("/");
  await page.locator(".voice-text-toggle").click();
  await page
    .getByRole("textbox", { name: "Your message to SAL", exact: true })
    .fill(
      "I am 30. For two weeks I have a small itchy, dry patch on my forearm. It is not spreading, I have no fever or severe pain, and I am otherwise well. What kind of doctor may be suitable?",
    );
  const firstPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/sal/message") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const first = await firstPromise;
  f.initialRequestIds = [
    ...(f.initialRequestIds || []),
    first.request().postDataJSON().requestId,
  ];
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  const body = await first.json();
  expect(
    first.status(),
    `SAL HTTP ${first.status()}: ${body.error || ""}`,
  ).toBe(200);
  f.guestSessionIds.push(body.sessionId);
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  await expect(page).toHaveURL(/session=/);
  await expect(page.locator(".sal-message").last()).toBeVisible();
  let answer = body.message.structured_data;
  for (let turn = 0; turn < 3 && answer.stage !== "recommendation"; turn++) {
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/sal/message") && r.request().method() === "POST",
    );
    await page
      .getByRole("textbox", { name: "Your message to SAL" })
      .fill(
        turn === 0
          ? "It is a coin-sized dry red patch on my forearm, mildly itchy, with no blisters, discharge, pain, swelling, or fever. I take no medicines and have no known conditions. No new products or exposures. I would like a routine professional evaluation."
          : "There are no other symptoms or changes. It has persisted for two weeks. Please suggest an appropriate care specialty and show the matching doctors available in your directory.",
      );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    answer = (await response.json()).message.structured_data;
  }
  expect(answer.stage).toBe("recommendation");
  expect(answer.doctors.length).toBeGreaterThan(0);
  const { data: directory } = await db.from("clinic_doctors").select("id");
  expect(
    answer.recommendedDoctorIds.every((id: string) =>
      directory!.some((d) => d.id === id),
    ),
  ).toBe(true);
  const own = await context.request.get(`/api/sal/sessions/${body.sessionId}`);
  expect(own.status()).toBe(200);
  const stranger = await browser.newContext();
  expect(
    (
      await stranger.request.get(`${origin}/api/sal/sessions/${body.sessionId}`)
    ).status(),
  ).toBe(404);
  await stranger.close();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "work/sal-live.png", fullPage: true });
  let bookable: { slug: string } | undefined;
  for (const doctor of answer.doctors) {
    const { data: times, error } = await db.rpc("clinic_available_slots", {
      p_doctor: doctor.id,
    });
    expect(error).toBeNull();
    if (times?.length) {
      bookable = doctor;
      break;
    }
  }
  expect(
    bookable,
    "At least one recommended doctor has real availability",
  ).toBeDefined();
  await page
    .locator(`.sal-recommendations a[href="/booking/${bookable!.slug}"]`)
    .last()
    .click();
  await expect(page.locator(".time-option").first()).toBeVisible();
  await page.locator(".time-option").first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?next=/);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(f.users.patient.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(f.users.patient.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/booking\/.*\?slot=/);
  await page
    .getByLabel("What would you like help with?")
    .fill("Software verification: routine appointment, not real medical care.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const bookedPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/appointments") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  const booked = await bookedPromise;
  expect(booked.status()).toBe(201);
  const appointment = (await booked.json()).appointment;
  await expect(
    page.getByRole("heading", { name: "You’re all set." }),
  ).toBeVisible();
  const stored = await db
    .from("clinic_appointments")
    .select("id,patient_id")
    .eq("id", appointment.id)
    .single();
  expect(stored.data?.patient_id).toBe(f.users.patient.id);
  const migrated = await db
    .from("clinic_sal_sessions")
    .select("user_id,guest_token_hash")
    .eq("id", body.sessionId)
    .single();
  expect(migrated.data?.user_id).toBe(f.users.patient.id);
  expect(migrated.data?.guest_token_hash).toBeNull();
  await page.goto("/patient");
  await expect(page.locator(".appointment-card")).toContainText("Demo");
  await page
    .getByRole("tab", { name: "SAL conversations", exact: true })
    .click();
  await expect(page.locator(".session-card")).toBeVisible();
  await page.getByRole("tab", { name: "Upcoming", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel appointment", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await db
            .from("clinic_appointments")
            .select("status")
            .eq("id", appointment.id)
            .single()
        ).data?.status,
    )
    .toBe("cancelled");
  expect(errors).toEqual([]);
});

test("invalid successful AI payloads remain recoverable without corrupting the conversation", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.route("**/api/sal/message", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: "invalid",
        message: { content: "Malformed test response" },
      }),
    }),
  );
  await page.goto("/sal");
  await page.locator(".voice-text-toggle").click();
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill("A software verification message.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "SAL couldn’t reliably prepare" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  expect(await page.locator(".patient-message").count()).toBe(1);
  expect(await page.locator(".sal-message").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("recovery links change a real test password, logout clears access, and unsafe callbacks stay local", async ({
  page,
  context,
}) => {
  const f = await fixture(),
    db = await admin(),
    user = f.users.other;
  const { data, error } = await db.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
  });
  expect(error).toBeNull();
  if (error || !data.properties)
    throw new Error("Verification recovery link unavailable");
  const confirmation = await context.request.get(
    `/auth/confirm?type=recovery&token_hash=${encodeURIComponent(data.properties.hashed_token)}`,
    { maxRedirects: 0 },
  );
  expect(confirmation.status()).toBe(307);
  expect(confirmation.headers().location).toBe(`${origin}/auth/reset`);
  await page.goto("/auth/reset");
  await expect(
    page.getByRole("heading", { name: "Choose a new password." }),
  ).toBeVisible();
  const password = `Verification-${randomUUID()}!`;
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  f.users.other.password = password;
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  expect(
    (await context.cookies())
      .filter((c) => c.name.includes("auth-token"))
      .every((c) => c.httpOnly),
  ).toBe(true);
  await page.getByLabel("Open account menu").click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto("/patient");
  await expect(page).toHaveURL(/\/auth\?next=/);
  const failed = await context.request.get(
    "/auth/callback?code=invalid&next=https%3A%2F%2Fevil.example",
    { maxRedirects: 0 },
  );
  expect(failed.headers().location).toBe(`${origin}/auth?error=confirmation`);
  await login(context, "other");
  const oauth = await context.request.post("/api/auth", {
    headers: { Origin: origin },
    data: { mode: "google", next: "/patient" },
  });
  expect(oauth.status()).toBe(200);
  const oauthUrl = new URL((await oauth.json()).next);
  expect(oauthUrl.protocol).toBe("https:");
  expect(oauthUrl.searchParams.get("redirect_to")).toBe(
    `${origin}/auth/callback?next=%2Fpatient`,
  );
});
test("simultaneous requests reserve a slot once, reject invalid slots and protect ownership", async ({
  browser,
}) => {
  const f = await fixture(),
    db = await admin(),
    one = await browser.newContext(),
    two = await browser.newContext();
  await login(one);
  await login(two, "other");
  const { data: slots } = await db.rpc("clinic_available_slots", {
    p_doctor: (
      await db
        .from("clinic_doctors")
        .select("id")
        .eq("slug", "demo-layla-hassan")
        .single()
    ).data!.id,
  });
  const slotId = slots[0].id;
  const responses = await Promise.all([
    one.request.post(`${origin}/api/appointments`, {
      headers: { Origin: origin },
      data: {
        slotId,
        reason: "Development concurrency check",
        patient_id: f.users.other.id,
      },
    }),
    two.request.post(`${origin}/api/appointments`, {
      headers: { Origin: origin },
      data: { slotId, reason: "Development concurrency check" },
    }),
  ]);
  expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
  const index = responses.findIndex((r) => r.status() === 201),
    id = (await responses[index].json()).appointment.id,
    winner = index === 0 ? f.users.patient : f.users.other,
    loser = index === 0 ? two : one;
  expect(
    (
      await db
        .from("clinic_appointments")
        .select("patient_id")
        .eq("id", id)
        .single()
    ).data?.patient_id,
  ).toBe(winner.id);
  expect(
    (
      await loser.request.patch(`${origin}/api/appointments/${id}`, {
        headers: { Origin: origin },
        data: { action: "cancel" },
      })
    ).status(),
  ).toBe(409);
  const foreignPage = await loser.newPage();
  await foreignPage.goto(`/patient/appointments/${id}`);
  await expect(
    foreignPage.getByRole("heading", { name: "We couldn’t find that page." }),
  ).toBeVisible();
  expect(
    (
      await one.request.post(`${origin}/api/appointments`, {
        headers: { Origin: origin },
        data: { slotId: randomUUID(), reason: "Invalid time test" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await one.request.post(`${origin}/api/admin`, {
        headers: { Origin: origin },
        data: { action: "specialty.delete", id: randomUUID() },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await one.request.post(`${origin}/api/profile`, {
        headers: { Origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(405);
  await db.from("clinic_appointments").delete().eq("id", id);
  await one.close();
  await two.close();
});
test("doctor manages real availability and profile; admin CRUD and curated embeddings persist", async ({
  page,
  context,
}) => {
  const errors = monitor(page),
    f = await fixture(),
    db = await admin();
  await login(context, "doctor");
  await page.goto("/doctor");
  await expect(
    page.getByRole("heading", { name: "Your schedule, simply." }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Availability", exact: true }).click();
  await page.getByRole("button", { name: "Add a time", exact: true }).click();
  const start = new Date(Date.now() + 4 * 86400000);
  start.setHours(14, 0, 0, 0);
  const local = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  await page.getByLabel("Starts", { exact: true }).fill(local(start));
  await page
    .getByLabel("Ends", { exact: true })
    .fill(local(new Date(start.getTime() + 30 * 60000)));
  await page.getByRole("button", { name: "Save appointment time" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Close bookings" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Doctor profile", exact: true }).click();
  await page
    .getByLabel("Biography (English)", { exact: true })
    .fill("Fictional clinician record for application verification.");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .from("clinic_doctors")
            .select("bio")
            .eq("id", f.doctorId)
            .single()
        ).data?.bio,
    )
    .toContain("application verification");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", {
      name: "This area isn’t available to your account.",
    }),
  ).toBeVisible();
  await context.clearCookies();
  await login(context, "admin");
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Specialties", exact: true }).click();
  await page.getByRole("button", { name: "Add specialty" }).click();
  const specialtyName = `Verification specialty ${f.run}`,
    specialtySlug = `verification-${f.run}`;
  f.extraSpecialtySlugs = [specialtySlug];
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  await page.getByLabel("English name", { exact: true }).fill(specialtyName);
  await page.getByLabel("Arabic name", { exact: true }).fill("تخصص للاختبار");
  await page.getByLabel("URL name", { exact: true }).fill(specialtySlug);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.locator("tr").filter({ hasText: specialtyName }),
  ).toBeVisible();
  await page
    .locator("tr")
    .filter({ hasText: specialtyName })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByLabel("English description", { exact: true })
    .fill("Development verification only.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("tab", { name: "Doctors", exact: true }).click();
  await page.getByRole("button", { name: "Add doctor" }).click();
  const doctorName = `Admin Verification Doctor ${f.run}`;
  await page.getByLabel("Name (English)", { exact: true }).fill(doctorName);
  await page
    .getByLabel("Name (Arabic)", { exact: true })
    .fill("طبيب افتراضي للاختبار");
  await page
    .getByLabel("Profile URL name", { exact: true })
    .fill(`verification-doctor-${f.run}`);
  await page
    .getByLabel("Primary specialty", { exact: true })
    .selectOption({ label: specialtyName });
  await page
    .getByLabel("Fictional development profile", { exact: true })
    .check();
  const createdPromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const created = await createdPromise;
  expect(created.status()).toBe(200);
  const createdId = (await created.json()).id;
  f.extraDoctorIds = [createdId];
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  const row = page.locator("tr").filter({ hasText: doctorName });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Activate", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Knowledge base", exact: true }).click();
  await page.getByRole("button", { name: "Add document" }).click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill(`Verification reference ${f.run}`);
  await page
    .getByLabel("Source URL", { exact: true })
    .fill("https://www.nhs.uk/symptoms/chest-pain/");
  await page
    .getByLabel("Reviewed content", { exact: true })
    .fill(
      "Application verification reference. Persistent sudden chest discomfort, or chest pain together with sweating, nausea, lightheadedness or breathlessness, needs immediate emergency medical help. A clinician should assess concerning symptoms; this reference is not a diagnosis.",
    );
  await page.getByLabel("Use in SAL retrieval", { exact: true }).uncheck();
  const savedPromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const saved = await savedPromise;
  expect(saved.status()).toBe(200);
  const docId = (await saved.json()).id;
  f.extraDocumentIds = [docId];
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  const { data: chunks } = await db
    .from("clinic_knowledge_chunks")
    .select("id,embedding")
    .eq("document_id", docId);
  expect(chunks?.length).toBeGreaterThan(0);
  expect(JSON.parse(chunks![0].embedding).length).toBe(768);
  const inactiveMatches = await db.rpc("clinic_match_knowledge", {
    query_embedding: JSON.parse(chunks![0].embedding),
    match_count: 4,
    threshold: 0.55,
  });
  expect(inactiveMatches.error).toBeNull();
  expect(
    inactiveMatches.data.some((x: { id: string }) => x.id === chunks![0].id),
  ).toBe(false);
  await db
    .from("clinic_knowledge_documents")
    .update({ is_active: true })
    .eq("id", docId);
  const matches = await db.rpc("clinic_match_knowledge", {
    query_embedding: JSON.parse(chunks![0].embedding),
    match_count: 4,
    threshold: 0.55,
  });
  expect(matches.data.some((x: { id: string }) => x.id === chunks![0].id)).toBe(
    true,
  );
  await db
    .from("clinic_knowledge_documents")
    .update({ is_active: false })
    .eq("id", docId);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Knowledge base", exact: true }).click();
  await page
    .locator("tr")
    .filter({ hasText: `Verification reference ${f.run}` })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove record", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("emergency behaviour is immediate and persisted; malformed input and origins are rejected", async ({
  page,
  context,
}) => {
  const f = await fixture();
  await page.goto("/sal");
  await page.locator(".voice-text-toggle").click();
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill("I have severe chest pain and cannot breathe.");
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/sal/message"),
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".urgent-panel").first()).toBeVisible();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  f.guestSessionIds.push(result.sessionId);
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  expect(result.message.structured_data.safety.urgent).toBe(true);
  expect(result.message.structured_data.doctors).toEqual([]);
  await expect(
    page.getByRole("textbox", { name: "Your message to SAL" }),
  ).toBeDisabled();
  expect(
    (
      await context.request.post("/api/sal/message", {
        headers: { Origin: origin },
        data: { message: " ", locale: "en", requestId: randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.post("/api/locale", {
        headers: { Origin: "https://evil.example" },
        data: { locale: "ar" },
      })
    ).status(),
  ).toBe(403);
});
test("LLM failure shows a retry without losing the patient message", async ({
  page,
}) => {
  const f = await fixture();
  await page.route("**/api/sal/message", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "AI_UNAVAILABLE" }),
    }),
  );
  await page.goto("/sal");
  await page.locator(".voice-text-toggle").click();
  await page
    .getByRole("textbox", { name: "Your message to SAL" })
    .fill("A small routine health concern for software verification.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  expect(await page.locator(".patient-message").count()).toBe(1);
  await page.unroute("**/api/sal/message");
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/sal/message"),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const data = await response.json();
  f.guestSessionIds.push(data.sessionId);
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  await expect(page.locator(".sal-message")).toBeVisible();
  expect(await page.locator(".patient-message").count()).toBe(1);
});
test("Arabic SAL responses persist in an RTL conversation with real provider output", async ({
  page,
  context,
}) => {
  const errors = monitor(page),
    f = await fixture();
  await context.addCookies([
    { name: "clinic-locale", value: "ar", url: origin },
  ]);
  await page.goto("/sal");
  await page.locator(".voice-text-toggle").click();
  await page
    .getByRole("textbox", { name: "رسالتك إلى سال" })
    .fill(
      "هذه محادثة اختبار للتطبيق وليست حالة مريض حقيقية. عمري ٣٠ سنة وأشعر بحكة خفيفة وجفاف في الجلد منذ أسبوعين. لا توجد حمى أو أعراض شديدة. ما التخصص المناسب لمراجعة روتينية؟",
    );
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/sal/message") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  const response = await responsePromise,
    result = await response.json();
  f.initialRequestIds = [
    ...(f.initialRequestIds || []),
    response.request().postDataJSON().requestId,
  ];
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  expect(response.status(), `Arabic SAL: ${result.error || ""}`).toBe(200);
  expect(result.message.content).toMatch(/[\u0600-\u06ff]/);
  await expect(page).toHaveURL(/session=/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".sal-message").last()).toContainText(
    result.message.content.slice(0, 35),
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "work/sal-ar-live.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("saved doctors and preferred language are persisted to the patient account", async ({
  page,
  context,
}) => {
  const f = await fixture(),
    db = await admin();
  await login(context);
  await page.goto("/doctors/demo-layla-hassan");
  await page
    .getByRole("button", { name: "Save this doctor", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved doctor", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/patient");
  await page.getByRole("tab", { name: "Saved doctors", exact: true }).click();
  await expect(page.locator(".doctor-card")).toContainText("Layla");
  await page.getByRole("tab", { name: "My details", exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill(`Verified Patient ${f.run}`);
  await page
    .getByLabel("Preferred language", { exact: true })
    .selectOption("ar");
  const savedPromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/profile") && r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  expect((await savedPromise).status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const { data: profile } = await db
    .from("clinic_profiles")
    .select("name,locale,role")
    .eq("id", f.users.patient.id)
    .single();
  expect(profile?.locale).toBe("ar");
  expect(profile?.name).toBe(`Verified Patient ${f.run}`);
  expect(profile?.role).toBe("patient");
});

test("only the assigned doctor can complete an ended appointment", async ({
  page,
  context,
}) => {
  const f = await fixture(),
    db = await admin(),
    start = new Date(Date.now() - 7200000).toISOString(),
    end = new Date(Date.now() - 5400000).toISOString();
  const { data: slot, error: slotError } = await db
    .from("clinic_doctor_availability")
    .insert({
      doctor_id: f.doctorId,
      start_at: start,
      end_at: end,
      consultation_type: "in_person",
    })
    .select("id")
    .single();
  expect(slotError).toBeNull();
  const { data: appointment, error } = await db
    .from("clinic_appointments")
    .insert({
      doctor_id: f.doctorId,
      patient_id: f.users.patient.id,
      availability_id: slot!.id,
      start_at: start,
      end_at: end,
      consultation_type: "in_person",
      status: "confirmed",
      reason: "Fictional software verification visit.",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  await login(context, "patient");
  expect(
    (
      await context.request.post("/api/doctor", {
        headers: { Origin: origin },
        data: {
          action: "appointment.status",
          id: appointment!.id,
          status: "completed",
        },
      })
    ).status(),
  ).toBe(403);
  await context.clearCookies();
  await login(context, "doctor");
  await page.goto("/doctor");
  await page
    .getByRole("button", { name: "Mark completed", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db
            .from("clinic_appointments")
            .select("status")
            .eq("id", appointment!.id)
            .single()
        ).data?.status,
    )
    .toBe("completed");
});

test("search, no-result state and doctor profiles use actual directory data", async ({
  page,
}) => {
  await page.goto("/doctors");
  await page
    .getByLabel("Doctor or keyword")
    .fill("nonexistent-verification-name");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No doctors match those filters." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.locator(".doctor-card").first()).toBeVisible();
  await page
    .locator(".doctor-card")
    .first()
    .getByRole("link", { name: "View profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "About this doctor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Book an appointment", exact: true }),
  ).toBeVisible();
});
for (const locale of ["en", "ar"])
  for (const width of [1440, 1280, 1024, 768, 430, 390, 375, 320])
    test(`${locale} homepage at ${width}px has no overflow or page errors`, async ({
      page,
      context,
    }) => {
      const errors = monitor(page);
      await context.addCookies([
        { name: "clinic-locale", value: locale, url: origin },
      ]);
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(page.locator(".voice-mascot img")).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator(".voice-mascot img")
            .evaluate((img) => (img as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if ([1440, 390].includes(width))
        await page.screenshot({
          path: `work/home-${locale}-${width}.png`,
          fullPage: true,
        });
      expect(errors).toEqual([]);
    });
for (const locale of ["en", "ar"])
  test(`${locale} mobile care pages remain usable`, async ({
    page,
    context,
  }) => {
    const errors = monitor(page);
    await context.addCookies([
      { name: "clinic-locale", value: locale, url: origin },
    ]);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of [
      "/sal",
      "/doctors",
      "/specialties",
      "/doctors/demo-layla-hassan",
      "/booking/demo-layla-hassan",
      "/auth",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
