// ═══════════════════════════════════════════════════════════════
//  EMB PROSPECT TRACKER — Gmail Email Log Poller
//  Uses App Passwords + IMAP via Electron main process
//  Stores in Supabase gmail_log, deduplicates on message_id
// ═══════════════════════════════════════════════════════════════

const GMAIL_POLL_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
let _gmailPollTimer = null
let _gmailPolling = false
let _gmailPollStartedAt = 0   // timestamp of last poll start
let _gmailPollLockTimeout = null // safety timeout to auto-reset lock
const _gmailAutoFetchedContacts = new Set() // tracks contacts already backfilled this session

// Account definitions (email → short label)
const GMAIL_ACCOUNT_DEFS = [
  { key: 'gmail_mbemb', email: 'matt@eugenebrokers.com',         label: 'MBEMB' },
  { key: 'gmail_mbbmb', email: 'matt@bendmortgagebrokers.com',   label: 'MBBMB' },
  { key: 'gmail_cs',    email: 'chandler@bendmortgagebrokers.com', label: 'CS'   },
  { key: 'gmail_by',    email: 'brian@eugenebrokers.com',         label: 'BY'   },
]

// ─────────────────────────────────────────────
//  Start / Stop
// ─────────────────────────────────────────────
function startGmailPoller() {
  const cfg = loadConfig() || {}
  const configured = GMAIL_ACCOUNT_DEFS.filter(a => cfg[a.key + '_app_password'])
  if (configured.length === 0) {
    console.log('[Gmail] No app passwords configured — skipping poller')
    return
  }
  console.log(`[Gmail] Starting poller for: ${configured.map(a=>a.label).join(', ')}`)
  pollGmailNow()
  _gmailPollTimer = setInterval(pollGmailNow, GMAIL_POLL_INTERVAL_MS)
}

function stopGmailPoller() {
  if (_gmailPollTimer) { clearInterval(_gmailPollTimer); _gmailPollTimer = null }
}

// ─────────────────────────────────────────────
//  Main poll
// ─────────────────────────────────────────────
async function pollGmailNow() {
  if (!supabase) return

  // Timestamp-based guard: skip if last poll started less than the interval ago
  const now = Date.now()
  if (_gmailPolling && (now - _gmailPollStartedAt) < GMAIL_POLL_INTERVAL_MS) return

  // If we get here and _gmailPolling is still true, the previous poll is stale — force reset
  if (_gmailPolling) {
    console.warn('[Gmail] Previous poll appears stuck — resetting lock')
  }

  _gmailPolling = true
  _gmailPollStartedAt = now

  // Safety timeout: auto-reset the flag after 120 seconds to prevent permanent lock
  if (_gmailPollLockTimeout) clearTimeout(_gmailPollLockTimeout)
  _gmailPollLockTimeout = setTimeout(() => {
    if (_gmailPolling) {
      console.warn('[Gmail] Poll lock auto-reset after 120s timeout')
      _gmailPolling = false
      _gmailPollStartedAt = 0
    }
  }, 120_000)

  const cfg = loadConfig() || {}
  const accounts = GMAIL_ACCOUNT_DEFS.filter(a => cfg[a.key + '_app_password'])

  for (const acct of accounts) {
    try {
      await pollOneGmailAccount(acct, cfg)
    } catch(e) {
      console.error(`[Gmail] Error polling ${acct.label}:`, e.message)
    }
  }

  _gmailPolling = false
  _gmailPollStartedAt = 0
  if (_gmailPollLockTimeout) { clearTimeout(_gmailPollLockTimeout); _gmailPollLockTimeout = null }
}

// ─────────────────────────────────────────────
//  Poll one account
// ─────────────────────────────────────────────
async function pollOneGmailAccount(acct, cfg) {
  if (!window.electronAPI?.gmailFetch) {
    console.warn('[Gmail] electronAPI.gmailFetch not available')
    return
  }

  const lastPolledKey = acct.key + '_last_polled'
  const lastPolled = cfg[lastPolledKey]

  // First run: 7 days back. After: since last poll
  const since = lastPolled
    ? new Date(lastPolled).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const appPassword = cfg[acct.key + '_app_password']
  console.log(`[Gmail] Fetching ${acct.label} (${acct.email}) since ${since}`)

  const messages = await window.electronAPI.gmailFetch({
    email: acct.email,
    appPassword,
    since
  })

  if (!messages || messages.length === 0) {
    console.log(`[Gmail] ${acct.label}: no new messages`)
  } else {
    console.log(`[Gmail] ${acct.label}: processing ${messages.length} messages`)
    for (const msg of messages) {
      await processGmailMessage(msg, acct)
    }
  }

  // Save last polled timestamp
  cfg[lastPolledKey] = new Date().toISOString()
  saveConfig(cfg)
}

// ─────────────────────────────────────────────
//  Fetch 30-day history for a specific contact
//  Called on card open (if empty) or manual refresh
// ─────────────────────────────────────────────
async function fetchGmailForContact(contact, daysBack) {
  if (!window.electronAPI?.gmailFetch) return
  const cfg = loadConfig() || {}
  const accounts = GMAIL_ACCOUNT_DEFS.filter(a => cfg[a.key + '_app_password'])
  if (accounts.length === 0) return

  // All email addresses on this contact (lowercased)
  const emails = [contact.email, contact.email2].filter(Boolean).map(e => e.toLowerCase().trim())
  if (emails.length === 0) return

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  console.log(`[Gmail] Fetching ${daysBack}-day history for ${contact.first_name} (${emails.join(', ')})`)

  for (const acct of accounts) {
    for (const searchEmail of emails) {
      try {
        const messages = await window.electronAPI.gmailFetch({
          email: acct.email,
          appPassword: cfg[acct.key + '_app_password'],
          since,
          searchEmail
        })
        if (messages && messages.length > 0) {
          console.log(`[Gmail] ${acct.label}: ${messages.length} messages for ${searchEmail}`)
          for (const msg of messages) {
            await processGmailMessage(msg, acct, contact)
          }
        }
      } catch(e) {
        console.error(`[Gmail] fetchGmailForContact error (${acct.label}):`, e.message)
      }
    }
  }

  // Re-render the inline thread now that we have data
  loadGmailInlineThread(contact.id, true)
}

// ─────────────────────────────────────────────
//  Process one message
// ─────────────────────────────────────────────
async function processGmailMessage(msg, acct, knownContact) {
  // Normalize the "other side" email address (always lowercase)
  const otherRaw = msg.direction === 'sent' ? msg.to : msg.from
  const otherEmail = normalizeEmail(otherRaw)
  if (!otherEmail) return

  // Match contact: use provided contact, or search by email/email2 (case-insensitive)
  const contact = knownContact || contacts.find(c => {
    const e1 = (c.email  || '').toLowerCase().trim()
    const e2 = (c.email2 || '').toLowerCase().trim()
    return (e1 && e1 === otherEmail) || (e2 && e2 === otherEmail)
  })

  // Skip emails that don't belong to anyone in the program
  if (!contact) return

  // Build the log entry
  const newEntry = {
    message_id:    msg.messageId,
    thread_id:     msg.threadId || null,
    contact_id:    contact.id,
    contact_email: otherEmail,
    account_email: acct.email,
    account_label: acct.label,
    direction:     msg.direction, // 'sent' | 'received'
    subject:       (msg.subject || '(no subject)').substring(0, 500),
    snippet:       (msg.snippet || '').substring(0, 300),
    from_address:  msg.from || '',
    to_address:    msg.to || '',
    sent_at:       msg.sentAt || new Date().toISOString()
  }

  // Check if message_id already exists (multi-inbox dedup)
  const { data: existing } = await supabase
    .from('gmail_log')
    .select('id, account_label')
    .eq('message_id', msg.messageId)
    .maybeSingle()

  if (existing) {
    // Already seen — combine account labels if this is a new inbox
    const existingLabels = existing.account_label.split('+').map(s => s.trim())
    if (!existingLabels.includes(acct.label)) {
      const combined = [...existingLabels, acct.label].join('+')
      await supabase.from('gmail_log').update({ account_label: combined }).eq('id', existing.id)
      console.log(`[Gmail] Updated multi-inbox: ${msg.messageId} → ${combined}`)
    }
    // Even on dedup: if this is an outbound email, always clear needs_response
    if (msg.direction === 'sent' && contact.needs_response) {
      await supabase.from('contacts').update({ needs_response: false }).eq('id', contact.id)
      contact.needs_response = false
      loadContacts()
    }
    return
  }

  // Insert new record
  const { error } = await supabase.from('gmail_log').insert(newEntry)
  if (error) {
    console.error('[Gmail] Insert error:', error.message)
    return
  }

  console.log(`[Gmail] Saved: ${msg.direction} ${acct.label} — "${newEntry.subject}"`)

  // Auto-log + update follow-up + set needs_response
  await handleGmailContactUpdate(contact, newEntry)
}

// ─────────────────────────────────────────────
//  Auto-update contact when email matched
// ─────────────────────────────────────────────
async function handleGmailContactUpdate(contact, entry) {
  const isInbound = entry.direction === 'received'
  const cfg = loadConfig() || {}
  const fuDays = parseInt(cfg.followup_default_days || 2)
  const newFuDate = addBizDays(new Date(), fuDays).toISOString().split('T')[0]

  // 1. Insert contact_log entry
  const logEntry = {
    contact_id: contact.id,
    user_name:  entry.account_label,
    log_type:   'email',
    note:       `${isInbound ? '↩' : '→'} ${entry.account_label}: ${entry.subject}`,
    timestamp:  entry.sent_at
  }
  await supabase.from('contact_log').insert(logEntry)

  // 2. Update contact: reset follow-up + set needs_response if inbound
  const updates = {
    followup_date: newFuDate,
    updated_at: new Date().toISOString()
  }
  if (isInbound) updates.needs_response = true
  if (!isInbound) updates.needs_response = false // always clear yellow when WE email them

  await supabase.from('contacts').update(updates).eq('id', contact.id)

  // 3. Update local contacts array so card re-renders immediately
  const local = contacts.find(c => c.id === contact.id)
  if (local) {
    local.followup_date = newFuDate
    if (isInbound) local.needs_response = true
    else if (!isInbound) local.needs_response = false
    if (!local.contact_log) local.contact_log = []
    local.contact_log.push(logEntry)
  }

  // 4. Re-render the board so card updates immediately
  loadContacts()

  console.log(`[Gmail] Contact updated: ${contact.first_name} ${contact.last_name} — ${isInbound ? 'needs response' : 'follow-up reset'}`)
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function normalizeEmail(raw) {
  if (!raw) return ''
  // Handle "Name <email@domain.com>" format
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw).toLowerCase().trim()
}

// ─────────────────────────────────────────────
//  Load email log for a contact (for display)
// ─────────────────────────────────────────────
async function loadGmailThreadForContact(contactId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('gmail_log')
    .select('*')
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })
    .limit(50)
  if (error) { console.error('[Gmail] Load error:', error.message); return [] }
  return data || []
}

// ─────────────────────────────────────────────
//  Render email thread HTML (inline in card modal)
//  skipAutoFetch = true when called after a fetch (avoids infinite loop)
// ─────────────────────────────────────────────
async function loadGmailInlineThread(contactId, skipAutoFetch) {
  const container = document.getElementById(`gmail-thread-inline-${contactId}`)
  if (!container) return

  const emails = await loadGmailThreadForContact(contactId)

  if (emails.length === 0) {
    // First time opening this contact's card — auto-fetch 30 days back
    const contact = (typeof contacts !== 'undefined') && contacts.find(c => c.id === contactId)
    const hasEmail = contact && (contact.email || contact.email2)
    if (!skipAutoFetch && hasEmail && !_gmailAutoFetchedContacts.has(contactId)) {
      _gmailAutoFetchedContacts.add(contactId)
      container.innerHTML = '<div style="text-align:center;color:#aaa;font-size:11px;font-weight:700;padding:16px">Searching last 30 days...</div>'
      await fetchGmailForContact(contact, 30)
      return // fetchGmailForContact calls loadGmailInlineThread(id, true) when done
    }
    container.innerHTML = '<div style="text-align:center;color:#ccc;font-size:11px;font-weight:700;padding:16px">No emails logged yet — emails sync automatically every 2 minutes</div>'
    return
  }

  container.innerHTML = emails.map(e => {
    const isInbound = e.direction === 'received'
    const isNew = isInbound && !e.read_at

    // Direction + account badge
    const badgeBg = isInbound
      ? (isNew ? 'background:#fff9c4;color:#b8860b;border:1px solid #d4a500' : 'background:linear-gradient(135deg,#61C08C,#4aab79);color:#2B3739')
      : 'background:linear-gradient(135deg,#3F80AA,#448694);color:white'
    const dirSymbol = isInbound ? '↩' : '→'
    const badgeText = `${dirSymbol} ${e.account_label}`

    const timeStr = formatDateTime(e.sent_at)
    const gmailUrl = `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(e.message_id)}`

    return `
    <div style="background:${isNew ? '#fffef0' : 'white'};border-radius:8px;padding:10px 12px;margin-bottom:8px;border-left:3px solid ${isInbound ? (isNew ? '#d4a500' : '#61C08C') : '#3F80AA'};box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:8px;font-weight:900;padding:2px 7px;border-radius:4px;${badgeBg}">${escHtml(badgeText)}</span>
        </div>
        <span style="font-size:9px;font-weight:700;color:#bbb;white-space:nowrap">${timeStr}</span>
      </div>
      <div style="font-size:11px;font-weight:900;color:#2B3739;margin-bottom:3px">${escHtml(e.subject)}</div>
      <div style="font-size:11px;color:#777;line-height:1.4;margin-bottom:6px">${escHtml(e.snippet)}</div>
      <button onclick="window.electronAPI ? window.electronAPI.openExternal('${gmailUrl}') : window.open('${gmailUrl}')"
        style="background:transparent;border:1px solid #e0e4e6;color:#bbb;padding:3px 9px;border-radius:5px;font-family:inherit;font-size:9px;font-weight:700;cursor:pointer">
        ↗ Open in Gmail
      </button>
    </div>`
  }).join('')
}
