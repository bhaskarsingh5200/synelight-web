/* SYNELIGHT Admin — internal lead management.
   Vanilla JS. All server data is rendered as TEXT via esc() — no HTML injection. */
"use strict";
(function () {
  var loginForm = document.getElementById("login-form");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* ---------------- Login page ---------------- */
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = document.getElementById("login-error");
      err.hidden = true;
      var btn = loginForm.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Signing in…";
      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: document.getElementById("password").value })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.success) { location.href = "/admin/leads/"; return; }
          err.hidden = false;
          err.textContent = (res.j && res.j.message) || "Incorrect password.";
          btn.disabled = false;
          btn.textContent = "Sign In →";
        })
        .catch(function () {
          err.hidden = false;
          err.textContent = "Network error. Please try again.";
          btn.disabled = false;
          btn.textContent = "Sign In →";
        });
    });
    return;
  }

  /* ---------------- Dashboard ---------------- */
  var tbody = document.getElementById("leads-tbody");
  if (!tbody) return;

  var state = { status: "", service: "", source: "", q: "", sort: "newest", leads: [], selectedId: null };

  function api(url, options) {
    return fetch(url, options).then(function (r) {
      if (r.status === 401) { location.href = "/admin/login/"; throw new Error("unauthenticated"); }
      return r.json();
    });
  }

  var STATUS_LABEL = { CALL_BOOKED: "CALL BOOKED", PROPOSAL_SENT: "PROPOSAL" };

  function statusPill(status) {
    return '<span class="status-pill s-' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + "</span>";
  }

  function loadStats() {
    api("/api/admin/stats").then(function (j) {
      if (!j.success) return;
      var stats = j.stats || {};
      var all = 0;
      Object.keys(stats).forEach(function (k) {
        var el = document.querySelector('[data-stat="' + k + '"]');
        if (el) el.textContent = stats[k];
        all += stats[k];
      });
      var allEl = document.querySelector('[data-stat="ALL"]');
      if (allEl) allEl.textContent = all;
    }).catch(function () {});
  }

  function loadLeads() {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading…</td></tr>';
    var params = new URLSearchParams();
    if (state.status) params.set("status", state.status);
    if (state.service) params.set("service", state.service);
    if (state.source) params.set("source", state.source);
    if (state.q) params.set("q", state.q);
    params.set("sort", state.sort);
    api("/api/admin/leads?" + params.toString()).then(function (j) {
      if (!j.success) return;
      state.leads = j.leads || [];
      renderTable();
    }).catch(function (e) {
      if (e.message !== "unauthenticated") {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Failed to load leads.</td></tr>';
      }
    });
  }

  function renderTable() {
    if (!state.leads.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No leads match the current filters.</td></tr>';
      return;
    }
    tbody.innerHTML = state.leads.map(function (l) {
      return '<tr data-id="' + esc(l.id) + '" class="' + (l.id === state.selectedId ? "is-selected" : "") + '">' +
        "<td>" + esc(l.full_name) + "</td>" +
        "<td>" + esc(l.business_name || "—") + "</td>" +
        "<td>" + esc(l.service) + "</td>" +
        "<td>" + statusPill(l.status) + "</td>" +
        "<td>" + esc(l.source) + "</td>" +
        "<td>" + esc(fmtDate(l.created_at)) + "</td></tr>";
    }).join("");
  }

  tbody.addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    openLead(tr.getAttribute("data-id"));
  });

  /* ---- Detail panel ---- */
  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val == null || val === "" ? "—" : val;
  }

  function openLead(id) {
    state.selectedId = id;
    renderTable();
    api("/api/admin/leads/" + encodeURIComponent(id)).then(function (j) {
      if (!j.success) return;
      var l = j.lead;
      document.getElementById("detail-panel").hidden = false;
      setText("d-name", l.full_name);
      var em = document.getElementById("d-email");
      em.textContent = l.email;
      em.href = "mailto:" + esc(l.email);
      setText("d-whatsapp", l.whatsapp);
      setText("d-business", l.business_name);
      setText("d-website", l.website);
      setText("d-type", l.business_type);
      setText("d-service", l.service);
      setText("d-timeline", l.timeline);
      setText("d-budget", l.budget);
      setText("d-source", l.source);
      setText("d-utm", [l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" / ") || "");
      setText("d-created", fmtDate(l.created_at));
      setText("d-updated", fmtDate(l.updated_at));
      setText("d-description", l.description);
      document.getElementById("d-status-select").value = l.status || "NEW";
      document.getElementById("d-notes").value = l.notes || "";

      var wa = document.getElementById("d-wa-link");
      var waDigits = String(l.whatsapp || "").replace(/[^0-9]/g, "");
      if (waDigits) {
        wa.hidden = false;
        wa.href = "https://wa.me/" + waDigits;
      } else { wa.hidden = true; }
      var ml = document.getElementById("d-mail-link");
      ml.href = "mailto:" + esc(l.email);
    }).catch(function () {});
  }

  document.getElementById("detail-close").addEventListener("click", function () {
    document.getElementById("detail-panel").hidden = true;
    state.selectedId = null;
    renderTable();
  });

  function saveLead(patch, msgEl) {
    if (!state.selectedId) return;
    fetch("/api/admin/leads/" + encodeURIComponent(state.selectedId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }).then(function (r) {
      if (r.status === 401) { location.href = "/admin/login/"; return; }
      return r.json();
    }).then(function (j) {
      if (!j || !j.success) throw new Error("failed");
      if (msgEl) { msgEl.textContent = "Saved."; setTimeout(function () { msgEl.textContent = ""; }, 2500); }
      loadStats();
      loadLeads();
    }).catch(function () {
      if (msgEl) { msgEl.textContent = "Save failed — try again."; msgEl.classList.add("err"); }
    });
  }

  var saveBtn = document.getElementById("save-btn");
  saveBtn.addEventListener("click", function () {
    saveLead({
      status: document.getElementById("d-status-select").value,
      notes: document.getElementById("d-notes").value
    }, document.getElementById("save-msg"));
  });
  document.querySelectorAll("[data-quick-status]").forEach(function (b) {
    b.addEventListener("click", function () {
      var s = b.getAttribute("data-quick-status");
      document.getElementById("d-status-select").value = s;
      saveLead({ status: s }, document.getElementById("save-msg"));
    });
  });

  /* ---- Filters ---- */
  document.querySelectorAll(".stat-card").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll(".stat-card").forEach(function (c) { c.classList.remove("is-active"); });
      card.classList.add("is-active");
      state.status = card.getAttribute("data-status-filter") || "";
      loadLeads();
    });
  });

  var searchTimer = null;
  document.getElementById("lead-search").addEventListener("input", function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      loadLeads();
    }, 300);
  });
  ["service-filter", "source-filter"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function (e) {
      if (id === "service-filter") state.service = e.target.value; else state.source = e.target.value;
      loadLeads();
    });
  });
  document.getElementById("sort-select").addEventListener("change", function (e) {
    state.sort = e.target.value;
    loadLeads();
  });

  /* ---- Logout ---- */
  document.getElementById("logout-btn").addEventListener("click", function () {
    fetch("/api/admin/logout", { method: "POST" }).finally(function () {
      location.href = "/admin/login/";
    });
  });

  /* ---- Boot ---- */
  api("/api/admin/session").then(function (j) {
    if (!j.authenticated) location.href = "/admin/login/";
  }).catch(function () {});
  fetch("/api/healthz").then(function (r) { return r.json(); }).then(function (j) {
    var badge = document.getElementById("engine-badge");
    if (badge && j.engine) badge.textContent = "db: " + j.engine;
  }).catch(function () {});

  var SERVICE_OPTIONS = ["Website Development", "Landing Page", "AI Automation", "AI Lead Generation",
    "AI Calling Agent", "Social Media Management", "Complete Growth System", "Other"];
  var serviceSel = document.getElementById("service-filter");
  SERVICE_OPTIONS.forEach(function (s) {
    var o = document.createElement("option");
    o.textContent = s; o.value = s;
    serviceSel.appendChild(o);
  });

  loadStats();
  loadLeads();
})();
