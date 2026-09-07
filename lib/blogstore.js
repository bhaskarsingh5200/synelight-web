/* SYNELIGHT — local JSON blog store (zero-dependency CMS)
   Posts persisted to data/blog.json with atomic-ish writes on Windows. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "blog.json");

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

function writeAll(posts) {
  ensure();
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(posts, null, 2), "utf8");
  try {
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    fs.copyFileSync(tmp, DB_FILE);
    try { fs.unlinkSync(tmp); } catch {}
    if (!/EBUSY|EPERM|EACCES/.test(String(err.code))) throw err;
  }
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function uniqueSlug(base, existing, ignoreId) {
  let slug = base || "post";
  let n = 1;
  while (existing.some((p) => p.slug === slug && p.id !== ignoreId)) {
    n += 1;
    slug = base + "-" + n;
  }
  return slug;
}

function readingMinutes(body) {
  const words = String(body || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function rowFrom(fields, existing) {
  const now = new Date().toISOString();
  const title = String(fields.title || "").trim();
  const base = uniqueSlug(fields.slug ? slugify(fields.slug) : slugify(title), existing);
  const status = fields.status === "published" ? "published" : "draft";
  const date = status === "published"
    ? (fields.date || now)
    : "";
  return {
    id: crypto.randomUUID(),
    slug: base,
    title,
    category: String(fields.category || "Insights").trim().slice(0, 60),
    excerpt: String(fields.excerpt || "").trim().slice(0, 300),
    body: String(fields.body || ""),
    author: String(fields.author || "SYNELIGHT").trim().slice(0, 80) || "SYNELIGHT",
    date,
    updated_at: now,
    status,
    reading_minutes: readingMinutes(fields.body)
  };
}

function list(filters) {
  const f = filters || {};
  let posts = readAll();
  if (f.status) posts = posts.filter((p) => p.status === f.status);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    posts = posts.filter(
      (p) => p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }
  const sortBy = f.sort === "oldest" ? "oldest" : "newest";
  posts.sort(function (a, b) {
    const ka = a.date || a.updated_at;
    const kb = b.date || b.updated_at;
    return sortBy === "newest" ? String(kb).localeCompare(String(ka)) : String(ka).localeCompare(String(kb));
  });
  if (!f.all) posts = posts.map(function (p) {
    return {
      id: p.id, slug: p.slug, title: p.title, category: p.category,
      excerpt: p.excerpt, date: p.date, updated_at: p.updated_at,
      status: p.status, reading_minutes: p.reading_minutes
    };
  });
  if (f.limit && f.limit > 0) posts = posts.slice(0, f.limit);
  return posts;
}

function getById(id) {
  return readAll().find((p) => p.id === id) || null;
}

function getBySlug(slug) {
  return readAll().find((p) => p.slug === slug && p.status === "published") || null;
}

function create(fields) {
  const posts = readAll();
  const row = rowFrom(fields, posts);
  if (!row.title) return { error: "Title is required." };
  posts.unshift(row);
  writeAll(posts);
  return { post: row };
}

function update(id, patch) {
  const posts = readAll();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return { post: null };
  const existing = posts.slice();
  const prev = posts[idx];

  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t) return { error: "Title is required." };
    prev.title = t;
  }
  if (patch.slug !== undefined) prev.slug = uniqueSlug(slugify(patch.slug) || slugify(prev.title), existing, id);
  if (patch.category !== undefined) prev.category = String(patch.category).trim().slice(0, 60);
  if (patch.excerpt !== undefined) prev.excerpt = String(patch.excerpt).trim().slice(0, 300);
  if (patch.body !== undefined) {
    prev.body = String(patch.body);
    prev.reading_minutes = readingMinutes(prev.body);
  }
  if (patch.author !== undefined) prev.author = String(patch.author).trim().slice(0, 80) || "SYNELIGHT";
  if (patch.status !== undefined) {
    const st = patch.status === "published" ? "published" : "draft";
    if (st === "published" && prev.status !== "published") prev.date = new Date().toISOString();
    if (st === "draft") prev.date = "";
    prev.status = st;
  }
  prev.updated_at = new Date().toISOString();
  writeAll(posts);
  return { post: prev };
}

function remove(id) {
  const posts = readAll();
  const next = posts.filter((p) => p.id !== id);
  if (next.length === posts.length) return false;
  writeAll(next);
  return true;
}

module.exports = { list, getById, getBySlug, create, update, remove, slugify };