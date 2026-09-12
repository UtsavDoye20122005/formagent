"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabase/browser.js";

export default function ForgotForm() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send(event) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
    });

    setBusy(false);
    // Deliberately the same message either way: telling a stranger whether an
    // address has an account here is a small leak with no upside.
    if (err && !/rate limit|too many/i.test(err.message)) {
      setSent(true);
      return;
    }
    if (err) {
      setError("Too many attempts. Wait a minute and try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="card">
        <h1 style={{ fontSize: 23, marginBottom: 6 }}>Check your email</h1>
        <p className="lede">
          If <strong>{email.trim()}</strong> has an account, a link to set a new password
          is on its way. It works once, and expires in an hour.
        </p>
        <div className="note">
          Nothing arrived? Look in spam, and make sure you typed the same address you
          signed up with.
        </div>
        <p className="hint" style={{ textAlign: "center", marginTop: 18 }}>
          <Link className="linklike" href="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 style={{ fontSize: 23, marginBottom: 6 }}>Forgot your password?</h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        Type your email and we&apos;ll send you a link to set a new one.
      </p>

      {error && <div className="note bad">{error}</div>}

      <form onSubmit={send}>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            required
            autoComplete="email"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button className="btn primary block big" type="submit" disabled={busy}>
          {busy ? <><span className="spin" /> Sending…</> : "Send the link"}
        </button>
      </form>

      <p className="hint" style={{ textAlign: "center", marginTop: 18 }}>
        Remembered it?{" "}
        <Link className="linklike" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
