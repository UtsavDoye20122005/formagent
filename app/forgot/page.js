import ForgotForm from "./ForgotForm.js";
import SetupNotice from "../SetupNotice.js";
import { isConfigured } from "../../lib/supabase/config.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password — FormAgent" };

export default function ForgotPage() {
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
          <ForgotForm />
        </div>
      </section>
    </main>
  );
}
