export type Locale = "en" | "ar";
export type Role = "patient" | "doctor" | "admin";
export type Profile = {
  id: string;
  name: string;
  role: Role;
  phone: string | null;
  locale: Locale;
  avatar_url: string | null;
};
export type Specialty = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
};
export type Doctor = {
  id: string;
  profile_id: string | null;
  slug: string;
  name: string;
  name_ar: string;
  bio: string;
  bio_ar: string;
  photo_url: string | null;
  city: string;
  address: string;
  languages: string[];
  years_experience: number | null;
  price: number | null;
  currency: string;
  is_verified: boolean;
  is_active: boolean;
  is_demo: boolean;
  consultation_types: string[];
  specialties: Specialty[];
};
export type Slot = {
  id: string;
  doctor_id: string;
  start_at: string;
  end_at: string;
  consultation_type: string;
  is_active: boolean;
};
export type Appointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  availability_id: string;
  start_at: string;
  end_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  reason: string;
  consultation_type: string;
  doctors: Doctor | null;
  patient?: { name: string } | null;
};
export type SalResponse = {
  message: string;
  stage: "question" | "summary" | "recommendation" | "urgent";
  followUpQuestions: string[];
  symptomSummary: string | null;
  suggestedSpecialties: string[];
  recommendedDoctorIds: string[];
  safety: { urgent: boolean; message: string | null };
  doctors: Doctor[];
  sources: { id: string; title: string; source: string }[];
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  structured_data: SalResponse | null;
  created_at: string;
  request_id: string;
};
export type SalSession = {
  id: string;
  title: string;
  locale: Locale;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};
export type KnowledgeDocument = {
  id: string;
  title: string;
  source: string;
  content: string;
  is_active: boolean;
  created_at: string;
};
