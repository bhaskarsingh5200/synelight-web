/* SYNELIGHT — WhatsApp Cloud API notifications (zero-dependency)
   Sends lead notifications via Meta's WhatsApp Cloud API when configured:
     WHATSAPP_TOKEN        permanent access token (system user token ideally)
     WHATSAPP_PHONE_ID     the business phone number ID (owned by the WABA)
     WHATSAPP_TO           recipient in E.164 digits, e.g. 918409405200
   If unconfigured, notifications are skipped and logged —
   lead storage NEVER depends on this. */
"use strict";
const env = require("./env");
const logger = require("./logger");

const GRAPH = "https://graph.facebook.com/v20.0";

function configured() {
  return Boolean(env.get("WHATSAPP_TOKEN") && env.get("WHATSAPP_PHONE_ID"));
}

function recipient() {
  return env.get("WHATSAPP_TO", "918409405200").replace(/[^0-9]/g, "");
}

async function sendText(message) {
  if (!configured()) {
    logger.log("warn", "whatsapp_skipped_no_config", {});
    return { ok: false, skipped: true };
  }
  const to = recipient();
  if (!to) return { ok: false, skipped: true };

  let res;
  try {
    res = await fetch(
      GRAPH + "/" + encodeURIComponent(env.get("WHATSAPP_PHONE_ID")) + "/messages",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.get("WHATSAPP_TOKEN"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: String(message).slice(0, 4096) }
        })
      }
    );
  } catch (err) {
    logger.log("error", "whatsapp_failed", { reason: String(err.message).slice(0, 160) });
    return { ok: false, error: err.message };
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 220); } catch {}
    logger.log("error", "whatsapp_failed", {
      status: res.status,
      reason: detail.replace(/\s+/g, " ").slice(0, 220)
    });
    return { ok: false, error: "whatsapp_" + res.status };
  }
  logger.log("info", "whatsapp_sent", { to });
  return { ok: true, via: "whatsapp_cloud_api" };
}

/* Compact internal lead alert — one readable WhatsApp message */
async function notifyInternalLead(lead) {
  const admin = env.get("ADMIN_URL", (env.get("SITE_URL") || "https://synelight.com").replace(/\/+$/, "") + "/admin/leads/");
  const lines = [
    "NEW SYNELIGHT ENQUIRY",
    "",
    "Name: " + (lead.full_name || ""),
    "Business: " + (lead.business_name || "—"),
    "Email: " + (lead.email || "—"),
    "WhatsApp: " + (lead.whatsapp || "—"),
    "Website: " + (lead.website || "—"),
    "Type: " + (lead.business_type || ""),
    "Service: " + (lead.service || ""),
    "Timeline: " + (lead.timeline || "—"),
    "Budget: " + (lead.budget || "—"),
    "",
    (lead.description || "").slice(0, 400),
    "",
    "Lead: " + admin
  ];
  return sendText(lines.join("\n"));
}

module.exports = { configured, sendText, notifyInternalLead };