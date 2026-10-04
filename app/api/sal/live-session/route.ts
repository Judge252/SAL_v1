import { apiError, assertOrigin, json, parseBody } from "@/lib/api";
import { liveSessionInput } from "@/lib/sal/live-validation";
import { prepareLiveSession } from "@/lib/sal/live-session";
import { liveModel } from "@/lib/gemini/live";
import { consumeLimit, networkHash } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, liveSessionInput);
    await consumeLimit(`live-bootstrap:${networkHash(request)}`, 400);
    const sessionId = await prepareLiveSession(input);
    return json({ sessionId, model: liveModel(), apiVersion: "v1beta" });
  } catch (e) {
    return apiError(e);
  }
}
