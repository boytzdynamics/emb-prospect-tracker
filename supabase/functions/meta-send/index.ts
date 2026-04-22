// ─────────────────────────────────────────────────────────────
//  meta-send — Tracker → ManyChat Send API
//
//  Called by the Electron app when a user sends a Messenger
//  message from the card compose box. Enforces the 24h / 7d
//  window, calls ManyChat Send API, and writes the outbound row.
//
//  Deploy:
//    supabase functions deploy meta-send --no-verify-jwt
//
//  Secrets:
//    MANYCHAT_API_KEY          ManyChat Settings → API
//    SUPABASE_URL              (auto-populated)
//    SUPABASE_SERVICE_ROLE_KEY (auto-populated)
//
//  Request body:
//    {
//      meta_lead_id?: string,    // either meta_lead_id OR contact_id required
//      contact_id?: string,      // for post-promotion sends
//      body: string,
//      user_name?: string        // LO who sent the message (for audit)
//    }
//
//  Note: ManyChat's Send API requires the ManyChat subscriber_id, not the
//  raw FB PSID. This function looks up the subscriber_id via
//  `/fb/subscriber/findByCustomField` using PSID, or falls back to
//  `findBySystemField` with `last_input_text` matching. For simplicity,
//  v1 uses `/fb/subscriber/findByName` against full_name stored on the
//  meta_lead; production use should switch to a deterministic lookup
//  (store ManyChat subscriber_id on meta_leads when the first webhook
//  arrives — TODO add to meta-webhook payload).
// ─────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

type WindowState = "free" | "human_only" | "closed";

interface SendRequest {
  meta_lead_id?: string;
  contact_id?: string;
  body: string;
  user_name?: string;
  manychat_subscriber_id?: string;  // if caller knows it, pass it
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function windowState(lastInboundAt: Date | null): WindowState {
  if (!lastInboundAt) return "closed";
  const hrs = (Date.now() - lastInboundAt.getTime()) / 3600000;
  if (hrs < 24) return "free";
  if (hrs < 168) return "human_only";
  return "closed";
}

async function manychatSendText(
  apiKey: string,
  subscriberId: string,
  body: string,
  messageTag: string | null,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const payload: Record<string, unknown> = {
    subscriber_id: subscriberId,
    data: {
      version: "v2",
      content: {
        messages: [{ type: "text", text: body }],
      },
    },
    message_tag: messageTag ?? undefined,
  };

  const res = await fetch("https://api.manychat.com/fb/sending/sendContent", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, detail: text };
}

async function findSubscriberIdByPsid(
  apiKey: string,
  psid: string,
): Promise<string | null> {
  // ManyChat lookup: /fb/subscriber/findByCustomField?field_id=X&field_value=PSID
  // Easier path: /fb/subscriber/getInfo?subscriber_id=PSID works if ManyChat
  // has synced the subscriber. In v1 we try that path.
  const res = await fetch(
    `https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(psid)}`,
    { headers: { "Authorization": `Bearer ${apiKey}` } },
  );
  if (!res.ok) return null;
  try {
    const data = await res.json();
    return data?.data?.id ?? psid;
  } catch {
    return psid;
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: SendRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!payload.body?.trim()) {
    return json({ error: "empty_body" }, 400);
  }
  if (!payload.meta_lead_id && !payload.contact_id) {
    return json({ error: "missing_target" }, 400);
  }

  const apiKey = Deno.env.get("MANYCHAT_API_KEY");
  if (!apiKey) return json({ error: "server_misconfigured" }, 500);

  const sb: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let psid: string | null = null;
  let platform: string = "messenger";
  let metaLeadId: string | null = null;
  let contactId: string | null = null;
  let lastInbound: Date | null = null;

  if (payload.meta_lead_id) {
    const { data } = await sb
      .from("meta_leads")
      .select("id, meta_psid_bmb, ig_user_id_bmb, platform, last_inbound_at")
      .eq("id", payload.meta_lead_id)
      .maybeSingle();
    if (!data) return json({ error: "meta_lead_not_found" }, 404);
    metaLeadId = data.id;
    psid = data.meta_psid_bmb ?? data.ig_user_id_bmb ?? null;
    platform = data.platform;
    lastInbound = data.last_inbound_at ? new Date(data.last_inbound_at) : null;
  } else if (payload.contact_id) {
    const { data } = await sb
      .from("contacts")
      .select("id, meta_psid_bmb, ig_user_id_bmb")
      .eq("id", payload.contact_id)
      .maybeSingle();
    if (!data) return json({ error: "contact_not_found" }, 404);
    contactId = data.id;
    psid = data.meta_psid_bmb ?? data.ig_user_id_bmb ?? null;
    // For promoted contacts, recompute last_inbound from meta_messages
    const { data: lastMsg } = await sb
      .from("meta_messages")
      .select("sent_at")
      .eq("contact_id", contactId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastInbound = lastMsg?.sent_at ? new Date(lastMsg.sent_at) : null;
  }

  if (!psid) return json({ error: "no_psid_on_record" }, 400);
  if (platform === "instagram") {
    return json({ error: "instagram_send_not_supported_v1" }, 501);
  }

  // Window check
  const state = windowState(lastInbound);
  if (state === "closed") {
    return json({ error: "window_closed", window_state: state }, 409);
  }
  const messageTag = state === "human_only" ? "HUMAN_AGENT" : null;

  // Resolve ManyChat subscriber_id
  const subscriberId = payload.manychat_subscriber_id
    ?? await findSubscriberIdByPsid(apiKey, psid);
  if (!subscriberId) {
    return json({ error: "subscriber_not_found" }, 404);
  }

  // Send
  const result = await manychatSendText(apiKey, subscriberId, payload.body, messageTag);
  if (!result.ok) {
    return json({
      error: "manychat_send_failed",
      status: result.status,
      detail: result.detail,
    }, 502);
  }

  // Log outbound locally. ManyChat doesn't return a stable message ID for
  // Send API calls, so we generate one.
  const sentAtIso = new Date().toISOString();
  const localMessageId = `local_${crypto.randomUUID()}`;

  await sb.from("meta_messages").insert({
    id: localMessageId,
    meta_lead_id: metaLeadId,
    contact_id: contactId,
    platform,
    psid,
    ig_thread_id: null,
    direction: "outbound",
    source_type: "manual",
    body: payload.body,
    contact_name: payload.user_name ?? null,
    sent_at: sentAtIso,
  });

  // Clear needs_response, update last_outbound_at
  if (metaLeadId) {
    await sb.from("meta_leads")
      .update({
        last_outbound_at: sentAtIso,
        last_activity_at: sentAtIso,
        needs_response: false,
      })
      .eq("id", metaLeadId);
  } else if (contactId) {
    await sb.from("contacts")
      .update({ needs_response: false })
      .eq("id", contactId);
  }

  return json({
    status: "ok",
    message_id: localMessageId,
    window_state: state,
    sent_at: sentAtIso,
  });
});
