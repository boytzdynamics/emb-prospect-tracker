// ─────────────────────────────────────────────────────────────
//  meta-webhook — ManyChat → Supabase Edge Function
//
//  Receives webhook calls from ManyChat External Request actions.
//  Creates/updates meta_leads, inserts meta_messages, classifies
//  source_state + bucket (cold vs active), and sets needs_response.
//
//  Deploy:
//    supabase functions deploy meta-webhook --no-verify-jwt
//
//  Secrets (set in Supabase Dashboard → Project Settings → Edge Functions):
//    MANYCHAT_WEBHOOK_SECRET   Bearer token ManyChat must send
//    SUPABASE_URL              (auto-populated by Supabase)
//    SUPABASE_SERVICE_ROLE_KEY (auto-populated by Supabase)
// ─────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ─── Types ───────────────────────────────────────────────────
type Platform = "messenger" | "instagram";
type Direction = "inbound" | "outbound";
type SourceTag = "lead_form" | "ad" | "organic";
type Bucket = "cold" | "active";
type SourceState = "form_only" | "messenger_only" | "both" | "organic" | "ad";

interface WebhookPayload {
  event_type?: string;
  message_id: string;
  platform: Platform;
  direction: Direction;
  psid?: string;
  ig_thread_id?: string;
  ig_username?: string;         // IG @handle for Instagram events
  contact?: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    ig_username?: string;       // alternate location — prefer top-level
  };
  message?: {
    body?: string;
    sent_at?: string;
  };
  tags?: string;                // comma-separated: "source_lead_form,..."
  source?: SourceTag;           // explicit source hint from flow
  lead_form_id?: string;
  lead_form_responses?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────
// Strip unresolved ManyChat placeholders like "{{email}}" — if a subscriber
// field is empty on their side, the template leaks through as a literal string.
function isUnresolvedTemplate(s: string | null | undefined): boolean {
  if (!s) return false;
  return s.includes("{{") || s.includes("}}");
}

function cleanString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (isUnresolvedTemplate(raw)) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  if (isUnresolvedTemplate(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  // Strip leading 1 for US numbers
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits.slice(-10);
}

function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  if (isUnresolvedTemplate(raw)) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUsername(raw?: string | null): string | null {
  if (!raw) return null;
  // Strip leading @, whitespace, and lowercase for stable matching.
  // IG placeholders from ManyChat sometimes come through as "{{ig_username}}"
  // if the variable doesn't exist — filter those out too.
  const v = raw.trim().replace(/^@/, '').toLowerCase();
  if (!v || v.includes('{{') || v.includes('}}')) return null;
  return v;
}

// A "better" name is longer OR has more word-parts (first + last) than what we have.
function isBetterName(incoming: string | null, existing: string | null): boolean {
  if (!incoming) return false;
  if (!existing) return true;
  const incomingParts = incoming.trim().split(/\s+/).filter(Boolean).length;
  const existingParts = existing.trim().split(/\s+/).filter(Boolean).length;
  if (incomingParts > existingParts) return true;
  if (incoming.length > existing.length + 2) return true;
  return false;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseTags(tags?: string): Set<string> {
  if (!tags) return new Set();
  return new Set(tags.split(",").map(t => t.trim()).filter(Boolean));
}

async function getSetting(
  sb: SupabaseClient,
  key: string,
  fallback: string,
): Promise<string> {
  const { data } = await sb
    .from("admin_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? fallback;
}

function pickSourceState(
  tags: Set<string>,
  existing: SourceState | null,
  hasPsid: boolean,
): SourceState {
  // Lead form submission is the strongest signal about entry path — if an
  // existing record already has form data, any subsequent Messenger activity
  // upgrades it to "both" regardless of the new event's own tag.
  const existingHasForm = existing === "form_only" || existing === "both";

  if (tags.has("source_lead_form")) {
    if (existing === "messenger_only" || existing === "organic" || hasPsid) return "both";
    return "form_only";
  }
  if (tags.has("source_organic")) {
    if (existingHasForm) return "both";
    return "organic";
  }
  if (tags.has("source_ad")) {
    if (existingHasForm) return "both";
    return "ad";
  }
  // No explicit tag
  if (existingHasForm && hasPsid) return "both";
  return existing ?? (hasPsid ? "messenger_only" : "organic");
}

function classifyBucket(
  sourceState: SourceState,
  submissionAt: Date | null,
  messages: { direction: Direction; source_type: string; sent_at: string }[],
  initialWindowHours: number,
): Bucket {
  if (sourceState === "organic") return "active";
  if (!submissionAt) return "active";

  const windowEnd = new Date(submissionAt.getTime() + initialWindowHours * 3600 * 1000);

  // Any inbound arriving after a manual outbound → active
  let lastManualOutboundAt: Date | null = null;
  for (const msg of messages) {
    const at = new Date(msg.sent_at);
    if (msg.direction === "outbound" && msg.source_type === "manual") {
      lastManualOutboundAt = at;
    } else if (msg.direction === "inbound") {
      if (lastManualOutboundAt && at > lastManualOutboundAt) return "active";
      if (at > windowEnd) return "active";
    }
  }

  return "cold";
}

function classifyOutboundType(
  submissionAt: Date | null,
  sentAt: Date,
  autoWindowSeconds: number,
): "manual" | "automated" {
  if (!submissionAt) return "manual";
  const diffMs = sentAt.getTime() - submissionAt.getTime();
  return diffMs <= autoWindowSeconds * 1000 ? "automated" : "manual";
}

// ─── Main handler ────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Auth: Bearer token match against MANYCHAT_WEBHOOK_SECRET
  const expectedSecret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json({ error: "server_misconfigured" }, 500);
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (presented !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // platform + direction are mandatory. message_id we generate if missing
  // (ManyChat doesn't expose one). sent_at defaults to now() later.
  if (!payload.platform || !payload.direction) {
    return json({ error: "missing_required_fields" }, 400);
  }
  if (!payload.message_id || payload.message_id.includes("{{") || payload.message_id === "No field selected") {
    // Build a stable-ish ID from platform + psid + timestamp so dedup still works
    // for replays inside ~1 second
    const t = Math.floor(Date.now() / 1000);
    payload.message_id = `${payload.platform}_${payload.psid ?? "nopsid"}_${t}_${crypto.randomUUID().slice(0,8)}`;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Load tunable windows
  const autoWindowSec = parseInt(
    await getSetting(sb, "auto_response_window_seconds", "120"),
    10,
  );
  const initialWindowHr = parseInt(
    await getSetting(sb, "initial_submission_window_hours", "3"),
    10,
  );

  // Normalize contact fields (all sanitized against unresolved ManyChat templates)
  const phone = normalizePhone(payload.contact?.phone);
  const email = normalizeEmail(payload.contact?.email);
  const cleanFirst = cleanString(payload.contact?.first_name);
  const cleanLast  = cleanString(payload.contact?.last_name);
  const cleanFull  = cleanString(payload.contact?.full_name);
  const fullName = cleanFull
    || (cleanFirst || cleanLast ? [cleanFirst, cleanLast].filter(Boolean).join(" ") : null);
  const psid = cleanString(payload.psid);
  const igUsername = normalizeUsername(payload.ig_username || payload.contact?.ig_username);
  const messageBody = cleanString(payload.message?.body);
  const tags = parseTags(payload.tags);
  if (payload.source) tags.add(`source_${payload.source}`);

  // Dedup cascade: phone → email → PSID (platform-scoped) → ig_username
  let existing: any = null;
  if (phone) {
    const { data } = await sb
      .from("meta_leads")
      .select("*")
      .eq("phone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    existing = data;
  }
  if (!existing && email) {
    const { data } = await sb
      .from("meta_leads")
      .select("*")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    existing = data;
  }
  if (!existing && psid) {
    // Scope PSID lookup to the correct platform column
    const col = payload.platform === "instagram" ? "ig_user_id_bmb" : "meta_psid_bmb";
    const { data } = await sb
      .from("meta_leads")
      .select("*")
      .eq(col, psid)
      .is("deleted_at", null)
      .maybeSingle();
    existing = data;
  }
  if (!existing && igUsername) {
    const { data } = await sb
      .from("meta_leads")
      .select("*")
      .eq("ig_username", igUsername)
      .is("deleted_at", null)
      .maybeSingle();
    existing = data;
  }

  // Look for a matching contact so we can attach the message to their file
  // instead of creating a fresh meta_lead. Cascade:
  //   1. Messenger/IG stable ID (PSID or IG user ID)
  //   2. IG username
  //   3. Phone (normalized)
  //   4. Email (lowercased)
  // On match via phone/email/ig_username we ALSO backfill the contact's social
  // identifiers so future DMs auto-link via the cheaper PSID lookup.
  let promotedContactId: string | null = null;
  let contactBackfill: Record<string, unknown> | null = null;

  if (psid) {
    const col = payload.platform === "instagram" ? "ig_user_id_bmb" : "meta_psid_bmb";
    const { data: contactRow } = await sb
      .from("contacts")
      .select("id")
      .eq(col, psid)
      .maybeSingle();
    if (contactRow) promotedContactId = contactRow.id;
  }
  if (!promotedContactId && igUsername) {
    const { data: contactRow } = await sb
      .from("contacts")
      .select("id, meta_psid_bmb, ig_user_id_bmb")
      .eq("ig_username", igUsername)
      .maybeSingle();
    if (contactRow) {
      promotedContactId = contactRow.id;
      // Backfill PSID for future fast-path lookups
      const patch: Record<string, unknown> = {};
      if (psid && payload.platform === "messenger" && !contactRow.meta_psid_bmb) patch.meta_psid_bmb = psid;
      if (psid && payload.platform === "instagram" && !contactRow.ig_user_id_bmb) patch.ig_user_id_bmb = psid;
      if (Object.keys(patch).length > 0) contactBackfill = patch;
    }
  }
  if (!promotedContactId && phone) {
    const { data: contactRow } = await sb
      .from("contacts")
      .select("id, meta_psid_bmb, ig_user_id_bmb, ig_username")
      .eq("phone", phone)
      .maybeSingle();
    if (contactRow) {
      promotedContactId = contactRow.id;
      const patch: Record<string, unknown> = { meta_lead_id: null };
      if (psid && payload.platform === "messenger" && !contactRow.meta_psid_bmb) patch.meta_psid_bmb = psid;
      if (psid && payload.platform === "instagram" && !contactRow.ig_user_id_bmb) patch.ig_user_id_bmb = psid;
      if (igUsername && !contactRow.ig_username) patch.ig_username = igUsername;
      delete patch.meta_lead_id;
      if (Object.keys(patch).length > 0) contactBackfill = patch;
    }
  }
  if (!promotedContactId && email) {
    const { data: contactRow } = await sb
      .from("contacts")
      .select("id, meta_psid_bmb, ig_user_id_bmb, ig_username")
      .eq("email", email)
      .maybeSingle();
    if (contactRow) {
      promotedContactId = contactRow.id;
      const patch: Record<string, unknown> = {};
      if (psid && payload.platform === "messenger" && !contactRow.meta_psid_bmb) patch.meta_psid_bmb = psid;
      if (psid && payload.platform === "instagram" && !contactRow.ig_user_id_bmb) patch.ig_user_id_bmb = psid;
      if (igUsername && !contactRow.ig_username) patch.ig_username = igUsername;
      if (Object.keys(patch).length > 0) contactBackfill = patch;
    }
  }

  // Apply contact backfill before logging the message
  if (promotedContactId && contactBackfill) {
    await sb.from("contacts").update(contactBackfill).eq("id", promotedContactId);
  }

  const nowIso = new Date().toISOString();
  // Guard against unresolved ManyChat placeholders and other garbage in sent_at
  const rawSentAt = payload.message?.sent_at;
  let sentAtIso = nowIso;
  if (rawSentAt && !rawSentAt.includes("{{") && !rawSentAt.includes("}}")) {
    const parsed = new Date(rawSentAt);
    if (!isNaN(parsed.getTime())) sentAtIso = parsed.toISOString();
  }
  const sentAt = new Date(sentAtIso);

  // ─── Promoted contact path: log message, skip meta_leads ───
  if (promotedContactId) {
    const isOutbound = payload.direction === "outbound";
    await sb.from("meta_messages").upsert({
      id: payload.message_id,
      meta_lead_id: null,
      contact_id: promotedContactId,
      platform: payload.platform,
      psid,
      ig_thread_id: payload.ig_thread_id ?? null,
      direction: payload.direction,
      source_type: isOutbound ? "manual" : "inbound",
      body: messageBody,
      contact_name: fullName,
      sent_at: sentAtIso,
    }, { onConflict: "id" });

    if (!isOutbound) {
      await sb.from("contacts")
        .update({ needs_response: true })
        .eq("id", promotedContactId);
    }

    return json({ status: "ok", action: "logged_to_contact", contact_id: promotedContactId });
  }

  // ─── meta_leads path ──────────────────────────────────────
  const isOutbound = payload.direction === "outbound";
  const hasPsid = !!(psid || existing?.meta_psid_bmb);
  const newSourceState = pickSourceState(tags, existing?.source_state ?? null, hasPsid);

  // submission_at: first time we see a source_lead_form event is the submission time
  const isFormEvent = tags.has("source_lead_form");
  const submissionAtIso = existing?.submission_at
    ?? (isFormEvent ? sentAtIso : null);

  const sourceType = isOutbound
    ? classifyOutboundType(
        submissionAtIso ? new Date(submissionAtIso) : null,
        sentAt,
        autoWindowSec,
      )
    : "inbound";

  let metaLeadId: string;

  if (existing) {
    metaLeadId = existing.id;
  } else {
    // Insert new meta_leads row. Default column placement is cold_1 or active_1;
    // client redistributes across columns by last_activity_at DESC.
    const initialBucket: Bucket = newSourceState === "organic" ? "active" : "cold";
    // Fallback display name: use @ig_username when nothing else is known,
    // so the card doesn't show "Unknown" for IG leads.
    const displayName = fullName || (igUsername ? `@${igUsername}` : null);
    const { data: inserted, error: insertErr } = await sb
      .from("meta_leads")
      .insert({
        phone,
        email,
        full_name: displayName,
        ig_username: igUsername,
        meta_psid_bmb: payload.platform === "messenger" ? psid : null,
        ig_user_id_bmb: payload.platform === "instagram" ? psid : null,
        ig_thread_id: payload.ig_thread_id ?? null,
        platform: payload.platform,
        source_state: newSourceState,
        lead_form_id: payload.lead_form_id ?? null,
        lead_form_responses: payload.lead_form_responses ?? null,
        column_id: initialBucket === "active" ? "col_active_1" : "col_cold_1",
        bucket: initialBucket,
        needs_response: !isOutbound,
        submission_at: submissionAtIso,
        last_activity_at: sentAtIso,
        last_inbound_at: isOutbound ? null : sentAtIso,
        last_outbound_at: isOutbound ? sentAtIso : null,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.error("meta_leads insert failed", insertErr);
      return json({ error: "insert_failed", detail: insertErr?.message }, 500);
    }
    metaLeadId = inserted.id;
  }

  // Upsert the message (dedup by ManyChat message_id)
  await sb.from("meta_messages").upsert({
    id: payload.message_id,
    meta_lead_id: metaLeadId,
    contact_id: null,
    platform: payload.platform,
    psid,
    ig_thread_id: payload.ig_thread_id ?? null,
    direction: payload.direction,
    source_type: sourceType,
    body: messageBody,
    contact_name: fullName,
    sent_at: sentAtIso,
  }, { onConflict: "id" });

  // Recompute bucket from full message history
  const { data: allMsgs } = await sb
    .from("meta_messages")
    .select("direction, source_type, sent_at")
    .eq("meta_lead_id", metaLeadId)
    .order("sent_at", { ascending: true });

  const newBucket = classifyBucket(
    newSourceState,
    submissionAtIso ? new Date(submissionAtIso) : null,
    (allMsgs ?? []) as any,
    initialWindowHr,
  );

  // Update meta_leads with merged state
  const updatePatch: Record<string, unknown> = {
    last_activity_at: sentAtIso,
    source_state: newSourceState,
    bucket: newBucket,
    column_id: newBucket === "active" ? "col_active_1" : "col_cold_1",
    updated_at: nowIso,
    version: (existing?.version ?? 1) + 1,
  };
  if (!existing?.submission_at && submissionAtIso) {
    updatePatch.submission_at = submissionAtIso;
  }
  if (existing && !existing.meta_psid_bmb && psid && payload.platform === "messenger") {
    updatePatch.meta_psid_bmb = psid;
  }
  if (existing && !existing.ig_user_id_bmb && psid && payload.platform === "instagram") {
    updatePatch.ig_user_id_bmb = psid;
  }
  if (!existing?.phone && phone) updatePatch.phone = phone;
  if (!existing?.email && email) updatePatch.email = email;
  if (!existing?.ig_username && igUsername) updatePatch.ig_username = igUsername;

  // Name override: upgrade full_name when a better value arrives.
  // Treat "@handle" as a placeholder — any real name is better than it.
  const currentIsHandlePlaceholder = existing?.full_name && existing.full_name.startsWith('@');
  if (fullName && (currentIsHandlePlaceholder || isBetterName(fullName, existing?.full_name || null))) {
    updatePatch.full_name = fullName;
  } else if (!existing?.full_name && igUsername) {
    updatePatch.full_name = `@${igUsername}`;
  }

  if (payload.lead_form_responses && !existing?.lead_form_responses) {
    updatePatch.lead_form_responses = payload.lead_form_responses;
  }
  if (payload.lead_form_id && !existing?.lead_form_id) {
    updatePatch.lead_form_id = payload.lead_form_id;
  }
  if (isOutbound) {
    updatePatch.last_outbound_at = sentAtIso;
    updatePatch.needs_response = false;
  } else {
    updatePatch.last_inbound_at = sentAtIso;
    updatePatch.needs_response = true;
  }

  const { error: updateErr } = await sb
    .from("meta_leads")
    .update(updatePatch)
    .eq("id", metaLeadId);

  if (updateErr) {
    console.error("meta_leads update failed", updateErr);
    return json({ error: "update_failed", detail: updateErr.message }, 500);
  }

  return json({
    status: "ok",
    meta_lead_id: metaLeadId,
    action: existing ? "updated" : "created",
    bucket: newBucket,
    source_state: newSourceState,
  });
});
