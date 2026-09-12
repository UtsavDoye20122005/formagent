import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "./Header.js";
import Builder from "./Builder.js";
import SetupNotice from "./SetupNotice.js";
import { currentUser } from "../lib/supabase/server.js";
import { isConfigured } from "../lib/supabase/config.js";
import { listWorkspaces } from "../lib/db.js";
import { aiProvider } from "../lib/ai.js";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }) {
  // Supabase's confirmation and sign-in emails land on the Site URL with a
  // ?code= attached rather than on /auth/callback. Hand it to the callback so
  // the person ends up signed in instead of staring at a blank home page.
  const params = await searchParams;
  const code = typeof params?.code === "string" ? params.code : null;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  if (!isConfigured()) {
    return (
      <main className="shell narrow">
        <SetupNotice />
      </main>
    );
  }

  const user = await currentUser();
  if (!user) redirect("/login");

  let workspaces = [];
  let loadError = "";
  try {
    workspaces = await listWorkspaces();
  } catch (err) {
    loadError = String(err.message || err);
  }

  return (
    <main className="shell">
      <Header user={user}>
        <Link className="btn small ghost" href="/dashboard">My forms</Link>
      </Header>
      <Builder
        workspaces={workspaces}
        loadError={loadError}
        voiceApi={Boolean(process.env.GROQ_API_KEY)}
      />
    </main>
  );
}
