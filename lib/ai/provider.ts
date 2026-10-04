import type { Locale, Message, Specialty } from "@/types";
import type { z } from "zod";
import type { modelResponse } from "@/lib/validation";
export type ProviderInput = {
  locale: Locale;
  history: Pick<Message, "role" | "content">[];
  specialties: Specialty[];
  knowledge: { title: string; content: string; source: string }[];
};
export interface AiProvider {
  respond(input: ProviderInput): Promise<z.infer<typeof modelResponse>>;
  embed(
    text: string,
    task: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  ): Promise<number[]>;
}
