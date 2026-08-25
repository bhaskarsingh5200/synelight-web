/* SYNELIGHT — environment loader (zero-dependency)
   Reads process.env first, then falls back to a local .env file.
   Never import this from browser code. */
"use strict";
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");

function parseEnvFile(file) {
  const out = {};
  let raw = "";
  try { raw = fs.readFileSync(file, "utf8"); } catch { return out; }
  raw.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const eq = t.indexOf("=");
    if (eq === -1) return;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  });
  return out;
}

const fileVars = parseEnvFile(ENV_FILE);

const env = {
  get(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== "") {
      return process.env[key];
    }
    if (Object.prototype.hasOwnProperty.call(fileVars, key) && fileVars[key] !== "") {
      return fileVars[key];
    }
    return fallback === undefined ? "" : fallback;
  },
  bool(key, fallback) {
    const v = env.get(key, fallback ? "true" : "false").toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "on";
  },
  int(key, fallback) {
    const n = parseInt(env.get(key, ""), 10);
    return Number.isFinite(n) ? n : fallback;
  }
};

module.exports = env;
