/* SYNELIGHT — blog store facade (zero-dependency)
   Primary engine: Supabase REST (table: public.blog). Fallback: JSON file.
   Same API as lib/blogstore but async — both engines return the same shapes. */
"use strict";
const blogstore = require("./blogstore");
const supabase = require("./supabase");

function engine() {
  return supabase.isConfigured() ? "supabase" : "json";
}

async function list(filter) {
  if (supabase.isConfigured()) return supabase.blogList(filter);
  return blogstore.list(filter);
}

async function getById(id) {
  if (supabase.isConfigured()) return supabase.blogById(id);
  return blogstore.getById(id);
}

async function getBySlug(slug) {
  if (supabase.isConfigured()) return supabase.blogBySlug(slug);
  return blogstore.getBySlug(slug);
}

async function create(fields) {
  if (supabase.isConfigured()) return supabase.blogCreate(fields);
  return blogstore.create(fields);
}

async function update(id, patch) {
  if (supabase.isConfigured()) return supabase.blogUpdate(id, patch);
  return blogstore.update(id, patch);
}

async function remove(id) {
  if (supabase.isConfigured()) return supabase.blogRemove(id);
  return blogstore.remove(id);
}

module.exports = { list, getById, getBySlug, create, update, remove, engine };