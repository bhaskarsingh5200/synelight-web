/* SYNELIGHT — lead store facade (zero-dependency)
   Primary engine: Supabase REST. Fallback: local JSON file.
   Same async API regardless of which engine is active. */
"use strict";
const supabase = require("./supabase");
const jsonstore = require("./jsonstore");
const logger = require("./logger");

function activeEngine() {
  return supabase.isConfigured() ? "supabase" : "json";
}

/* Returns { lead, duplicate } — duplicate=true means a recent enquiry with
   the same email already exists and no new row was created. */
async function createLead(fields, duplicateWindowSec) {
  const windowSec = duplicateWindowSec || 120;

  if (supabase.isConfigured()) {
    const recent = await supabase.findRecentByEmail(fields.email, windowSec);
    if (recent) {
      const existing = await supabase.getById(recent.id);
      if (existing) return { lead: existing, duplicate: true };
    }
    const row = jsonstore.rowFrom(fields);
    const inserted = await supabase.insert(row);
    if (!inserted) throw new Error("insert_failed");
    return { lead: inserted, duplicate: false };
  }

  /* JSON fallback */
  const since = Date.now() - windowSec * 1000;
  const recent = jsonstore.readAll().find((l) =>
    l.email === String(fields.email).toLowerCase() &&
    new Date(l.created_at).getTime() >= since
  );
  if (recent) return { lead: recent, duplicate: true };
  const leads = jsonstore.readAll();
  const lead = jsonstore.rowFrom(fields);
  leads.push(lead);
  jsonstore.writeAll(leads);
  return { lead, duplicate: false };
}

async function getLead(id) {
  if (supabase.isConfigured()) return supabase.getById(id);
  return jsonstore.readAll().find((l) => l.id === id) || null;
}

async function listLeads(filter) {
  if (supabase.isConfigured()) {
    let rows = await supabase.list({ status: filter && filter.status, sort: filter && filter.sort });
    /* Search + remaining filters applied in-process (dataset is small;
       move to PostgREST operators if volume grows) */
    const q = filter && filter.q ? String(filter.q).toLowerCase() : "";
    if (filter && filter.service) rows = rows.filter((r) => r.service === filter.service);
    if (filter && filter.source) rows = rows.filter((r) => r.source === filter.source);
    if (q) {
      rows = rows.filter((r) =>
        [r.full_name, r.email, r.business_name]
          .some((v) => v && String(v).toLowerCase().indexOf(q) !== -1)
      );
    }
    return rows;
  }
  let rows = jsonstore.readAll();
  if (filter && filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter && filter.service) rows = rows.filter((r) => r.service === filter.service);
  if (filter && filter.source) rows = rows.filter((r) => r.source === filter.source);
  const q = filter && filter.q ? String(filter.q).toLowerCase() : "";
  if (q) {
    rows = rows.filter((r) =>
      [r.full_name, r.email, r.business_name]
        .some((v) => v && String(v).toLowerCase().indexOf(q) !== -1)
    );
  }
  rows.sort((a, b) => (filter && filter.sort === "oldest"
    ? (a.created_at > b.created_at ? 1 : -1)
    : (a.created_at < b.created_at ? 1 : -1)));
  return rows;
}

async function updateLead(id, patch) {
  if (patch.status && patch.notes !== undefined) {
    logger.log("info", "lead_update", { id, fields: ["status", "notes"] });
  } else if (patch.status) {
    logger.log("info", "lead_status_change", { id, to: patch.status });
  }
  if (supabase.isConfigured()) return supabase.update(id, patch);
  const leads = jsonstore.readAll();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  const lead = leads[idx];
  if (patch.status) lead.status = patch.status;
  if (typeof patch.notes === "string") lead.notes = patch.notes.slice(0, 5000);
  lead.updated_at = new Date().toISOString();
  leads[idx] = lead;
  jsonstore.writeAll(leads);
  return lead;
}

async function statsByStatus() {
  const out = {};
  if (supabase.isConfigured()) {
    try { return await supabase.statsByStatus(); } catch (err) { logger.log("warn", "stats_failed", { reason: err.message }); }
  }
  jsonstore.readAll().forEach((l) => { out[l.status] = (out[l.status] || 0) + 1; });
  return out;
}

module.exports = { createLead, getLead, listLeads, updateLead, statsByStatus, activeEngine };
