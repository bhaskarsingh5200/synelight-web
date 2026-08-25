/* SYNELIGHT — server-side validation & sanitization (zero-dependency)
   The client validates for UX; this module is the source of truth.
   Never trust client-side validation alone. */
"use strict";
const env = require("./env");


const SERVICE_OPTIONS = [
  "Website Development",
  "Landing Page",
  "AI Automation",
  "AI Lead Generation",
  "AI Calling Agent",
  "Social Media Management",
  "Complete Growth System",
  "Other"
];

const TIMELINE_OPTIONS = ["ASAP", "1–2 Months", "3+ Months", "Exploring"];

const BUSINESS_TYPE_OPTIONS = [
  "Local Business", "Services", "E-commerce / Retail", "Startup", "Enterprise", "Other"
];

const SOURCE_OPTIONS = ["website", "instagram", "linkedin", "google", "referral", "direct", "other"];

const STATUSES = [
  "NEW", "CONTACTED", "QUALIFIED", "CALL_BOOKED",
  "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* International-friendly phone: optional +, digits, spaces, () and dashes */
const PHONE_RE = /^\+?[0-9\s().-]{7,20}$/;

function sanitizeText(value, maxLen) {
  if (typeof value !== "string") return "";
  let v = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  v = v.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n");
  return v.trim().slice(0, maxLen);
}

function oneLine(value, maxLen) {
  return sanitizeText(String(value || "").replace(/[\n\r\t]+/g, " "), maxLen);
}

function isValidEmail(v) { return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v); }
function isValidPhone(v) { return typeof v === "string" && PHONE_RE.test(v); }

function isPlainUrl(v) {
  if (!v) return true;
  if (v.length > 300) return false;
  return /^https?:\/\/[^\s"<>&]+$/i.test(v);
}

/* Validates + sanitizes a lead payload.
   Returns { ok, errors, values } — errors keyed by client field name. */
function validateLeadPayload(body) {
  const errors = {};
  const b = body && typeof body === "object" ? body : {};
  const values = {};

  values.honeypot = oneLine(b.company_url, 100);

  const fullName = oneLine(b.fullName, 120);
  if (fullName.length < 2) errors.fullName = "Please enter your full name.";
  else values.full_name = fullName;

  const email = oneLine(b.email, 254).toLowerCase();
  if (!email) errors.email = "Please enter your email address.";
  else if (!isValidEmail(email)) errors.email = "Please enter a valid email address.";
  else values.email = email;

  const whatsapp = oneLine(b.whatsapp, 24);
  if (whatsapp && !isValidPhone(whatsapp)) errors.whatsapp = "Please enter a valid phone number.";
  else values.whatsapp = whatsapp;

  const website = oneLine(b.website, 300);
  if (!isPlainUrl(website)) errors.website = "Please enter a valid URL (starting with https://).";
  else values.website = website;

  const businessName = oneLine(b.businessName, 120);
  values.business_name = businessName;

  const businessType = oneLine(b.businessType, 60);
  if (!businessType) errors.businessType = "Please select your business type.";
  else if (BUSINESS_TYPE_OPTIONS.indexOf(businessType) === -1) errors.businessType = "Invalid business type.";
  else values.business_type = businessType;

  const service = oneLine(b.serviceNeeded, 60);
  if (!service) errors.serviceNeeded = "Please select a service.";
  else if (SERVICE_OPTIONS.indexOf(service) === -1) errors.serviceNeeded = "Invalid service.";
  else values.service = service;

  const timeline = oneLine(b.timeline, 30);
  if (timeline && TIMELINE_OPTIONS.indexOf(timeline) === -1) errors.timeline = "Invalid timeline.";
  else values.timeline = timeline;

  const budget = oneLine(b.budget, 40);
  values.budget = budget;

  const description = sanitizeText(b.description, 5000);
  if (description.length < 20) errors.description = "Please describe your project in at least 20 characters.";
  else values.description = description;

  const utmSource = oneLine(b.utm_source, 120).toLowerCase();
  const utmMedium = oneLine(b.utm_medium, 120).toLowerCase();
  const utmCampaign = oneLine(b.utm_campaign, 120);
  values.utm_source = utmSource;
  values.utm_medium = utmMedium;
  values.utm_campaign = utmCampaign;

  let source = oneLine(b.source, 30).toLowerCase();
  if (!source) source = "website";
  if (SOURCE_OPTIONS.indexOf(source) === -1) source = "other";
  values.source = source;

  values.referer = oneLine(b.referer, 300);

  return { ok: Object.keys(errors).length === 0, errors, values };
}

function validStatus(s) { return STATUSES.indexOf(String(s || "")) !== -1; }

/* ---- Cloudflare Turnstile (optional; enabled via TURNSTILE_SECRET_KEY) ---- */
async function verifyTurnstile(token, ip) {
  const secret = env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true; /* not configured -> skip */
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: secret, response: String(token).slice(0, 2048) });
    if (ip) body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    /* Fail closed on network error only when Turnstile is mandatory */
    return false;
  }
}

module.exports = {
  SERVICE_OPTIONS, TIMELINE_OPTIONS, BUSINESS_TYPE_OPTIONS,
  SOURCE_OPTIONS, STATUSES,
  sanitizeText, oneLine, isValidEmail, isValidPhone,
  validateLeadPayload, validStatus, verifyTurnstile
};
