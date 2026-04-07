# EMB Prospect Tracker

CRM for mortgage loan officers at Eugene Mortgage Brokers (EMB) and Bend Mortgage Brokers (BMB). Tracks prospects through a kanban pipeline from initial contact through loan closing.

## Install (Windows)

1. Download the latest `.exe` from [Releases](https://github.com/boytzdynamics/emb-prospect-tracker/releases)
2. Run the installer — it installs silently with a desktop shortcut
3. On first launch, enter your name, initials, role, team, and Unite credentials
4. Supabase and Claude API keys are pre-configured

**Windows SmartScreen:** On first install, Windows may show a warning. Click "More info" then "Run anyway".

**Updates are automatic.** The app checks for new versions on launch and prompts to restart when ready.

## For Admins

- Gmail account management is in the Admin panel (admin-only)
- Column label customization is in the Admin panel
- To add new users: they just install and fill in the setup screen

## Development

```bash
npm install
npm start
```

## Release a New Version

```bash
# 1. Bump version in package.json
# 2. Commit and push
git add -A && git commit -m "vX.Y.Z: description"
git push origin main
# 3. Tag — triggers GitHub Actions build
git tag vX.Y.Z && git push origin vX.Y.Z
```

GitHub Actions builds the Windows NSIS installer and publishes it to Releases. Installed copies auto-update.

## Keyboard Shortcuts

- `Cmd/Ctrl + N` — New Prospect
- `Cmd/Ctrl + R` — Refresh/Sync
- `Escape` — Close any modal

## Boards

- **Prospects**: FAAS Team | General (x4) | Meta Prospects
- **Leads**: Prospect > Getting Docs > Ready > Pre-Approved > In Process
- **Closed Loans**: List view
- **Dead Files**: Dead Prospects | Denied Pre-Approvals
