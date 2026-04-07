-- Add account_phone column to sms_messages
-- Stores which LO's phone number sent/received each text
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS account_phone text;
