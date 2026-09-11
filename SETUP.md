# Setting up FormAgent

Follow these in order. Total time is about 20 minutes. Nothing here costs money.

Where you'll be working:

- **Supabase** — the database and the login system → https://supabase.com
- **Google Cloud** — only needed for the "Continue with Google" button → https://console.cloud.google.com
- **Vercel** — where the website runs → https://vercel.com

---

## Step 0 — Put this code online (2 min)

There is an older `formagent-app` project already on your Vercel account. **It has
the old code on it — no login, no sections.** Ignore it, or delete it, and deploy
this folder fresh.

Unzip this project, then in a terminal, inside the folder:

```bash
npm install
npx vercel --prod
```

The first time it will ask you to log in and then a few setup questions — press
Enter for all the defaults, and say **no** when it asks to modify settings.

It prints a URL at the end. **That is your live website.** Because you deployed it
yourself with `--prod`, it is a real production deployment and it is public — you
do not need to touch Deployment Protection at all.

Opening it right now will show an "Almost ready" screen. That's expected: the
database isn't connected yet. Steps 1 to 3 fix that.

> Every time you change an environment variable in Vercel, you have to deploy again
> for it to take effect. Either run `npx vercel --prod` again, or use the Redeploy
> button in the Vercel dashboard.

---

## Step 1 — Make the Supabase project (5 min)

1. Go to https://supabase.com and sign up (use Continue with GitHub, it's quickest).
2. Click **New project**.
3. Name it `formagent`. Pick a database password and **save it somewhere** — you
   won't need it for this app, but losing it is annoying later.
4. Region: pick **Southeast Asia (Singapore)** or **South Asia (Mumbai)** — closest to you,
   so the app feels faster.
5. Click **Create new project** and wait about 2 minutes while it sets up.

## Step 2 — Create the tables (2 min)

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project, copy **everything** in it,
   and paste it into the editor.
4. Click **Run**.

You should see "Success. No rows returned". That's correct — it made the tables,
it didn't fetch anything.

You'll see some yellow NOTICE lines. Those are fine. Running this file a second
time is safe.

## Step 3 — Copy the three keys into Vercel (4 min)

1. In Supabase: **Settings** (gear icon) → **API**.
2. You need three values from that page:

   | On the Supabase page | Call it this in Vercel |
   |---|---|
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
   | Project API keys → `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | Project API keys → `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

3. In Vercel: your project → **Settings** → **Environment Variables**.
4. Add all three. Tick all environments (Production, Preview, Development).
5. Redeploy: **Deployments** tab → the newest one → **⋯** → **Redeploy**.

> **The `service_role` key is a master key.** It can read and write everything,
> ignoring all security rules. Never put it in the frontend, never paste it in a
> chat or a screenshot, never commit it to GitHub. It only ever belongs in Vercel's
> environment variables. If it leaks, go to Supabase → Settings → API and roll it.

At this point open your site. The "Almost ready" screen should be gone and you
should see a sign-in page. **Email/password signup already works now.** Google
sign-in is the next step.

## Step 4 — Tell Supabase where your site lives (1 min)

Otherwise logging in will bounce you to the wrong address.

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: your app's address, e.g. `https://formagent-app.vercel.app`
3. **Redirect URLs**: click Add URL and add:
   ```
   https://your-app-address.vercel.app/auth/callback
   http://localhost:3000/auth/callback
   ```
   (the second one is so it works when you run it on your own laptop)
4. Save.

### Optional: skip the confirmation email while testing

By default Supabase emails a confirmation link before a new account can sign in.
That's correct for real use but slow while you're testing.

Supabase → **Authentication** → **Sign In / Providers** → **Email** → turn off
**Confirm email** → Save. Turn it back on before real people use it.

## Step 5 — Google sign-in (8 min)

This is the fiddliest part. Take it slowly.

**First, get your Supabase callback address.** In Supabase go to
**Authentication** → **Sign In / Providers** → **Google**. Near the bottom there's a
**Callback URL** that looks like:

```
https://abcdefghijklmnop.supabase.co/auth/v1/callback
```

Copy it. You'll paste it into Google in a moment.

**Now in Google Cloud:**

1. Go to https://console.cloud.google.com and sign in.
2. Top left, click the project dropdown → **New Project** → name it `formagent` → Create.
   Make sure you're *inside* that project before continuing.
3. Search for **"OAuth consent screen"** and open it.
   - User Type: **External** → Create
   - App name: `FormAgent`
   - User support email: your email
   - Developer contact email: your email
   - Save and continue through the remaining screens. You can skip Scopes.
   - On **Test users**, add your own Gmail address. While the app is in "Testing"
     mode only the emails listed here can sign in with Google — worth knowing when
     your teacher tries it and gets blocked.
4. Search for **"Credentials"** → **Create Credentials** → **OAuth client ID**.
   - Application type: **Web application**
   - Name: `FormAgent web`
   - Under **Authorized redirect URIs** click **Add URI** and paste the Supabase
     callback URL you copied above. This must match exactly.
   - Create.
5. Google shows you a **Client ID** and a **Client secret**. Keep that box open.

**Back in Supabase:**

1. **Authentication** → **Sign In / Providers** → **Google**
2. Turn **Enable Sign in with Google** on
3. Paste the Client ID and Client secret
4. Save

Now try the "Continue with Google" button on your site.

> If you get *"Access blocked: app has not completed verification"*, that's the
> Testing-mode limit from step 3. Either add that person under Test users, or
> click **Publish app** on the OAuth consent screen.

## Step 6 — Make the forms actually smart (3 min)

Without this, form-building uses a simple word-matching parser I wrote. It handles
common cases but it isn't clever.

1. Get an API key at https://console.anthropic.com (Settings → API Keys).
2. Vercel → **Settings** → **Environment Variables** → add `ANTHROPIC_API_KEY`.
3. Redeploy.

Cost is a fraction of a rupee per form. If the key is missing or the call fails,
the app quietly falls back to the parser instead of breaking.

## Step 7 — Check a stranger can open your forms

If you deployed with `npx vercel --prod` in step 0, this already works. Test it:
open one of your form links in a private/incognito window. You should see the form,
not a Vercel login page.

If you do get a Vercel login screen, you're looking at a *preview* deployment
instead of production. Fix it with:

1. Vercel → your project → **Settings** → **Deployment Protection** → turn
   **Vercel Authentication** off, **or**
2. **Deployments** → newest → **⋯** → **Promote to Production**

---

## Running it on your own laptop

Create a file called `.env.local` in the project folder:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
```

Then:

```bash
npm install
npm run dev
```

Open http://localhost:3000

`.env.local` is already in `.gitignore`, so it won't get pushed to GitHub. Keep it
that way.

---

## Quick troubleshooting

| What you see | What's wrong |
|---|---|
| "Almost ready" screen | The three Supabase variables aren't set in Vercel, or you didn't redeploy after adding them |
| Sign-in works but the dashboard is empty and errors | You skipped step 2 — the tables don't exist |
| Google button says "provider is not enabled" | Step 5 isn't finished in Supabase |
| Google sends you to a wrong or broken page | The redirect URI in Google doesn't exactly match the Supabase callback URL |
| Logged in, then immediately logged out | Site URL / Redirect URLs in step 4 don't match your real address |
| Signup says check your email, but no email arrives | Supabase's free built-in email is rate-limited. Turn off "Confirm email" while testing |
| Strangers get a Vercel login when opening a form link | Step 7 |

## How your data is kept apart

Every table has row-level security switched on in the database itself. A user's
account id has to match the row's owner or the database returns nothing — this is
enforced by Postgres, not by the app code, so a bug in the app can't leak someone
else's forms.

The two things a logged-out visitor can do — open a form by its link and submit an
answer — run on the server with the service key and check the form themselves. The
public form page deliberately never reveals who owns the form.

I tested this against a real Postgres before shipping: a second user could not read,
list, delete, or forge anything belonging to the first.
