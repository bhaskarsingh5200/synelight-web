/* SYNELIGHT — minimal, XSS-safe body renderer for blog posts.
   Accepts a small safe subset of markdown and always escapes HTML first. */
"use strict";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBlock(line) {
  const t = line.trim();
  if (t === "---") return '<hr class="prose-hr">';
  if (/^###\s+/.test(t)) return "<h3>" + esc(t.replace(/^###\s+/, "")) + "</h3>";
  if (/^##\s+/.test(t)) return "<h2>" + esc(t.replace(/^##\s+/, "")) + "</h2>";
  if (/^#\s+/.test(t)) return "<h2>" + esc(t.replace(/^#\s+/, "")) + "</h2>";
  if (/^>\s?/.test(t)) return "<blockquote>" + esc(t.replace(/^>\s?/, "")) + "</blockquote>";
  if (/^- /.test(t)) return '<p class="prose-li">• ' + esc(t.replace(/^- /, "")) + "</p>";
  return "<p>" + esc(t) + "</p>";
}

function render(body) {
  const raw = String(body || "");
  const blocks = raw.split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (!lines.length) continue;
    if (lines.length === 1) {
      out.push(renderBlock(lines[0]));
      continue;
    }
    if (lines.every((l) => /^- /.test(l.trim()))) {
      out.push("<ul>" + lines.map((l) => "<li>" + esc(l.trim().replace(/^- /, "")) + "</li>").join("") + "</ul>");
      continue;
    }
    for (const line of lines) out.push(renderBlock(line));
  }
  return out.join("\n");
}

module.exports = { render, esc };