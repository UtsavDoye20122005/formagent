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

-- A fingerprint of the answers themselves, so "has this exact response already
-- arrived?" is one index lookup. Without it, 500 people submitting at the same
-- moment would each re-read every submission that arrived just before them.
-- Written by the database, not the app, so it can never disagree with the row.
alter table public.responses add column if not exists answers_hash text;

update public.responses
   set answers_hash = md5(answers::text)
 where answers_hash is null;

create or replace function public.set_answers_hash()
returns trigger
language plpgsql
as $$
begin
  new.answers_hash := md5(coalesce(new.answers, '{}'::jsonb)::text);
  return new;
end;
$$;

drop trigger if exists responses_hash on public.responses;
create trigger responses_hash
  before insert or update of answers on public.responses
  for each row execute function public.set_answers_hash();

create index if not exists responses_dupe_idx
  on public.responses (form_id, ip_hash, answers_hash, submitted_at desc);

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
  fld    jsonb;
  path   text;
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
    --
    -- A lecture hall on one college connection is ONE sender. The old ceiling
    -- of 40 meant the 41st student in a class was told to come back later,
    -- which looks exactly like the site being broken. A fest registration can
    -- easily be 500 students on one campus connection in a single go, so the
    -- ceiling is set well above the largest room anyone can fill.
    select count(*) into recent
      from public.responses
     where form_id = new.form_id
       and ip_hash = new.ip_hash
       and submitted_at > now() - interval '1 hour';
    if recent >= 2000 then
      raise exception 'too_many_from_you';
    end if;

    -- Same sender, every form, last hour. Catches someone walking a script
    -- across several links at once.
    select count(*) into recent
      from public.responses
     where ip_hash = new.ip_hash
       and submitted_at > now() - interval '1 hour';
    if recent >= 5000 then
      raise exception 'too_many_from_you';
    end if;
  end if;

  -- Whole-form burst, whoever is sending it. "Everyone register now" to a hall
  -- of 500 produces a genuine spike, so this is not a speed limit on people —
  -- it is the ceiling above which no real audience can be the cause.
  select count(*) into recent
    from public.responses
   where form_id = new.form_id
     and submitted_at > now() - interval '1 minute';
  if recent >= 2000 then
    raise exception 'too_fast';
  end if;

  -- Raising the ceilings above so a classroom fits means a determined script
  -- could push hundreds of rows an hour. From the server's side, sixty students
  -- behind one college router and one script look identical — counting requests
  -- cannot tell them apart. What CAN: sixty students never send byte-identical
  -- answers, and a script usually sends nothing else. So the same sender
  -- repeating an identical answer inside a minute is refused.
  --
  -- Guarded by the 8-character test so a one-question "Yes / No" poll, where
  -- a whole class genuinely does answer identically, is left alone. Any form
  -- asking a name or an email clears that bar, and two different people do not
  -- share one.
  if new.ip_hash is not null
     and exists (
       select 1 from jsonb_each_text(coalesce(new.answers, '{}'::jsonb)) as kv(k, v)
        where length(v) >= 8
     )
     and exists (
       -- Matched on a hash rather than by comparing the answers themselves, so
       -- this stays an index lookup when 500 people send at once instead of
       -- every submission re-reading every other submission.
       select 1 from public.responses r
        where r.form_id = new.form_id
          and r.ip_hash = new.ip_hash
          and r.answers_hash = md5(new.answers::text)
          and r.submitted_at > now() - interval '1 minute'
     )
  then
    raise exception 'already_sent';
  end if;

  -- An upload answer is only the path the file landed at. Nothing stopped a
  -- hand-made request from naming a file that was never uploaded, which would
  -- show a resume in the dashboard that opens to nothing. Check it is really
  -- there, and really inside this form's own folder.
  for fld in select * from jsonb_array_elements(coalesce(f.fields, '[]'::jsonb))
  loop
    if fld->>'type' = 'file' then
      path := nullif(trim(new.answers->>(fld->>'id')), '');
      if path is not null then
        if split_part(path, '/', 1) <> new.form_id then
          raise exception 'file_not_uploaded';
        end if;
        if not exists (
          select 1 from storage.objects
           where bucket_id = 'form-files'
             and name = path
        ) then
          raise exception 'file_not_uploaded';
        end if;
      end if;
    end if;
  end loop;

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
