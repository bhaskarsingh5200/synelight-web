/* SYNELIGHT — Supabase REST client (zero-dependency)
   Talks directly to PostgREST using the service-role key.
   Server-side ONLY — the key must never reach the browser. */
"use strict";
const env = require("./env");
const blogstore = require("./blogstore");

const SB_URL = () => env.get("SUPABASE_URL").replace(/\/+$/, "");
const SB_KEY = () => env.get("SUPABASE_SERVICE_ROLE_KEY");

function isConfigured() {
  return /^https:\/\/.+/.test(SB_URL()) && SB_KEY().length > 20;
}

async function rest(method, table, search, body, prefer) {
  const headers = {
    "apikey": SB_KEY(),
    "Authorization": "Bearer " + SB_KEY(),
    "Accept": "application/json"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers["Prefer"] = prefer;
  const res = await fetch(SB_URL() + "/rest/v1/" + table + (search || ""), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch {}
    const err = new Error("supabase_" + res.status + (detail ? " " + detail.replace(/\s+/g, " ") : ""));
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function findRecentByEmail(email, windowSec) {
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const rows = await rest(
    "GET", "leads",
    "?select=id,created_at&email=eq." + encodeURIComponent(String(email).toLowerCase()) +
    "&created_at=gte." + encodeURIComponent(since) +
    "&order=created_at.desc&limit=1"
  );
  return rows && rows[0] ? rows[0] : null;
}

async function insert(row) {
  const rows = await rest("POST", "leads", "", row, "return=representation");
  return rows && rows[0] ? rows[0] : null;
}

async function getById(id) {
  /* id is validated as a UUID by the caller before interpolation */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const rows = await rest("GET", "leads", "?select=*&id=eq." + id + "&limit=1");
  return rows && rows[0] ? rows[0] : null;
}

async function list(filter) {
  const parts = ["select=*", "order=created_at." + ((filter && filter.sort === "oldest") ? "asc" : "desc")];
  if (filter && filter.status) parts.push("status=eq." + encodeURIComponent(filter.status));
  if (filter && filter.service) parts.push("service=eq." + encodeURIComponent(filter.service));
  if (filter && filter.source) parts.push("source=eq." + encodeURIComponent(filter.source));
  const rows = await rest("GET", "leads", "?" + parts.join("&"));
  return rows || [];
}

async function update(id, patch) {
  const clean = {};
  if (patch.status) clean.status = patch.status;
  if (typeof patch.notes === "string") clean.notes = patch.notes.slice(0, 5000);
  if (!Object.keys(clean).length) return getById(id);
  clean.updated_at = new Date().toISOString();
  await rest("PATCH", "leads", "?id=eq." + id, clean);
  return getById(id);
}

async function remove(id) {
  const existing = await getById(id);
  if (!existing) return false;
  await rest("DELETE", "leads", "?id=eq." + id);
  return true;
}

/* PostgREST can aggregate with a computed header, but a simple grouped
   fetch of one column keeps this dependency-free and easy to audit. */
async function statsByStatus() {
  const rows = await rest("GET", "leads", "?select=status&limit=10000");
  const out = {};
  (rows || []).forEach((r) => { out[r.status] = (out[r.status] || 0) + 1; });
  return out;
}

/* ---------------- Blog (table: public.blog) ---------------- */

async function blogRows(filter) {
  const parts = ["select=*", "order=date.desc.nulls.last"];
  if (filter && filter.status) parts.push("status=eq." + encodeURIComponent(filter.status));
  const rows = await rest("GET", "blog", "?" + parts.join("&"));
  return rows || [];
}

async function blogList(filter) {
  const f = filter || {};
  let rows = await blogRows(f);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    rows = rows.filter((p) =>
      [p.title, p.excerpt, p.body, p.category].some((v) => v && String(v).toLowerCase().includes(q)));
  }
  if (!f.all) rows = rows.map((p) => ({
    id: p.id, slug: p.slug, title: p.title, category: p.category,
    excerpt: p.excerpt, cover: p.cover, date: p.date, updated_at: p.updated_at,
    status: p.status, reading_minutes: p.reading_minutes
  }));
  return rows;
}

async function blogById(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const rows = await rest("GET", "blog", "?select=*&id=eq." + id + "&limit=1");
  return rows && rows[0] ? rows[0] : null;
}

async function blogBySlug(slug) {
  const rows = await rest("GET", "blog", "?select=*&slug=eq." + encodeURIComponent(slug) + "&status=eq.published&limit=1");
  return rows && rows[0] ? rows[0] : null;
}

async function blogCreate(fields) {
  const existing = await blogRows({ all: true });
  const row = blogstore.rowFrom(fields, existing);
  if (!row.title) return { error: "Title is required." };
  const rows = await rest("POST", "blog", "", row, "return=representation");
  return { post: rows && rows[0] ? rows[0] : row };
}

async function blogUpdate(id, patch) {
  const prev = await blogById(id);
  if (!prev) return { post: null };
  const existing = await blogRows({ all: true });
  const result = blogstore.applyPostPatch(prev, patch, existing);
  if (result.error) return { error: result.error };
  await rest("PATCH", "blog", "?id=eq." + id, result.post);
  return { post: result.post };
}

async function blogRemove(id) {
  const existing = await blogById(id);
  if (!existing) return false;
  await rest("DELETE", "blog", "?id=eq." + id);
  return true;
}

module.exports = {
  isConfigured, findRecentByEmail, insert, getById, list, update, remove, statsByStatus,
  blogList, blogById, blogBySlug, blogCreate, blogUpdate, blogRemove
};
