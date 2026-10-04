import { z } from "zod";
import { uuid } from "@/lib/validation";

export const liveSessionInput = z
  .object({
    sessionId: uuid.nullish(),
    requestId: uuid,
    locale: z.enum(["en", "ar"]),
  })
  .strict();
export const liveTokenInput = z
  .object({
    sessionId: uuid,
    locale: z.enum(["en", "ar"]),
  })
  .strict();
export const doctorSearchArgs = z
  .object({
    specialty: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
    city: z.string().trim().min(1).max(100).optional(),
    language: z.enum(["Arabic", "English"]).optional(),
    consultationType: z.enum(["in_person", "video"]).optional(),
  })
  .strict();
export const doctorIdArgs = z.object({ doctorId: uuid }).strict();
export const referenceArgs = z
  .object({ concern: z.string().trim().min(3).max(1000) })
  .strict();
export const urgentArgs = z.object({}).strict();
const tool = z.discriminatedUnion("name", [
  z.object({ name: z.literal("find_doctors"), args: doctorSearchArgs }),
  z.object({ name: z.literal("get_doctor_details"), args: doctorIdArgs }),
  z.object({ name: z.literal("get_doctor_availability"), args: doctorIdArgs }),
  z.object({ name: z.literal("get_care_references"), args: referenceArgs }),
  z.object({ name: z.literal("get_urgent_care_guidance"), args: urgentArgs }),
]);
export const liveToolInput = z
  .object({
    sessionId: uuid,
    locale: z.enum(["en", "ar"]),
    context: z.string().max(6000).default(""),
    call: tool,
  })
  .strict();
export const liveTurn = z
  .object({
    requestId: uuid,
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(6000),
    doctorIds: z.array(uuid).max(3).default([]),
  })
  .strict();
export const liveTurnsInput = z
  .object({
    sessionId: uuid,
    locale: z.enum(["en", "ar"]),
    turns: z.array(liveTurn).min(1).max(4),
  })
  .strict();
export type LiveTurn = z.infer<typeof liveTurn>;
