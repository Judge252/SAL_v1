import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

for (const locale of ["en", "ar"] as const)
  test(`admin doctor form validates, creates and deletes (${locale})`, async ({
    page,
    context,
  }) => {
    test.slow();
    const label = (en: string, ar: string) => (locale === "ar" ? ar : en);
    if (locale === "ar")
      await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let mutations = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/admin") && r.method() === "POST") mutations++;
    });
    const f = JSON.parse(await readFile("work/e2e-fixtures.json", "utf8"));
    const db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await context.request.post("/api/auth", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: {
        mode: "login",
        email: f.users.admin.email,
        password: f.users.admin.password,
      },
    });
    expect(login.status()).toBe(200);
    expect(
      (
        await context.request.post("/api/locale", {
          headers: { Origin: "http://127.0.0.1:3000" },
          data: { locale },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/admin");
    await page
      .getByRole("button", {
        name: label("Add doctor", "أضف طبيبًا"),
        exact: true,
      })
      .click();
    const name = `Doctor form verification ${locale} ${f.run}`;
    const slug = `doctor-form-verification-${locale}-${f.run}`;
    await page
      .getByLabel(label("Name (English)", "الاسم بالإنجليزية"), { exact: true })
      .fill(name);
    const url = page.getByLabel(label("Profile URL name", "اسم رابط الملف"), {
      exact: true,
    });
    await url.fill("Doctor With Spaces");
    await page
      .getByLabel(label("Primary specialty", "التخصص الأساسي"), { exact: true })
      .selectOption({
        label: label("General practice", "طب عام"),
      });
    await page
      .getByLabel(
        label("Fictional development profile", "ملف افتراضي للاختبار"),
        { exact: true },
      )
      .check();
    const submit = page.getByRole("button", {
      name: label("Save changes", "احفظ التغييرات"),
      exact: true,
    });
    expect(
      await url.evaluate(
        (input: HTMLInputElement) => input.validity.patternMismatch,
      ),
    ).toBe(true);
    await submit.click();
    await expect(
      page.locator('dialog[open] .error-notice[role="alert"]'),
    ).toContainText(label("with no spaces", "دون مسافات"));
    await url.fill(slug);
    const arabic = page.getByLabel(label("Arabic", "العربية"), { exact: true });
    const english = page.getByLabel(label("English", "الإنجليزية"), {
      exact: true,
    });
    await arabic.uncheck();
    await english.uncheck();
    await submit.click();
    await expect(
      page.locator('dialog[open] .error-notice[role="alert"]'),
    ).toContainText(label("at least one language", "لغة واحدة على الأقل"));
    await arabic.check();
    const inPerson = page.getByLabel(label("In person", "في العيادة"), {
      exact: true,
    });
    await inPerson.uncheck();
    await submit.click();
    await expect(
      page.locator('dialog[open] .error-notice[role="alert"]'),
    ).toContainText(
      label("at least one consultation type", "نوع استشارة واحدًا على الأقل"),
    );
    expect(mutations).toBe(0);
    await inPerson.check();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
    );
    await submit.click();
    const response = await saved;
    const body = await response.json();
    if (body.id) {
      f.extraDoctorIds = [...(f.extraDoctorIds || []), body.id];
      await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
    }
    expect(response.status(), JSON.stringify(body)).toBe(200);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const row = page.locator("tr").filter({ hasText: name });
    await expect(row).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    const record = await db
      .from("clinic_doctors")
      .select("price,years_experience,profile_id,photo_url")
      .eq("id", body.id)
      .single();
    expect(record.error).toBeNull();
    expect(record.data).toEqual({
      price: null,
      years_experience: null,
      profile_id: null,
      photo_url: null,
    });
    await row
      .getByRole("button", { name: label("Edit", "تعديل"), exact: true })
      .click();
    await page
      .getByLabel(
        label("Consultation price (optional)", "سعر الاستشارة (اختياري)"),
        { exact: true },
      )
      .fill("175.50");
    const edited = page.waitForResponse(
      (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
    );
    await submit.click();
    expect((await edited).status()).toBe(200);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect(
      (
        await db
          .from("clinic_doctors")
          .select("price")
          .eq("id", body.id)
          .single()
      ).data?.price,
    ).toBe(175.5);
    await row
      .getByRole("button", { name: label("Edit", "تعديل"), exact: true })
      .click();
    await url.fill(`sal-verification-${f.run}`);
    const conflict = page.waitForResponse(
      (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
    );
    await submit.click();
    const conflicting = await conflict;
    expect(conflicting.status()).toBe(409);
    expect((await conflicting.json()).error).toBe("DOCTOR_SLUG_TAKEN");
    await expect(
      page.locator('dialog[open] .error-notice[role="alert"]'),
    ).toContainText(
      label("already uses this profile URL", "يستخدم رابط الملف هذا بالفعل"),
    );
    expect(
      (
        await db
          .from("clinic_doctors")
          .select("slug")
          .eq("id", body.id)
          .single()
      ).data?.slug,
    ).toBe(slug);
    await page
      .getByRole("button", { name: "Close / إغلاق", exact: true })
      .click();
    const start = new Date(Date.now() + 75 * 86400000);
    const slot = await db
      .from("clinic_doctor_availability")
      .insert({
        doctor_id: body.id,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + 1800000).toISOString(),
      })
      .select("id")
      .single();
    expect(slot.error).toBeNull();
    const remove = row.getByRole("button", {
      name: label("Remove doctor", "حذف الطبيب"),
      exact: true,
    });
    await remove.click();
    await page
      .getByRole("button", {
        name: label("Keep record", "احتفظ بالسجل"),
        exact: true,
      })
      .click();
    await expect(row).toBeVisible();
    await remove.click();
    const deleted = page.waitForResponse(
      (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: label("Remove record", "احذف السجل"),
        exact: true,
      })
      .click();
    expect((await deleted).status()).toBe(200);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(row).toHaveCount(0);
    const remainingRows = await Promise.all([
      db
        .from("clinic_doctors")
        .select("id", { count: "exact", head: true })
        .eq("id", body.id),
      db
        .from("clinic_doctor_availability")
        .select("id", { count: "exact", head: true })
        .eq("id", slot.data!.id),
      db
        .from("clinic_doctor_specialties")
        .select("doctor_id", { count: "exact", head: true })
        .eq("doctor_id", body.id),
    ]);
    for (const remaining of remainingRows) {
      expect(remaining.error).toBeNull();
      expect(remaining.count).toBe(0);
    }
    expect(errors).toEqual([]);
  });

test("doctor deletion requires admin access and preserves booked history", async ({
  page,
  context,
}) => {
  test.slow();
  const f = JSON.parse(await readFile("work/e2e-fixtures.json", "utf8"));
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const headers = { Origin: "http://127.0.0.1:3000" };
  const deletion = { action: "doctor.delete", id: f.doctorId };
  expect(
    (
      await context.request.post("/api/admin", { headers, data: deletion })
    ).status(),
  ).toBe(401);
  async function login(role: "patient" | "admin") {
    const response = await context.request.post("/api/auth", {
      headers,
      data: {
        mode: "login",
        email: f.users[role].email,
        password: f.users[role].password,
      },
    });
    expect(response.status()).toBe(200);
  }
  await login("patient");
  expect(
    (
      await context.request.post("/api/admin", { headers, data: deletion })
    ).status(),
  ).toBe(403);
  const original = await db
    .from("clinic_doctors")
    .select("*")
    .eq("id", f.doctorId)
    .single();
  expect(original.error).toBeNull();
  const start = new Date(Date.now() + 80 * 86400000);
  const slot = await db
    .from("clinic_doctor_availability")
    .insert({
      doctor_id: f.doctorId,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + 1800000).toISOString(),
    })
    .select("id")
    .single();
  expect(slot.error).toBeNull();
  const booking = await context.request.post("/api/appointments", {
    headers,
    data: {
      slotId: slot.data!.id,
      reason: "Fictional doctor deletion regression test.",
    },
  });
  expect(booking.status()).toBe(201);
  const appointmentId = (await booking.json()).appointment.id;
  const appointment = await db
    .from("clinic_appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();
  expect(appointment.error).toBeNull();
  await login("admin");
  expect(
    (
      await context.request.post("/api/admin", {
        headers: { Origin: "https://example.invalid" },
        data: deletion,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/admin", {
        headers,
        data: { ...deletion, id: "not-a-uuid" },
      })
    ).status(),
  ).toBe(400);
  await page.goto("/admin");
  const row = page.locator("tr").filter({ hasText: original.data!.name });
  await row.getByRole("button", { name: "Remove doctor", exact: true }).click();
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith("/api/admin") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Remove record", exact: true })
    .click();
  const response = await rejected;
  expect(response.status()).toBe(409);
  expect((await response.json()).error).toBe("DOCTOR_HAS_APPOINTMENTS");
  await expect(
    page.locator('dialog[open] .error-notice[role="alert"]'),
  ).toContainText("appointment history and cannot be deleted");
  expect(
    (await db.from("clinic_doctors").select("*").eq("id", f.doctorId).single())
      .data,
  ).toEqual(original.data);
  expect(
    (
      await db
        .from("clinic_appointments")
        .select("*")
        .eq("id", appointmentId)
        .single()
    ).data,
  ).toEqual(appointment.data);
  expect(
    (
      await db
        .from("clinic_doctor_availability")
        .select("id")
        .eq("id", slot.data!.id)
        .single()
    ).data?.id,
  ).toBe(slot.data!.id);
  await page.getByRole("button", { name: "Keep record", exact: true }).click();
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Activate", exact: true }),
  ).toBeVisible();
  await login("patient");
  const history = await context.request.get(
    `/patient/appointments/${appointmentId}`,
  );
  expect(history.status()).toBe(200);
  expect(await history.text()).toContain(original.data!.name);
});
