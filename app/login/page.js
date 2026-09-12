import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "../../lib/supabase/server.js";
import { isConfigured } from "../../lib/supabase/config.js";
import SetupNotice from "../SetupNotice.js";
import LoginForm from "./LoginForm.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — FormAgent" };

const POINTS = [
  ["1", "Say what you need to collect — out loud or typed."],
  ["2", "Check the questions it writes, change anything."],
  ["3", "Share the link. Answers land in one place."],
];

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
    <main className="auth-wrap">
      <aside className="auth-art">
        <div className="brand">
          <span className="mark">F</span>
          <span>FormAgent</span>
        </div>

        <div className="auth-pitch">
          <p className="eyebrow">Forms without the fiddling</p>
          <h2>Describe the form. Get the link.</h2>
          <p>
            No dragging fields around. No twenty clicks per question. Just say what
            you want and send the link.
          </p>

          <ul className="auth-points">
            {POINTS.map(([n, text]) => (
              <li key={n}>
                <span className="dot" aria-hidden="true">{n}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hint" style={{ margin: 0 }}>
          Your forms and sections stay private to your account.
        </p>
      </aside>

      <section className="auth-form-side">
        <div className="auth-card">
          <LoginForm />
        </div>

        <p className="auth-legal">
          <Link href="/privacy">Privacy Policy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Terms of Service</Link>
        </p>
      </section>
    </main>
  );
}
