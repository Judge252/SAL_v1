"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { Badge, Button, EmptyState, FormField, Modal } from "@/components/ui";
import { requestJson, errorText } from "@/lib/client";
import { t, dateLabel, statusLabel } from "@/lib/utils";
import type {
  Appointment,
  Doctor,
  KnowledgeDocument,
  Profile,
  Specialty,
} from "@/types";
type UserSummary = Pick<Profile, "id" | "name" | "role" | "locale"> & {
  created_at: string;
};
type Editor =
  | { kind: "doctor"; record: Doctor | null }
  | { kind: "specialty"; record: Specialty | null }
  | { kind: "knowledge"; record: KnowledgeDocument | null };
export function AdminDashboard({
  doctors,
  specialties,
  appointments,
  users,
  documents,
}: {
  doctors: Doctor[];
  specialties: Specialty[];
  appointments: Appointment[];
  users: UserSummary[];
  documents: KnowledgeDocument[];
}) {
  const locale = useLocale(),
    router = useRouter(),
    [tab, setTab] = useState(0),
    [editor, setEditor] = useState<Editor | null>(null),
    [remove, setRemove] = useState<{
      kind: "specialty" | "knowledge";
      id: string;
      name: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tabs = [
    t(locale, "Doctors", "الأطباء"),
    t(locale, "Specialties", "التخصصات"),
    t(locale, "Appointments", "المواعيد"),
    t(locale, "Users", "المستخدمون"),
    t(locale, "Knowledge base", "قاعدة المعرفة"),
  ];
  async function act(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/admin", body);
      setEditor(null);
      setRemove(null);
      router.refresh();
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
    }
  }
  function doctorData(d: Doctor) {
    return { ...d, specialty_id: d.specialties[0]?.id };
  }
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor || busy) return;
    const form = new FormData(e.currentTarget),
      s = (key: string) => String(form.get(key) || ""),
      bool = (key: string) => form.get(key) === "on";
    if (editor.kind === "doctor")
      void act({
        action: "doctor.save",
        data: {
          id: editor.record?.id || null,
          profile_id: s("profile_id") || null,
          slug: s("slug"),
          name: s("name"),
          name_ar: s("name_ar"),
          bio: s("bio"),
          bio_ar: s("bio_ar"),
          city: s("city"),
          address: s("address"),
          languages: form.getAll("languages"),
          price: s("price") === "" ? null : Number(s("price")),
          currency: s("currency"),
          years_experience:
            s("years_experience") === "" ? null : Number(s("years_experience")),
          photo_url: s("photo_url") || null,
          consultation_types: form.getAll("consultation_types"),
          is_active: bool("is_active"),
          is_verified: bool("is_verified"),
          is_demo: bool("is_demo"),
          specialty_id: s("specialty_id"),
        },
      });
    if (editor.kind === "specialty")
      void act({
        action: "specialty.save",
        data: {
          id: editor.record?.id || null,
          slug: s("slug"),
          name_en: s("name_en"),
          name_ar: s("name_ar"),
          description_en: s("description_en"),
          description_ar: s("description_ar"),
        },
      });
    if (editor.kind === "knowledge")
      void act({
        action: "knowledge.save",
        data: {
          id: editor.record?.id || null,
          title: s("title"),
          source: s("source"),
          content: s("content"),
          is_active: bool("is_active"),
        },
      });
  }
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">
            {t(locale, "The Clinic administration", "إدارة ذا كلينك")}
          </span>
          <h1>
            {t(locale, "Care, thoughtfully managed.", "إدارة الرعاية بعناية.")}
          </h1>
        </div>
      </div>
      <div
        className="dashboard-tabs"
        role="tablist"
        aria-label={t(locale, "Administration sections", "أقسام الإدارة")}
      >
        {tabs.map((label, i) => (
          <button
            className="dashboard-tab"
            role="tab"
            disabled={busy}
            aria-selected={tab === i}
            id={`admin-tab-${i}`}
            aria-controls="admin-panel"
            onClick={() => {
              setTab(i);
              setError("");
            }}
            key={i}
          >
            {label}
          </button>
        ))}
      </div>
      {error && !editor && !remove && (
        <p className="error-notice mb-5" role="alert">
          {error}
        </p>
      )}
      <div
        id="admin-panel"
        role="tabpanel"
        aria-labelledby={`admin-tab-${tab}`}
      >
        <div className="dashboard-panel-heading">
          <h2>{tabs[tab]}</h2>
          {[0, 1, 4].includes(tab) && (
            <Button
              disabled={busy}
              onClick={() => {
                setError("");
                setEditor(
                  tab === 0
                    ? { kind: "doctor", record: null }
                    : tab === 1
                      ? { kind: "specialty", record: null }
                      : { kind: "knowledge", record: null },
                );
              }}
            >
              <Plus size={16} />
              {tab === 0
                ? t(locale, "Add doctor", "أضف طبيباً")
                : tab === 1
                  ? t(locale, "Add specialty", "أضف تخصصاً")
                  : t(locale, "Add document", "أضف مستنداً")}
            </Button>
          )}
        </div>
        <div className="card admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                {(tab === 0
                  ? [
                      t(locale, "Doctor", "الطبيب"),
                      t(locale, "Specialty", "التخصص"),
                      t(locale, "Status", "الحالة"),
                      t(locale, "Actions", "الإجراءات"),
                    ]
                  : tab === 1
                    ? [
                        t(locale, "Specialty", "التخصص"),
                        t(locale, "Arabic name", "الاسم العربي"),
                        t(locale, "Actions", "الإجراءات"),
                      ]
                    : tab === 2
                      ? [
                          t(locale, "Doctor", "الطبيب"),
                          t(locale, "When", "الوقت"),
                          t(locale, "Status", "الحالة"),
                        ]
                      : tab === 3
                        ? [
                            t(locale, "Name", "الاسم"),
                            t(locale, "Role", "الدور"),
                            t(locale, "Language", "اللغة"),
                            t(locale, "Joined", "تاريخ الانضمام"),
                          ]
                        : [
                            t(locale, "Document", "المستند"),
                            t(locale, "Source", "المصدر"),
                            t(locale, "Status", "الحالة"),
                            t(locale, "Actions", "الإجراءات"),
                          ]
                ).map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === 0 &&
                doctors.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {locale === "ar" ? d.name_ar || d.name : d.name}
                      {d.is_demo && (
                        <small>
                          {t(
                            locale,
                            "Fictional test profile",
                            "ملف افتراضي للاختبار",
                          )}
                        </small>
                      )}
                    </td>
                    <td>
                      {d.specialties[0]
                        ? locale === "ar"
                          ? d.specialties[0].name_ar
                          : d.specialties[0].name_en
                        : "—"}
                    </td>
                    <td>
                      <Badge
                        className={d.is_active ? "badge-teal" : "badge-muted"}
                      >
                        {d.is_active
                          ? t(locale, "Active", "نشط")
                          : t(locale, "Inactive", "غير نشط")}
                      </Badge>
                      {d.is_verified && (
                        <small>{t(locale, "Verified", "موثق")}</small>
                      )}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setEditor({ kind: "doctor", record: d })
                          }
                        >
                          {t(locale, "Edit", "تعديل")}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void act({
                              action: "doctor.save",
                              data: {
                                ...doctorData(d),
                                is_active: !d.is_active,
                              },
                            })
                          }
                        >
                          {d.is_active
                            ? t(locale, "Deactivate", "إيقاف")
                            : t(locale, "Activate", "تفعيل")}
                        </Button>
                        {!d.is_demo && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void act({
                                action: "doctor.save",
                                data: {
                                  ...doctorData(d),
                                  is_verified: !d.is_verified,
                                },
                              })
                            }
                          >
                            {d.is_verified
                              ? t(locale, "Unverify", "أزل التوثيق")
                              : t(locale, "Verify", "توثيق")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {tab === 1 &&
                specialties.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name_en}</td>
                    <td>{s.name_ar}</td>
                    <td>
                      <div className="admin-row-actions">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setEditor({ kind: "specialty", record: s })
                          }
                        >
                          {t(locale, "Edit", "تعديل")}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            setRemove({
                              kind: "specialty",
                              id: s.id,
                              name: s.name_en,
                            })
                          }
                        >
                          {t(locale, "Remove", "حذف")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {tab === 2 &&
                appointments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.doctors?.name || "—"}</td>
                    <td>
                      {dateLabel(a.start_at, locale, {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <Badge className="badge-muted">
                        {statusLabel(a.status, locale)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              {tab === 3 &&
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.name || t(locale, "Account holder", "صاحب الحساب")}
                    </td>
                    <td>
                      {u.role === "doctor"
                        ? t(locale, "Doctor", "طبيب")
                        : u.role === "admin"
                          ? t(locale, "Administrator", "مسؤول")
                          : t(locale, "Patient", "مريض")}
                    </td>
                    <td>{u.locale === "ar" ? "العربية" : "English"}</td>
                    <td>
                      {dateLabel(u.created_at, locale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              {tab === 4 &&
                documents.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title}</td>
                    <td>
                      <a
                        href={d.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link"
                        style={{ fontSize: ".78rem" }}
                      >
                        {t(locale, "View source", "عرض المصدر")}
                      </a>
                    </td>
                    <td>
                      <Badge className="badge-muted">
                        {d.is_active
                          ? t(locale, "Active", "نشط")
                          : t(locale, "Inactive", "غير نشط")}
                      </Badge>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setEditor({ kind: "knowledge", record: d })
                          }
                        >
                          {t(locale, "Edit", "تعديل")}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            setRemove({
                              kind: "knowledge",
                              id: d.id,
                              name: d.title,
                            })
                          }
                        >
                          {t(locale, "Remove", "حذف")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {[doctors, specialties, appointments, users, documents][tab]
            .length === 0 && (
            <EmptyState
              title={t(locale, "No records yet.", "لا يوجد سجلات بعد.")}
            />
          )}
        </div>
      </div>
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={
          editor?.kind === "doctor"
            ? t(locale, "Doctor profile", "ملف الطبيب")
            : editor?.kind === "specialty"
              ? t(locale, "Specialty", "التخصص")
              : t(locale, "Curated document", "مستند مختار")
        }
      >
        {editor && (
          <form
            className="form-grid"
            onSubmit={save}
            key={`${editor.kind}-${editor.record?.id || "new"}`}
          >
            {editor.kind === "doctor" && (
              <>
                <div className="form-row">
                  <FormField
                    label={t(locale, "Name (English)", "الاسم بالإنجليزية")}
                  >
                    <input
                      className="input"
                      name="name"
                      defaultValue={editor.record?.name}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </FormField>
                  <FormField
                    label={t(locale, "Name (Arabic)", "الاسم بالعربية")}
                  >
                    <input
                      className="input"
                      name="name_ar"
                      defaultValue={editor.record?.name_ar}
                      maxLength={100}
                      dir="rtl"
                    />
                  </FormField>
                </div>
                <FormField
                  label={t(locale, "Profile URL name", "اسم رابط الملف")}
                  hint={t(
                    locale,
                    "Lowercase letters, numbers, and hyphens.",
                    "أحرف إنجليزية صغيرة وأرقام وشرطات.",
                  )}
                >
                  <input
                    className="input"
                    name="slug"
                    defaultValue={editor.record?.slug}
                    required
                    pattern="[a-z0-9-]{3,80}"
                    dir="ltr"
                  />
                </FormField>
                <FormField
                  label={t(locale, "Primary specialty", "التخصص الأساسي")}
                >
                  <select
                    className="select"
                    name="specialty_id"
                    defaultValue={editor.record?.specialties[0]?.id}
                    required
                  >
                    <option value="">
                      {t(locale, "Choose a specialty", "اختر تخصصاً")}
                    </option>
                    {specialties.map((s) => (
                      <option value={s.id} key={s.id}>
                        {locale === "ar" ? s.name_ar : s.name_en}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label={t(
                    locale,
                    "Connected doctor account",
                    "حساب الطبيب المرتبط",
                  )}
                >
                  <select
                    className="select"
                    name="profile_id"
                    defaultValue={editor.record?.profile_id || ""}
                  >
                    <option value="">
                      {t(locale, "No connected account", "دون حساب مرتبط")}
                    </option>
                    {users
                      .filter((u) => u.role !== "admin")
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.name || t(locale, "Account holder", "صاحب الحساب")}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField
                  label={t(locale, "Biography (English)", "نبذة بالإنجليزية")}
                >
                  <textarea
                    className="textarea"
                    name="bio"
                    defaultValue={editor.record?.bio}
                    rows={3}
                    maxLength={4000}
                  />
                </FormField>
                <FormField
                  label={t(locale, "Biography (Arabic)", "نبذة بالعربية")}
                >
                  <textarea
                    className="textarea"
                    name="bio_ar"
                    defaultValue={editor.record?.bio_ar}
                    rows={3}
                    maxLength={4000}
                    dir="rtl"
                  />
                </FormField>
                <div className="form-row">
                  <FormField label={t(locale, "City", "المدينة")}>
                    <input
                      className="input"
                      name="city"
                      defaultValue={editor.record?.city}
                      maxLength={100}
                    />
                  </FormField>
                  <FormField
                    label={t(
                      locale,
                      "Years of experience (optional)",
                      "سنوات الخبرة (اختياري)",
                    )}
                  >
                    <input
                      className="input"
                      name="years_experience"
                      type="number"
                      defaultValue={editor.record?.years_experience ?? ""}
                      min={0}
                      max={80}
                    />
                  </FormField>
                </div>
                <FormField label={t(locale, "Address", "العنوان")}>
                  <input
                    className="input"
                    name="address"
                    defaultValue={editor.record?.address}
                    maxLength={400}
                  />
                </FormField>
                <div className="form-row">
                  <FormField
                    label={t(
                      locale,
                      "Consultation price (optional)",
                      "سعر الاستشارة (اختياري)",
                    )}
                  >
                    <input
                      className="input"
                      name="price"
                      type="number"
                      defaultValue={editor.record?.price ?? ""}
                      min={0}
                      max={100000}
                    />
                  </FormField>
                  <FormField label={t(locale, "Currency", "العملة")}>
                    <select
                      className="select"
                      name="currency"
                      defaultValue={editor.record?.currency || "EGP"}
                    >
                      {["EGP", "USD", "EUR", "GBP"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <FormField
                  label={t(
                    locale,
                    "Photo storage URL (optional)",
                    "رابط صورة التخزين (اختياري)",
                  )}
                  hint={t(
                    locale,
                    "Use a photo from the Clinic doctor-photos storage bucket.",
                    "استخدم صورة من مساحة تخزين صور أطباء ذا كلينك.",
                  )}
                >
                  <input
                    className="input"
                    name="photo_url"
                    type="url"
                    defaultValue={editor.record?.photo_url || ""}
                    dir="ltr"
                  />
                </FormField>
                <fieldset style={{ border: 0, padding: 0 }}>
                  <legend>{t(locale, "Languages", "اللغات")}</legend>
                  {["Arabic", "English"].map((l) => (
                    <label className="checkbox-label" key={l}>
                      <input
                        type="checkbox"
                        name="languages"
                        value={l}
                        defaultChecked={
                          editor.record
                            ? editor.record.languages.includes(l)
                            : true
                        }
                      />
                      {l === "Arabic"
                        ? t(locale, "Arabic", "العربية")
                        : t(locale, "English", "الإنجليزية")}
                    </label>
                  ))}
                </fieldset>
                <fieldset style={{ border: 0, padding: 0 }}>
                  <legend>
                    {t(locale, "Consultation types", "أنواع الاستشارة")}
                  </legend>
                  {["in_person", "video"].map((type) => (
                    <label className="checkbox-label" key={type}>
                      <input
                        type="checkbox"
                        name="consultation_types"
                        value={type}
                        defaultChecked={
                          editor.record
                            ? editor.record.consultation_types.includes(type)
                            : type === "in_person"
                        }
                      />
                      {type === "video"
                        ? t(locale, "Video consultation", "استشارة فيديو")
                        : t(locale, "In person", "في العيادة")}
                    </label>
                  ))}
                </fieldset>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={editor.record?.is_active ?? true}
                  />
                  {t(locale, "Active in directory", "نشط في الدليل")}
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_verified"
                    defaultChecked={editor.record?.is_verified ?? false}
                  />
                  {t(
                    locale,
                    "Credentials reviewed and verified",
                    "تمت مراجعة وتوثيق المؤهلات",
                  )}
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_demo"
                    defaultChecked={editor.record?.is_demo ?? false}
                  />
                  {t(
                    locale,
                    "Fictional development profile",
                    "ملف افتراضي للاختبار",
                  )}
                </label>
              </>
            )}
            {editor.kind === "specialty" && (
              <>
                <FormField
                  label={t(locale, "English name", "الاسم بالإنجليزية")}
                >
                  <input
                    className="input"
                    name="name_en"
                    defaultValue={editor.record?.name_en}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </FormField>
                <FormField label={t(locale, "Arabic name", "الاسم بالعربية")}>
                  <input
                    className="input"
                    name="name_ar"
                    defaultValue={editor.record?.name_ar}
                    minLength={2}
                    maxLength={100}
                    required
                    dir="rtl"
                  />
                </FormField>
                <FormField label={t(locale, "URL name", "اسم الرابط")}>
                  <input
                    className="input"
                    name="slug"
                    defaultValue={editor.record?.slug}
                    pattern="[a-z0-9-]{3,80}"
                    required
                    dir="ltr"
                  />
                </FormField>
                <FormField
                  label={t(locale, "English description", "وصف بالإنجليزية")}
                >
                  <textarea
                    className="textarea"
                    name="description_en"
                    defaultValue={editor.record?.description_en}
                    maxLength={1000}
                  />
                </FormField>
                <FormField
                  label={t(locale, "Arabic description", "وصف بالعربية")}
                >
                  <textarea
                    className="textarea"
                    name="description_ar"
                    defaultValue={editor.record?.description_ar}
                    maxLength={1000}
                    dir="rtl"
                  />
                </FormField>
              </>
            )}
            {editor.kind === "knowledge" && (
              <>
                <p className="muted" style={{ fontSize: ".85rem" }}>
                  {t(
                    locale,
                    "Add only content reviewed by your clinical team. Saving creates searchable embeddings.",
                    "أضف فقط محتوى تمت مراجعته بواسطة فريقك الطبي. الحفظ يجهز المحتوى للبحث.",
                  )}
                </p>
                <FormField label={t(locale, "Document title", "عنوان المستند")}>
                  <input
                    className="input"
                    name="title"
                    defaultValue={editor.record?.title}
                    minLength={3}
                    maxLength={200}
                    required
                  />
                </FormField>
                <FormField label={t(locale, "Source URL", "رابط المصدر")}>
                  <input
                    className="input"
                    name="source"
                    type="url"
                    defaultValue={editor.record?.source}
                    pattern="https://.*"
                    required
                    dir="ltr"
                  />
                </FormField>
                <FormField
                  label={t(locale, "Reviewed content", "المحتوى المراجع")}
                >
                  <textarea
                    className="textarea"
                    name="content"
                    defaultValue={editor.record?.content}
                    rows={8}
                    minLength={20}
                    maxLength={24000}
                    required
                  />
                </FormField>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={editor.record?.is_active ?? true}
                  />
                  {t(locale, "Use in SAL retrieval", "استخدم في مراجع سال")}
                </label>
              </>
            )}
            {error && (
              <p className="error-notice" role="alert">
                {error}
              </p>
            )}
            <Button loading={busy}>
              {t(locale, "Save changes", "احفظ التغييرات")}
            </Button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={t(locale, "Remove this record?", "حذف هذا السجل؟")}
      >
        <p>{remove?.name}</p>
        {error && (
          <p className="error-notice mt-4" role="alert">
            {error}
          </p>
        )}
        <div className="booking-nav">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            {t(locale, "Keep record", "احتفظ بالسجل")}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() =>
              remove &&
              void act({ action: `${remove.kind}.delete`, id: remove.id })
            }
          >
            {t(locale, "Remove record", "احذف السجل")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
