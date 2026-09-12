import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — JiffyThat",
  description: "How JiffyThat handles your data.",
};

const UPDATED = "13 September 2026";
const CONTACT = "utsavdoye07@gmail.com";

export default function Privacy() {
  return (
    <main className="shell narrow legal">
      <p className="legal-back">
        <Link href="/">← Back to JiffyThat</Link>
      </p>

      <h1>Privacy Policy</h1>
      <p className="lede">Last updated {UPDATED}</p>

      <p>
        JiffyThat lets you describe a form in your own words and turns it into a
        shareable web form. This page explains, in plain language, what we store
        and why.
      </p>

      <h2>Who runs this service</h2>
      <p>
        JiffyThat is operated by an individual developer. For any question about
        your data, write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account.</strong> When you sign in with Google we receive
          your email address, your name and your profile picture from Google. If
          you sign up with email instead, we store your email address and a
          securely hashed password. We never see or store your Google password.
        </li>
        <li>
          <strong>What you create.</strong> The instructions you type or speak,
          the forms generated from them, and the sections you organise them into.
        </li>
        <li>
          <strong>Form responses.</strong> Whatever people type into a form you
          published. You choose the questions, so you decide what is collected.
          Responses are visible to the form&apos;s owner only.
        </li>
        <li>
          <strong>Files people attach.</strong> If a form asks for an upload, the
          file is stored privately and can be opened only by that form&apos;s
          owner, through a link that expires.
        </li>
        <li>
          <strong>A fingerprint of the sender.</strong> When someone submits a
          form we store a one-way hash of their IP address — never the address
          itself, and it cannot be turned back into one. It exists for a single
          purpose: to stop one person flooding a form with thousands of fake
          answers. Nothing else reads it, and it is not shown to form owners.
        </li>
      </ul>
      <p>
        We do not use tracking or advertising cookies. The only cookie set is the
        one that keeps you signed in.
      </p>

      <h2>Where it is stored</h2>
      <p>
        All accounts, forms and responses are stored in a Supabase-hosted
        PostgreSQL database, and uploaded files in Supabase storage. Each account
        can only read its own forms, responses and files; this is enforced by the
        database itself, not only by the app.
      </p>

      <h2>Who else sees it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — hosts the database and handles sign-in.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the website.
        </li>
        <li>
          <strong>Groq</strong> — when you ask JiffyThat to build a form, the
          instructions you wrote (or the audio you recorded, if you used the
          microphone) are sent to Groq so the form can be generated, and the
          result is sent back. Nothing else about your account is sent.
        </li>
      </ul>
      <p>
        We do not sell your data, and we do not share it with anyone beyond the
        services listed above.
      </p>

      <h2>Google user data</h2>
      <p>
        Signing in with Google gives JiffyThat only your basic profile
        information: email address, name and profile picture. We use it solely to
        create your account, show who is signed in, and keep your forms attached
        to you. We do not read your Gmail, Drive, Contacts or Calendar, and we do
        not request access to them. JiffyThat&apos;s use of information received
        from Google APIs follows the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your forms and their responses stay until you delete them or delete your
        account. Deleting a form deletes its responses with it.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Delete any form, and its responses go with it.</li>
        <li>Ask us to delete a particular uploaded file at the address below.</li>
        <li>
          Ask us to delete your account and everything in it by writing to{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will do it within 30
          days.
        </li>
        <li>Ask for a copy of what we hold about you at the same address.</li>
      </ul>

      <h2>People who fill in your forms</h2>
      <p>
        If you publish a form, you are responsible for what you ask people and
        for how you use their answers. Do not collect passwords, payment card
        numbers, government ID numbers or similar sensitive details through
        JiffyThat.
      </p>

      <h2>Children</h2>
      <p>
        JiffyThat is not intended for people under 13, and accounts should not be
        created by them.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top changes with it. Significant
        changes will be announced on the site.
      </p>

      <p className="legal-back">
        <Link href="/terms">Terms of Service</Link>
      </p>
    </main>
  );
}
