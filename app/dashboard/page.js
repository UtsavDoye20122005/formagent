import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "../Header.js";
import Dashboard from "./Dashboard.js";
import SetupNotice from "../SetupNotice.js";
import { currentUser } from "../../lib/supabase/server.js";
import { isConfigured } from "../../lib/supabase/config.js";
import { listWorkspaces, listForms } from "../../lib/db.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "My forms — FormAgent" };

export default async function DashboardPage() {
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
  let forms = [];
  let loadError = "";
  try {
    [workspaces, forms] = await Promise.all([listWorkspaces(), listForms()]);
  } catch (err) {
    loadError = String(err.message || err);
  }

  return (
    <main className="shell">
      <Header user={user}>
        <Link className="btn small ghost" href="/">New form</Link>
      </Header>
      <Dashboard
        initialWorkspaces={workspaces}
        initialForms={forms}
        loadError={loadError}
      />
    </main>
  );
}
