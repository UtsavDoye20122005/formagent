"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/browser.js";

const GoogleMark = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.3 6.6v5.5h7c4.1-3.8 6.6-9.4 6.6-16.3z" />
    <path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-7-5.5c-1.9 1.3-4.4 2.1-7.3 2.1-5.6 0-10.4-3.8-12.1-8.9H4.7v5.7C8.3 41.4 15.6 46 24 46z" />
    <path fill="#FBBC05" d="M11.9 28.5c-.4-1.3-.7-2.7-.7-4.5s.3-3.2.7-4.5v-5.7H4.7C3.1 17 2 20.4 2 24s1.1 7 2.7 10.2l7.2-5.7z" />
    <path fill="#EA4335" d="M24 10.6c3.2 0 6 1.1 8.2 3.2l6.2-6.2C34.7 4.1 29.8 2 24 2 15.6 2 8.3 6.6 4.7 13.8l7.2 5.7c1.7-5.1 6.5-8.9 12.1-8.9z" />
  </svg>
);

export default function LoginForm() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const signingUp = mode === "signup";

  async function withGoogle() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setBusy(false);
      setError(
        err.message?.includes("provider is not enabled")
          ? "Google sign-in isn't switched on in Supabase yet. Use email and password for now."
          : err.message
      );
    }
  }

  async function withEmail(event) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (signingUp) {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) throw err;
        if (data.session) {
          router.push("/");
          router.refresh();
          return;
        }
        setMessage("Check your email for a confirmation link, then sign in.");
        setMode("signin");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.push("/");
        router.refresh();
        return;
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1 style={{ fontSize: 23, marginBottom: 6 }}>
        {signingUp ? "Create your account" : "Sign in to FormAgent"}
      </h1>
      <p className="lede" style={{ marginBottom: 22 }}>
        {signingUp
          ? "Your forms and sections stay private to you."
          : "Welcome back. Your forms are where you left them."}
      </p>

      {error && <div className="note bad">{error}</div>}
      {message && <div className="note good">{message}</div>}

      <button className="btn google" onClick={withGoogle} disabled={busy} type="button">
        <GoogleMark />
        Continue with Google
      </button>

      <div className="or"><span>or</span></div>

      <form onSubmit={withEmail}>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="label-row">
            <label className="label" htmlFor="password">Password</label>
            {!signingUp && (
              <Link className="linklike small" href="/forgot">Forgot?</Link>
            )}
          </div>
          <input
            id="password"
            type="password"
            value={password}
            required
            minLength={6}
            autoComplete={signingUp ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signingUp && <p className="hint">At least 6 characters.</p>}
        </div>

        <button className="btn primary block big" type="submit" disabled={busy}>
          {busy ? <><span className="spin" /> Just a moment…</> : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="hint" style={{ textAlign: "center", marginTop: 18 }}>
        {signingUp ? "Already have an account?" : "New here?"}{" "}
        <button
          className="linklike"
          type="button"
          onClick={() => {
            setMode(signingUp ? "signin" : "signup");
            setError("");
            setMessage("");
          }}
        >
          {signingUp ? "Sign in" : "Create one"}
        </button>
      </p>
    </div>
  );
}

function friendly(err) {
  const raw = String(err?.message || err);
  if (/invalid login credentials/i.test(raw)) return "That email and password don't match.";
  if (/already registered/i.test(raw)) return "That email already has an account. Try signing in.";
  if (/password should be/i.test(raw)) return "Password needs to be at least 6 characters.";
  return raw;
}
