"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/browser.js";

export default function ResetForm() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  // "checking" until we know whether the recovery link actually signed them in.
  const [state, setState] = useState("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setState(data?.user ? "ready" : "expired");
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function save(event) {
    event.preventDefault();
    if (!supabase) return;

    if (password.length < 6) {
      setError("Password needs to be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (err) {
      setError(err.message);
      return;
    }
    setState("done");
  }

  if (state === "checking") {
    return (
      <div className="card">
        <p className="lede" style={{ margin: 0 }}>
          <span className="spin" /> Checking your link…
        </p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="card">
        <h1 style={{ fontSize: 23, marginBottom: 6 }}>That link has expired</h1>
        <p className="lede">
          Reset links work once and only for an hour. Ask for a fresh one.
        </p>
        <Link className="btn primary block big" href="/forgot">Send a new link</Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="card">
        <h1 style={{ fontSize: 23, marginBottom: 6 }}>Password changed</h1>
        <p className="lede">You&apos;re signed in with the new password.</p>
        <button
          className="btn primary block big"
          type="button"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
        >
          Go to my forms
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 style={{ fontSize: 23, marginBottom: 6 }}>Set a new password</h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        Pick something you&apos;ll remember. At least 6 characters.
      </p>

      {error && <div className="note bad">{error}</div>}

      <form onSubmit={save}>
        <div className="field">
          <label className="label" htmlFor="pw">New password</label>
          <input
            id="pw"
            type="password"
            value={password}
            required
            minLength={6}
            autoComplete="new-password"
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="pw2">Type it again</label>
          <input
            id="pw2"
            type="password"
            value={confirm}
            required
            minLength={6}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <button className="btn primary block big" type="submit" disabled={busy}>
          {busy ? <><span className="spin" /> Saving…</> : "Save new password"}
        </button>
      </form>
    </div>
  );
}
