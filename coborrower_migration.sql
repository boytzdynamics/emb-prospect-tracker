-- Add co-borrower and secondary contact fields to contacts table
-- Run this in the Supabase SQL Editor

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone2 text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS co_first_name text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS co_last_name text;
-- email2 already exists from email2_migration.sql
