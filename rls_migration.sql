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

-- ---- PART 2: TRANSITIONAL anon policy ----
-- Keeps old (pre-v2.1.0) clients working during the rollout window.
-- DROP THESE once all LOs are on the new build (see PART 3).

create policy "anon_transition" on public.contacts
  for all to anon using (true) with check (true);
create policy "anon_transition" on public.contact_log
  for all to anon using (true) with check (true);
create policy "anon_transition" on public.notes
  for all to anon using (true) with check (true);
create policy "anon_transition" on public.gmail_log
  for all to anon using (true) with check (true);
create policy "anon_transition" on public.sms_messages
  for all to anon using (true) with check (true);
create policy "anon_transition" on public.column_labels
  for all to anon using (true) with check (true);
create policy "anon_transition" on public.app_settings
  for all to anon using (true) with check (true);

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='quick_notes') then
    execute 'create policy "anon_transition" on public.quick_notes
             for all to anon using (true) with check (true)';
  end if;
end $$;

-- ============================================================
--  PART 3: TIGHTEN — run this AFTER both apps are migrated.
--  Drops the anon transition policies; authenticated-only from here.
--  Leave commented until you're ready.
-- ============================================================

-- drop policy "anon_transition" on public.contacts;
-- drop policy "anon_transition" on public.contact_log;
-- drop policy "anon_transition" on public.notes;
-- drop policy "anon_transition" on public.gmail_log;
-- drop policy "anon_transition" on public.sms_messages;
-- drop policy "anon_transition" on public.column_labels;
-- drop policy "anon_transition" on public.app_settings;
-- -- and if quick_notes still exists:
-- -- drop policy "anon_transition" on public.quick_notes;
