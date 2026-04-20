-- ============================================================
--  EMB Prospect Tracker — RLS Lockdown Migration
--  Apply in Supabase SQL Editor.
--
--  Order of operations for safe rollout:
--    1. Run this whole file ONCE — it enables RLS AND adds a
--       transitional anon policy so old app versions keep working.
--    2. Create email/password accounts for each LO in the Supabase
--       Auth dashboard (Auth → Users → Add User).
--    3. Ship Electron v2.1.0 and iOS auth build. Every LO logs in
--       once on each device.
--    4. After all clients migrated, run the TIGHTEN section at the
--       bottom to drop the anon policy.
--    5. Rotate the anon key in Supabase (Settings → API → Reset).
-- ============================================================

-- ---- PART 1: Enable RLS + authenticated policy on every table ----

-- contacts
alter table public.contacts enable row level security;
drop policy if exists "authenticated_full_access" on public.contacts;
create policy "authenticated_full_access" on public.contacts
  for all to authenticated using (true) with check (true);

-- contact_log
alter table public.contact_log enable row level security;
drop policy if exists "authenticated_full_access" on public.contact_log;
create policy "authenticated_full_access" on public.contact_log
  for all to authenticated using (true) with check (true);

-- notes (legacy, still read)
alter table public.notes enable row level security;
drop policy if exists "authenticated_full_access" on public.notes;
create policy "authenticated_full_access" on public.notes
  for all to authenticated using (true) with check (true);

-- gmail_log
alter table public.gmail_log enable row level security;
drop policy if exists "authenticated_full_access" on public.gmail_log;
create policy "authenticated_full_access" on public.gmail_log
  for all to authenticated using (true) with check (true);

-- sms_messages
alter table public.sms_messages enable row level security;
drop policy if exists "authenticated_full_access" on public.sms_messages;
create policy "authenticated_full_access" on public.sms_messages
  for all to authenticated using (true) with check (true);

-- column_labels
alter table public.column_labels enable row level security;
drop policy if exists "authenticated_full_access" on public.column_labels;
create policy "authenticated_full_access" on public.column_labels
  for all to authenticated using (true) with check (true);

-- app_settings
alter table public.app_settings enable row level security;
drop policy if exists "authenticated_full_access" on public.app_settings;
create policy "authenticated_full_access" on public.app_settings
  for all to authenticated using (true) with check (true);

-- quick_notes (deprecated, in case it still exists with data)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='quick_notes') then
    execute 'alter table public.quick_notes enable row level security';
    execute 'drop policy if exists "authenticated_full_access" on public.quick_notes';
    execute 'create policy "authenticated_full_access" on public.quick_notes
             for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- ---- PART 1b: Additional tables found in Supabase ----
-- audit_log, contact_history, deleted_records were not in the original
-- spec but exist in the DB. Apply RLS + authenticated policy to them too.

alter table public.audit_log enable row level security;
drop policy if exists "authenticated_full_access" on public.audit_log;
create policy "authenticated_full_access" on public.audit_log
  for all to authenticated using (true) with check (true);

alter table public.contact_history enable row level security;
drop policy if exists "authenticated_full_access" on public.contact_history;
create policy "authenticated_full_access" on public.contact_history
  for all to authenticated using (true) with check (true);

alter table public.deleted_records enable row level security;
drop policy if exists "authenticated_full_access" on public.deleted_records;
create policy "authenticated_full_access" on public.deleted_records
  for all to authenticated using (true) with check (true);

-- ---- PART 1c: Defensive sweep — catch any other public.* tables ----
-- Enables RLS + authenticated_full_access on every public table that
-- doesn't already have it. Safe to re-run.
do $$
declare
  tbl record;
begin
  for tbl in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', tbl.tablename);
    execute format('drop policy if exists "authenticated_full_access" on public.%I', tbl.tablename);
    execute format('create policy "authenticated_full_access" on public.%I
                    for all to authenticated using (true) with check (true)', tbl.tablename);
  end loop;
end $$;

-- ---- PART 2: TRANSITIONAL anon policy ----
-- Keeps old (pre-v2.1.0) clients working during the rollout window.
-- DROP THESE once all LOs are on the new build (see PART 3).

-- Defensive sweep — drop any existing anon_transition, then add one to every public.* table.
do $$
declare
  tbl record;
begin
  for tbl in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop policy if exists "anon_transition" on public.%I', tbl.tablename);
    execute format('create policy "anon_transition" on public.%I
                    for all to anon using (true) with check (true)', tbl.tablename);
  end loop;
end $$;

-- ============================================================
--  PART 3: TIGHTEN — run this AFTER both apps are migrated.
--  Drops the anon transition policies; authenticated-only from here.
--  Leave commented until you're ready.
-- ============================================================

-- do $$
-- declare
--   tbl record;
-- begin
--   for tbl in
--     select tablename from pg_tables where schemaname = 'public'
--   loop
--     execute format('drop policy if exists "anon_transition" on public.%I', tbl.tablename);
--   end loop;
-- end $$;
