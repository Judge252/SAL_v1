import { AuthForm } from "@/components/auth/auth-form";
import { requireIdentity } from "@/lib/auth";
export default async function ResetPage() {
  await requireIdentity("/auth/reset");
  return (
    <div className="container page-shell" style={{ maxWidth: 520 }}>
      <AuthForm mode="reset" />
    </div>
  );
}
