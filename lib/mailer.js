/* SYNELIGHT — transactional email (zero-dependency)
   Transport order:
     1. Resend API        (RESEND_API_KEY + MAIL_FROM)
     2. Generic webhook   (MAIL_WEBHOOK_URL — e.g. Make / Zapier / n8n)
     3. Raw SMTP          (SMTP_HOST/USER/PASS/FROM)
   If none configured, emails are skipped and the result is logged —
   lead storage NEVER depends on email delivery. */
"use strict";
const env = require("./env");
const logger = require("./logger");

function fromAddress() {
  return env.get("MAIL_FROM", "SYNELIGHT <synelight@gmail.com>");
}

/* ---------------- Transports ---------------- */

async function sendViaResend(to, subject, text) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.get("RESEND_API_KEY"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, text })
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch {}
    throw new Error("resend_" + res.status + (detail ? " " + detail.replace(/\s+/g, " ") : ""));
  }
  return "resend";
}

async function sendViaWebhook(payload) {
  const res = await fetch(env.get("MAIL_WEBHOOK_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("webhook_" + res.status);
  return "webhook";
}

async function sendViaSmtp(to, subject, text) {
  const smtp = require("./smtp");
  await smtp.send({
    host: env.get("SMTP_HOST"),
    port: env.int("SMTP_PORT", 465),
    user: env.get("SMTP_USER"),
    pass: env.get("SMTP_PASS"),
    from: env.get("SMTP_FROM") || fromAddress(),
    to, subject, text
  });
  return "smtp";
}

/* ---------------- Dispatch ---------------- */

function activeTransport() {
  if (env.get("RESEND_API_KEY")) return "resend";
  if (env.get("MAIL_WEBHOOK_URL")) return "webhook";
  if (env.get("SMTP_HOST")) return "smtp";
  return "none";
}

async function sendMail(to, subject, text, tag) {
  const transport = activeTransport();
  if (transport === "none") {
    logger.log("warn", "email_skipped_no_transport", { tag });
    return { ok: false, skipped: true };
  }
  try {
    let via;
    if (transport === "resend") via = await sendViaResend(to, subject, text);
    else if (transport === "webhook") {
      await sendViaWebhook({ type: "email", tag, to, subject, text, from: fromAddress() });
      via = "webhook";
    }
    else via = await sendViaSmtp(to, subject, text);
    logger.log("info", "email_sent", { tag, via });
    return { ok: true, via };
  } catch (err) {
    logger.log("error", "email_failed", { tag, reason: String(err.message).slice(0, 200) });
    return { ok: false, error: err.message };
  }
}

/* ---------------- Templates ---------------- */

function siteUrl() {
  return (env.get("SITE_URL", "https://synelight.com") || "https://synelight.com").replace(/\/+$/, "");
}

function adminUrl() {
  return env.get("ADMIN_URL", siteUrl() + "/admin/leads/");
}

function fmt(lead) {
  const when = new Date(lead.created_at || Date.now());
  return {
    name: lead.full_name,
    business: lead.business_name || "—",
    email: lead.email,
    whatsapp: lead.whatsapp || "—",
    website: lead.website || "—",
    type: lead.business_type,
    service: lead.service,
    timeline: lead.timeline || "—",
    budget: lead.budget || "—",
    description: lead.description,
    source: lead.source +
      ((lead.utm_source || lead.utm_medium || lead.utm_campaign)
        ? " (utm: " + [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ") + ")"
        : ""),
    submitted: when.toUTCString(),
    id: lead.id
  };
}

/* Internal notification — subject/body per SYNELIGHT spec */
async function notifyInternalLead(lead) {
  const f = fmt(lead);
  const subject = "NEW SYNELIGHT PROJECT ENQUIRY";
  const text = [
    "NEW PROJECT ENQUIRY",
    "",
    "Name:",
    f.name,
    "",
    "Business:",
    f.business,
    "",
    "Email:",
    f.email,
    "",
    "WhatsApp:",
    f.whatsapp,
    "",
    "Website:",
    f.website,
    "",
    "Business Type:",
    f.type,
    "",
    "Service:",
    f.service,
    "",
    "Timeline:",
    f.timeline,
    "",
    "Budget:",
    f.budget,
    "",
    "Description:",
    f.description,
    "",
    "Source:",
    f.source,
    "",
    "Submitted:",
    f.submitted,
    "",
    "Lead ID:",
    f.id,
    "",
    "VIEW LEAD -> " + adminUrl()
  ].join("\n");
  const to =
    env.get("LEAD_NOTIFICATION_EMAIL") ||
    (env.get("MAIL_FROM").match(/<(.+)>/) || [])[1] ||
    "synelight@gmail.com";
  return sendMail(to, subject, text, "internal_lead_notification");
}

/* Client confirmation — no response-time promises unless a real SLA exists */
async function confirmClientLead(lead) {
  const first = String(lead.full_name || "").trim().split(/\s+/)[0] || "there";
  const subject = "We've received your project enquiry — SYNELIGHT";
  const text = [
    "Hi " + first + ",",
    "",
    "Thanks for reaching out to SYNELIGHT.",
    "",
    "We've received your project details and will review them carefully.",
    "",
    "We'll get back to you with the next steps.",
    "",
    "SYNELIGHT",
    "AI • AUTOMATION • DIGITAL GROWTH"
  ].join("\n");
  return sendMail(lead.email, subject, text, "client_confirmation");
}

module.exports = { activeTransport, sendMail, notifyInternalLead, confirmClientLead };
