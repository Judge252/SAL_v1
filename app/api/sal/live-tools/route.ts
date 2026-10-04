import { apiError, assertOrigin, json, parseBody } from "@/lib/api";
import { liveToolInput } from "@/lib/sal/live-validation";
import { ownedSession, salOwner } from "@/lib/sal/session";
import { executeSalTool } from "@/lib/sal/tools";
import { consumeLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, liveToolInput);
    await ownedSession(input.sessionId, await salOwner(false));
    await consumeLimit(`live-tools:${input.sessionId}`, 120);
    return json(await executeSalTool(input));
  } catch (e) {
    return apiError(e);
  }
}
