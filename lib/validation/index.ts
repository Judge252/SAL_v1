import { z } from "zod";
export const uuid = z.uuid();
export const localeSchema = z.enum(["en", "ar"]);
export const salInput = z.object({
  message: z.string().trim().min(1).max(2000),
  sessionId: uuid.nullable().optional(),
  requestId: uuid,
  locale: localeSchema,
});
export const modelResponse = z.object({
  message: z.string().min(1).max(6000),
  stage: z.enum(["question", "summary", "recommendation", "urgent"]),
  followUpQuestions: z.array(z.string().max(400)).max(3),
  symptomSummary: z.string().max(1500).nullable(),
  suggestedSpecialties: z.array(z.string().max(70)).max(3),
  recommendedDoctorIds: z.array(uuid).max(5).default([]),
  safety: z.object({
    urgent: z.boolean(),
    message: z.string().max(1500).nullable(),
  }),
});
export const bookingInput = z.object({
  slotId: uuid,
  reason: z.string().trim().min(3).max(2000),
});
export const profileInput = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30),
  locale: localeSchema,
});
export const authInput = z
  .object({
    mode: z.enum(["login", "signup", "forgot", "reset", "logout", "google"]),
    email: z.email().optional(),
    password: z.string().min(1).max(128).optional(),
    name: z.string().trim().min(2).max(100).optional(),
    next: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      !["signup", "reset"].includes(v.mode) || (v.password?.length || 0) >= 10,
  );
export const availabilityInput = z
  .object({
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }),
    consultation_type: z.enum(["in_person", "video"]),
  })
  .refine(
    (v) =>
      new Date(v.end_at).getTime() > new Date(v.start_at).getTime() &&
      new Date(v.start_at).getTime() > Date.now() &&
      new Date(v.end_at).getTime() - new Date(v.start_at).getTime() <=
        4 * 3600000,
  );
