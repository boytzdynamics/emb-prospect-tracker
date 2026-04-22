# Meta Leads — Supabase Deployment Guide

One-time steps to deploy the Meta Leads backend before the Electron UI can use it.

## 1. Run the SQL migration

Open Supabase Dashboard → SQL Editor → paste the contents of [meta_leads_migration.sql](../meta_leads_migration.sql) → Run.

Verifies:
- Creates `meta_leads`, `meta_messages`, `admin_settings` tables
- Adds `meta_psid_bmb`, `ig_user_id_bmb`, `meta_lead_id` columns to `contacts`
- Seeds 4 rows in `admin_settings` (2 tunable windows, 2 placeholders)
- Enables realtime on `meta_leads` + `meta_messages`
- Disables RLS on all 3 new tables

## 2. Install the Supabase CLI (one-time)

```bash
brew install supabase/tap/supabase
supabase login
```

## 3. Link the Supabase CLI to the project

From the `emb-app/` directory:

```bash
cd ~/Documents/emb-app
supabase link --project-ref osygjjljpdpltjtuklvj
```

Prompts for the database password. Matt has this in `EMB_Credentials.txt`.

## 4. Set Edge Function secrets

```bash
# Generate a strong random webhook secret:
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET   <-- save this, you'll paste it into ManyChat"

supabase secrets set \
  MANYCHAT_WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  MANYCHAT_API_KEY="<paste ManyChat Settings → API key>"
```

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-populated — don't set them.

Then mirror the webhook secret into `admin_settings` so the Electron admin panel can display it read-only:

```sql
update admin_settings set value = '<the WEBHOOK_SECRET value>' where key = 'manychat_webhook_secret';
update admin_settings set value = '<BMB Facebook Page numeric ID>' where key = 'bmb_page_id';
```

## 5. Deploy the Edge Functions

```bash
supabase functions deploy meta-webhook --no-verify-jwt
supabase functions deploy meta-send    --no-verify-jwt
```

`--no-verify-jwt` is intentional — `meta-webhook` uses its own Bearer-token auth
(checked against `MANYCHAT_WEBHOOK_SECRET`), not Supabase JWT auth.

After deploy, note the URLs (Supabase Dashboard → Edge Functions):

- `https://osygjjljpdpltjtuklvj.supabase.co/functions/v1/meta-webhook`
- `https://osygjjljpdpltjtuklvj.supabase.co/functions/v1/meta-send`

## 6. Wire ManyChat External Requests

For each of the 6 flows (Messenger × 3 + Instagram × 3), set the External Request:

- **URL:** `https://osygjjljpdpltjtuklvj.supabase.co/functions/v1/meta-webhook`
- **Method:** `POST`
- **Headers:**
  - `Authorization: Bearer <WEBHOOK_SECRET from step 4>`
  - `Content-Type: application/json`
- **Body (JSON template):**

```json
{
  "event_type": "{{event_type}}",
  "message_id": "{{message_id}}",
  "platform": "messenger",
  "direction": "inbound",
  "psid": "{{psid}}",
  "ig_thread_id": "{{ig_thread_id}}",
  "contact": {
    "full_name": "{{full_name}}",
    "first_name": "{{first_name}}",
    "last_name": "{{last_name}}",
    "phone": "{{phone}}",
    "email": "{{email}}"
  },
  "message": {
    "body": "{{last_input_text}}",
    "sent_at": "{{timestamp}}"
  },
  "tags": "{{user_tags}}",
  "source": "lead_form",
  "lead_form_id": "{{lead_form_id}}",
  "lead_form_responses": {}
}
```

Change `platform`: `"messenger"` vs `"instagram"` per channel.
Change `source`: `"lead_form"`, `"ad"`, or `"organic"` per flow.

## 7. Test the webhook

```bash
curl -X POST https://osygjjljpdpltjtuklvj.supabase.co/functions/v1/meta-webhook \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "message_id": "test_'$(date +%s)'",
    "platform": "messenger",
    "direction": "inbound",
    "psid": "TEST_PSID_123",
    "contact": {"full_name":"Test Lead","phone":"555-123-4567","email":"test@example.com"},
    "message": {"body":"hi im interested","sent_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "tags":"source_organic",
    "source":"organic"
  }'
```

Expected response: `{"status":"ok","meta_lead_id":"...","action":"created","bucket":"active","source_state":"organic"}`

Then verify in Supabase Table Editor: a new row in `meta_leads` and one in `meta_messages`.

## 8. View function logs

```bash
supabase functions logs meta-webhook --follow
```

Useful while debugging ManyChat wiring.
