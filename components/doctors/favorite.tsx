"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { requestJson, errorText } from "@/lib/client";
import { t } from "@/lib/utils";
export function FavoriteButton({
  doctorId,
  saved,
  slug,
}: {
  doctorId: string;
  saved: boolean;
  slug: string;
}) {
  const locale = useLocale(),
    router = useRouter(),
    [active, setActive] = useState(saved),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/favorites", { doctorId, save: !active });
      setActive(!active);
    } catch (e) {
      if (e instanceof Error && e.message === "AUTH_REQUIRED")
        router.push(`/auth?next=${encodeURIComponent(`/doctors/${slug}`)}`);
      else setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="favorite-button"
        type="button"
        aria-pressed={active}
        disabled={busy}
        onClick={() => void toggle()}
      >
        <Heart size={16} fill={active ? "currentColor" : "none"} />
        {active
          ? t(locale, "Saved doctor", "طبيب محفوظ")
          : t(locale, "Save this doctor", "احفظ هذا الطبيب")}
      </button>
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
