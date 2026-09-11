import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "./Header.js";
import Builder from "./Builder.js";
import SetupNotice from "./SetupNotice.js";
import { currentUser } from "../lib/supabase/server.js";
import { isConfigured } from "../lib/supabase/config.js";
import { listWorkspaces } from "../lib/db.js";

export const dynamic = "force-dynamic";

export default async function Home() {
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
      <Builder workspaces={workspaces} loadError={loadError} />
    </main>
  );
}
