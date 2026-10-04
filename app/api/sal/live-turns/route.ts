import { apiError, assertOrigin, json, parseBody } from "@/lib/api";
import { liveTurnsInput } from "@/lib/sal/live-validation";
import { ownedSession, salOwner } from "@/lib/sal/session";
import { saveLiveTurns } from "@/lib/sal/live-session";
import { consumeLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, liveTurnsInput);
    await ownedSession(input.sessionId, await salOwner(false));
    await consumeLimit(`live-turns:${input.sessionId}`, 300);
    return json(
      await saveLiveTurns(input.sessionId, input.locale, input.turns),
    );
  } catch (e) {
    return apiError(e);
  }
}
