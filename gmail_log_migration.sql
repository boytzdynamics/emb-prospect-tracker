-- ─────────────────────────────────────────────────────────────
--  EMB PROSPECT TRACKER — Gmail Email Log Migration
--  Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. gmail_log table
create table if not exists gmail_log (
  id            uuid primary key default gen_random_uuid(),
  message_id    text unique not null,
  thread_id     text,
  contact_id    uuid references contacts(id) on delete set null,
  contact_email text,
  account_email text not null,
  account_label text not null,   -- MBEMB | MBBMB | CS | BY | combos with +
  direction     text not null,   -- 'sent' | 'received'
  subject       text,
  snippet       text,
  from_address  text,
  to_address    text,
  sent_at       timestamptz not null,
  created_at    timestamptz default now()
);

create index if not exists gmail_log_contact_id on gmail_log(contact_id);
create index if not exists gmail_log_sent_at    on gmail_log(sent_at desc);
create index if not exists gmail_log_message_id on gmail_log(message_id);

-- 2. Add needs_response column to contacts
alter table contacts add column if not exists needs_response boolean default false;

-- 3. Enable realtime
alter publication supabase_realtime add table gmail_log;

-- 4. Disable RLS (consistent with other tables)
alter table gmail_log disable row level security;

-- Done!
