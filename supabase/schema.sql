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
-- Closing rules, branding, the live response count, and spam protection
--
-- Added after the first version, so these are all "add if missing" statements.
-- Running this file again on an existing project changes nothing else.
-- ---------------------------------------------------------------------------

alter table public.forms add column if not exists closes_at      timestamptz;
alter table public.forms add column if not exists response_count integer not null default 0;
alter table public.forms add column if not exists accent         text;
alter table public.forms add column if not exists logo_url       text;

-- The "stop after N answers" limit was dropped again: a deadline is the only
-- closing rule now.
alter table public.forms drop constraint if exists forms_max_responses_sane;
alter table public.forms drop column if exists max_responses;

-- A one-way fingerprint of the sender, never their actual address. Used only
-- to stop one person flooding a form, and nothing else reads it.
alter table public.responses add column if not exists ip_hash text;

create index if not exists responses_ip_idx on public.responses (ip_hash, submitted_at desc);

-- Backfill the counter for forms that already have answers.
update public.forms f
   set response_count = c.n
  from (select form_id, count(*)::int as n from public.responses group by form_id) c
 where c.form_id = f.id
   and f.response_count is distinct from c.n;

-- Keep the counter true.
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
-- from outside can push a response into a form that is shut, or flood one.
--
-- The limits are deliberately generous. A whole computer lab sharing one
-- college connection will show up as a single fingerprint, so the per-form
-- ceiling has to survive that; it is set to stop a script, not a classroom.
create or replace function public.check_form_accepting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f      public.forms%rowtype;
  recent integer;
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

  if new.ip_hash is not null then
    -- Same sender, same form, last hour.
    select count(*) into recent
      from public.responses
     where form_id = new.form_id
       and ip_hash = new.ip_hash
       and submitted_at > now() - interval '1 hour';
    if recent >= 40 then
      raise exception 'too_many_from_you';
    end if;

    -- Same sender, every form, last hour. Catches someone walking a script
    -- across several links at once.
    select count(*) into recent
      from public.responses
     where ip_hash = new.ip_hash
       and submitted_at > now() - interval '1 hour';
    if recent >= 120 then
      raise exception 'too_many_from_you';
    end if;
  end if;

  -- Whole-form burst, whoever is sending it.
  select count(*) into recent
    from public.responses
   where form_id = new.form_id
     and submitted_at > now() - interval '1 minute';
  if recent >= 40 then
    raise exception 'too_fast';
  end if;

  return new;
end;
$$;

drop trigger if exists responses_gate on public.responses;
create trigger responses_gate
  before insert on public.responses
  for each row execute function public.check_form_accepting();

grant insert (form_id, answers, ip_hash) on public.responses to anon;

-- ---------------------------------------------------------------------------
-- File storage
--
-- Two buckets:
--   form-files  private. Whatever people attach when filling in a form. An
--               anonymous visitor may drop a file into an open form's folder
--               and nothing else. Only the form's owner can read them back.
--   form-logos  public. The small image an owner puts at the top of their own
--               form, so it has to be readable by anyone opening the link.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('form-files', 'form-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

insert into storage.buckets (id, name, public, file_size_limit)
values ('form-logos', 'form-logos', true, 2097152)
on conflict (id) do update set public = true, file_size_limit = 2097152;

-- --- form-files -------------------------------------------------------------

drop policy if exists "attach a file to an open form" on storage.objects;
create policy "attach a file to an open form"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'form-files'
    and exists (
      select 1 from public.forms f
      where f.id = (storage.foldername(name))[1]
        and f.is_open
        and (f.closes_at is null or now() < f.closes_at)
    )
  );

drop policy if exists "only the form owner reads its files" on storage.objects;
create policy "only the form owner reads its files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'form-files'
    and exists (
      select 1 from public.forms f
      where f.id = (storage.foldername(name))[1]
        and f.user_id = auth.uid()
    )
  );

drop policy if exists "only the form owner deletes its files" on storage.objects;
create policy "only the form owner deletes its files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'form-files'
    and exists (
      select 1 from public.forms f
      where f.id = (storage.foldername(name))[1]
        and f.user_id = auth.uid()
    )
  );

-- --- form-logos -------------------------------------------------------------
-- Each person owns the folder named after their own user id.

drop policy if exists "anyone may see a form logo" on storage.objects;
create policy "anyone may see a form logo"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'form-logos');

drop policy if exists "own your logo folder" on storage.objects;
create policy "own your logo folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'form-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "replace your own logo" on storage.objects;
create policy "replace your own logo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'form-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "remove your own logo" on storage.objects;
create policy "remove your own logo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'form-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
