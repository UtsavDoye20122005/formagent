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

-- ---------------------------------------------------------------------------
-- Public access
--
-- A person filling in a form is not logged in. Rather than relying on a secret
-- server key, these two policies let an anonymous visitor do exactly two things
-- and nothing else: read a form that is open, and post an answer to it.
-- They can never read anyone's responses.
-- ---------------------------------------------------------------------------

drop policy if exists "anyone may read an open form" on public.forms;
create policy "anyone may read an open form"
  on public.forms
  for select
  to anon, authenticated
  using (is_open = true);

drop policy if exists "anyone may answer an open form" on public.responses;
create policy "anyone may answer an open form"
  on public.responses
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.forms f
      where f.id = responses.form_id
        and f.is_open
    )
  );

grant usage on schema public to anon;
grant select on public.forms to anon;
grant insert on public.responses to anon;

-- ---------------------------------------------------------------------------
-- Closing rules, branding and the live response count
--
-- Added after the first version, so these are all "add if missing" statements.
-- Running this file again on an existing project changes nothing else.
-- ---------------------------------------------------------------------------

alter table public.forms add column if not exists closes_at      timestamptz;
alter table public.forms add column if not exists max_responses  integer;
alter table public.forms add column if not exists response_count integer not null default 0;
alter table public.forms add column if not exists accent         text;
alter table public.forms add column if not exists logo_url       text;

alter table public.forms drop constraint if exists forms_max_responses_sane;
alter table public.forms add  constraint forms_max_responses_sane
  check (max_responses is null or max_responses between 1 and 100000);

-- Backfill the counter for forms that already have answers.
update public.forms f
   set response_count = c.n
  from (select form_id, count(*)::int as n from public.responses group by form_id) c
 where c.form_id = f.id
   and f.response_count is distinct from c.n;

-- Keep the counter true. The public form page reads it to decide whether a
-- form has hit its limit, and an anonymous visitor is not allowed to count
-- rows in responses themselves.
create or replace function public.bump_response_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.forms set response_count = response_count + 1 where id = new.form_id;
    return new;
  else
    update public.forms set response_count = greatest(response_count - 1, 0) where id = old.form_id;
    return old;
  end if;
end;
$$;

drop trigger if exists responses_count_ins on public.responses;
create trigger responses_count_ins
  after insert on public.responses
  for each row execute function public.bump_response_count();

drop trigger if exists responses_count_del on public.responses;
create trigger responses_count_del
  after delete on public.responses
  for each row execute function public.bump_response_count();

-- The real gate. Enforced by the database, so no amount of poking at the API
-- from outside can push a response into a form that is shut.
create or replace function public.check_form_accepting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.forms%rowtype;
begin
  select * into f from public.forms where id = new.form_id;

  if not found then
    raise exception 'form_not_found';
  end if;
  if not f.is_open then
    raise exception 'form_closed';
  end if;
  if f.closes_at is not null and now() >= f.closes_at then
    raise exception 'form_past_deadline';
  end if;
  if f.max_responses is not null and f.response_count >= f.max_responses then
    raise exception 'form_full';
  end if;

  return new;
end;
$$;

drop trigger if exists responses_gate on public.responses;
create trigger responses_gate
  before insert on public.responses
  for each row execute function public.check_form_accepting();
