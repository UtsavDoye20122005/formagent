# JiffyThat

Say what you need to collect. Get back a form with a link you can share.

You talk — in English, or Hindi typed the way people actually type it — and it
writes the questions, picks the right kind of input for each one, and gives you a
link. People fill it in, and the answers come back with charts.

Live at **[formagent-web.vercel.app](https://formagent-web.vercel.app)**
(the URL still carries the old name).

---

## Why I built it

A teacher at my college needed a registration form and didn't want to spend
twenty minutes dragging fields around in Google Forms. She wanted to say what she
needed and be done.

That turned out to be the easy half. The hard half was everything that happens
after she shares the link — sixty students submitting at once from one college
wifi, someone closing the tab halfway through, a deadline that means one thing to
her and another to the server. Most of the work in this repo is that half.

---

## What it does

| | |
|---|---|
| **Write a form by talking** | Speak or type what you want. It picks short text, email, phone, dropdown, yes/no, ratings, dates — whichever fits the question. |
| **Handles Hinglish** | Dictate in Hindi typed in English and the form still comes out in English. |
| **Deadlines from speech** | "Close it before the 28th" sets the closing date. After that, nobody can submit. |
| **Multi-page forms** | Long forms break into steps, and each step is checked before you move on. |
| **Remembers half-finished answers** | Close the tab, come back, and what you typed is still there — on the same step. |
| **Real analysis** | Donut charts for choices, bars for multi-select, average and median for numbers, quotes for text. Plus a breakdown control that cross-tabs any question against another. |
| **Fix typos after sharing** | Edit the wording of a question that already has answers, without disconnecting it from them. |
| **Export** | CSV, or copy straight into Google Sheets. |
| **QR code** | For a slide or a poster. |

Every account is separate. Your forms and answers are yours, and the database
enforces that, not the app code.

---

## Some things that took longer than expected

These are the parts I'd want to read about if I opened someone else's repo.

### The 41st student

The spam protection counted how many responses came from one sender. A college
wifi is *one* sender — so a class of sixty hit the limit at student 41 and got
told to come back later. It looked exactly like the site being broken.

Raising the number didn't fix it, it just moved the problem. Counting is O(n):
every submission has to re-read every submission already in the window. With
5,000 students arriving together, that one check read **5,043 database pages per
insert** and turned a sub-second job into 34 seconds.

The real problem was that it could never work. From the database's side, 5,000
students behind one router and one script look identical. Counting requests
cannot separate them, so the count was buying nothing at a real price.

What replaced it costs nothing and actually works: 5,000 students never send
byte-identical answers, and a script usually sends nothing else. So a repeated
identical submission is refused, matched on a hash with an index, in constant
time. It also happens to catch someone pressing submit twice.

**Result: 5,000 submissions from one connection in 836ms.**

### A deadline that was a day late

Say "close it on 28 September" and it stored 23:59 — with no timezone attached.
The server runs on UTC. So the form actually closed at **5:29 in the morning on
the 29th**, India time, and students could still submit after the deadline.

The fix is to pin the wall-clock time to a real moment in the browser, where the
person's own timezone is known, before it ever reaches the server.

### The bug that only appears under load

Even after removing the slow checks, 5,000 submissions still took 27 seconds. I
went looking in the wrong place for a while.

Every response bumps a counter on the same row of the forms table, and the safety
check reads that row on every insert. Postgres keeps the old version of a row
each time it's updated, so during a burst that one row grows a chain of dead
copies, and each read walks further down it. Reading it went from **1 page to 30**
over the course of a single registration window.

Two lines of table configuration fixed it. You cannot find this by reading code —
only by measuring.

### A student can run code in your teacher's spreadsheet

If someone types `=1+1` as their name, Excel and Google Sheets treat it as a
formula and run it when the file opens. A nastier formula can reach out to a web
address. Every exported cell that starts with `=`, `+`, `-` or `@` is now
neutralised.

### Videos and resumes are links, not uploads

A 10 MB upload cap and a rehearsal video are incompatible. So anything that
sounds like a recording — or a resume, portfolio, certificate, marksheet — is
asked for as a link instead, with wording that reminds people to set Drive
sharing correctly.

There's a harder reason than the cap. 500 students each attaching a 2 MB resume is
1 GB — the entire free storage allowance, from one form, with uploads failing
halfway through registration. A link costs nothing at any size, and every student
already has their own Drive.

---

## How it's built

- **Next.js 15** (App Router), plain JavaScript
- **Supabase** — Postgres and accounts. Row-level security, so one account can
  never read another's data even if the app code has a bug
- **Groq** — writes the questions, and transcribes the voice
- **Vercel** — hosting, plus a daily job that keeps the database from going to
  sleep

The rules that matter live in the database as triggers, not in the API. A form
that is closed, past its deadline, or being flooded is refused by Postgres
itself — so no amount of poking at the API from outside gets around it.

Setup instructions are in **[SETUP.md](SETUP.md)**.

---

## What it doesn't do

Worth saying plainly:

- **No email when a response arrives.** You check the dashboard.
- **No receipt for the person who filled it in.**
- **You can't delete a question once it has answers** — only reword it, reorder
  it, or make it optional. Deleting would throw away what people wrote, so it's
  refused with a reason.
- **Nothing stops the AI writing a careless question.** If you dictate "collect
  their card number", it will build that. The guard rail is you.
- **Free-tier limits are real.** 1 GB of file storage and 500 MB of database on
  Supabase's free plan. Collecting files as links, which is the default, keeps
  you well clear of both.

---

## Numbers

Measured, not estimated:

| | |
|---|---|
| 5,000 submissions from one wifi connection | 836 ms |
| Longest form tested | 20 questions, 4 pages |
| Time to write a form from speech | about 2 seconds |
| Cost to run | nothing, on free tiers |

---

Built by [Utsav Doye](https://github.com/UtsavDoye20122005).
