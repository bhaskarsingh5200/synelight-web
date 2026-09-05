/* ============================================================
   SYNELIGHT — production server (zero-dependency Node)
   Static site + secure lead API + authenticated admin panel.

   Routes:
     GET  /api/site-config      public safe configuration
     GET  /api/healthz          uptime probe
     POST /api/leads            create enquiry (validated + rate limited)
     POST /api/admin/login      password auth -> HttpOnly session cookie
     POST /api/admin/logout     destroy session
     GET  /api/admin/session    { authenticated }
     GET  /api/admin/stats      lead counts by status        [auth]
     GET  /api/admin/leads      list/filter/search leads     [auth]
     GET  /api/admin/leads/:id  single lead                  [auth]
     PATCH /api/admin/leads/:id change status / notes        [auth]
     /admin/login               login page
     /admin, /admin/leads       dashboard (session-gated)
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const env = require("./lib/env");
const logger = require("./lib/logger");
const db = require("./lib/db");
const validate = require("./lib/validate");
const mailer = require("./lib/mailer");
const limiter = require("./lib/ratelimit");

const ROOT = __dirname;
const PORT = env.int("PORT", 3000);
const SITE_URL = env.get("SITE_URL", "http://localhost:" + PORT).replace(/\/+$/, "");
const FORCE_HTTPS = env.bool("FORCE_HTTPS", false);
const DUPLICATE_WINDOW_SEC = env.int("DUPLICATE_WINDOW_SEC", 120);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

/* Paths that must never be served statically */
const DENY_PREFIX = ["/data/", "/data", "/lib/", "/.env", "/node_modules/", "/admin/api"];
const DENY_EXACT = ["/server.js", "/package.json", "/package-lock.json"];

/* ---------------- Response helpers ---------------- */

function applySecurityHeaders(req, res, opts) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com",
    "img-src 'self' data:",
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; "));
  const noStore = opts && opts.noStore;
  res.setHeader("Cache-Control", noStore ? "no-store, must-revalidate" : "no-cache");
}

function serve(res, status, type, body, extraHeaders) {
  const headers = Object.assign({ "Content-Type": type }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, obj, extraHeaders) {
  serve(res, status, "application/json; charset=utf-8", JSON.stringify(obj), extraHeaders);
}

function notFound(res) {
  fs.readFile(path.join(ROOT, "404.html"), (err, data) => {
    if (err) return serve(res, 404, "text/plain; charset=utf-8", "Not found");
    serve(res, 404, "text/html; charset=utf-8", data);
  });
}

function serverError(res, err) {
  logger.error("request_failed", { path: "/", reason: String(err && err.message).slice(0, 200) });
  const body = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Something went wrong — SYNELIGHT</title>' +
    '<style>body{background:#060B18;color:#fff;font-family:Manrope,Inter,sans-serif;display:grid;' +
    'place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}h1{letter-spacing:.08em}' +
    'p{color:#94A3B8}a{color:#20C7D9}</style></head><body><div>' +
    '<h1>SOMETHING WENT WRONG.</h1><p>Please try again in a moment.</p>' +
    '<a href="/">← Back to SYNELIGHT</a></div></body></html>';
  serve(res, 500, "text/html; charset=utf-8", body);
}

/* ---------------- Request helpers ---------------- */

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("payload_too_large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("invalid_json"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

/* ---------------- Cookies & sessions ---------------- */

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

const SESSION_COOKIE = "sl_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; /* 8 hours, sliding */
const sessions = new Map(); /* token -> expiresAt */

function pruneSessions() {
  const now = Date.now();
  for (const [tok, exp] of sessions) if (exp < now) sessions.delete(tok);
}
setInterval(pruneSessions, 15 * 60 * 1000).unref();

function createSession(res, secure) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader("Set-Cookie",
    SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict" +
    (secure ? "; Secure" : "") + "; Max-Age=" + Math.floor(SESSION_TTL_MS / 1000));
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) sessions.delete(cookies[SESSION_COOKIE]);
  res.setHeader("Set-Cookie", SESSION_COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

function isAuthed(req) {
  pruneSessions();
  const cookies = parseCookies(req);
  const tok = cookies[SESSION_COOKIE];
  if (!tok || !sessions.has(tok)) return false;
  sessions.set(tok, Date.now() + SESSION_TTL_MS); /* sliding */
  return true;
}

/* CSRF defense: mutating requests with an Origin/Referer must match our host.
   Combined with SameSite=Strict cookies this blocks cross-site POSTs. */
function sameOrigin(req) {
  const host = req.headers.host;
  const origin = req.headers.origin || req.headers.referer;
  if (!origin || !host) return true; /* server-to-server / curl allowed */
  try { return new URL(origin).host === host; } catch { return false; }
}

function timingSafePasswordMatch(input, expected) {
  const a = crypto.createHash("sha256").update(String(input)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------------- Public API ---------------- */

async function handleSiteConfig(res) {
  const cfg = {};
  const wa = env.get("WHATSAPP_NUMBER", "8409405200");
  let waNum = (wa || "").replace(/[^0-9]/g, "");
  if (waNum && /^\d{10}$/.test(waNum)) waNum = "91" + waNum;
  if (waNum) cfg.whatsappNumber = waNum;
  if (env.get("BOOKING_URL")) cfg.bookingUrl = env.get("BOOKING_URL");
  if (env.get("GA4_ID")) cfg.ga4Id = env.get("GA4_ID");
  if (env.get("TURNSTILE_SITE_KEY")) cfg.turnstileSiteKey = env.get("TURNSTILE_SITE_KEY");
  json(res, 200, cfg);
}

async function handleCreateLead(req, res, ip) {
  if (!limiter.allow("lead:" + ip, env.int("LEAD_RATE_MAX", 5), env.int("LEAD_RATE_WINDOW_MS", 10 * 60 * 1000))) {
    logger.log("warn", "rate_limited", { route: "leads", ip });
    return json(res, 429, { success: false, message: "Too many requests. Please try again later." });
  }
  let body;
  try { body = await readJsonBody(req, 20 * 1024); }
  catch (err) {
    return json(res, err.status || 400, { success: false, message: "Unable to submit your request." });
  }

  /* Honeypot: pretend success so bots move on */
  if (validate.oneLine(body.company_url, 100)) {
    logger.log("info", "honeypot_hit", {});
    return json(res, 200, { success: true });
  }

  /* Timing check: submissions faster than ~1.5s after render are bots */
  const age = Date.now() - Number(body.renderedAt || 0);
  if (!Number.isFinite(age) || age < 0 || age > 1000 * 60 * 60 * 24) {
    logger.log("info", "suspicious_timing", {});
  } else if (age < 1500) {
    return json(res, 200, { success: true });
  }

  /* Turnstile (only enforced when configured server-side) */
  const human = await validate.verifyTurnstile(body.turnstileToken, ip);
  if (!human) {
    logger.log("warn", "turnstile_failed", {});
    return json(res, 400, { success: false, message: "Verification failed. Please try again." });
  }

  const result = validate.validateLeadPayload(body);
  if (!result.ok) {
    return json(res, 400, {
      success: false,
      message: "Please correct the highlighted fields.",
      errors: result.errors
    });
  }

  let created;
  try {
    created = await db.createLead(result.values, DUPLICATE_WINDOW_SEC);
  } catch (err) {
    logger.error("lead_create_failed", { reason: String(err.message).slice(0, 200) });
    return json(res, 500, { success: false, message: "Unable to submit your request." });
  }

  if (created.duplicate) {
    logger.log("info", "duplicate_suppressed", { id: created.lead.id });
  } else {
    logger.log("info", "lead_created", { id: created.lead.id, engine: db.activeEngine() });
    /* Email must never block or fail the lead creation */
    mailer.notifyInternalLead(created.lead).catch((e) =>
      logger.error("email_failed", { tag: "internal", reason: String(e.message).slice(0, 120) }));
    mailer.confirmClientLead(created.lead).catch((e) =>
      logger.error("email_failed", { tag: "confirmation", reason: String(e.message).slice(0, 120) }));
  }

  json(res, 201, { success: true });
}

/* ---------------- Admin API ---------------- */

async function handleAdminLogin(req, res, ip) {
  if (!limiter.allow("login:" + ip, 8, 15 * 60 * 1000)) {
    logger.log("warn", "rate_limited", { route: "login", ip });
    return json(res, 429, { success: false, message: "Too many attempts. Try again later." });
  }
  const expected = env.get("ADMIN_PASSWORD");
  if (!expected) {
    return json(res, 503, { success: false, message: "Admin access is not configured." });
  }
  let body;
  try { body = await readJsonBody(req, 2 * 1024); }
  catch { return json(res, 400, { success: false }); }

  let ok = false;
  try { ok = timingSafePasswordMatch(body.password || "", expected); } catch {}
  if (!ok) {
    logger.log("warn", "admin_login_failed", { ip });
    /* Constant small delay to blunt brute force */
    await new Promise((r) => setTimeout(r, 600));
    return json(res, 401, { success: false, message: "Incorrect password." });
  }
  createSession(res, FORCE_HTTPS);
  logger.log("info", "admin_login_ok", {});
  json(res, 200, { success: true });
}

function requireAdmin(req, res) {
  if (!sameOrigin(req)) { json(res, 403, { success: false }); return false; }
  if (!isAuthed(req)) { json(res, 401, { success: false, message: "Authentication required." }); return false; }
  return true;
}

async function handleAdminApi(req, res, pathname, query, ip) {
  if (pathname === "/api/admin/login") {
    if (req.method !== "POST") return json(res, 405, { success: false });
    return handleAdminLogin(req, res, ip);
  }
  if (pathname === "/api/admin/logout") {
    destroySession(req, res);
    return json(res, 200, { success: true });
  }
  if (pathname === "/api/admin/session") {
    return json(res, 200, { authenticated: isAuthed(req) });
  }

  if (!requireAdmin(req, res)) return;

  if (pathname === "/api/admin/stats" && req.method === "GET") {
    try { return json(res, 200, { success: true, stats: await db.statsByStatus() }); }
    catch { return json(res, 500, { success: false }); }
  }

  let m = pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/i);
  if (m && req.method === "GET") {
    try {
      const lead = await db.getLead(m[1]);
      if (!lead) return json(res, 404, { success: false, message: "Not found." });
      return json(res, 200, { success: true, lead });
    } catch { return json(res, 500, { success: false }); }
  }
  if (m && req.method === "PATCH") {
    let body;
    try { body = await readJsonBody(req, 8 * 1024); }
    catch { return json(res, 400, { success: false }); }
    const patch = {};
    if (body.status !== undefined) {
      if (!validate.validStatus(body.status)) return json(res, 400, { success: false, message: "Invalid status." });
      patch.status = body.status;
    }
    if (body.notes !== undefined) patch.notes = validate.sanitizeText(body.notes, 5000);
    try {
      const lead = await db.updateLead(m[1], patch);
      if (!lead) return json(res, 404, { success: false });
      return json(res, 200, { success: true, lead });
    } catch { return json(res, 500, { success: false }); }
  }

  if (pathname === "/api/admin/leads" && req.method === "GET") {
    try {
      const leads = await db.listLeads({
        status: query.get("status") || "",
        service: query.get("service") || "",
        source: query.get("source") || "",
        q: query.get("q") || "",
        sort: query.get("sort") === "oldest" ? "oldest" : "newest"
      });
      return json(res, 200, { success: true, leads });
    } catch { return json(res, 500, { success: false }); }
  }

  json(res, 404, { success: false, message: "Unknown admin endpoint." });
}

/* ---------------- Static file serving ---------------- */

function serveStatic(res, filePath, status) {
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    const ext = path.extname(filePath).toLowerCase();
    serve(res, status || 200, MIME[ext] || "application/octet-stream", data);
  });
}

function readPage(file) {
  return new Promise((resolve) => {
    fs.readFile(path.join(ROOT, file), (err, data) => resolve(err ? null : data));
  });
}

function isDenied(p) {
  return DENY_EXACT.indexOf(p) !== -1 ||
    DENY_PREFIX.some((pre) => p === pre || p.startsWith(pre)) ||
    /^\/\.env/.test(p);
}

/* ---------------- Router ---------------- */

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(req, res, { noStore: true });
    const ip = clientIp(req);

    /* HTTPS behind proxies/load balancers */
    if (FORCE_HTTPS && String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "http") {
      res.writeHead(301, { Location: "https://" + req.headers.host + req.url });
      return res.end();
    }

    let pathname;
    let query;
    try {
      const u = new URL(req.url, "http://" + (req.headers.host || "localhost"));
      query = u.searchParams;
      pathname = decodeURIComponent(u.pathname);
    } catch {
      return serve(res, 400, "text/plain; charset=utf-8", "Bad request");
    }

    if (pathname.indexOf("..") !== -1 || pathname.indexOf("\\") !== -1 || pathname.indexOf("\0") !== -1) {
      return serve(res, 403, "text/plain; charset=utf-8", "Forbidden");
    }
    if (pathname.charAt(0) !== "/") pathname = "/" + pathname;

    /* ---- API ---- */
    if (pathname === "/api/healthz" && req.method === "GET") {
      return json(res, 200, { ok: true, engine: db.activeEngine(), time: new Date().toISOString() });
    }
    if (pathname === "/api/site-config" && req.method === "GET") {
      return handleSiteConfig(res);
    }
    if (pathname === "/api/leads") {
      if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { success: false }); }
      if (!sameOrigin(req)) return json(res, 403, { success: false, message: "Unable to submit your request." });
      return handleCreateLead(req, res, ip);
    }
    if (pathname.startsWith("/api/admin/")) {
      return handleAdminApi(req, res, pathname, query, ip).catch((e) => serverError(res, e));
    }
    if (pathname.startsWith("/api/")) return json(res, 404, { success: false });

    /* ---- Admin pages ---- */
    if (pathname === "/admin" || pathname === "/admin/" || pathname.indexOf("/admin/leads") === 0) {
      if (isAuthed(req)) {
        const dash = await readPage("admin/dashboard.html");
        if (dash) return serve(res, 200, "text/html; charset=utf-8", dash);
      } else {
        res.writeHead(302, { Location: "/admin/login/" });
        return res.end();
      }
    }
    if (pathname.indexOf("/admin/login") === 0) {
      if (isAuthed(req)) { res.writeHead(302, { Location: "/admin/leads/" }); return res.end(); }
      const page = await readPage("admin/login.html");
      if (page) return serve(res, 200, "text/html; charset=utf-8", page);
    }

    /* ---- Static ---- */
    if (isDenied(pathname)) return notFound(res);

    if (pathname.startsWith("/admin/")) {
      /* pathname is pre-validated (no "..", "\", "\0") */
      return serveStatic(res, path.join(ROOT, "admin", pathname.slice("/admin/".length)));
    }

    /* Directory-style pretty URLs: /solutions -> /solutions/ */
    const hasExt = path.extname(pathname) !== "";
    if (!hasExt && !pathname.endsWith("/")) {
      if (fs.existsSync(path.join(ROOT, pathname, "index.html"))) {
        res.writeHead(301, { Location: encodeURI(pathname + "/") + (req.url.includes("?") ? "?" + req.url.split("?")[1] : "") });
        return res.end();
      }
    }

    let filePath;
    if (pathname.endsWith("/")) filePath = path.join(ROOT, pathname, "index.html");
    else filePath = path.join(ROOT, pathname);

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        if (req.method === "GET" || req.method === "HEAD") return notFound(res);
        return serve(res, 404, "text/plain; charset=utf-8", "Not found");
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        return serve(res, 405, "text/plain; charset=utf-8", "Method not allowed");
      }
      serveStatic(res, filePath);
    });
  } catch (err) {
    serverError(res, err);
  }
});

/* ---------------- Env validation ---------------- */

function validateEnv() {
  const missing = [];
  const warnings = [];

  if (!env.get("ADMIN_PASSWORD")) missing.push("ADMIN_PASSWORD — admin panel is inaccessible without it");
  if (!env.get("SUPABASE_URL") || !env.get("SUPABASE_SERVICE_ROLE_KEY"))
    warnings.push("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — running in JSON fallback mode (data/leads.json)");
  if (!env.get("RESEND_API_KEY") && !env.get("MAIL_WEBHOOK_URL") && !env.get("SMTP_HOST"))
    warnings.push("No email transport configured (RESEND_API_KEY, MAIL_WEBHOOK_URL, SMTP_HOST) — emails will be skipped");
  if (!env.get("SITE_URL"))
    warnings.push("SITE_URL not set — falling back to http://localhost:" + PORT);

  if (missing.length) {
    console.error("\n  FATAL: Missing required environment variables:\n");
    missing.forEach(function (m) { console.error("    - " + m); });
    console.error("\n  Copy .env.example to .env and configure the required values.\n");
    process.exit(1);
  }
  if (warnings.length) {
    console.log("\n  NOTE: Optional configuration missing:\n");
    warnings.forEach(function (w) { console.log("    - " + w); });
    console.log("");
  }
}

validateEnv();

server.listen(PORT, "0.0.0.0", () => {
  logger.log("info", "server_started", { port: PORT, engine: db.activeEngine(), mailer: mailer.activeTransport() });
  console.log("SYNELIGHT running at http://0.0.0.0:" + PORT);
});
