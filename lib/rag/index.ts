import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { GeminiProvider } from "@/lib/ai/gemini";
export async function retrieveKnowledge(query: string) {
  const db = adminDb();
  const { count, error } = await db
    .from("clinic_knowledge_documents")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error || !count) return [];
  try {
    const embedding = await new GeminiProvider().embed(
      query,
      "RETRIEVAL_QUERY",
    );
    const { data, error: rpcError } = await db.rpc("clinic_match_knowledge", {
      query_embedding: embedding,
      match_count: 4,
      threshold: 0.55,
    });
    if (rpcError) return [];
    return (data || []) as {
      id: string;
      title: string;
      source: string;
      content: string;
    }[];
  } catch {
    return [];
  }
}
export function chunkDocument(
  content: string,
  max = 1800,
  overlap = 180,
): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += max - overlap) {
    const part = content.slice(i, i + max).trim();
    if (part) chunks.push(part);
  }
  return chunks;
}
