-- FormAgent database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A workspace is a section the user makes for themselves ("College", "AIESEC",
-- "Client work"). We never create one for them.
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);

create table if not exists public.forms (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id) on delete set null,
  title         text not null,
  description   text not null default '',
  submit_label  text not null default 'Submit',
  thank_you     text not null default '',
  fields        jsonb not null default '[]'::jsonb,
  is_open       boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.responses (
  id            uuid primary key default gen_random_uuid(),
  form_id       text not null references public.forms (id) on delete cascade,
  answers       jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz not null default now()
);

create index if not exists forms_user_idx       on public.forms (user_id, created_at desc);
create index if not exists forms_workspace_idx  on public.forms (workspace_id);
create index if not exists responses_form_idx   on public.responses (form_id, submitted_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Everything here is owner-only. The public form page and the submit endpoint
-- do NOT rely on these policies: they run on the server with the service role
-- key and do their own checking. That way the public anon key can never be
-- used to list other people's forms or read anyone's responses.
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.forms      enable row level security;
alter table public.responses  enable row level security;

drop policy if exists "workspaces are private to their owner" on public.workspaces;
create policy "workspaces are private to their owner"
  on public.workspaces
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "forms are private to their owner" on public.forms;
create policy "forms are private to their owner"
  on public.forms
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "only the form owner reads responses" on public.responses;
create policy "only the form owner reads responses"
  on public.responses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = responses.form_id
        and f.user_id = auth.uid()
    )
  );

drop policy if exists "only the form owner deletes responses" on public.responses;
create policy "only the form owner deletes responses"
  on public.responses
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = responses.form_id
        and f.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Table permissions
--
-- Supabase usually grants these automatically for new tables, but that depends
-- on the "Automatically expose new tables" project setting. Setting them here
-- explicitly means this schema works on any Supabase project, however it was
-- configured. Row Level Security above still decides which ROWS each person
-- sees; these grants only decide who may touch the table at all.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.forms      to authenticated;
grant select, insert, update, delete on public.responses  to authenticated;

grant all on public.workspaces to service_role;
grant all on public.forms      to service_role;
grant all on public.responses  to service_role;
