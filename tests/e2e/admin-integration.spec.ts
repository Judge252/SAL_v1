import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("admin integration: one demo doctor moves through draft, publish, update and archive without redeployment", async ({
  page,
  context,
}) => {
  test.slow();
  const origin = "http://127.0.0.1:3000";
  const headers = { Origin: origin };
  const f = JSON.parse(await readFile("work/e2e-fixtures.json", "utf8"));
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: original, error: readError } = await db
    .from("clinic_doctors")
    .select("*")
    .eq("id", f.doctorId)
    .single();
  expect(readError).toBeNull();
  const { data: specialty } = await db
    .from("clinic_doctor_specialties")
    .select("specialty_id")
    .eq("doctor_id", f.doctorId)
    .single();
  const city = `Integration demo ${f.run}`;
  const name = original!.name;
  const slug = original!.slug;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let appointmentId: string | undefined;
  let slotIds: string[] = [];
  async function save(values: Record<string, unknown>) {
    const { data: current, error } = await db
      .from("clinic_doctors")
      .select("*")
      .eq("id", f.doctorId)
      .single();
    expect(error).toBeNull();
    const saved = await db.rpc("salapp_save_doctor", {
      p_data: { ...current, ...values },
      p_specialty: specialty!.specialty_id,
    });
    expect(saved.error).toBeNull();
    expect(saved.data).toBe(f.doctorId);
  }
  async function upload(asset: string) {
    const path = `verification/${f.run}/${f.doctorId}/${randomUUID()}.png`;
    f.photoPaths = [...(f.photoPaths || []), path];
    await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
    const result = await db.storage
      .from("clinic-doctor-photos")
      .upload(path, await readFile(asset), {
        contentType: "image/png",
        upsert: false,
      });
    expect(result.error).toBeNull();
    const url = db.storage.from("clinic-doctor-photos").getPublicUrl(path)
      .data.publicUrl;
    const response = await context.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    return url;
  }
  await page.goto("/");
  const started = await context.request.post("/api/sal/live-session", {
    headers,
    data: { requestId: randomUUID(), locale: "en" },
  });
  expect(started.status()).toBe(200);
  const sessionId = (await started.json()).sessionId;
  f.guestSessionIds.push(sessionId);
  await writeFile("work/e2e-fixtures.json", JSON.stringify(f));
  async function tool(name: string, args: Record<string, unknown>) {
    return context.request.post("/api/sal/live-tools", {
      headers,
      data: { sessionId, locale: "en", call: { name, args } },
    });
  }
  async function find() {
    const response = await tool("find_doctors", {
      specialty: "general-practice",
      city,
      language: "English",
      consultationType: "in_person",
    });
    expect(response.status()).toBe(200);
    return response.json();
  }
  try {
    await test.step("draft is absent from the directory, profile, search and SAL", async () => {
      await save({
        is_active: false,
        city,
        price: 600,
        bio: "Fictional integration demonstration biography.",
      });
      await page.goto("/doctors");
      await expect(
        page.locator(".doctor-card").filter({ hasText: name }),
      ).toHaveCount(0);
      await page.goto(`/doctors?q=${encodeURIComponent(name)}`);
      await expect(page.locator(".doctor-card")).toHaveCount(0);
      await page.goto(`/doctors/${slug}`);
      await expect(page.locator(".doctor-profile-card")).toHaveCount(0);
      expect((await find()).doctors).toEqual([]);
    });
    await test.step("publish uses existing specialties, Storage photos and dated slots", async () => {
      const photo = await upload("public/logo_dark.png"); // A visibly fictional demo uses a brand placeholder, never a real clinician's photo.
      const start = Date.now() + 40 * 86400000;
      const { data: slots, error } = await db
        .from("clinic_doctor_availability")
        .insert(
          [0, 1].map((n) => ({
            doctor_id: f.doctorId,
            start_at: new Date(start + n * 1800000).toISOString(),
            end_at: new Date(start + (n + 1) * 1800000).toISOString(),
            consultation_type: "in_person",
          })),
        )
        .select("id");
      expect(error).toBeNull();
      slotIds = slots!.map((s) => s.id);
      await save({ is_active: true, photo_url: photo });
      await page.goto("/doctors");
      await expect(
        page.locator(".doctor-card").filter({ hasText: name }),
      ).toBeVisible();
      await page.goto("/specialties");
      await page
        .locator('a[href="/doctors?specialty=general-practice"]')
        .first()
        .click();
      await expect(
        page.locator(".doctor-card").filter({ hasText: name }),
      ).toBeVisible();
      await page.goto(`/doctors?q=${encodeURIComponent(name)}`);
      await expect(page.locator(".doctor-card")).toHaveCount(1);
      await page.goto(`/doctors/${slug}`);
      await expect(page.locator(".doctor-profile-card")).toContainText(name);
      const image = page.locator(".doctor-profile-card .doctor-avatar img");
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const result = await find();
      expect(result.doctors.map((d: { id: string }) => d.id)).toEqual([
        f.doctorId,
      ]);
      expect(result.doctors[0].profile_id).toBeNull();
      expect(
        result.availability[f.doctorId].map((s: { id: string }) => s.id),
      ).toEqual(expect.arrayContaining(slotIds));
      const details = await tool("get_doctor_details", {
        doctorId: f.doctorId,
      });
      expect(details.status()).toBe(200);
      const response = await context.request.get(
        `/api/doctors/${f.doctorId}/availability`,
      );
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(
        (await response.json()).slots.map((s: { id: string }) => s.id),
      ).toEqual(expect.arrayContaining(slotIds));
    });
    await test.step("an authenticated patient books the current database availability", async () => {
      const user = f.users.patient;
      const login = await context.request.post("/api/auth", {
        headers,
        data: { mode: "login", email: user.email, password: user.password },
      });
      expect(login.status()).toBe(200);
      await page.goto(`/booking/${slug}`);
      await expect(page.locator(".time-option")).toHaveCount(2);
      await page.locator(".time-option").first().click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByLabel("What would you like help with?")
        .fill("Fictional integration verification, no real medical care.");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const bookedPromise = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/appointments") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Confirm appointment", exact: true })
        .click();
      const booked = await bookedPromise;
      expect(booked.status()).toBe(201);
      appointmentId = (await booked.json()).appointment.id;
      await expect(
        page.getByRole("heading", { name: "You’re all set." }),
      ).toBeVisible();
    });
    await test.step("bio, price, photo, location, languages and availability refresh without rebuilding", async () => {
      const newPhoto = await upload("public/logo_light.png");
      await save({
        bio: "Updated fictional integration biography.",
        bio_ar: "سيرة تجريبية محدثة لاختبار التكامل.",
        price: 825,
        city: `${city} updated`,
        languages: ["Arabic"],
        photo_url: newPhoto,
      });
      await page.goto(`/doctors/${slug}`);
      await expect(page.locator(".doctor-profile-card")).toContainText(
        "Updated fictional integration biography.",
      );
      await expect(page.locator(".doctor-profile-grid")).toContainText("825");
      await expect(page.locator(".doctor-profile-card")).toContainText(
        `${city} updated`,
      );
      const image = page.locator(".doctor-profile-card .doctor-avatar img");
      await expect(image).toHaveAttribute(
        "src",
        new RegExp(
          encodeURIComponent(newPhoto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      );
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      expect((await find()).doctors).toEqual([]);
      const detail = await tool("get_doctor_availability", {
        doctorId: f.doctorId,
      });
      expect(detail.status()).toBe(200);
      const current = await detail.json();
      expect(current.doctors[0].price).toBe(825);
      expect(current.doctors[0].photo_url).toBe(newPhoto);
      expect(current.doctors[0].languages).toEqual(["Arabic"]);
      const free = current.availability[f.doctorId][0].id;
      const removed = await db
        .from("clinic_doctor_availability")
        .update({ is_active: false })
        .eq("id", free);
      expect(removed.error).toBeNull();
      expect(
        (
          await (
            await context.request.get(`/api/doctors/${f.doctorId}/availability`)
          ).json()
        ).slots,
      ).toEqual([]);
      await page.goto(`/booking/${slug}`);
      await expect(page.locator(".time-option")).toHaveCount(0);
      const restoredSlot = await db
        .from("clinic_doctor_availability")
        .update({ is_active: true })
        .eq("id", free);
      expect(restoredSlot.error).toBeNull();
      await context.request.post("/api/locale", {
        headers,
        data: { locale: "ar" },
      });
      await page.setViewportSize({ width: 320, height: 780 });
      await page.goto(`/doctors/${slug}`);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator(".doctor-profile-card")).toContainText(
        "سيرة تجريبية محدثة",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await context.request.post("/api/locale", {
        headers,
        data: { locale: "en" },
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    });
    await test.step("archive hides new discovery and booking while appointment history remains", async () => {
      await save({ is_active: false });
      await page.goto(`/doctors?q=${encodeURIComponent(name)}`);
      await expect(page.locator(".doctor-card")).toHaveCount(0);
      await page.goto(`/doctors/${slug}`);
      await expect(page.locator(".doctor-profile-card")).toHaveCount(0);
      await page.goto(`/booking/${slug}`);
      await expect(page.locator(".booking-layout")).toHaveCount(0);
      expect(
        (await tool("get_doctor_details", { doctorId: f.doctorId })).status(),
      ).toBe(404);
      const archivedSearch = await tool("find_doctors", {
        specialty: "general-practice",
        city: `${city} updated`,
        language: "Arabic",
      });
      expect((await archivedSearch.json()).doctors).toEqual([]);
      const staleBooking = await context.request.post("/api/appointments", {
        headers,
        data: { slotId: slotIds[0], reason: "Archived doctor test booking" },
      });
      expect(staleBooking.status()).toBe(400);
      expect((await staleBooking.json()).error).toBe("INVALID_SLOT");
      await page.goto("/patient");
      await expect(
        page.locator(".appointment-card").filter({ hasText: name }),
      ).toBeVisible();
      await page.goto(`/patient/appointments/${appointmentId}`);
      await expect(page.locator("body")).toContainText(name);
      expect(
        (
          await db
            .from("clinic_appointments")
            .select("doctor_id")
            .eq("id", appointmentId)
            .single()
        ).data?.doctor_id,
      ).toBe(f.doctorId);
      expect(errors).toEqual([]);
    });
  } finally {
    // Restore this run's shared fictional fixture for the other regression tests.
    // Global teardown removes it and these versioned photos; existing records are never touched.
    if (appointmentId) {
      const removed = await db
        .from("clinic_appointments")
        .delete()
        .eq("id", appointmentId)
        .eq("doctor_id", f.doctorId);
      expect(removed.error).toBeNull();
    }
    if (slotIds.length) {
      const removed = await db
        .from("clinic_doctor_availability")
        .delete()
        .in("id", slotIds)
        .eq("doctor_id", f.doctorId);
      expect(removed.error).toBeNull();
    }
    await save(original!);
  }
});
