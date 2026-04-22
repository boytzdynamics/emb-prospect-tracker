-- ─────────────────────────────────────────────────────────────
--  EMB PROSPECT TRACKER — Meta Leads Feature Migration (v1)
--  Run this in Supabase SQL Editor
--
--  Adds:
--    • meta_leads           Meta Leads board rows (BMB only in v1)
--    • meta_messages        Messenger/IG inbound + outbound history
--    • admin_settings       Key-value store for Meta-specific settings
--    • contacts additions   meta_psid_bmb, ig_user_id_bmb, meta_lead_id
-- ─────────────────────────────────────────────────────────────

-- 1. meta_leads table
create table if not exists meta_leads (
  id                      uuid primary key default gen_random_uuid(),
  phone                   text,                 -- normalized, 10 digits
  email                   text,                 -- lowercased
  full_name               text,
  meta_psid_bmb           text,                 -- FB Messenger Page-Scoped ID for BMB
  ig_user_id_bmb          text,                 -- IG Business user ID for BMB
  ig_thread_id            text,
  platform                text not null,        -- 'messenger' | 'instagram'
  source_state            text not null,        -- 'form_only' | 'messenger_only' | 'both' | 'organic' | 'ad'
  lead_form_id            text,                 -- Meta lead form ID (if from form)
  lead_form_responses     jsonb,                -- {va_status, credit_score, intent, ...}
  column_id               text not null,        -- 'col_cold_1' | 'col_cold_2' | 'col_cold_3' | 'col_active_1' | 'col_active_2'
  bucket                  text not null,        -- 'cold' | 'active' (derived; stored for fast query)
  needs_response          boolean default false,
  first_seen_at           timestamptz not null default now(),
  last_activity_at        timestamptz not null default now(),
  last_inbound_at         timestamptz,
  last_outbound_at        timestamptz,
  submission_at           timestamptz,          -- lead form submission time (null for organic)
  promoted_to_contact_id  uuid references contacts(id) on delete set null,
  deleted_at              timestamptz,          -- soft delete
  version                 integer default 1,    -- optimistic locking
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists idx_meta_leads_phone
  on meta_leads(phone) where phone is not null;
create index if not exists idx_meta_leads_email
  on meta_leads(email) where email is not null;
create index if not exists idx_meta_leads_psid
  on meta_leads(meta_psid_bmb) where meta_psid_bmb is not null;
create index if not exists idx_meta_leads_bucket_activity
  on meta_leads(bucket, last_activity_at desc) where deleted_at is null;

-- 2. meta_messages table
create table if not exists meta_messages (
  id              text primary key,            -- ManyChat message ID
  meta_lead_id    uuid references meta_leads(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete set null,   -- set on promotion
  platform        text not null,               -- 'messenger' | 'instagram'
  psid            text,
  ig_thread_id    text,
  direction       text not null,               -- 'inbound' | 'outbound'
  source_type     text not null,               -- 'manual' | 'automated' | 'inbound'
  body            text,
  contact_name    text,
  sent_at         timestamptz not null,
  created_at      timestamptz default now()
);

create index if not exists idx_meta_messages_lead_sent
  on meta_messages(meta_lead_id, sent_at desc);
create index if not exists idx_meta_messages_contact_sent
  on meta_messages(contact_id, sent_at desc) where contact_id is not null;

-- 3. contacts table additions (Meta PSID / IG user ID backlinks for promoted cards)
alter table contacts add column if not exists meta_psid_bmb text;
alter table contacts add column if not exists ig_user_id_bmb text;
alter table contacts add column if not exists meta_lead_id uuid references meta_leads(id);

create index if not exists idx_contacts_psid_bmb
  on contacts(meta_psid_bmb) where meta_psid_bmb is not null;

-- 4. admin_settings table (separate from app_settings; used by Edge Functions)
create table if not exists admin_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       text,
  updated_by  text,
  updated_at  timestamptz default now()
);

-- Seed default settings. Replace placeholder values from the Electron Admin panel
-- or via the Supabase SQL editor before going live.
insert into admin_settings (key, value) values
  ('auto_response_window_seconds',   '120'),
  ('initial_submission_window_hours', '3'),
  ('bmb_page_id',                    'REPLACE_WITH_ACTUAL_BMB_PAGE_ID'),
  ('manychat_webhook_secret',        'REPLACE_WITH_SECRET')
on conflict (key) do nothing;

-- 5. Enable realtime
alter publication supabase_realtime add table meta_leads;
alter publication supabase_realtime add table meta_messages;

-- 6. Disable RLS (consistent with other tables)
alter table meta_leads     disable row level security;
alter table meta_messages  disable row level security;
alter table admin_settings disable row level security;

-- Done!
