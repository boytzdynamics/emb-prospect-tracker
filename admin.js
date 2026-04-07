// ═══════════════════════════════════════════
//  EMB PROSPECT TRACKER — ADMIN PANEL
// ═══════════════════════════════════════════

function renderAdminPanel() {
  const cfg = loadConfig() || {}
  if (cfg.user_role !== 'admin') return

  showSimpleModal('⚙️ ADMIN SETTINGS', `
    <div style="padding:0">
      <div style="display:flex;border-bottom:1px solid #eaeef0;background:#f8f9fa;border-radius:8px 8px 0 0;overflow:hidden">
        ${['Profile','Teams','Users','Columns','Boards','Integrations','Gmail','Import','Defaults'].map((tab,i) =>
          `<button onclick="adminTab(${i})" id="atab-${i}" style="flex:1;padding:10px 4px;border:none;background:${i===0?'white':'transparent'};font-family:inherit;font-size:10px;font-weight:900;color:${i===0?'var(--dark)':'#aaa'};cursor:pointer;border-bottom:2px solid ${i===0?'var(--blue)':'transparent'};transition:all .2s">${tab}</button>`
        ).join('')}
      </div>

      <!-- 0: Profile -->
      <div id="apanel-0" style="padding:20px">
        <div class="frow"><div class="ff"><label>Your Name</label><input id="a-name" value="${cfg.user_name||''}" /></div><div class="ff"><label>Initials</label><input id="a-initials" value="${cfg.user_initials||''}" maxlength="2" /></div></div>
        <div class="frow"><div class="ff"><label>Role</label><select id="a-role"><option value="admin" ${cfg.user_role==='admin'?'selected':''}>Admin</option><option value="lo" ${cfg.user_role==='lo'?'selected':''}>Loan Officer</option></select></div><div class="ff"><label>Team</label><select id="a-team"><option value="matt" ${cfg.user_team==='matt'?'selected':''}>Team Matt</option><option value="shad" ${cfg.user_team==='shad'?'selected':''}>Team Shad</option><option value="lauren" ${cfg.user_team==='lauren'?'selected':''}>Team Lauren</option></select></div></div>
        <button class="btn-p" onclick="saveAdminProfile()" style="margin-top:8px">Save Profile</button>
      </div>

      <!-- 1: Teams -->
      <div id="apanel-1" style="padding:20px;display:none">
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px">MANAGE TEAMS</div>
        <div id="teams-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px"></div>
        <div style="display:flex;gap:8px">
          <input id="new-team-name" placeholder="New team name (e.g. Team Portland)" style="flex:1;border:1.5px solid #e0e4e6;border-radius:8px;padding:8px 11px;font-family:inherit;font-size:13px;background:var(--off);outline:none" />
          <input id="new-team-phone" placeholder="Shared phone (+15415551234)" style="flex:1;border:1.5px solid #e0e4e6;border-radius:8px;padding:8px 11px;font-family:inherit;font-size:13px;background:var(--off);outline:none" />
          <button class="btn-p" onclick="addTeam()">+ Add Team</button>
        </div>
      </div>

      <!-- 2: Users -->
      <div id="apanel-2" style="padding:20px;display:none">
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px">MANAGE USERS</div>
        <div id="users-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px"></div>
        <div style="background:var(--off);border:1.5px solid #e0e4e6;border-radius:10px;padding:14px">
          <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Add New User</div>
          <div class="frow"><div class="ff"><label>Name</label><input id="nu-name" placeholder="Full name" /></div><div class="ff"><label>Email</label><input id="nu-email" placeholder="email@example.com" /></div></div>
          <div class="frow"><div class="ff"><label>Role</label><select id="nu-role"><option value="admin">Admin</option><option value="lo" selected>Loan Officer</option></select></div><div class="ff"><label>Team</label><select id="nu-team"><option value="matt">Team Matt</option><option value="shad">Team Shad</option><option value="lauren">Team Lauren</option></select></div></div>
          <div class="frow"><div class="ff"><label>Initials</label><input id="nu-initials" maxlength="2" placeholder="CS" /></div><div class="ff"><label>Color</label><input id="nu-color" type="color" value="#3F80AA" /></div></div>
          <button class="btn-p" onclick="addUser()" style="margin-top:4px">+ Add User</button>
        </div>
      </div>

      <!-- 3: Columns -->
      <div id="apanel-3" style="padding:20px;display:none">
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px">COLUMN DISPLAY LABELS</div>
        <div style="font-size:11px;color:#888;margin-bottom:12px">Internal IDs never change — only what shows on screen</div>
        <div id="col-labels-list" style="display:flex;flex-direction:column;gap:8px"></div>
        <button class="btn-p" onclick="saveColumnLabels()" style="margin-top:14px">Save Labels</button>
      </div>

      <!-- 4: Boards (per-team visibility) -->
      <div id="apanel-4" style="padding:20px;display:none">
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px">BOARD VISIBILITY PER TEAM</div>
        <div style="font-size:11px;color:#888;margin-bottom:12px">Choose which boards each team can see. Hidden boards block all moves to those boards.</div>
        <div class="frow" style="margin-bottom:14px">
          <div class="ff">
            <label>Team</label>
            <select id="a-board-team" onchange="loadBoardVisibilityAdmin()" style="border:1.5px solid #e0e4e6;border-radius:8px;padding:8px 11px;font-family:inherit;font-size:13px;font-weight:700;background:var(--off);outline:none">
              <option value="matt">Team Matt</option>
              <option value="shad">Team Shad</option>
              <option value="lauren">Team Lauren</option>
            </select>
          </div>
        </div>
        <div id="board-vis-checks" style="display:flex;flex-direction:column;gap:10px"></div>
        <button class="btn-p" onclick="saveBoardVisibility()" style="margin-top:14px">Save Board Visibility</button>
        <div style="margin-top:24px;border-top:1px solid #eaeef0;padding-top:16px">
          <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px">ADMIN PIN</div>
          <div style="font-size:11px;color:#888;margin-bottom:10px">Used to access admin settings on any machine via Ctrl+Shift+A</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="a-admin-pin" type="text" placeholder="PIN code" style="width:140px;border:1.5px solid #e0e4e6;border-radius:8px;padding:8px 11px;font-family:inherit;font-size:14px;font-weight:900;letter-spacing:3px;text-align:center;background:var(--off);outline:none" />
            <button class="btn-p" onclick="saveAdminPin()">Save PIN</button>
          </div>
          <div id="admin-pin-status" style="margin-top:6px;font-size:11px;color:#888"></div>
        </div>
      </div>

      <!-- 5: Integrations (Supabase, Claude, Unite) -->
      <div id="apanel-5" style="padding:20px;display:none">
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">SUPABASE</div>
        <div class="frow"><div class="ff"><label>Supabase URL</label><input id="a-sb-url" value="${cfg.supabase_url||''}" /></div></div>
        <div class="frow"><div class="ff"><label>Supabase Anon Key</label><input id="a-sb-key" value="${cfg.supabase_anon_key||''}" type="password" /></div></div>
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">CLAUDE AI</div>
        <div class="frow"><div class="ff"><label>Claude API Key</label><input id="a-claude" value="${cfg.claude_api_key||''}" type="password" /></div></div>
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">INTERMEDIA UNITE SMS</div>
        <div class="frow"><div class="ff"><label>Client ID</label><input id="a-unite-id" value="${cfg.unite_client_id||''}" /></div><div class="ff"><label>Client Secret</label><input id="a-unite-secret" value="${cfg.unite_client_secret||''}" type="password" /></div></div>
        <div class="frow"><div class="ff"><label>Shared Phone Number</label><input id="a-unite-phone" value="${cfg.unite_phone_number||''}" placeholder="+15415551234" /></div></div>
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px">META LEAD WEBHOOK</div>
        <div style="background:var(--off);border:1.5px solid #e0e4e6;border-radius:9px;padding:12px;font-size:12px;color:var(--dark)">
          Point your Meta Lead Ad webhook to:<br>
          <code style="background:#e8f0fe;padding:2px 6px;border-radius:4px;font-size:11px">${cfg.supabase_url||'https://your-project.supabase.co'}/functions/v1/meta-webhook</code>
          <button onclick="copyWebhook()" class="btn-sm btn-edit-sm" style="margin-left:8px">Copy</button>
        </div>
        <button class="btn-p" onclick="saveIntegrations()" style="margin-top:14px">Save Integrations</button>
      </div>

      <!-- 6: Gmail (App Passwords — Admin only) -->
      <div id="apanel-6" style="padding:20px;display:none">
        <div style="background:#eef5fc;border:1.5px solid var(--blue);border-radius:9px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--dark);line-height:1.7">
          <strong>📧 Gmail App Password Setup</strong><br>
          Matt's PC scrapes all 4 accounts automatically. One-time setup per account.<br><br>
          <strong>How to get an App Password:</strong><br>
          1. Go to <strong>myaccount.google.com</strong> → Security → 2-Step Verification<br>
          2. Scroll to bottom → <strong>App passwords</strong><br>
          3. Select app: <em>Mail</em> · Select device: <em>Windows Computer</em><br>
          4. Copy the 16-character password and paste below<br>
          5. Repeat for each account
        </div>

        <div style="display:flex;flex-direction:column;gap:12px">
          ${gmailAccountRow('MBEMB', 'matt@eugenebrokers.com', 'a-pw-mbemb', cfg.gmail_mbemb_app_password)}
          ${gmailAccountRow('MBBMB', 'matt@bendmortgagebrokers.com', 'a-pw-mbbmb', cfg.gmail_mbbmb_app_password)}
          ${gmailAccountRow('CS', 'chandler@bendmortgagebrokers.com', 'a-pw-cs', cfg.gmail_cs_app_password)}
          ${gmailAccountRow('BY', 'brian@eugenebrokers.com', 'a-pw-by', cfg.gmail_by_app_password)}
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;align-items:center">
          <button class="btn-p" onclick="saveGmailPasswords()">💾 Save App Passwords</button>
          <button class="btn-s" onclick="testGmailConnections()">🔍 Test Connections</button>
        </div>
        <div id="gmail-test-results" style="margin-top:10px"></div>
      </div>

      <!-- 7: Import -->
      <div id="apanel-7" style="padding:20px;display:none">
        <div style="font-size:10px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px">CSV MASS IMPORT</div>
        <div style="background:var(--off);border:2px dashed #dde2e4;border-radius:12px;padding:24px;text-align:center;margin-bottom:14px">
          <div style="font-size:32px;margin-bottom:8px">📄</div>
          <div style="font-size:13px;font-weight:700;color:var(--dark);margin-bottom:4px">Drop CSV file here or click to browse</div>
          <div style="font-size:11px;color:#888">Required: first_name, last_name, phone · Optional: email, source, notes</div>
          <input type="file" id="csv-import" accept=".csv" style="display:none" onchange="handleCSVImport(this)" />
          <button class="btn-p" onclick="document.getElementById('csv-import').click()" style="margin-top:12px">Browse Files</button>
        </div>
        <div id="csv-preview" style="display:none">
          <div id="csv-preview-content"></div>
          <div class="frow" style="margin-top:10px">
            <div class="ff"><label>Import to Column</label>
              <select id="csv-column">
                <option value="col_gen1">🏠 Prospects</option>
                <option value="col_faas">⭐ FAAS Team</option>
                <option value="col_meta">📱 Meta Prospects</option>
              </select>
            </div>
          </div>
          <button class="btn-p" onclick="confirmCSVImport()" style="margin-top:10px">Import All →</button>
        </div>
      </div>

      <!-- 8: Defaults -->
      <div id="apanel-8" style="padding:20px;display:none">
        <div class="frow">
          <div class="ff">
            <label>Default Follow-Up Days</label>
            <input id="a-fu-days" type="number" value="${cfg.followup_default_days||2}" min="1" max="30" />
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:9px;font-weight:900;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;display:block;margin-bottom:8px">ASSIGN-TO FEATURE</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="checkbox" id="a-assign-toggle" ${cfg.assign_to_enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--blue)" />
            <label for="a-assign-toggle" style="font-size:12px;font-weight:700;color:var(--dark)">Enable assign-to on cards</label>
          </div>
        </div>
        <button class="btn-p" onclick="saveDefaults()">Save Defaults</button>
      </div>
    </div>
  `, 'modal-admin')

  renderColLabels()
  renderTeamsList()
  renderUsersList()
  loadBoardVisibilityAdmin()
  loadAdminPinForPanel()
}

// Gmail account row helper
function gmailAccountRow(label, email, inputId, currentVal) {
  const isSet = !!currentVal
  return `
    <div style="background:var(--off);border:1.5px solid ${isSet ? 'var(--green)' : '#e0e4e6'};border-radius:10px;padding:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2px;background:${isSet ? 'linear-gradient(135deg,var(--green),#4aab79)' : 'var(--dark)'};color:${isSet ? 'var(--dark)' : 'white'};padding:2px 10px;border-radius:5px">${label}</span>
        <span style="font-size:12px;font-weight:700;color:#888">${email}</span>
        ${isSet ? '<span style="margin-left:auto;font-size:10px;font-weight:900;color:var(--green)">✓ Connected</span>' : '<span style="margin-left:auto;font-size:10px;font-weight:700;color:#ccc">Not configured</span>'}
      </div>
      <div class="frow" style="margin-bottom:0">
        <div class="ff">
          <label>App Password (16 characters)</label>
          <input id="${inputId}" value="${currentVal||''}" type="password" placeholder="xxxx xxxx xxxx xxxx" style="font-family:monospace;letter-spacing:2px" />
        </div>
      </div>
    </div>`
}

function adminTab(i) {
  for(let j=0;j<9;j++){
    const tab = document.getElementById('atab-'+j)
    const panel = document.getElementById('apanel-'+j)
    if(tab){tab.style.background=j===i?'white':'transparent';tab.style.color=j===i?'var(--dark)':'#aaa';tab.style.borderBottomColor=j===i?'var(--blue)':'transparent'}
    if(panel)panel.style.display=j===i?'block':'none'
  }
}

function saveGmailPasswords() {
  const cfg = loadConfig() || {}
  cfg.gmail_mbemb_app_password = document.getElementById('a-pw-mbemb')?.value?.replace(/\s/g,'') || cfg.gmail_mbemb_app_password
  cfg.gmail_mbbmb_app_password = document.getElementById('a-pw-mbbmb')?.value?.replace(/\s/g,'') || cfg.gmail_mbbmb_app_password
  cfg.gmail_cs_app_password    = document.getElementById('a-pw-cs')?.value?.replace(/\s/g,'')    || cfg.gmail_cs_app_password
  cfg.gmail_by_app_password    = document.getElementById('a-pw-by')?.value?.replace(/\s/g,'')    || cfg.gmail_by_app_password
  saveConfig(cfg)
  showToast('Gmail app passwords saved — polling will start within 2 minutes', 'green')
  // Restart poller with new credentials
  stopGmailPoller()
  startGmailPoller()
  setTimeout(() => renderAdminPanel(), 300)
}

async function testGmailConnections() {
  const results = document.getElementById('gmail-test-results')
  if (results) results.innerHTML = '<div style="color:#aaa;font-size:11px;font-weight:700">Testing connections...</div>'

  const cfg = loadConfig() || {}
  const accounts = [
    { label: 'MBEMB', email: 'matt@eugenebrokers.com',           pw: cfg.gmail_mbemb_app_password },
    { label: 'MBBMB', email: 'matt@bendmortgagebrokers.com',     pw: cfg.gmail_mbbmb_app_password },
    { label: 'CS',    email: 'chandler@bendmortgagebrokers.com', pw: cfg.gmail_cs_app_password },
    { label: 'BY',    email: 'brian@eugenebrokers.com',           pw: cfg.gmail_by_app_password },
  ]

  const html = []
  for (const acct of accounts) {
    if (!acct.pw) {
      html.push(`<div style="display:flex;align-items:center;gap:8px;padding:6px 0"><span style="font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:1px;background:#eee;color:#aaa;padding:1px 8px;border-radius:4px">${acct.label}</span><span style="font-size:11px;color:#aaa">Not configured</span></div>`)
      continue
    }
    try {
      const msgs = await window.electronAPI.gmailFetch({
        email: acct.email,
        appPassword: acct.pw,
        since: new Date(Date.now() - 24*60*60*1000).toISOString() // last 24h test
      })
      html.push(`<div style="display:flex;align-items:center;gap:8px;padding:6px 0"><span style="font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:1px;background:linear-gradient(135deg,var(--green),#4aab79);color:var(--dark);padding:1px 8px;border-radius:4px">${acct.label}</span><span style="font-size:11px;color:var(--green);font-weight:700">✓ Connected — ${msgs?.length||0} emails in last 24h</span></div>`)
    } catch(e) {
      html.push(`<div style="display:flex;align-items:center;gap:8px;padding:6px 0"><span style="font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:1px;background:#fff0f0;color:var(--red);padding:1px 8px;border-radius:4px">${acct.label}</span><span style="font-size:11px;color:var(--red);font-weight:700">✗ Failed — check app password</span></div>`)
    }
  }
  if (results) results.innerHTML = `<div style="background:var(--off);border-radius:8px;padding:10px 14px">${html.join('')}</div>`
}

// ── All existing functions below (unchanged) ──

function renderColLabels() {
  const cfg = loadConfig()||{}
  const colConfigs = [
    {id:'col_faas',default:'⭐ FAAS Team'},{id:'col_gen1',default:'🏠 Prospects'},
    {id:'col_gen2',default:'🏠 Prospects 2'},{id:'col_gen3',default:'🏠 Prospects 3'},
    {id:'col_gen4',default:'🏠 Prospects 4'},{id:'col_meta',default:'📱 Meta Prospects'},
    {id:'lead_prospect',default:'👤 Prospect'},{id:'lead_docs',default:'📂 Getting Docs'},
    {id:'lead_ready',default:'✅ PRE-APP / REFI'},{id:'lead_approved',default:'🏆 Pre-Approved'},
    {id:'lead_inprocess',default:'📋 In Process'},
    {id:'dead_prospect',default:'💀 Dead Prospects'},{id:'dead_denied',default:'❌ Denied Pre-Approvals'}
  ]
  const el = document.getElementById('col-labels-list')
  if(!el) return
  el.innerHTML = colConfigs.map(col => `
    <div style="display:flex;gap:10px;align-items:center">
      <div style="font-size:11px;font-weight:700;color:#888;width:160px;flex-shrink:0">${col.id}</div>
      <input data-col-id="${col.id}" value="${(cfg.col_labels||{})[col.id]||col.default}" style="flex:1;border:1.5px solid #e0e4e6;border-radius:7px;padding:6px 10px;font-family:inherit;font-size:12px;background:var(--off);outline:none" />
    </div>`).join('')
}

function saveColumnLabels() {
  const cfg = loadConfig()||{}
  if(!cfg.col_labels) cfg.col_labels = {}
  document.querySelectorAll('[data-col-id]').forEach(input => { cfg.col_labels[input.dataset.colId] = input.value })
  saveConfig(cfg)
  showToast('Column labels saved', 'green')
  renderAllBoards()
}

function renderTeamsList() {
  const el = document.getElementById('teams-list')
  if(!el) return
  const teams = JSON.parse(localStorage.getItem('emb_teams')||'[]')
  el.innerHTML = teams.length === 0
    ? '<div style="color:#ccc;font-size:12px;font-weight:700">No additional teams yet</div>'
    : teams.map(t => `
      <div style="display:flex;align-items:center;gap:10px;background:var(--off);border-radius:9px;padding:10px 14px">
        <div style="flex:1"><div style="font-weight:900;font-size:13px">${t.name}</div><div style="font-size:11px;color:#888">${t.phone||'No phone set'}</div></div>
        <button onclick="deleteTeam('${t.id}')" style="background:#fff0f0;color:var(--red);border:1.5px solid #ffcdd2;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:900;cursor:pointer">Remove</button>
      </div>`).join('')
}

function addTeam() {
  const name = document.getElementById('new-team-name')?.value?.trim()
  if(!name) return
  const teams = JSON.parse(localStorage.getItem('emb_teams')||'[]')
  teams.push({id:'team-'+Date.now(), name, phone: document.getElementById('new-team-phone')?.value?.trim(), members:[]})
  localStorage.setItem('emb_teams', JSON.stringify(teams))
  document.getElementById('new-team-name').value = ''
  document.getElementById('new-team-phone').value = ''
  renderTeamsList()
  showToast('Team added', 'green')
}

function deleteTeam(id) {
  const teams = JSON.parse(localStorage.getItem('emb_teams')||'[]').filter(t=>t.id!==id)
  localStorage.setItem('emb_teams', JSON.stringify(teams))
  renderTeamsList()
}

function renderUsersList() {
  const el = document.getElementById('users-list')
  if(!el) return
  const users = JSON.parse(localStorage.getItem('emb_users')||'[]')
  el.innerHTML = users.length === 0
    ? '<div style="color:#ccc;font-size:12px;font-weight:700">No users added yet</div>'
    : users.map(u => `
      <div style="display:flex;align-items:center;gap:10px;background:var(--off);border-radius:9px;padding:10px 14px">
        <div style="width:30px;height:30px;border-radius:50%;background:${u.color||'var(--blue)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:white;flex-shrink:0">${u.initials||'?'}</div>
        <div style="flex:1"><div style="font-weight:900;font-size:13px">${u.name}</div><div style="font-size:11px;color:#888">${u.email} · ${u.role} · ${u.team}</div></div>
        <button onclick="removeUser('${u.id}')" style="background:#fff0f0;color:var(--red);border:1.5px solid #ffcdd2;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:900;cursor:pointer">Remove</button>
      </div>`).join('')
}

function addUser() {
  const name = document.getElementById('nu-name')?.value?.trim()
  if(!name) { showToast('Name is required','red'); return }
  const users = JSON.parse(localStorage.getItem('emb_users')||'[]')
  users.push({
    id:'user-'+Date.now(), name,
    email: document.getElementById('nu-email')?.value?.trim(),
    role: document.getElementById('nu-role')?.value,
    team: document.getElementById('nu-team')?.value,
    initials: document.getElementById('nu-initials')?.value?.toUpperCase(),
    color: document.getElementById('nu-color')?.value
  })
  localStorage.setItem('emb_users', JSON.stringify(users))
  ;['nu-name','nu-email','nu-initials'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''})
  renderUsersList()
  showToast('User added', 'green')
}

function removeUser(id) {
  const users = JSON.parse(localStorage.getItem('emb_users')||'[]').filter(u=>u.id!==id)
  localStorage.setItem('emb_users', JSON.stringify(users))
  renderUsersList()
}

function saveAdminProfile() {
  const cfg = loadConfig()||{}
  cfg.user_name = document.getElementById('a-name')?.value
  cfg.user_initials = document.getElementById('a-initials')?.value?.toUpperCase()
  cfg.user_role = document.getElementById('a-role')?.value
  cfg.user_team = document.getElementById('a-team')?.value
  saveConfig(cfg)
  showToast('Profile saved', 'green')
}

function saveIntegrations() {
  const cfg = loadConfig()||{}
  cfg.supabase_url        = document.getElementById('a-sb-url')?.value
  cfg.supabase_anon_key   = document.getElementById('a-sb-key')?.value
  cfg.claude_api_key      = document.getElementById('a-claude')?.value
  cfg.unite_client_id     = document.getElementById('a-unite-id')?.value
  cfg.unite_client_secret = document.getElementById('a-unite-secret')?.value
  cfg.unite_phone_number  = document.getElementById('a-unite-phone')?.value
  saveConfig(cfg)
  showToast('Integrations saved — restart for full effect', 'blue')
}

function saveDefaults() {
  const cfg = loadConfig()||{}
  cfg.followup_default_days = parseInt(document.getElementById('a-fu-days')?.value||'2')
  cfg.assign_to_enabled = document.getElementById('a-assign-toggle')?.checked
  saveConfig(cfg)
  showToast('Defaults saved', 'green')
}

function copyWebhook() {
  const cfg = loadConfig()||{}
  const url = `${cfg.supabase_url||'https://your-project.supabase.co'}/functions/v1/meta-webhook`
  navigator.clipboard?.writeText(url)
  showToast('Webhook URL copied', 'blue')
}

async function handleCSVImport(input) {
  if(!input.files?.length) return
  const file = input.files[0]
  const text = await file.text()
  const lines = text.split('\n').filter(l=>l.trim())
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/"/g,''))
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v=>v.trim().replace(/"/g,''))
    return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||'']))
  }).filter(r=>r.first_name||r.last_name||r.phone)
  const preview = document.getElementById('csv-preview')
  const previewContent = document.getElementById('csv-preview-content')
  if(preview) preview.style.display='block'
  if(previewContent) previewContent.innerHTML = `
    <div style="background:var(--off);border-radius:9px;padding:12px;font-size:12px;font-weight:700;color:var(--dark)">
      Found <strong>${rows.length} contacts</strong> to import
      <div style="margin-top:8px;color:#888;font-size:11px">
        ${rows.slice(0,3).map(r=>`${r.first_name||''} ${r.last_name||''} · ${r.phone||''}`).join('<br>')}
        ${rows.length>3?`<br>...and ${rows.length-3} more`:''}
      </div>
    </div>`
  window._csvImportRows = rows
}

async function confirmCSVImport() {
  const rows = window._csvImportRows || []
  const colId = document.getElementById('csv-column')?.value || 'col_gen1'
  const cfg = loadConfig()||{}
  let imported = 0
  for(const row of rows) {
    const contact = {
      id: 'csv-'+Date.now()+'-'+Math.random().toString(36).substr(2,5),
      first_name: row.first_name||'', last_name: row.last_name||'',
      phone: row.phone||'', email: row.email||'',
      board: 'prospects', column_id: colId, team: cfg.user_team||'matt',
      source: row.source||null, created_by_name: cfg.user_name||'Import',
      followup_date: addBizDays(new Date(), parseInt(cfg.followup_default_days||2)).toISOString().split('T')[0],
      notes:[], contact_log:[], quick_notes:[],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    contacts.unshift(contact)
    if(supabase) { try { await supabase.from('contacts').insert(contact) } catch(e){} }
    imported++
  }
  renderAllBoards()
  closeModal('modal-admin')
  showToast(`${imported} contacts imported ✓`, 'green')
}

function exportSettings() {
  const cfg = loadConfig() || {}
  const blob = new Blob([JSON.stringify(cfg, null, 2)], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'emb-settings-' + new Date().toISOString().split('T')[0] + '.json'
  a.click()
  URL.revokeObjectURL(url)
  showToast('Settings exported ✓', 'green')
}

async function importSettings(input) {
  if (!input.files?.length) return
  const file = input.files[0]
  const text = await file.text()
  try {
    const cfg = JSON.parse(text)
    cfg.isSetupComplete = true
    saveConfig(cfg)
    showToast('Settings imported — restarting...', 'green')
    setTimeout(() => location.reload(), 1500)
  } catch(e) { showToast('Invalid settings file', 'red') }
}

// ═══════════════════════════════════════════
//  BOARD VISIBILITY (Admin Panel)
// ═══════════════════════════════════════════
const ALL_BOARDS = [
  { id: 'prospects', label: 'Prospects', icon: '🏠' },
  { id: 'leads', label: 'Leads', icon: '⚡' },
  { id: 'closed', label: 'Closed Loans', icon: '✅' },
  { id: 'dead', label: 'Dead Files', icon: '💀' }
]

async function loadBoardVisibilityAdmin() {
  const team = document.getElementById('a-board-team')?.value || 'matt'
  const el = document.getElementById('board-vis-checks')
  if (!el) return

  // Default: all boards visible
  let visible = ['prospects','leads','closed','dead']
  if (supabase) {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'boards_visible_' + team).maybeSingle()
      if (data?.value) {
        try { const parsed = JSON.parse(data.value); if (Array.isArray(parsed) && parsed.length > 0) visible = parsed } catch(e) {}
      }
    } catch(e) { console.error('Error loading board visibility for admin:', e) }
  }

  el.innerHTML = ALL_BOARDS.map(b => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--off);border-radius:9px;padding:10px 14px">
      <input type="checkbox" id="bv-${b.id}" ${visible.includes(b.id)?'checked':''} style="width:18px;height:18px;accent-color:var(--blue)" />
      <label for="bv-${b.id}" style="font-size:13px;font-weight:900;color:var(--dark);cursor:pointer">${b.icon} ${b.label}</label>
    </div>`).join('')
}

async function saveBoardVisibility() {
  const team = document.getElementById('a-board-team')?.value || 'matt'
  const visible = ALL_BOARDS.filter(b => document.getElementById('bv-' + b.id)?.checked).map(b => b.id)
  if (visible.length === 0) { showToast('At least one board must be visible', 'red'); return }
  if (!supabase) { showToast('Supabase not connected', 'red'); return }
  try {
    const key = 'boards_visible_' + team
    const payload = { key, value: JSON.stringify(visible), updated_by: currentUser?.name || 'Admin', updated_at: new Date().toISOString() }
    // Check if row exists, then update or insert
    const { data: existing } = await supabase.from('app_settings').select('id').eq('key', key).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update(payload).eq('key', key))
    } else {
      ({ error } = await supabase.from('app_settings').insert(payload))
    }
    if (error) { showToast('Failed to save: ' + error.message, 'red'); return }
    showToast('Board visibility saved for Team ' + team.charAt(0).toUpperCase() + team.slice(1), 'green')
    // If saving for current user's team, update live state
    if (team === currentUser?.team) {
      visibleBoards = visible
      renderSidebar()
      renderAllBoards()
    }
  } catch(e) { showToast('Error saving board visibility', 'red') }
}

// ═══════════════════════════════════════════
//  ADMIN PIN MANAGEMENT
// ═══════════════════════════════════════════
async function loadAdminPinForPanel() {
  const input = document.getElementById('a-admin-pin')
  const status = document.getElementById('admin-pin-status')
  if (!input || !supabase) return
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_pin').maybeSingle()
    if (data?.value) {
      input.value = data.value
      if (status) status.textContent = 'Current PIN loaded from database'
    } else {
      input.value = '8702'
      if (status) status.textContent = 'Using default PIN (8702) — no PIN saved in database yet'
    }
  } catch(e) { console.error('Error loading admin PIN:', e) }
}

async function saveAdminPin() {
  const pin = document.getElementById('a-admin-pin')?.value?.trim()
  if (!pin || pin.length < 4) { showToast('PIN must be at least 4 characters', 'red'); return }
  if (!supabase) { showToast('Supabase not connected', 'red'); return }
  try {
    const payload = { key: 'admin_pin', value: pin, updated_by: currentUser?.name || 'Admin', updated_at: new Date().toISOString() }
    const { data: existing } = await supabase.from('app_settings').select('id').eq('key', 'admin_pin').maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update(payload).eq('key', 'admin_pin'))
    } else {
      ({ error } = await supabase.from('app_settings').insert(payload))
    }
    if (error) { showToast('Failed to save PIN: ' + error.message, 'red'); return }
    showToast('Admin PIN saved', 'green')
    const status = document.getElementById('admin-pin-status')
    if (status) status.textContent = 'PIN saved successfully'
  } catch(e) { showToast('Error saving PIN', 'red') }
}
