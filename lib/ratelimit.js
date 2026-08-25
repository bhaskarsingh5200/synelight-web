/* SYNELIGHT — in-memory sliding-window rate limiter (zero-dependency)
   Suitable for a single-process deployment. */
"use strict";

const buckets = new Map();

/* Periodic cleanup so the map never grows unbounded */
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < key.windowMs);
    if (alive.length === 0) buckets.delete(key);
    else hits.splice(0, hits.length, ...alive);
  }
}, 10 * 60 * 1000).unref();

/**
 * Consume one slot for `key`. Returns true if allowed, false if rate exceeded.
 */
function allow(key, max, windowMs) {
  const now = Date.now();
  let hits = buckets.get(key);
  if (!hits) { hits = []; buckets.set(key, hits); }
  while (hits.length && now - hits[0] >= windowMs) hits.shift();
  if (hits.length >= max) return false;
  hits.push(now);
  return true;
}

function remaining(key, max, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  return Math.max(0, max - hits.length);
}

module.exports = { allow, remaining };
