import { z } from "zod";
import { doctorSchema } from "./sal-reply";
import { uuid } from "./index";

const slot = z.object({
  id: uuid,
  doctor_id: uuid,
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
  consultation_type: z.enum(["in_person", "video"]),
  is_active: z.boolean(),
});
const result = z
  .object({
    doctors: z.array(doctorSchema).max(3).optional(),
    availability: z.record(uuid, z.array(slot).max(12)).optional(),
    urgent: z.boolean().optional(),
    urgentRequestId: uuid.optional(),
    guidance: z.string().optional(),
    references: z
      .array(z.object({ id: uuid, title: z.string(), source: z.url() }))
      .optional(),
    context: z.string().optional(),
    note: z.string().optional(),
  })
  .refine(
    (value) =>
      value.doctors !== undefined ||
      value.references !== undefined ||
      value.urgent === true,
  );

export function parseLiveToolResult(value: unknown) {
  const parsed = result.safeParse(value);
  if (!parsed.success) throw new Error("DIRECTORY_UNAVAILABLE");
  return parsed.data;
}
