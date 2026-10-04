import test from "node:test";
import assert from "node:assert/strict";
import { hasUrgentRedFlag, emergencyResponse } from "../lib/ai/safety";
import { safeNext } from "../lib/utils";
import { modelResponse, bookingInput, authInput } from "../lib/validation";
import { matchDoctors } from "../lib/matching";
import type { Doctor } from "../types";
import { isSameOrigin, requestOrigin } from "../lib/request-origin";
import { parseSalReply } from "../lib/validation/sal-reply";

test("browser origins survive Next internal hostname normalization and reject cross-site requests", () => {
  const request = new Request("http://localhost:3000/api/auth", {
    headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" },
  });
  assert.equal(requestOrigin(request), "http://127.0.0.1:3000");
  assert.equal(isSameOrigin(request), true);
  assert.equal(isSameOrigin(request, "https://clinic.example"), false);
  for (const origin of [
    "null",
    "https://evil.example",
    "not-a-url",
    "http://127.0.0.1:3000/path",
  ])
    assert.equal(
      isSameOrigin(
        new Request(request, {
          headers: { Host: "127.0.0.1:3000", Origin: origin },
        }),
      ),
      false,
    );
  assert.equal(
    requestOrigin(request, "https://clinic.example"),
    "https://clinic.example",
  );
});
test("malformed successful SAL envelopes cannot enter conversation state", () => {
  for (const response of [
    null,
    {},
    { sessionId: "invented" },
    {
      sessionId: "00000000-0000-4000-8000-000000000001",
      message: { content: "Hello" },
    },
  ])
    assert.throws(() => parseSalReply(response), /AI_INVALID_RESPONSE/);
});
test("obvious urgent concerns stop routine navigation in both languages", () => {
  for (const text of [
    "I have severe chest pain",
    "I cannot breathe",
    "My face drooping suddenly",
    "I have uncontrolled bleeding",
    "ألم شديد في الصدر",
    "مش قادر اتنفس",
    "نزيف شديد",
  ])
    assert.equal(hasUrgentRedFlag(text), true, text);
});
test("negated red flags and ordinary concerns do not produce emergency claims", () => {
  for (const text of [
    "I have no severe chest pain",
    "I do not have severe difficulty breathing",
    "I have a mild headache",
    "ليس لدي ألم شديد في الصدر",
    "عندي ألم خفيف في معدتي",
  ])
    assert.equal(hasUrgentRedFlag(text), false, text);
});
test("urgent responses contain no doctors, booking recommendations, or diagnosis", () => {
  for (const locale of ["en", "ar"] as const) {
    const response = emergencyResponse(locale);
    assert.equal(response.stage, "urgent");
    assert.equal(response.safety.urgent, true);
    assert.deepEqual(response.recommendedDoctorIds, []);
    assert.deepEqual(response.doctors, []);
    assert.deepEqual(response.followUpQuestions, []);
  }
});
test("interrupted actions cannot create external redirects", () => {
  for (const url of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/patient\nLocation:bad",
    "/auth/callback",
  ])
    assert.equal(safeNext(url), "/patient");
  assert.equal(
    safeNext("/booking/demo-layla-hassan?slot=123"),
    "/booking/demo-layla-hassan?slot=123",
  );
});
test("model contracts reject invalid stages, doctor identifiers and oversized questions", () => {
  const valid = {
    message: "Tell me more.",
    stage: "question",
    followUpQuestions: [],
    symptomSummary: null,
    suggestedSpecialties: [],
    recommendedDoctorIds: [],
    safety: { urgent: false, message: null },
  };
  assert.ok(modelResponse.safeParse(valid).success);
  assert.equal(
    modelResponse.safeParse({ ...valid, stage: "diagnosis" }).success,
    false,
  );
  assert.equal(
    modelResponse.safeParse({ ...valid, recommendedDoctorIds: ["fake-doctor"] })
      .success,
    false,
  );
  assert.equal(
    modelResponse.safeParse({
      ...valid,
      followUpQuestions: Array(4).fill("Question?"),
    }).success,
    false,
  );
});
test("booking and signup validate server input without accepting identity or roles", () => {
  assert.equal(
    bookingInput.safeParse({ slotId: "invalid", reason: "abc" }).success,
    false,
  );
  const result = authInput.parse({
    mode: "signup",
    email: "test@example.com",
    password: "long-password-123",
    name: "Test User",
    role: "admin",
  });
  assert.equal("role" in result, false);
  assert.equal(
    authInput.safeParse({ ...result, password: "short" }).success,
    false,
  );
});
test("matching selects active doctors with database specialties, deterministically", () => {
  const doctor = {
    id: "db-1",
    name: "Test One",
    is_active: true,
    languages: ["English"],
    city: "Cairo",
    specialties: [{ slug: "general-practice" }],
  } as Doctor;
  const wrong = {
    ...doctor,
    id: "db-2",
    specialties: [{ slug: "dermatology" }],
  } as Doctor;
  const inactive = { ...doctor, id: "db-3", is_active: false };
  assert.deepEqual(
    matchDoctors([wrong, inactive, doctor], ["general-practice"], "en").map(
      (d) => d.id,
    ),
    ["db-1"],
  );
  assert.deepEqual(
    matchDoctors([doctor], ["hallucinated-specialty"], "en"),
    [],
  );
});
