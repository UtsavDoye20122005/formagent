import { redirect } from "next/navigation";
import { currentUser } from "../../lib/supabase/server.js";
import { isConfigured } from "../../lib/supabase/config.js";
import SetupNotice from "../SetupNotice.js";
import LoginForm from "./LoginForm.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — FormAgent" };

export default async function LoginPage() {
  if (!isConfigured()) {
    return (
      <main className="shell narrow">
        <SetupNotice />
      </main>
    );
  }

  const user = await currentUser();
  if (user) redirect("/");

  return (
    <main className="shell narrow auth-shell">
      <div className="brand" style={{ justifyContent: "center", marginBottom: 26 }}>
        <span className="mark">F</span>
        <span>FormAgent</span>
      </div>
      <LoginForm />
    </main>
  );
}
