// ─────────────────────────────────────────────
//  EMB PROSPECT TRACKER — CONFIGURATION
//  Fill these in before first launch
// ─────────────────────────────────────────────

const CONFIG = {
  // Supabase
  SUPABASE_URL: 'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

  // Claude AI (shared key)
  CLAUDE_API_KEY: 'YOUR_CLAUDE_API_KEY',

  // Unit API (phone/text)
  UNIT_API_KEY: 'YOUR_UNIT_API_KEY',
  UNIT_PHONE_NUMBER: 'YOUR_UNIT_SHARED_PHONE_NUMBER', // e.g. +15415551234

  // App settings
  FOLLOWUP_DEFAULT_DAYS: 2,
  REFRESH_INTERVAL_MS: 120000, // 2 minutes

  // Column internal IDs (NEVER CHANGE THESE)
  // Display names are stored in Supabase column_labels table
  PROSPECT_COLUMNS: [
    { id: 'col_faas',    default_label: 'FAAS Team',       type: 'labeled' },
    { id: 'col_gen1',    default_label: 'Prospects',        type: 'general' },
    { id: 'col_gen2',    default_label: 'Prospects',        type: 'general' },
    { id: 'col_gen3',    default_label: 'Prospects',        type: 'general' },
    { id: 'col_gen4',    default_label: 'Prospects',        type: 'general' },
    { id: 'col_meta',    default_label: 'Meta Prospects',   type: 'labeled' },
  ],
  LEADS_COLUMNS: [
    { id: 'lead_prospect',  default_label: 'Prospect' },
    { id: 'lead_docs',      default_label: 'Getting Docs' },
    { id: 'lead_ready',     default_label: 'Ready — Pre-Approve / Refi' },
    { id: 'lead_approved',  default_label: 'Pre-Approved' },
    { id: 'lead_inprocess', default_label: 'In Process' },
  ],
  DEAD_COLUMNS: [
    { id: 'dead_prospect',  default_label: 'Dead Prospects' },
    { id: 'dead_denied',    default_label: 'Denied Pre-Approvals' },
  ]
}

// Make available globally
if (typeof module !== 'undefined') module.exports = CONFIG
