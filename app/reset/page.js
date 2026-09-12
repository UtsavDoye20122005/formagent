import ResetForm from "./ResetForm.js";
import SetupNotice from "../SetupNotice.js";
import { isConfigured } from "../../lib/supabase/config.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set a new password — JiffyThat" };

export default function ResetPage() {
  if (!isConfigured()) {
    return (
      <main className="shell narrow">
        <SetupNotice />
      </main>
    );
  }

  return (
    <main className="auth-wrap simple">
      <section className="auth-form-side">
        <div className="auth-card">
          <ResetForm />
        </div>
      </section>
    </main>
  );
}
