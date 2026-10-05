"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  MessageCircle,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { DoctorCard } from "@/components/doctors/doctor-card";
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  LinkButton,
  Modal,
} from "@/components/ui";
import { requestJson, errorText } from "@/lib/client";
import { t, dateLabel, statusLabel } from "@/lib/utils";
import type { Appointment, Doctor, Profile, SalSession } from "@/types";
export function PatientDashboard({
  profile,
  appointments,
  sessions,
  favorites,
  renderTime,
}: {
  profile: Profile;
  appointments: Appointment[];
  sessions: SalSession[];
  favorites: Doctor[];
  renderTime: number;
}) {
  const locale = useLocale(),
    [tab, setTab] = useState(0);
  const tabs = [
    t(locale, "Upcoming", "القادمة"),
    t(locale, "Past appointments", "المواعيد السابقة"),
    t(locale, "SAL conversations", "محادثات سال"),
    t(locale, "Saved doctors", "الأطباء المحفوظون"),
    t(locale, "My details", "بياناتي"),
  ];
  const now = renderTime,
    upcoming = appointments.filter(
      (a) =>
        new Date(a.start_at).getTime() > now &&
        ["pending", "confirmed"].includes(a.status),
    ),
    past = appointments.filter((a) => !upcoming.includes(a));
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">
            {t(locale, "Your care, in one place", "رعايتك، في مكان واحد")}
          </span>
          <h1>
            {t(locale, "Hello, ", "مرحبًا، ")}
            <bdi>{profile.name.split(" ")[0] || t(locale, "there", "بك")}</bdi>.
          </h1>
          <p>
            {t(
              locale,
              "A calm place for your next steps.",
              "مواعيدك ومحادثاتك وخطواتك التالية، في مكان واحد.",
            )}
          </p>
        </div>
        <LinkButton href="/sal">
          <MessageCircle size={17} />
          {t(locale, "Talk to SAL", "تحدّث مع سال")}
        </LinkButton>
      </div>
      <div
        className="dashboard-tabs"
        role="tablist"
        aria-label={t(locale, "Care space sections", "أقسام حساب الرعاية")}
      >
        {tabs.map((label, i) => (
          <button
            key={i}
            className="dashboard-tab"
            role="tab"
            aria-selected={tab === i}
            aria-controls="patient-panel"
            id={`patient-tab-${i}`}
            onClick={() => setTab(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="patient-panel"
        role="tabpanel"
        aria-labelledby={`patient-tab-${tab}`}
      >
        {tab < 2 ? (
          <div className="dashboard-grid">
            {(tab === 0 ? upcoming : past).length ? (
              (tab === 0 ? upcoming : past).map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  renderTime={renderTime}
                />
              ))
            ) : (
              <EmptyState
                title={t(
                  locale,
                  "No appointments here yet.",
                  "لا توجد مواعيد هنا بعد.",
                )}
                description={t(
                  locale,
                  "SAL can help you find a place to start.",
                  "سال يساعدك على معرفة من أين تبدأ.",
                )}
              >
                <LinkButton href="/doctors" variant="secondary">
                  {t(locale, "Find a doctor", "ابحث عن طبيب")}
                </LinkButton>
              </EmptyState>
            )}
          </div>
        ) : tab === 2 ? (
          <div className="dashboard-grid">
            {sessions.length ? (
              sessions.map((s) => (
                <Link
                  className="card session-card"
                  key={s.id}
                  href={`/sal?session=${s.id}`}
                >
                  <div>
                    <h3>
                      <bdi>{s.title}</bdi>
                    </h3>
                    <p>
                      <bdi>
                        {dateLabel(s.updated_at, locale, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </bdi>
                    </p>
                  </div>
                  <ArrowUpRight size={20} className="directional" />
                </Link>
              ))
            ) : (
              <EmptyState
                title={t(
                  locale,
                  "Your conversations will appear here.",
                  "ستظهر محادثاتك هنا.",
                )}
              >
                <LinkButton href="/sal">
                  {t(locale, "Start a conversation", "ابدأ محادثة")}
                </LinkButton>
              </EmptyState>
            )}
          </div>
        ) : tab === 3 ? (
          favorites.length ? (
            <div className="doctor-grid">
              {favorites.map((d) => (
                <DoctorCard key={d.id} doctor={d} locale={locale} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t(locale, "No saved doctors yet.", "لم تحفظ أي طبيب بعد.")}
            >
              <LinkButton href="/doctors" variant="secondary">
                {t(locale, "Explore doctors", "استكشف الأطباء")}
              </LinkButton>
            </EmptyState>
          )
        ) : (
          <ProfileSettings profile={profile} />
        )}
      </div>
    </>
  );
}
export function AppointmentCard({
  appointment: a,
  renderTime,
}: {
  appointment: Appointment;
  renderTime: number;
}) {
  const locale = useLocale();
  return (
    <article className="card appointment-card">
      <div className="appointment-info">
        <h3>
          <bdi>
            {a.doctors
              ? locale === "ar"
                ? a.doctors.name_ar || a.doctors.name
                : a.doctors.name
              : t(locale, "Your appointment", "موعدك")}
          </bdi>
        </h3>
        <p>
          <CalendarDays
            size={14}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginInlineEnd: 6,
            }}
          />
          <bdi>
            {dateLabel(a.start_at, locale, {
              weekday: "short",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
            })}
          </bdi>{" "}
          · {t(locale, "Cairo time", "توقيت القاهرة")}
        </p>
        <p>
          {a.consultation_type === "video"
            ? t(locale, "Video consultation", "استشارة بالفيديو")
            : a.doctors?.city ||
              t(locale, "In-person visit", "زيارة في العيادة")}
        </p>
        <Badge
          className={a.status === "confirmed" ? "badge-teal" : "badge-muted"}
        >
          {statusLabel(a.status, locale)}
        </Badge>
        {a.doctors?.is_demo && (
          <Badge className="badge-demo ml-2">
            {t(locale, "Test appointment", "موعد تجريبي")}
          </Badge>
        )}
      </div>
      <div className="appointment-actions">
        <LinkButton href={`/patient/appointments/${a.id}`} variant="secondary">
          {t(locale, "View details", "عرض التفاصيل")}
        </LinkButton>
        {["pending", "confirmed"].includes(a.status) &&
          new Date(a.start_at).getTime() > renderTime && (
            <CancelAppointment id={a.id} />
          )}
      </div>
    </article>
  );
}
export function CancelAppointment({ id }: { id: string }) {
  const locale = useLocale(),
    router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function cancel() {
    setBusy(true);
    try {
      await requestJson(
        `/api/appointments/${id}`,
        { action: "cancel" },
        "PATCH",
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t(locale, "Cancel", "إلغاء")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t(locale, "Cancel this appointment?", "إلغاء هذا الموعد؟")}
      >
        <p className="muted">
          {t(
            locale,
            "Your time will become available for another patient.",
            "سيصبح هذا الموعد متاحًا لمريض آخر.",
          )}
        </p>
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
        <div className="booking-nav">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t(locale, "Keep appointment", "احتفظ بالموعد")}
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void cancel()}>
            {t(locale, "Cancel appointment", "ألغِ الموعد")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function ProfileSettings({ profile }: { profile: Profile }) {
  const locale = useLocale(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestJson(
        "/api/profile",
        {
          name: values.get("name"),
          phone: values.get("phone"),
          locale: values.get("locale"),
        },
        "PATCH",
      );
      setMessage(t(locale, "Your details have been saved.", "تم حفظ بياناتك."));
      router.refresh();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/auth", { mode: "logout" });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card">
      <h2>{t(locale, "Your details.", "بياناتك.")}</h2>
      <form className="form-grid" onSubmit={(e) => void save(e)}>
        <FormField label={t(locale, "Name", "الاسم")}>
          <input
            className="input"
            name="name"
            defaultValue={profile.name}
            dir="auto"
            minLength={2}
            maxLength={100}
            required
            autoComplete="name"
          />
        </FormField>
        <FormField label={t(locale, "Phone (optional)", "الهاتف (اختياري)")}>
          <input
            className="input"
            name="phone"
            defaultValue={profile.phone || ""}
            maxLength={30}
            type="tel"
            autoComplete="tel"
            dir="ltr"
          />
        </FormField>
        <FormField label={t(locale, "Preferred language", "اللغة المفضلة")}>
          <select
            className="select"
            name="locale"
            defaultValue={profile.locale}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </FormField>
        {message && (
          <p className="success-notice" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
        <Button loading={busy}>
          {t(locale, "Save details", "احفظ البيانات")}
        </Button>
      </form>
      <Button variant="ghost" className="mt-6" onClick={() => void logout()}>
        <LogOut size={16} />
        {t(locale, "Log out", "تسجيل الخروج")}
      </Button>
    </section>
  );
}
