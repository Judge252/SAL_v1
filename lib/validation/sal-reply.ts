import { z } from "zod";
import { modelResponse, uuid } from "./index";
import type { Message } from "@/types";

const specialty = z.object({
  id: uuid,
  slug: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  description_en: z.string(),
  description_ar: z.string(),
});
export const doctorSchema = z.object({
  id: uuid,
  profile_id: uuid.nullable(),
  slug: z.string(),
  name: z.string(),
  name_ar: z.string(),
  bio: z.string(),
  bio_ar: z.string(),
  photo_url: z.string().nullable(),
  city: z.string(),
  address: z.string(),
  languages: z.array(z.string()),
  years_experience: z.number().nullable(),
  price: z.number().nullable(),
  currency: z.string(),
  is_verified: z.boolean(),
  is_active: z.boolean(),
  is_demo: z.boolean(),
  consultation_types: z.array(z.string()),
  specialties: z.array(specialty),
});
const reply = z.object({
  sessionId: uuid,
  message: z.object({
    id: uuid,
    role: z.literal("assistant"),
    content: z.string().min(1),
    created_at: z.string(),
    request_id: uuid,
    structured_data: modelResponse.extend({
      doctors: z.array(doctorSchema),
      sources: z.array(
        z.object({ id: uuid, title: z.string(), source: z.url() }),
      ),
    }),
  }),
});

export function parseSalReply(value: unknown): {
  sessionId: string;
  message: Message;
} {
  const parsed = reply.safeParse(value);
  if (!parsed.success) throw new Error("AI_INVALID_RESPONSE");
  return parsed.data;
}
