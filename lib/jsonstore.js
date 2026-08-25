/* SYNELIGHT — local JSON lead store (fallback engine)
   Used when Supabase is not configured. Atomic-ish writes on Windows. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "leads.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");
}

function readAll() {
  ensure();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch {
    try { fs.copyFileSync(DB_FILE, DB_FILE + ".corrupt-" + Date.now()); } catch {}
    return [];
  }
}

function writeAll(leads) {
  ensure();
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(leads, null, 2), "utf8");
  try {
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    /* Windows can briefly lock the destination file; fall back to copy */
    fs.copyFileSync(tmp, DB_FILE);
    try { fs.unlinkSync(tmp); } catch {}
    if (!/EBUSY|EPERM|EACCES/.test(String(err.code))) throw err;
  }
}

function rowFrom(fields) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    full_name: fields.full_name,
    business_name: fields.business_name || "",
    email: String(fields.email).toLowerCase(),
    whatsapp: fields.whatsapp || "",
    website: fields.website || "",
    business_type: fields.business_type,
    service: fields.service,
    timeline: fields.timeline || "",
    budget: fields.budget || "",
    description: fields.description,
    source: fields.source || "website",
    utm_source: fields.utm_source || "",
    utm_medium: fields.utm_medium || "",
    utm_campaign: fields.utm_campaign || "",
    referer: fields.referer || "",
    assigned_to: "",
    status: "NEW",
    notes: ""
  };
}

module.exports = { readAll, writeAll, rowFrom };
