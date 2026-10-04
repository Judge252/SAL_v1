import { renderTime } from "@/lib/i18n";
import { requireIdentity } from "@/lib/auth";
import { getPatientData } from "@/lib/data/dashboard";
import { getDoctors } from "@/lib/data/doctors";
import { PatientDashboard } from "@/components/dashboard/patient-dashboard";
export const metadata = {
  title: "My care space",
  robots: { index: false, follow: false },
};
export default async function PatientPage() {
  const identity = await requireIdentity("/patient");
  const [data, doctors] = await Promise.all([
    getPatientData(identity.user.id),
    getDoctors(),
  ]);
  return (
    <div className="container page-shell">
      <PatientDashboard
        renderTime={renderTime()}
        profile={identity.profile}
        appointments={data.appointments}
        sessions={data.sessions}
        favorites={doctors.filter((d) => data.favoriteIds.includes(d.id))}
      />
    </div>
  );
}
