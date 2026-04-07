-- Add second email address field to contacts
alter table contacts add column if not exists email2 text;

-- Add AI notes summary field to contacts
alter table contacts add column if not exists notes_summary text;
