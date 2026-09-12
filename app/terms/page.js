import Link from "next/link";

export const metadata = {
  title: "Terms of Service — FormAgent",
  description: "The rules for using FormAgent.",
};

const UPDATED = "12 September 2026";
const CONTACT = "utsavdoye07@gmail.com";

export default function Terms() {
  return (
    <main className="shell narrow legal">
      <p className="legal-back">
        <Link href="/">← Back to FormAgent</Link>
      </p>

      <h1>Terms of Service</h1>
      <p className="lede">Last updated {UPDATED}</p>

      <p>
        By creating an account on FormAgent you agree to what follows. If you do
        not agree, please do not use the service.
      </p>

      <h2>What FormAgent does</h2>
      <p>
        You describe a form in words or by voice, FormAgent builds it, and you
        get a link you can send to other people. Their answers come back to your
        dashboard.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in details to yourself. You are responsible for what
        happens under your account. One person, one account.
      </p>

      <h2>What you may not do</h2>
      <ul>
        <li>
          Collect passwords, payment card numbers, government ID numbers or
          similar sensitive details through a form.
        </li>
        <li>
          Impersonate another person, company or institution, or build a form
          that pretends to be an official one.
        </li>
        <li>Send unsolicited bulk messages pointing at your forms.</li>
        <li>Break the law, or use FormAgent to harm or deceive anyone.</li>
        <li>
          Attack, overload or attempt to break into the service or the accounts
          of others.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        Your forms and the responses you collect belong to you. We store and
        display them only so the service can work. You are responsible for what
        you ask people and for handling their answers lawfully.
      </p>

      <h2>Availability</h2>
      <p>
        FormAgent is provided as it is, with no guarantee of uptime, accuracy of
        generated forms, or that data will never be lost. Keep your own copy of
        anything important — you can export responses at any time. To the extent
        the law allows, we are not liable for losses arising from your use of the
        service.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using FormAgent whenever you like and ask us to delete your
        account by writing to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We may
        suspend an account that breaks these terms.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change; the date at the top will change with them.
        Continuing to use FormAgent after a change means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>

      <p className="legal-back">
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </main>
  );
}
