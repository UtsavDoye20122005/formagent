# JiffyThat

Describe a form in plain words — by voice or text — and get a link anyone can open
and fill in. Answers land in your own private dashboard, exportable to CSV or
straight into Google Sheets.

Every user has their own account, their own forms, and their own sections.

**Setup instructions are in [SETUP.md](SETUP.md). Start there.**

## What's in it

| Page | What it does |
|---|---|
| `/login` | Sign in or sign up. Google, or email and password. |
| `/` | The builder. Speak or type, review the questions, pick a section, publish. |
| `/f/<id>` | The public form. Anyone can fill it in — no account needed. |
| `/dashboard` | Your forms, with your sections down the left side. |
| `/dashboard/<id>` | One form's responses, plus CSV and Google Sheets export. |

## Sections

A section is just a folder the user makes for themselves — "College", "AIESEC",
a client's name. The app ships with none; users create their own. A form can sit
in a section or stay unfiled, and can be moved between sections at any time.
Deleting a section does **not** delete its forms — they become unfiled.

## Built with

- **Next.js 15** (App Router) — the website
- **Supabase** — Postgres database + login (Google and email/password)
- **Claude API** — turns instructions into form questions, with a rule-based
  fallback when no API key is set
- **Web Speech API** — voice input (Chrome, Edge, Safari)
- Deployed on **Vercel**

## How the code is laid out

```
app/
  page.js                    builder (needs login)
  Builder.js                 the instruction box, voice, editing, publishing
  login/                     sign in and sign up
  auth/callback/             where Google sends people back to
  f/[id]/                    the public form — the only page with no login
  dashboard/                 your forms, your sections
  api/                       forms, responses, workspaces, generate
lib/
  ai.js                      the Claude call
  parse.js                   offline fallback parser
  schema.js                  cleans and validates form definitions
  db.js                      all database reads and writes
  supabase/                  browser, server and admin clients
supabase/schema.sql          tables + security rules — paste into Supabase
middleware.js                keeps the login session alive
```

## How form generation works

`lib/ai.js` sends the instructions to Claude with a strict JSON shape and rules
about which field type to use when. `lib/parse.js` is the offline fallback.
Whatever comes back goes through `normalizeForm()` in `lib/schema.js`, which forces
it into a shape the renderer can trust — unknown types become plain text, choice
fields with fewer than two options become text, ids are made unique. Nothing the
model returns is rendered without passing that gate.

Submissions are validated again on the server against the form's own field list,
so a hand-crafted request can't add fields or skip required ones.

## Security

Row-level security is on for every table, enforced by Postgres. A user's account
id must match the row's owner or the query returns nothing — so a bug in the app
code still can't leak another user's forms or responses.

The two things a logged-out visitor can do (open a form by link, submit an answer)
run server-side with the service key and do their own checks. The public form page
never reveals who owns the form.

## Ideas for v2

- Email or WhatsApp alert on each new response
- Duplicate an existing form
- Charts for rating and choice questions
- Share a section with a teammate
- A custom domain and per-client branding
