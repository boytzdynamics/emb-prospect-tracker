-- ─────────────────────────────────────────────────────────────
--  EMB PROSPECT TRACKER — Meta Leads: IG username + name override
--  Run this in Supabase SQL Editor AFTER meta_leads_migration.sql
-- ─────────────────────────────────────────────────────────────

-- 1. Add ig_username for stable Instagram dedup + display
alter table meta_leads add column if not exists ig_username text;
create index if not exists idx_meta_leads_ig_username
  on meta_leads(ig_username) where ig_username is not null;

-- 2. Also on contacts so promoted IG leads keep the handle
alter table contacts add column if not exists ig_username text;

-- Done!
