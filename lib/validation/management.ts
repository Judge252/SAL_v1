import { z } from "zod";
import { uuid, availabilityInput } from "./index";
const doctorFields = {
  name: z.string().trim().min(2).max(100),
  name_ar: z.string().trim().max(100),
  bio: z.string().trim().max(4000),
  bio_ar: z.string().trim().max(4000),
  city: z.string().trim().max(100),
  address: z.string().trim().max(400),
  languages: z
    .array(z.enum(["English", "Arabic"]))
    .min(1)
    .max(2),
  price: z.number().min(0).max(100000).nullable(),
  consultation_types: z
    .array(z.enum(["in_person", "video"]))
    .min(1)
    .max(2),
};
export const doctorProfileInput = z.object(doctorFields);
export const doctorAdminInput = z.object({
  ...doctorFields,
  id: uuid.nullable(),
  profile_id: uuid.nullable(),
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  photo_url: z.url().nullable(),
  currency: z.enum(["EGP", "USD", "EUR", "GBP"]),
  years_experience: z.number().int().min(0).max(80).nullable(),
  is_active: z.boolean(),
  is_verified: z.boolean(),
  is_demo: z.boolean(),
  specialty_id: uuid,
});
export const specialtyAdminInput = z.object({
  id: uuid.nullable(),
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  name_en: z.string().min(2).max(100),
  name_ar: z.string().min(2).max(100),
  description_en: z.string().max(1000),
  description_ar: z.string().max(1000),
});
export const knowledgeInput = z.object({
  id: uuid.nullable(),
  title: z.string().trim().min(3).max(200),
  source: z.url().refine((url) => url.startsWith("https://")),
  content: z.string().trim().min(20).max(24000),
  is_active: z.boolean(),
});
export const doctorAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("availability.add"), data: availabilityInput }),
  z.object({ action: z.literal("availability.remove"), id: uuid }),
  z.object({
    action: z.literal("appointment.status"),
    id: uuid,
    status: z.enum(["confirmed", "completed"]),
  }),
  z.object({ action: z.literal("profile.update"), data: doctorProfileInput }),
]);
export const adminAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("doctor.save"), data: doctorAdminInput }),
  z.object({ action: z.literal("specialty.save"), data: specialtyAdminInput }),
  z.object({ action: z.literal("specialty.delete"), id: uuid }),
  z.object({ action: z.literal("knowledge.save"), data: knowledgeInput }),
  z.object({ action: z.literal("knowledge.delete"), id: uuid }),
]);
