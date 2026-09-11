export default function SetupNotice() {
  return (
    <div className="card" style={{ marginTop: 48 }}>
      <div className="brand" style={{ marginBottom: 18 }}>
        <span className="mark">F</span>
        <span>FormAgent</span>
      </div>
      <h1 style={{ fontSize: 22 }}>Almost ready</h1>
      <p className="lede">
        The app is deployed but it isn&apos;t connected to a database yet, so there is
        nowhere to keep accounts or forms.
      </p>
      <p className="lede" style={{ marginBottom: 8 }}>
        Add these environment variables in Vercel, then redeploy:
      </p>
      <ul className="setup-list">
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
        <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
        <li><code>SUPABASE_SERVICE_ROLE_KEY</code></li>
      </ul>
      <p className="hint">
        All three are in your Supabase project under Settings → API. The full
        walkthrough is in SETUP.md in the project folder.
      </p>
    </div>
  );
}
