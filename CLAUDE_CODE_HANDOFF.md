# EMB Prospect Tracker — Claude Code Handoff

## What This Project Is
A cross-platform CRM for Eugene Mortgage Brokers (EMB) and Bend Mortgage Brokers (BMB).
Tracks mortgage prospects through a kanban pipeline. Built by Matt Boytz (matt@eugenebrokers.com).

## Three Apps, One Supabase Backend
- **PC Electron app** — Mac/Windows, main daily driver
- **iPad SwiftUI app** — universal iOS/iPadOS app (same binary works on iPhone too)
- **Supabase backend** — `https://osygjjljpdpltjtuklvj.supabase.co`

## File Locations on Mac
- PC app: `~/Documents/emb-app/` (index.html, main.js, admin.js, gmail.js, config.js, preload.js, package.json)
- iOS app: `~/Documents/EMBTracker-iPad/` (Xcode project)

## Running the PC App on Mac
```bash
cd ~/Documents/emb-app
npm install        # first time only — installs imap, mailparser, supabase-js, electron
npm start          # launches the Electron app
```

## Building the iOS App
```bash
cd ~/Documents/EMBTracker-iPad
xcodebuild -project EMBTracker.xcodeproj -scheme EMBTracker -destination 'platform=iOS,name=YOUR_IPAD_NAME' build
```
Or just open in Xcode: `open EMBTracker.xcodeproj`

## Team
- **Matt** (admin) — matt@eugenebrokers.com (EMB), matt@bendmortgagebrokers.com (BMB)
- **Chandler Sawyer** (LO) — chandler@bendmortgagebrokers.com — green avatar
- **Brian Young** (LO, not yet active) — brian@eugenebrokers.com — yellow avatar
- LO colors: Matt=blue (#3F80AA), Chandler=green (#61C08C), Brian=yellow (#EFEFA3)

## Supabase Credentials
- URL: https://osygjjljpdpltjtuklvj.supabase.co
- Anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zeWdqamxqcGRwbHRqdHVrbHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDIzODcsImV4cCI6MjA4OTg3ODM4N30.LmSJ8IKkijGN2Tqp6DOFhvAs7K0v65TAoUak73-oM2g
- RLS is DISABLED on all tables (app uses anon key, no auth)

## Supabase Tables
- `contacts` — main prospect/lead data. Key columns: id, first_name, last_name, phone, email, board, column_id, team, office (bmb/emb), followup_date, needs_response (bool), created_by_name
- `contact_log` — every logged contact action. columns: contact_id, user_name, log_type, note, timestamp
- `notes` — add-only notes per contact
- `quick_notes` — lightweight on-card notes
- `gmail_log` — email thread history. columns: message_id (unique), account_label (MBEMB/MBBMB/CS/BY), direction (sent/received), subject, snippet, contact_id, sent_at
- `sms_messages` — Unite SMS history
- `column_labels` — editable display names for columns
- `app_settings` — key/value app config

## Board + Column Structure (CRITICAL — IDs never change)
### Prospects Board (col_*)
- col_faas → FAAS Team
- col_gen1, col_gen2, col_gen3, col_gen4 → Prospects (x4, labels editable)
- col_meta → Meta Prospects

### Leads Board (lead_*)
- lead_prospect → Prospect
- lead_docs → Getting Docs
- lead_ready → PRE-APP / REFI
- lead_approved → Pre-Approved
- lead_inprocess → In Process

### Closed Board — list view only

### Dead Board (dead_*)
- dead_prospect → Dead Prospects
- dead_denied → Denied Pre-Approvals

## Card Status Priority (highest to lowest)
1. 🟡 YELLOW — `needs_response=true` — borrower emailed/texted us. Badge: "↩ RESPONDED — REPLY NOW"
2. 🔴 RED — followup_date in the past (overdue)
3. 🟠 ORANGE — followup_date is today
4. 🟢 GREEN — followup_date in the future (on track)

## Gmail Email Tracking
- Uses IMAP App Passwords (NOT OAuth) — stored in Admin panel, admin-only
- Polls every 2 minutes from Matt's Mac/PC for all 4 accounts:
  - matt@eugenebrokers.com → label: MBEMB
  - matt@bendmortgagebrokers.com → label: MBBMB
  - chandler@bendmortgagebrokers.com → label: CS
  - brian@eugenebrokers.com → label: BY
- Deduplication: message_id is unique key in gmail_log
- Multi-inbox: if same message seen in 2 accounts, combines labels with + (e.g. "↩ MBEMB+CS")
- Inbound email → sets needs_response=true + resets followup clock
- Outbound email → resets followup clock, clears needs_response
- Display: inline scrollable thread in contact card (like Unite SMS), newest first
- Each entry shows: direction badge (→/↩) + account label, timestamp, subject, snippet, "Open in Gmail" button

## Unite SMS Tracking
- Read-only via Intermedia Unite API
- Endpoint: GET https://api.intermedia.net/messaging/v2/accounts/_me/sms/users/history
- Auth: client_credentials, scope: api.service.messaging
- Token endpoint: https://login.intermedia.net/user/connect/token
- Shared team phone number (one per team, in settings)
- Same yellow/log behavior as Gmail — inbound SMS sets needs_response=true

## Key Technical Rules
- Supabase loaded via local node_modules UMD script (NOT CDN — fails silently in Electron)
- Settings stored via Electron IPC to userData path (NOT localStorage — wiped on reinstall)
- Column IDs (col_faas etc) are FIXED. Display labels are editable in Admin → Columns tab
- iOS deployment target: 17.0
- No Swift Package Manager — SupabaseService.swift uses pure URLSession REST calls
- iOS polls Supabase every 30 seconds (no realtime websocket on mobile)

## Design Tokens
- Dark sidebar: #2B3739
- Blue: #3F80AA
- Teal: #448694
- Green: #61C08C
- Yellow: #EFEFA3
- Red: #E05252
- Orange: #E07A3F
- Fonts: Bebas Neue (headers/labels), Nunito Sans (body)

## What's Working
- PC Electron app: all 4 boards, Supabase sync, Unite SMS polling, Gmail email log, yellow card state, AI screenshot parser, duplicate detection, follow-up clock, optimistic saves, admin panel
- iOS/iPadOS app: compiles and runs, all 4 boards, correct column IDs, Gmail log display, yellow card state, contact detail with email+SMS threads, universal (iPad sidebar + iPhone bottom tabs)

## What Still Needs Testing/Fixing
- Gmail IMAP actual connection (needs real app passwords entered in Admin)
- Supabase data actually loading in iOS app (connection established but real data not verified)
- Unite SMS on iOS (display code written, not tested with live data)
- End-to-end sync test: add contact on iPad → confirm appears on PC

## Common Issues & Fixes
- "Build Failed" in Xcode: usually a Color shorthand issue — use Color.embBlue not .embBlue in foregroundStyle/shadow
- Supabase silent failure: check RLS is disabled on all tables
- Unite SMS empty: use 7-day window not 90-day (500 record limit fills up with old msgs)
- iOS white screen: check UIDevice.current.userInterfaceIdiom routing in EMBTrackerApp.swift
