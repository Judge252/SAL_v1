"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { Badge, Button, EmptyState, FormField, Modal } from "@/components/ui";
import { ProfileSettings } from "./patient-dashboard";
import { requestJson, errorText } from "@/lib/client";
import { t, dateLabel, statusLabel } from "@/lib/utils";
import type { Appointment, Doctor, Profile, Slot } from "@/types";
export function DoctorDashboard({
  doctor,
  profile,
  appointments,
  slots,
  renderTime,
}: {
  doctor: Doctor;
  profile: Profile;
  appointments: Appointment[];
  slots: Slot[];
  renderTime: number;
}) {
  const locale = useLocale(),
    router = useRouter(),
    [tab, setTab] = useState(0),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const tabs = [
    t(locale, "Appointments", "المواعيد"),
    t(locale, "Availability", "الأوقات المتاحة"),
    t(locale, "Doctor profile", "ملف الطبيب"),
    t(locale, "Account details", "بيانات الحساب"),
  ];
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await requestJson("/api/doctor", body);
      setOpen(false);
      setSuccess(
        t(locale, "Your changes have been saved.", "تم حفظ التغييرات."),
      );
      router.refresh();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">
            {t(locale, "Doctor care space", "حساب الطبيب")}
          </span>
          <h1>{t(locale, "Your schedule, simply.", "جدولك، ببساطة.")}</h1>
          <p>{locale === "ar" ? doctor.name_ar || doctor.name : doctor.name}</p>
        </div>
      </div>
      <div className="dashboard-tabs" role="tablist">
        {tabs.map((label, i) => (
          <button
            className="dashboard-tab"
            role="tab"
            aria-selected={tab === i}
            aria-controls="doctor-panel"
            id={`doctor-tab-${i}`}
            key={i}
            onClick={() => {
              setTab(i);
              setError("");
              setSuccess("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-notice mb-5" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success-notice mb-5" role="status">
          {success}
        </p>
      )}
      <div
        id="doctor-panel"
        role="tabpanel"
        aria-labelledby={`doctor-tab-${tab}`}
      >
        {tab === 0 ? (
          <div className="dashboard-grid">
            {appointments.length ? (
              appointments.map((a) => (
                <article className="card appointment-card" key={a.id}>
                  <div className="appointment-info">
                    <h3>
                      {a.patient?.name ||
                        t(locale, "Patient appointment", "موعد مريض")}
                    </h3>
                    <p>
                      {dateLabel(a.start_at, locale, {
                        day: "numeric",
                        month: "long",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {t(locale, "Cairo time", "توقيت القاهرة")}
                    </p>
                    <p
                      style={{
                        whiteSpace: "pre-line",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {a.reason}
                    </p>
                    <Badge className="badge-muted">
                      {statusLabel(a.status, locale)}
                    </Badge>
                  </div>
                  {a.status === "pending" ? (
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        void act({
                          action: "appointment.status",
                          id: a.id,
                          status: "confirmed",
                        })
                      }
                    >
                      {t(locale, "Confirm", "تأكيد")}
                    </Button>
                  ) : a.status === "confirmed" &&
                    new Date(a.end_at).getTime() <= renderTime ? (
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        void act({
                          action: "appointment.status",
                          id: a.id,
                          status: "completed",
                        })
                      }
                    >
                      {t(locale, "Mark completed", "حدد كمكتمل")}
                    </Button>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                title={t(locale, "No appointments yet.", "لا يوجد مواعيد بعد.")}
              />
            )}
          </div>
        ) : tab === 1 ? (
          <>
            <div className="dashboard-panel-heading">
              <h2>
                {t(
                  locale,
                  "Available appointment times",
                  "الأوقات المتاحة للحجز",
                )}
              </h2>
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} />
                {t(locale, "Add a time", "أضف وقتاً")}
              </Button>
            </div>
            <div className="dashboard-grid">
              {slots.length ? (
                slots.map((s) => (
                  <div className="card appointment-card" key={s.id}>
                    <div>
                      <h3 style={{ fontSize: ".95rem" }}>
                        {dateLabel(s.start_at, locale, {
                          weekday: "short",
                          day: "numeric",
                          month: "long",
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {dateLabel(s.end_at, locale, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </h3>
                      <p className="muted" style={{ fontSize: ".78rem" }}>
                        {s.consultation_type === "video"
                          ? t(locale, "Video consultation", "استشارة فيديو")
                          : t(locale, "In person", "في العيادة")}{" "}
                        · {t(locale, "Cairo time", "توقيت القاهرة")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      loading={busy}
                      onClick={() =>
                        void act({ action: "availability.remove", id: s.id })
                      }
                    >
                      {t(locale, "Close bookings", "أغلق الحجز")}
                    </Button>
                  </div>
                ))
              ) : (
                <EmptyState
                  title={t(
                    locale,
                    "Add your first appointment time.",
                    "أضف أول وقت متاح.",
                  )}
                />
              )}
            </div>
          </>
        ) : tab === 2 ? (
          <DoctorProfileEditor
            doctor={doctor}
            busy={busy}
            onSave={(data) => void act({ action: "profile.update", data })}
          />
        ) : (
          <ProfileSettings profile={profile} />
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t(locale, "Add appointment time", "أضف وقتاً متاحاً")}
      >
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void act({
              action: "availability.add",
              data: {
                start_at: new Date(String(data.get("start"))).toISOString(),
                end_at: new Date(String(data.get("end"))).toISOString(),
                consultation_type: data.get("type"),
              },
            });
          }}
        >
          <p className="muted" style={{ fontSize: ".8rem" }}>
            {t(
              locale,
              "Enter times in your device’s local time zone. Patients will see Cairo time.",
              "أدخل الأوقات بتوقيت جهازك المحلي. المرضى سيشاهدونها بتوقيت القاهرة.",
            )}
          </p>
          <FormField label={t(locale, "Starts", "بداية الموعد")}>
            <input
              className="input"
              type="datetime-local"
              name="start"
              required
            />
          </FormField>
          <FormField label={t(locale, "Ends", "نهاية الموعد")}>
            <input
              className="input"
              type="datetime-local"
              name="end"
              required
            />
          </FormField>
          <FormField label={t(locale, "Consultation type", "نوع الاستشارة")}>
            <select className="select" name="type">
              {doctor.consultation_types.map((type) => (
                <option key={type} value={type}>
                  {type === "video"
                    ? t(locale, "Video", "فيديو")
                    : t(locale, "In person", "في العيادة")}
                </option>
              ))}
            </select>
          </FormField>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
          <Button loading={busy}>
            {t(locale, "Save appointment time", "احفظ وقت الموعد")}
          </Button>
        </form>
      </Modal>
    </>
  );
}
export function DoctorProfileEditor({
  doctor,
  busy,
  onSave,
}: {
  doctor: Doctor;
  busy: boolean;
  onSave: (data: unknown) => void;
}) {
  const locale = useLocale();
  return (
    <section className="card settings-card" style={{ maxWidth: 780 }}>
      <h2>{t(locale, "Your public profile.", "ملفك العام.")}</h2>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          onSave({
            name: values.get("name"),
            name_ar: values.get("name_ar"),
            bio: values.get("bio"),
            bio_ar: values.get("bio_ar"),
            city: values.get("city"),
            address: values.get("address"),
            languages: values.getAll("languages"),
            price:
              values.get("price") === "" ? null : Number(values.get("price")),
            consultation_types: values.getAll("consultation_types"),
          });
        }}
      >
        <div className="form-row">
          <FormField label={t(locale, "Name (English)", "الاسم بالإنجليزية")}>
            <input
              className="input"
              name="name"
              defaultValue={doctor.name}
              required
              minLength={2}
              maxLength={100}
            />
          </FormField>
          <FormField label={t(locale, "Name (Arabic)", "الاسم بالعربية")}>
            <input
              className="input"
              name="name_ar"
              defaultValue={doctor.name_ar}
              maxLength={100}
              dir="rtl"
            />
          </FormField>
        </div>
        <FormField label={t(locale, "Biography (English)", "نبذة بالإنجليزية")}>
          <textarea
            className="textarea"
            name="bio"
            defaultValue={doctor.bio}
            maxLength={4000}
            rows={3}
          />
        </FormField>
        <FormField label={t(locale, "Biography (Arabic)", "نبذة بالعربية")}>
          <textarea
            className="textarea"
            name="bio_ar"
            defaultValue={doctor.bio_ar}
            maxLength={4000}
            rows={3}
            dir="rtl"
          />
        </FormField>
        <div className="form-row">
          <FormField label={t(locale, "City", "المدينة")}>
            <input
              className="input"
              name="city"
              defaultValue={doctor.city}
              maxLength={100}
            />
          </FormField>
          <FormField label={t(locale, "Consultation price", "سعر الاستشارة")}>
            <input
              className="input"
              name="price"
              type="number"
              min={0}
              max={100000}
              defaultValue={doctor.price ?? ""}
            />
          </FormField>
        </div>
        <FormField label={t(locale, "Address", "العنوان")}>
          <input
            className="input"
            name="address"
            defaultValue={doctor.address}
            maxLength={400}
          />
        </FormField>
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend style={{ fontSize: ".82rem" }}>
            {t(locale, "Languages", "اللغات")}
          </legend>
          {["Arabic", "English"].map((l) => (
            <label className="checkbox-label" key={l}>
              <input
                type="checkbox"
                name="languages"
                value={l}
                defaultChecked={doctor.languages.includes(l)}
              />
              {l === "Arabic"
                ? t(locale, "Arabic", "العربية")
                : t(locale, "English", "الإنجليزية")}
            </label>
          ))}
        </fieldset>
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend style={{ fontSize: ".82rem" }}>
            {t(locale, "Consultation types", "أنواع الاستشارة")}
          </legend>
          {["in_person", "video"].map((type) => (
            <label className="checkbox-label" key={type}>
              <input
                type="checkbox"
                name="consultation_types"
                value={type}
                defaultChecked={doctor.consultation_types.includes(type)}
              />
              {type === "video"
                ? t(locale, "Video consultation", "استشارة فيديو")
                : t(locale, "In person", "في العيادة")}
            </label>
          ))}
        </fieldset>
        <Button loading={busy}>
          {t(locale, "Save profile", "احفظ الملف")}
        </Button>
      </form>
    </section>
  );
}
