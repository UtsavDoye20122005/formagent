"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/browser.js";
import { uploadLogo } from "../../lib/uploads.js";

export default function AccountForm({ initialName, initialAvatar, email, first }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const letters = (name.trim() || email).slice(0, 1).toUpperCase();

  async function pickPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) throw new Error("Sign in again to change your picture.");
      setAvatar(await uploadLogo(userId, file));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function save(event) {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      setError("Pick a name with at least two characters.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const supabase = supabaseBrowser();
      const { error: err } = await supabase.auth.updateUser({
        data: { display_name: clean.slice(0, 40), avatar_url: avatar || null },
      });
      if (err) throw err;
      setSaved(true);
      router.refresh();
      if (first) {
        router.push("/");
        return;
      }
      setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>{first ? "What should we call you?" : "Your details"}</h2>
      <p className="lede">
        {first
          ? "This is the name on your account. We don't take it from Google — pick whatever you'd actually like to be called."
          : "Change your name or your picture whenever you like."}
      </p>

      {error && <div className="note bad">{error}</div>}
      {saved && !first && <div className="note good">Saved.</div>}

      <div className="avatar-row">
        <span className="avatar-big" aria-hidden="true">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" />
          ) : (
            letters
          )}
        </span>
        <div>
          <label className="btn small" htmlFor="photo" style={{ cursor: "pointer" }}>
            {uploading ? <><span className="spin" /> Uploading…</> : avatar ? "Change picture" : "Add a picture"}
          </label>
          <input
            id="photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={pickPhoto}
            disabled={uploading}
            style={{ display: "none" }}
          />
          {avatar && (
            <button className="btn small ghost" type="button" onClick={() => setAvatar("")}>
              Remove
            </button>
          )}
          <p className="hint">PNG, JPG or WEBP, up to 2 MB.</p>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="name">Your name</label>
        <input
          id="name"
          type="text"
          value={name}
          maxLength={40}
          autoFocus={first}
          placeholder="e.g. Utsav, or Prof. Sharma"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="hint">Shown to you in the corner. Nobody filling in your forms sees it.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="email-ro">Email</label>
        <input id="email-ro" type="text" value={email} readOnly disabled />
        <p className="hint">This is how you sign in, so it can&apos;t be changed here.</p>
      </div>

      <button className="btn primary big" type="submit" disabled={busy || uploading}>
        {busy ? <><span className="spin" /> Saving…</> : first ? "That's me →" : "Save"}
      </button>
    </form>
  );
}
