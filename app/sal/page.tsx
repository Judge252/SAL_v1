import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n";
import { ownedSession, salOwner } from "@/lib/sal/session";
import { adminDb } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation";
import { SalVoiceExperience } from "@/components/sal/voice-experience";
import { EmptyState, LinkButton } from "@/components/ui";
import { t } from "@/lib/utils";
import type { Message, SalSession } from "@/types";
export const metadata: Metadata = {
  title: "Talk to SAL",
  robots: { index: false, follow: false },
};
export default async function SalPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const [locale, query] = await Promise.all([getLocale(), searchParams]);
  let session: SalSession | null = null,
    messages: Message[] = [];
  if (query.session) {
    try {
      if (!uuid.safeParse(query.session).success) throw new Error();
      session = (await ownedSession(
        query.session,
        await salOwner(false),
      )) as SalSession;
      const { data, error } = await adminDb()
        .from("clinic_sal_messages")
        .select("*")
        .eq("session_id", query.session)
        .order("created_at");
      if (error) throw error;
      messages = (data || []) as Message[];
    } catch {
      return (
        <div className="container page-shell">
          <EmptyState
            title={t(
              locale,
              "This conversation is unavailable.",
              "هذه المحادثة غير متاحة.",
            )}
            description={t(
              locale,
              "Use the same account or device, or start a new conversation.",
              "استخدم نفس الحساب أو الجهاز، أو ابدأ محادثة جديدة.",
            )}
          >
            <LinkButton href="/sal">
              {t(locale, "Start a new conversation", "ابدأ محادثة جديدة")}
            </LinkButton>
          </EmptyState>
        </div>
      );
    }
  }
  return (
    <SalVoiceExperience
      key={`${locale}:${session?.id || "new"}`}
      session={session}
      initialMessages={messages}
      emergencyPhone={process.env.EMERGENCY_PHONE || null}
    />
  );
}
