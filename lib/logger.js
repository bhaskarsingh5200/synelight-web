/* SYNELIGHT — server-side logger (zero-dependency)
   Writes structured lines to data/logs/app-YYYY-MM-DD.log + stdout.
   Never log passwords, keys, tokens, or personal data beyond lead IDs. */
"use strict";
const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "data", "logs");

function log(level, event, detail) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    d: detail || {}
  });
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, "app-" + new Date().toISOString().slice(0, 10) + ".log");
    fs.appendFileSync(file, line + "\n", "utf8");
  } catch {}
  /* Console mirror for host-based log collection */
  try { console.log("[" + level + "] " + event + " " + JSON.stringify(detail || {})); } catch {}
}

module.exports = {
  log,
  info: (event, detail) => log("info", event, detail),
  warn: (event, detail) => log("warn", event, detail),
  error: (event, detail) => log("error", event, detail)
};
