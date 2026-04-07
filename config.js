// ─────────────────────────────────────────────
//  EMB PROSPECT TRACKER — CONFIGURATION
//  Fill these in before first launch
// ─────────────────────────────────────────────

const CONFIG = {
  // Supabase (pre-configured for team deployment)
  SUPABASE_URL: 'https://osygjjljpdpltjtuklvj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zeWdqamxqcGRwbHRqdHVrbHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDIzODcsImV4cCI6MjA4OTg3ODM4N30.LmSJ8IKkijGN2Tqp6DOFhvAs7K0v65TAoUak73-oM2g',

  // Claude AI (shared key, pre-configured)
  CLAUDE_API_KEY: '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',

  // Unite API — per-user, entered during setup
  UNIT_API_KEY: '',
  UNIT_PHONE_NUMBER: '',

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
