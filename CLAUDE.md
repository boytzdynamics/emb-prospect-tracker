# EMB Prospect Tracker — Electron App

Everything a Claude Code session needs to independently own and work on the Electron desktop app.

**IMPORTANT:** Read the shared `../CLAUDE.md` first. It defines the canonical feature set, data models, API contracts, and resolved inconsistencies. This file covers Electron-specific implementation details.

---

## Tech Stack

| Component | Version/Details |
|-----------|----------------|
| Runtime | Electron 28.0.0 |
| Language | Vanilla JavaScript (no framework) |
| UI | Single HTML file with embedded CSS + JS |
| Supabase | @supabase/supabase-js 2.39.0 (UMD, loaded from node_modules) |
| IMAP | imap 0.8.19 (Gmail polling, main process) |
| Mail parser | mailparser 3.6.5 (email header extraction) |
| Builder | electron-builder 24.13.3 |
| Node | Whatever Electron 28 bundles |

**CRITICAL:** Supabase JS is loaded via a local UMD script tag from node_modules, NOT from a CDN. CDN loading fails silently in Electron's renderer process. Do not switch to CDN.

---

## File & Folder Structure

```
emb-app/
  main.js              (205 lines) Electron main process — window creation, IPC handlers, Gmail IMAP fetch
  preload.js           (11 lines)  Context bridge — exposes limited API to renderer
  config.js            (47 lines)  Constants — column IDs, default settings, API placeholders
  index.html           (3089 lines) ENTIRE app UI + logic — HTML, CSS, JavaScript all in one file
  admin.js             (436 lines) Admin panel UI generation + settings management
  gmail.js             (363 lines) Gmail IMAP connection, polling, log writing
  package.json                     Dependencies + electron-builder config
  package-lock.json
  README.md
  CLAUDE_CODE_HANDOFF.md           Legacy handoff doc (superseded by this file)
  email2_migration.sql             SQL to add email2 + notes_summary columns
  gmail_log_migration.sql          SQL to create gmail_log table
  assets/
    icon.icns                      App icon (macOS)
  dist/                            Build output (DMG, Windows exe)
  node_modules/
```

### Where things live in index.html

The entire app is a single `index.html` file. Key sections:

- **Lines 1-800:** CSS styles (embedded `<style>` block) — color variables, layout, cards, modals, boards
- **Lines 800-900:** HTML structure — nav, sidebar, board containers, modal templates
- **Lines 900-3089:** JavaScript `<script>` block — all app logic

Key functions in the script block:
- `init()` — App initialization, load settings, connect Supabase, fetch data, start realtime
- `renderBoard()` — Renders kanban columns and cards for current board
- `renderCard()` — Generates HTML for a single contact card
- `openCardModal()` — Opens the contact detail modal
- `openNewModal()` — Opens the new prospect creation modal
- `logContact()` — Records a contact log entry
- `saveNewProspect()` — Creates a new contact
- `moveContact()` — Moves contact between columns/boards
- `generateNotesSummary()` — Calls Claude API for AI note summary
- `pollGmail()` — Triggers Gmail IMAP fetch via IPC
- `pollSMS()` — Fetches Unite SMS history
- `escHtml()` — HTML escaping utility

---

## Build, Run & Test Commands

```bash
# Install dependencies
cd ~/Documents/emb-app
npm install

# Run in development
npm start           # or: npm run dev (adds --dev flag)

# Build for distribution
npm run build-mac   # macOS DMG (arm64 + x64)
npm run build-win   # Windows (x64 only, may fail on arm64 Mac — rcedit issue)
npm run build-all   # Both platforms

# No test suite exists. Manual testing only.
# No linter configured.
```

**Build output:** `dist/` directory. Mac DMGs, Windows `win-unpacked/` folder.

**App ID:** com.eugenemb.tracker
**Product Name:** EMB Prospect Tracker

---

## Architecture & Patterns

### Process Model

```
Main Process (Node.js)                    Renderer Process (Chromium)
  main.js                                   index.html
    createWindow()                            Supabase JS client
    IPC handlers:                             All UI logic
      settings-load/save/path                 Board rendering
      gmail-fetch (IMAP connection)           Modal management
                                              API calls (Claude, Unite)
```

### IPC Bridge (preload.js)

The preload script exposes exactly these APIs to the renderer:

```javascript
window.electronAPI = {
  openExternal(url)      // Open URL in system browser
  platform               // process.platform string
  settingsLoad()         // Read settings JSON from disk
  settingsSave(data)     // Write settings JSON to disk
  settingsPath()         // Get settings file path
  gmailFetch(accounts)   // Trigger IMAP fetch from main process
}
```

### Security Settings

```javascript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: false,          // Required for IPC
  preload: 'preload.js'
}
```

### State Management

Global variables in the renderer:
- `contacts[]` — All contacts from Supabase
- `currentBoard` — Active board name
- `currentUser` — Current user config
- `supabase` — Supabase client instance
- `cfg` — Loaded config object

Settings persistence:
- Electron userData path: `~/Library/Application Support/EMB Prospect Tracker/emb-settings.json` (macOS) or `%APPDATA%\EMB Prospect Tracker\emb-settings.json` (Windows)
- Team/user lists: also in Electron userData (NOT localStorage)

### Supabase Realtime

```javascript
supabase.channel('contacts_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, handler)
  .subscribe()
```

Subscribes to all contact changes. On receiving a change, updates the local `contacts[]` array and re-renders.

---

## Code Style & Formatting

- **No framework** — vanilla JS, no React/Vue/Angular
- **Single file** — index.html contains everything (CSS + HTML + JS)
- **Template literals** — HTML generated with backtick strings and `${variable}` interpolation
- **camelCase** — function names and variables
- **escHtml()** — Used for HTML escaping user-provided strings in templates
- **Global functions** — No modules, classes, or namespaces. All functions are global.
- **Inline event handlers** — `onclick="functionName()"` in generated HTML
- **No formatter/linter configured**
- **Semicolons used** — Consistent semicolon usage
- **2-space indentation** in HTML/CSS, mixed in JS

---

## Electron-Specific Patterns

### Gmail IMAP Integration (gmail.js)

Runs in the main process (Node.js). Key behaviors:
- Polls every 2 minutes (`REFRESH_INTERVAL_MS: 120000`)
- 30-second overall timeout per poll cycle
- 15-second connection timeout per IMAP connection
- Searches INBOX, [Gmail]/Sent Mail, [Gmail]/Spam (all three folders)
- Limits to 200 most recent messages per folder per account
- Headers only (no body parsing — too slow)
- Deduplication by message_id in gmail_log table
- Auto-reset lock after 120 seconds if poll appears stuck

**4 Gmail accounts configured:**
- matt@eugenebrokers.com (MBEMB)
- matt@bendmortgagebrokers.com (MBBMB)
- chandler@bendmortgagebrokers.com (CS)
- brian@eugenebrokers.com (BY)

### Window Management

Single window, no menu bar customization beyond defaults. DevTools blocked via `beforeInputEvent` handler (F12 intercepted).

### Auto-Update

Not implemented. Distribution is manual (DMG / zip).

### Settings Storage

All settings stored as JSON on disk via Electron IPC. Never use localStorage for persistent config — it can be cleared.

---

## Changes Required (from shared CLAUDE.md)

**ALL 10 CHANGES COMPLETED** as of April 2026:

1. ✅ **est_price and credit_score fields** — Added to form, display, and edit.
2. ✅ **Source options** — Canonical 6: Realtor, Referral, Meta Lead, Call In, Website, Other.
3. ✅ **Refi subtypes removed** — Loan types: purchase, refi, other. No subtypes.
4. ✅ **Log types** — Canonical 5: call, email, text, note, ignore. All reset clock + clear flag.
5. ✅ **Ignore resets follow-up** — All log types including ignore reset to +2 business days.
6. ✅ **quick_notes migrated** — All notes write to contact_log with log_type="note". quick_notes table removed.
7. ✅ **Contact detail layout** — Sections: Info → Notes → Emails → Texts → Activity Log. Notes section shows only manually-entered log types (note, call, ignore) with non-empty notes. Auto-generated email/text entries excluded — they have dedicated sections.
8. ✅ **Gmail scrapes Spam** — INBOX, [Gmail]/Sent Mail, [Gmail]/Spam all scraped.
9. ✅ **Column labels from DB** — Loaded from column_labels table with hardcoded defaults as fallback.
10. ✅ **Business day calculation** — addBizDays() skips Saturday and Sunday.

**Additional changes completed:**
11. ✅ **Co-borrower / secondary contact fields** — phone2, email2, co_first_name, co_last_name added to new prospect form, detail modal (view + edit), card display, SMS matching, duplicate detection, and AI auto-fill parser. Requires `coborrower_migration.sql` to be run in Supabase.
12. ✅ **Default board changed to Leads** — App opens to Leads board, Leads above Prospects in sidebar.

---

## Known Issues & Tech Debt

1. **index.html is 3089 lines** — Entire app in one file. Works but hard to navigate. No plans to split unless explicitly requested.

2. **CSV import parser is fragile** — Simple `split(',')` doesn't handle quoted fields with commas. Works for simple CSVs.

3. **No pagination** — Loads all contacts at once. Could be slow with 1000+ records.

4. **Console.log statements throughout** — Debug logging left in production code.

5. **No offline mode** — Requires Supabase connection. Falls back to limited demo mode.

6. **IMAP body parsing disabled** — Only headers fetched (subject, from, to, date). Snippets come from subject line. Full body fetch was too slow for 200 messages.

7. **Config.js has placeholder values** — SUPABASE_URL, CLAUDE_API_KEY etc. are "YOUR_..." placeholders. Real values come from settings JSON on disk.

8. **No retry logic for Unite API** — Single fetch attempt, logs error on failure.

9. **XSS surface** — Template literals with `${variable}` interpolation. `escHtml()` is used but verify all user-provided strings go through it.

---

## What NOT to Change

- **Database schema** — See shared CLAUDE.md "Do Not Change" section
- **Column IDs** — col_faas, col_gen1-4, col_meta, lead_*, dead_* are hardcoded everywhere
- **DB enum values** — board, loan_type, log_type, direction values
- **Supabase loading method** — Keep UMD from node_modules, not CDN
- **IPC bridge API** — preload.js surface area. Both main.js and index.html depend on it.
- **Settings file path/format** — Other team members may have existing settings files
- **Gmail IMAP approach** — App passwords, not OAuth. Changing auth method would break all configured accounts.

---

## Environment & Config

**No environment variables used.** All configuration is UI-driven and stored in the Electron userData settings file.

Settings JSON structure:
```javascript
{
  user_name: "Matt",
  user_initials: "MB",
  user_role: "admin",        // "admin" or "lo"
  user_team: "Team Matt",
  supabase_url: "https://...",
  supabase_anon_key: "eyJ...",
  claude_api_key: "sk-ant-...",
  unite_client_id: "...",
  unite_client_secret: "...",
  unite_phone: "+1...",
  gmail_accounts: {           // Admin-only, app passwords
    "matt@eugenebrokers.com": "xxxx xxxx xxxx xxxx",
    ...
  },
  default_followup_days: 2
}
```

**Build flags:**
- `--dev` flag on npm run dev (currently unused in code but available)
- No debug/release distinction beyond Electron's built-in DevTools
