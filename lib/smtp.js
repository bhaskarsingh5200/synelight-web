/* SYNELIGHT — minimal SMTP client over implicit TLS (zero-dependency)
   Supports EHLO + AUTH LOGIN + plain text messages. Good enough for
   transactional notification emails via standard providers. */
"use strict";
const tls = require("tls");
const crypto = require("crypto");

function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }

function smtpSend(options) {
  const { host, port, user, pass, from, to, subject, text } = options;
  return new Promise((resolve, reject) => {
    let buffer = "";
    let step = 0;
    let socket;

    const fail = (err) => { try { socket && socket.destroy(); } catch {} reject(err instanceof Error ? err : new Error(String(err))); };

    const steps = [
      /* greet */
      { match: /^220/, send: () => "EHLO synelight.local\r\n" },
      { match: /^250/, send: () => (user ? "AUTH LOGIN\r\n" : "MAIL FROM:<" + addr(from) + ">\r\n") },
      { match: /^250/, send: () => (user ? b64(user) + "\r\n" : null) },
      { match: /^334/, send: () => (user ? b64(pass) + "\r\n" : null) },
      { match: /^235/, send: () => "MAIL FROM:<" + addr(from) + ">\r\n" },
      { match: /^250/, send: () => "RCPT TO:<" + addr(to) + ">\r\n" },
      { match: /^250/, send: () => "DATA\r\n" },
      { match: /^354/, send: () => buildMessage(from, to, subject, text) },
      { match: /^250/, send: () => "QUIT\r\n", done: true }
    ];

    function addr(a) {
      const m = String(a).match(/<([^>]+)>/);
      return m ? m[1] : String(a).trim();
    }

    function buildMessage() {
      const msgId = "<" + crypto.randomBytes(10).toString("hex") + "@synelight>";
      const headers = [
        "From: " + from,
        "To: " + to,
        "Subject: " + subject,
        "Date: " + new Date().toUTCString(),
        "Message-ID: " + msgId,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: base64",
        "",
        ""
      ].join("\r\n");
      const body = Buffer.from(text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
      return headers + body + "\r\n.\r\n";
    }

    const onError = (err) => fail(err);

    socket = tls.connect({ host, port: Number(port) || 465, servername: host }, () => {});
    socket.setEncoding("utf8");
    socket.setTimeout(15000);
    socket.on("timeout", () => fail(new Error("smtp_timeout")));
    socket.on("error", onError);

    socket.on("data", (chunk) => {
      buffer += chunk;
      /* Respond only to complete, final SMTP replies (line after last "xxx-") */
      if (!/\r\n$/.test(buffer)) return;
      if (/-\r\n$/.test(buffer.trimEnd().slice(-4))) return; /* multiline continues */
      const reply = buffer;
      buffer = "";
      const current = steps[step];
      if (!current) return;
      if (!current.match.test(reply)) {
        return fail(new Error("smtp_unexpected_reply_step_" + step + ": " + reply.slice(0, 120)));
      }
      step++;
      if (current.done) { socket.end(); resolve(true); return; }
      const out = current.send();
      if (out !== null && out !== undefined) socket.write(out);
    });

    socket.on("end", () => { if (step < steps.length) fail(new Error("smtp_closed_early")); });
  });
}

module.exports = { send: smtpSend };
