import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "../../Header.js";
import Responses from "./Responses.js";
import { currentUser } from "../../../lib/supabase/server.js";
import { isConfigured } from "../../../lib/supabase/config.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Responses — JiffyThat" };

export default async function ResponsesPage({ params }) {
  if (!isConfigured()) redirect("/");

  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  return (
    <main className="shell">
      <Header user={user}>
        <Link className="btn small ghost" href="/dashboard">My forms</Link>
        <Link className="btn small ghost" href="/">New form</Link>
      </Header>
      <Responses formId={id} />
    </main>
  );
}
