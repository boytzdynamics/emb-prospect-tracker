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
| Auto-update | electron-updater 6.8.3 |
| Node | Whatever Electron 28 bundles |

**CRITICAL:** Supabase JS is loaded via a local UMD script tag from node_modules, NOT from a CDN. CDN loading fails silently in Electron's renderer process. Do not switch to CDN.

---

## File & Folder Structure

```
emb-app/
  main.js              Electron main process — window creation, IPC handlers, Gmail IMAP fetch, auto-update
  preload.js           Context bridge — exposes limited API to renderer (including update APIs)
  config.js            Constants — column IDs, pre-baked Supabase/Claude credentials
  index.html           ENTIRE app UI + logic — HTML, CSS, JavaScript all in one file
  admin.js             Admin panel UI generation + settings management
  gmail.js             Gmail IMAP connection, polling, log writing
  package.json         Dependencies + electron-builder + NSIS + GitHub publish config
  package-lock.json
  README.md
  CLAUDE_CODE_HANDOFF.md           Legacy handoff doc (superseded by this file)
  email2_migration.sql             SQL to add email2 + notes_summary columns
  gmail_log_migration.sql          SQL to create gmail_log table
  coborrower_migration.sql         SQL to add co-borrower fields
  sms_account_phone_migration.sql  SQL to add account_phone column to sms_messages
  .github/workflows/build-win.yml  GitHub Actions — builds Windows NSIS installer on version tags
  .gitignore
  assets/
    icon.icns                      App icon (macOS)
    icon.ico                       App icon (Windows)
  dist/                            Build output (local builds only — CI builds go to GitHub Releases)
  node_modules/
```

### Where things live in index.html

The entire app is a single `index.html` file. Key sections:

- **Lines 1-800:** CSS styles (embedded `<style>` block) — color variables, layout, cards, modals, boards
- **Lines 800-900:** HTML structure — nav, sidebar, board containers, modal templates
- **Lines 900-3300+:** JavaScript `<script>` block — all app logic

Key functions in the script block:
- `init()` — App initialization, load settings, connect Supabase, fetch data, start realtime
- `renderBoard()` — Renders kanban columns and cards for current board
- `renderCard()` — Generates HTML for a single contact card
- `renderSidebar()` — Builds sidebar nav, respecting per-team board visibility
- `openCardModal()` — Opens the contact detail modal
- `openNewModal()` — Opens the new prospect creation modal
- `logContact()` — Records a contact log entry
- `saveNewProspect()` — Creates a new contact
- `moveContact()` — Moves contact between columns/boards
- `generateNotesSummary()` — Calls Claude API for AI note summary
- `pollGmail()` — Triggers Gmail IMAP fetch via IPC
- `pollSMS()` — Fetches Unite SMS history
- `loadBoardVisibility()` — Loads per-team board visibility from Supabase
- `loadUnitePhones()` — Loads multi-LO phone config from Supabase
- `showAdminPinModal()` / `verifyAdminPin()` — Admin PIN entry system
- `escHtml()` — HTML escaping utility

---

## Build, Run & Test Commands

```bash
# Install dependencies
cd ~/Documents/emb-app
npm install

# Run in development
npm start           # or: npm run dev (adds --dev flag)

# Build for distribution (local — Mac only, Windows cross-compile fails on Apple Silicon)
npm run build-mac   # macOS DMG (arm64 + x64)

# No test suite exists. Manual testing only.
# No linter configured.
```

### Windows Build & Release (via GitHub Actions)

Windows builds use GitHub Actions (cannot cross-compile from Apple Silicon Mac).

```bash
# 1. Bump version in package.json
# 2. Commit and push
git add -A && git commit -m "v1.X.Y: description"
git push origin main

# 3. Tag and push — this triggers the GitHub Actions build
git tag v1.X.Y
git push origin v1.X.Y

# 4. GitHub Actions builds NSIS installer on windows-latest
#    and creates a GitHub Release with the .exe, latest.yml, and blockmap
#    at: https://github.com/boytzdynamics/emb-prospect-tracker/releases
```

Installed copies auto-update from GitHub Releases on launch.

**App ID:** com.eugenemb.tracker
**Product Name:** EMB Prospect Tracker
**GitHub Repo:** https://github.com/boytzdynamics/emb-prospect-tracker

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
  getAppVersion()        // Returns app version from package.json
  checkForUpdates()      // Manually trigger update check
  onUpdateStatus(cb)     // Listen for auto-update events (available, downloaded)
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
- `visibleBoards[]` — Per-team list of visible board names (from Supabase)
- `adminModeActive` — Boolean, true if admin PIN was entered this session
- `unitePhones[]` — Array of `{phone, initials, name}` for multi-LO SMS display

Settings persistence:
- Electron userData path: `~/Library/Application Support/EMB Prospect Tracker/emb-settings.json` (macOS) or `%APPDATA%\EMB Prospect Tracker\emb-settings.json` (Windows)
- Team/user lists: stored in localStorage (`emb_users` key) — per-machine, does not sync across machines

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

### Auto-Update (Windows only)

Uses `electron-updater` with GitHub Releases as the update server.
- Checks for updates 5 seconds after launch (Windows only, skipped on macOS)
- Downloads in background, then shows native dialog: "Restart Now" / "Later"
- Auto-installs on app quit if user chose "Later"
- Renderer receives update status via `onUpdateStatus` IPC — nav badge shows "Updating..." and "vX.Y.Z ready"
- Requires NSIS installer (not `dir` target) — configured in package.json
- GitHub repo: `boytzdynamics/emb-prospect-tracker` (public, no token needed)

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
13. ✅ **Role-based team visibility** — LO users only see their own team. "Other Teams" toggle hidden for non-admins. `sbToggle()`, `switchTeamView()`, and `loadContacts()` all guarded.
14. ✅ **Simplified setup flow** — New users enter name, initials, role, team, and Unite credentials. Supabase URL/key and Claude API key pre-baked in `config.js`. Advanced credentials collapsed by default.
15. ✅ **Windows NSIS installer** — One-click installer with desktop shortcut and Start Menu entry. Built via GitHub Actions on version tags.
16. ✅ **Auto-update** — `electron-updater` checks GitHub Releases on Windows launch. Downloads in background, prompts restart.
17. ✅ **Admin PIN portal** — `Ctrl+Shift+A` opens PIN prompt on any machine. Correct PIN (stored in Supabase `app_settings` key `admin_pin`, default `8702`) temporarily elevates to admin for the session. Resets on restart.
18. ✅ **Per-team board visibility** — Admins can hide/show boards per team from admin panel "Boards" tab. Stored in Supabase `app_settings` key `boards_visible_{team}`. Hidden boards removed from sidebar, move modal, card action buttons (Move to Leads, Restore, Mark Dead).
19. ✅ **Multi-LO Unite phone numbers** — Multiple phone numbers with LO initials stored in `app_settings` key `unite_phones`. Managed from Admin > Integrations. SMS thread display shows initials badge next to each message. Requires `sms_account_phone_migration.sql`.
20. ✅ **AI auto-fill paste button cleanup** — Removed Ctrl+V/⌘V wording from paste button and hint text. Button now just says "Paste Image".
21. ✅ **Nav bar Windows overlap fix** — Added 140px right padding so Windows title bar controls (min/max/close) don't overlap admin button and version badge.
22. ✅ **Admin PIN actually unlocks panel** — `renderAdminPanel()` now checks in-memory `adminModeActive` flag in addition to saved config role.
23. ✅ **Dynamic team sidebar** — Bottom-left team label and LO icons are dynamic. Shows current user's team name + team members from Users list. Falls back to current user's initials for unconfigured teams.
24. ✅ **Team renamed: Shad → Tari** — All dropdowns (setup wizard, admin profile, add-user, settings modal), `KNOWN_TEAMS`, and `TEAM_COLORS` updated. Purple (#8B5CF6) retained for Tari.
25. ✅ **Cross-team reassignment** — Move Contact modal now has an optional team dropdown alongside the column dropdown. Updates `contacts.team`; does not touch follow-up clock or needs_response. Enables Tari ↔ Lauren (and Matt) transfers.
26. ✅ **Kanban card density** — Card padding/margins/font sizes trimmed across the board so more cards fit per column without losing info. Card `max-height` 320→260, LO dot 26→22, card-name 13→12.5, fu-tag 10.5→10, card-note 11→10.5 with max-height 60→38, btn-sm 24→21 / 9.5→9, column gap 8→6.

---

## Team Deployment Guide

The app is designed for multi-team deployment across EMB and BMB. One Supabase database serves all teams. Each team gets their own Windows machines with the app installed.

### Pre-Baked Credentials (users never see these)
- Supabase URL + anon key → `config.js`
- Claude API key → `config.js`

### Per-Machine Setup (first launch)
Each user enters during the setup wizard:
- Name, initials, role (LO), team
- Unite Client ID + Secret (company-wide, same for all machines)

### Admin Remote Access
On any LO's machine: `Ctrl+Shift+A` → enter PIN (default: `8702`) → full admin panel access for the session. Resets on app restart. PIN stored in Supabase `app_settings` (key: `admin_pin`), changeable from Admin > Boards tab.

### Per-Team Configuration (set once from admin panel)
From any machine with admin access:
1. **Boards tab** — Hide/show boards per team. Stored in Supabase (`boards_visible_{team}`). All machines for that team respect it immediately.
2. **Integrations tab** — Add LO phone numbers with initials for SMS thread display. Stored in Supabase (`unite_phones`).
3. **Users tab** — Add team members (name, initials, color). Shown in sidebar bottom. Currently stored in localStorage (per-machine).

### New Team Deployment Checklist
1. Download latest installer from [GitHub Releases](https://github.com/boytzdynamics/emb-prospect-tracker/releases)
2. Install on each team member's Windows PC
3. First launch: user enters name, initials, role=LO, team, Unite credentials
4. On one machine: `Ctrl+Shift+A` → PIN `8702` to access admin
5. Admin > Boards: configure which boards this team sees
6. Admin > Integrations: add LO phone numbers with initials
7. Admin > Users: add team members (for sidebar display)
8. App auto-updates from GitHub Releases going forward

### Supabase Migrations Required
Run these in the Supabase SQL editor before deploying new features:
- `coborrower_migration.sql` — Co-borrower fields
- `sms_account_phone_migration.sql` — Multi-LO SMS phone tracking

---

## Known Issues & Tech Debt

1. **index.html is 3300+ lines** — Entire app in one file. Works but hard to navigate. No plans to split unless explicitly requested.

2. **CSV import parser is fragile** — Simple `split(',')` doesn't handle quoted fields with commas. Works for simple CSVs.

3. **No pagination** — Loads all contacts at once. Could be slow with 1000+ records.

4. **Console.log statements throughout** — Debug logging left in production code.

5. **No offline mode** — Requires Supabase connection. Falls back to limited demo mode.

6. **IMAP body parsing disabled** — Only headers fetched (subject, from, to, date). Snippets come from subject line. Full body fetch was too slow for 200 messages.

7. **Config.js has pre-baked credentials** — Supabase URL/key and Claude API key are embedded for team deployment. Unite credentials are per-user (entered in setup).

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
  followup_default_days: 2
}
```

**Build flags:**
- `--dev` flag on npm run dev (currently unused in code but available)
- No debug/release distinction beyond Electron's built-in DevTools
