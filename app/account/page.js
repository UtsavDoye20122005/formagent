import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "../Header.js";
import AccountForm from "./AccountForm.js";
import { currentUser } from "../../lib/supabase/server.js";
import { isConfigured } from "../../lib/supabase/config.js";
import { displayName, avatarUrl } from "../../lib/profile.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your details — JiffyThat" };

export default async function AccountPage({ searchParams }) {
  if (!isConfigured()) redirect("/");

  const user = await currentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const first = params?.first === "1";

  return (
    <main className="shell narrow">
      <Header user={user}>
        {!first && <Link className="btn small ghost" href="/">New form</Link>}
      </Header>
      <AccountForm
        initialName={displayName(user)}
        initialAvatar={avatarUrl(user)}
        email={user.email || ""}
        first={first}
      />
    </main>
  );
}
