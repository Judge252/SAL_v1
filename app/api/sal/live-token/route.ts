import { apiError, assertOrigin, json, parseBody } from "@/lib/api";
import { liveTokenInput } from "@/lib/sal/live-validation";
import { ownedSession, salOwner } from "@/lib/sal/session";
import { liveHistory } from "@/lib/sal/live-session";
import { createLiveToken } from "@/lib/gemini/live";
import { configuredLimit, consumeLimit, networkHash } from "@/lib/rate-limit";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, liveTokenInput);
    const owner = await salOwner(false);
    await ownedSession(input.sessionId, owner);
    await consumeLimit(
      `live-owner:${owner.userId || owner.guestHash}`,
      configuredLimit(
        owner.userId ? "LIVE_USER_DAILY_LIMIT" : "LIVE_GUEST_DAILY_LIMIT",
        owner.userId ? 40 : 15,
      ),
    );
    await consumeLimit(
      `live-network:${networkHash(request)}`,
      configuredLimit("LIVE_NETWORK_DAILY_LIMIT", 200),
    );
    const token = await createLiveToken(
      input.locale,
      await liveHistory(input.sessionId),
    );
    return json({ token });
  } catch (e) {
    return apiError(e);
  }
}
