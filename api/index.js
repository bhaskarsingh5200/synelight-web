/* SYNELIGHT — Vercel serverless entry point.
   Every request is routed here via vercel.json rewrites and served by the
   same handleRequest() used by the standalone Node server (server.js).

   Vercel rewrites re-target req.url to the function destination (e.g.
   "/api/index") and expose the ORIGINAL path in the x-matched-path header —
   restore it so the router sees the real URL the visitor requested. */
"use strict";
const { handleRequest } = require("../server");

module.exports = async function vercelHandler(req, res) {
  const matched = req.headers && req.headers["x-matched-path"];
  if (typeof matched === "string" && matched.length && matched !== req.url) {
    let url = matched;
    const hasQuery = matched.indexOf("?") !== -1;
    const oq = req.url.indexOf("?");
    if (!hasQuery && oq !== -1) url += req.url.slice(oq);
    req.url = url;
  }
  return handleRequest(req, res);
};