# EMB Prospect Tracker — PC v1 Beta

## Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Install Electron globally (if needed)
```bash
npm install -g electron
```

### 3. Set up Supabase
- Go to supabase.com and create a new project
- Go to SQL Editor and paste the entire contents of `db.js` (the SQL block inside the comment)
- Copy your Project URL and Anon Key

### 4. Run the App
```bash
npm start
```

On first launch you'll see a setup screen — fill in:
- Supabase URL + Anon Key
- Claude API Key (from console.anthropic.com)
- Unit API Key + shared phone number (optional for v1)
- Your name, role, team, initials

### 5. Distribute to Team
- Give each team member the folder
- They run `npm install` then `npm start`
- Each person fills in their own name/initials on first launch
- Everyone shares the same Supabase URL + keys

## Keyboard Shortcuts
- `Cmd/Ctrl + N` — New Prospect
- `Cmd/Ctrl + R` — Refresh/Sync
- `Escape` — Close any modal

## Boards
- **Prospects**: FAAS Team | General (x4) | Meta Prospects
- **Leads**: Prospect → Getting Docs → Ready → Pre-Approved → In Process
- **Closed Loans**: List view
- **Dead Files**: Dead Prospects | Denied Pre-Approvals

## Notes
- Runs in demo mode if Supabase is not configured
- Auto-syncs every 2 minutes
- Realtime updates via Supabase channels
- Unit deep links for call/text (opens Unit app)
- Column internal IDs never change — safe to rename display labels
