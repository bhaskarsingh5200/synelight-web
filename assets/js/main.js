/* ============================================================
   SYNELIGHT — Interactions
   Vanilla JS · No dependencies
   ============================================================ */
(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header scroll state ---------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile menu ---------- */
  var navToggle = document.querySelector(".nav-toggle");
  var mobileMenu = document.getElementById("mobile-menu");
  if (navToggle && mobileMenu) {
    var closeMenu = function () {
      mobileMenu.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    navToggle.addEventListener("click", function () {
      var open = mobileMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    mobileMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    } else {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
      revealEls.forEach(function (el) { revealObserver.observe(el); });
    }
  }

  /* ---------- Hero ecosystem sequence ---------- */
  var ecosystem = document.querySelector(".ecosystem");
  if (ecosystem) {
    var activate = function () {
      if (ecosystem.classList.contains("is-on")) return;
      ecosystem.classList.add("is-on");
      ecosystem.querySelectorAll(".wire").forEach(function (w, i) {
        w.style.animationDelay = (i * 90) + "ms";
      });
      ecosystem.querySelectorAll(".eco-node").forEach(function (n, i) {
        n.style.transitionDelay = (200 + i * 110) + "ms";
      });
    };
    if (prefersReducedMotion || !("IntersectionObserver" in window)) activate();
    else {
      var ecoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { activate(); ecoObserver.disconnect(); } });
      }, { threshold: 0.3 });
      ecoObserver.observe(ecosystem);
    }
    /* Gentle node cycling */
    var ecoNodes = Array.prototype.slice.call(ecosystem.querySelectorAll(".eco-node"));
    if (!prefersReducedMotion && ecoNodes.length) {
      var cycleIdx = 0;
      setInterval(function () {
        ecoNodes.forEach(function (n) { n.classList.remove("is-active"); });
        ecoNodes[cycleIdx % ecoNodes.length].classList.add("is-active");
        cycleIdx++;
      }, 2400);
    }
  }

  /* ---------- Timelines ---------- */
  document.querySelectorAll(".timeline, .process-detail").forEach(function (tl) {
    if (!("IntersectionObserver" in window)) { tl.classList.add("is-inview"); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { tl.classList.add("is-inview"); obs.disconnect(); }
      });
    }, { threshold: 0.25 });
    obs.observe(tl);
  });

  /* ---------- System map ---------- */
  document.querySelectorAll("[data-sysmap]").forEach(function (map) {
    var stage = map.querySelector(".sysmap-stage");
    var svg = map.querySelector(".sysmap-wires");
    var nodes = Array.prototype.slice.call(map.querySelectorAll(".map-node"));
    var descTitle = map.querySelector(".map-desc-title");
    var descText = map.querySelector(".map-desc-text");
    if (!stage || !svg || !nodes.length) return;

    var ns = "http://www.w3.org/2000/svg";
    var drawn = {};

    nodes.forEach(function (node) {
      var links = (node.getAttribute("data-links") || "").split(/\s+/).filter(Boolean);
      links.forEach(function (targetId) {
        var key = [node.id, targetId].sort().join("|");
        if (drawn[key]) return;
        drawn[key] = true;
        var target = document.getElementById(targetId);
        if (!target) return;
        var line = document.createElementNS(ns, "line");
        line.setAttribute("x1", node.getAttribute("data-x"));
        line.setAttribute("y1", node.getAttribute("data-y"));
        line.setAttribute("x2", target.getAttribute("data-x"));
        line.setAttribute("y2", target.getAttribute("data-y"));
        line.setAttribute("data-a", node.id);
        line.setAttribute("data-b", targetId);
        svg.appendChild(line);
      });
    });

    var defaultTitle = descTitle ? descTitle.textContent : "";
    var defaultText = descText ? descText.textContent : "";

    var clearActive = function () {
      nodes.forEach(function (n) { n.classList.remove("is-active"); });
      svg.querySelectorAll("line").forEach(function (l) { l.classList.remove("is-lit"); });
    };

    var activateNode = function (node) {
      clearActive();
      node.classList.add("is-active");
      var id = node.id;
      svg.querySelectorAll("line").forEach(function (l) {
        if (l.getAttribute("data-a") === id || l.getAttribute("data-b") === id) {
          l.classList.add("is-lit");
        }
      });
      if (descTitle && descText) {
        descTitle.textContent = node.getAttribute("data-title") || node.textContent.trim();
        descText.textContent = node.getAttribute("data-desc") || "";
      }
    };

    var resetMap = function () {
      clearActive();
      if (descTitle && descText) {
        descTitle.textContent = defaultTitle;
        descText.textContent = defaultText;
      }
    };

    nodes.forEach(function (node) {
      node.setAttribute("tabindex", "0");
      node.addEventListener("mouseenter", function () { activateNode(node); });
      node.addEventListener("focus", function () { activateNode(node); });
      node.addEventListener("click", function () { activateNode(node); });
      node.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activateNode(node); }
      });
    });
    map.addEventListener("mouseleave", resetMap);
  });

  /* ---------- Simulated workflow demos ---------- */
  document.querySelectorAll("[data-demo]").forEach(function (demo) {
    var runBtn = demo.querySelector("[data-demo-run]");
    var resetBtn = demo.querySelector("[data-demo-reset]");
    var steps = Array.prototype.slice.call(demo.querySelectorAll(".demo-step"));
    var status = demo.querySelector(".demo-status");
    var timer = null;

    var reset = function () {
      if (timer) { clearTimeout(timer); timer = null; }
      steps.forEach(function (s) { s.classList.remove("is-active", "is-done"); });
      if (status) status.innerHTML = status.getAttribute("data-idle") || "Ready.";
    };

    var run = function () {
      reset();
      var i = 0;
      var stepDelay = prefersReducedMotion ? 60 : 850;
      var advance = function () {
        if (i > 0) steps[i - 1].classList.replace("is-active", "is-done");
        if (i >= steps.length) {
          if (status) status.innerHTML = status.getAttribute("data-done") || "Complete.";
          timer = null;
          return;
        }
        var step = steps[i];
        step.classList.add("is-active");
        if (status) status.innerHTML = step.getAttribute("data-status") || ("Processing <b>" + step.querySelector(".demo-step-box").textContent.trim() + "</b>…");
        i++;
        timer = setTimeout(advance, stepDelay);
      };
      advance();
    };

    if (runBtn) runBtn.addEventListener("click", run);
    if (resetBtn) resetBtn.addEventListener("click", reset);
  });

  /* ---------- Accordions (one open at a time) ---------- */
  document.querySelectorAll("[data-accordion]").forEach(function (group) {
    var items = Array.prototype.slice.call(group.querySelectorAll(".faq-item"));
    items.forEach(function (item) {
      var btn = item.querySelector(".faq-q");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");
        items.forEach(function (other) {
          other.classList.remove("is-open");
          var b = other.querySelector(".faq-q");
          if (b) b.setAttribute("aria-expanded", "false");
        });
        if (!isOpen) {
          item.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
  });

  /* ---------- FAQ search + category filter ---------- */
  var faqSearch = document.getElementById("faq-search");
  var faqGroups = document.querySelectorAll("[data-faq-catalog]");
  if (faqSearch && faqGroups.length) {
    var catBtns = document.querySelectorAll(".faq-cat-btn");
    var activeCat = "all";
    var applyFaqFilters = function () {
      var q = faqSearch.value.trim().toLowerCase();
      var totalVisible = 0;
      faqGroups.forEach(function (group) {
        var groupMatchesCat = activeCat === "all" || group.getAttribute("data-faq-catalog") === activeCat;
        var groupVisibleCount = 0;
        group.querySelectorAll(".faq-item").forEach(function (item) {
          var matchesQ = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
          var show = groupMatchesCat && matchesQ;
          item.style.display = show ? "" : "none";
          if (show) groupVisibleCount++;
        });
        group.style.display = groupVisibleCount ? "" : "none";
        totalVisible += groupVisibleCount;
      });
      var emptyMsg = document.getElementById("faq-empty");
      if (emptyMsg) emptyMsg.style.display = totalVisible ? "none" : "";
    };
    faqSearch.addEventListener("input", applyFaqFilters);
    catBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        catBtns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        activeCat = btn.getAttribute("data-cat") || "all";
        applyFaqFilters();
      });
    });
  }

  /* ---------- Work filters ---------- */
  var filterBar = document.querySelector(".filter-bar");
  if (filterBar) {
    var wBtns = filterBar.querySelectorAll(".filter-btn");
    var cards = document.querySelectorAll("[data-work-card]");
    wBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        wBtns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        var f = btn.getAttribute("data-filter") || "all";
        cards.forEach(function (card) {
          var cats = (card.getAttribute("data-work-card") || "").split(/\s+/);
          card.classList.toggle("work-hidden", f !== "all" && cats.indexOf(f) === -1);
        });
      });
    });
  }

  /* ---------- Lead capture state (UTM / source / service preselect) ---------- */
  var LEAD = { utm: {}, source: "direct", serviceSlug: "", started: false, submitted: false };
  try {
    var params = new URLSearchParams(window.location.search);
    var u = {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || ""
    };
    if (u.utm_source || u.utm_medium || u.utm_campaign) {
      sessionStorage.setItem("sl_utm", JSON.stringify(u));
    }
    LEAD.utm = JSON.parse(sessionStorage.getItem("sl_utm") || "{}");
  } catch (e) { LEAD.utm = {}; }

  (function deriveSource() {
    var s = (LEAD.utm.utm_source || "").toLowerCase();
    if (!s) {
      try {
        var ref = document.referrer ? new URL(document.referrer).hostname : "";
        if (/instagram/.test(ref)) s = "instagram";
        else if (/linkedin/.test(ref)) s = "linkedin";
        else if (/google|bing|duckduckgo/.test(ref)) s = "google";
        else if (ref && ref !== window.location.hostname) s = "referral";
        else s = document.referrer ? "referral" : "direct";
      } catch (e) { s = "direct"; }
    }
    if (["website", "instagram", "linkedin", "google", "referral", "direct"].indexOf(s) === -1) s = "other";
    LEAD.source = s;
  })();

  var SERVICE_SLUGS = {
    "website-development": "Website Development",
    "landing-page": "Landing Page",
    "ai-automation": "AI Automation",
    "ai-lead-generation": "AI Lead Generation",
    "ai-calling-agent": "AI Calling Agent",
    "social-media": "Social Media Management",
    "complete-growth-system": "Complete Growth System",
    "other": "Other"
  };
  try {
    var svcParam = new URLSearchParams(window.location.search).get("service");
    if (svcParam && SERVICE_SLUGS[svcParam]) LEAD.serviceSlug = svcParam;
  } catch (e) {}

  /* ---------- Forms (connected to POST /api/leads) ---------- */
  document.querySelectorAll("form[data-synelight-form]").forEach(function (form) {
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var phoneRe = /^\+?[0-9\s().-]{7,20}$/;
    var renderedAt = Date.now();
    var submitBtn = form.querySelector("button[type=submit]");
    var btnLabelHTML = submitBtn ? submitBtn.innerHTML : "";

    /* Funnel: project_form_start — first interaction inside the form */
    var markStarted = function () {
      if (LEAD.started) return;
      LEAD.started = true;
      SL.track("project_form_start");
    };
    form.querySelectorAll("input, select, textarea").forEach(function (f) {
      f.addEventListener("focus", markStarted);
      f.addEventListener("change", markStarted);
    });

    var setError = function (field, msg) {
      var wrap = field.closest(".field");
      if (!wrap) return;
      wrap.classList.toggle("has-error", Boolean(msg));
      var err = wrap.querySelector(".field-error");
      if (err) err.textContent = msg || "";
      field.setAttribute("aria-invalid", msg ? "true" : "false");
    };

    var validateField = function (field) {
      var v = field.value.trim();
      if (field.hasAttribute("required") && !v) {
        setError(field, "This field is required.");
        return false;
      }
      if (field.type === "email" && v && !emailRe.test(v)) {
        setError(field, "Please enter a valid email address.");
        return false;
      }
      if (field.type === "tel" && v && !phoneRe.test(v)) {
        setError(field, "Please enter a valid phone number.");
        return false;
      }
      if (field.name === "description" && v && v.length < 20) {
        setError(field, "Please describe your project in at least 20 characters.");
        return false;
      }
      setError(field, "");
      return true;
    };

    form.querySelectorAll("input[required], select[required], textarea[required], input[type='email'], input[type='tel']").forEach(function (f) {
      f.addEventListener("blur", function () { validateField(f); });
      f.addEventListener("input", function () {
        if (f.closest(".field").classList.contains("has-error")) validateField(f);
      });
    });

    var setButtonLoading = function (loading) {
      if (!submitBtn) return;
      submitBtn.disabled = loading;
      submitBtn.setAttribute("aria-busy", String(loading));
      if (loading) {
        submitBtn.innerHTML = "SUBMITTING...";
      } else {
        submitBtn.innerHTML = btnLabelHTML;
      }
    };

    var showFormError = function () {
      var box = document.getElementById("form-error");
      if (!box) return;
      box.hidden = false;
      box.setAttribute("tabindex", "-1");
      box.focus({ preventScroll: false });
      box.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    };

    var hideFormError = function () {
      var box = document.getElementById("form-error");
      if (box) box.hidden = true;
    };

    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-try-again]")) {
        hideFormError();
        var first = form.querySelector("input[required], select[required], textarea[required]");
        if (first) first.focus();
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      /* Honeypot — silently accept if a bot filled it */
      var hp = form.querySelector(".hp-field input");
      if (hp && hp.value) { form.reset(); return; }

      var valid = true;
      var firstInvalid = null;
      form.querySelectorAll("input[required], select[required], textarea[required]").forEach(function (f) {
        var ok = validateField(f);
        if (!ok && valid) { valid = false; firstInvalid = f; }
      });
      form.querySelectorAll("input[type='tel'], input[name='description']").forEach(function (f) {
        if (!validateField(f) && valid) { valid = false; firstInvalid = f; }
      });
      if (!valid) {
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      /* Build payload */
      var payload = {};
      form.querySelectorAll("input[name], select[name], textarea[name]").forEach(function (f) {
        if (f.type === "checkbox") {
          if (f.checked) { payload[f.name] = payload[f.name] || []; payload[f.name].push(f.value); }
        } else if (f.name) {
          payload[f.name] = f.value.trim();
        }
      });
      payload.source = LEAD.source;
      payload.utm_source = LEAD.utm.utm_source || "";
      payload.utm_medium = LEAD.utm.utm_medium || "";
      payload.utm_campaign = LEAD.utm.utm_campaign || "";
      payload.referer = document.referrer || "";
      payload.renderedAt = renderedAt;

      SL.track("project_form_submit_attempt");

      /* Optional external hook overrides the built-in endpoint */
      if (typeof window.SYNELIGHT_SUBMIT === "function") {
        setButtonLoading(true);
        Promise.resolve(window.SYNELIGHT_SUBMIT(payload))
          .then(onSuccess)
          .catch(onFailure);
        return;
      }

      setButtonLoading(true);
      hideFormError();

      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (j) { return { ok: res.ok, j: j }; });
      }).then(function (r) {
        if (r.ok && r.j && r.j.success) { onSuccess(); return; }
        if (r.j && r.j.errors) {
          Object.keys(r.j.errors).forEach(function (name) {
            var f = form.querySelector("[name='" + name + "']");
            if (f) setError(f, r.j.errors[name]);
          });
        }
        onFailure();
      }).catch(onFailure);

      function onSuccess() {
        setButtonLoading(false);
        LEAD.submitted = true;
        SL.track("project_form_submit");
        SL.track("project_form_success");
        SL.track("lead_generated", { service: payload.serviceNeeded || "" });
        form.reset();
        var successEl = document.getElementById(form.getAttribute("data-success-id") || "form-success");
        if (successEl) {
          form.style.display = "none";
          successEl.classList.add("is-visible");
          successEl.setAttribute("tabindex", "-1");
          successEl.focus({ preventScroll: false });
          successEl.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
        }
      }
      function onFailure() {
        setButtonLoading(false);
        SL.track("project_form_error");
        showFormError();
      }
    });

    /* project_form_abandon — left without submitting after starting */
    window.addEventListener("pagehide", function () {
      if (LEAD.started && !LEAD.submitted) SL.track("project_form_abandon");
    }, { once: true });

    /* Preselect service from /contact?service=<slug> */
    if (LEAD.serviceSlug) {
      var sel = form.querySelector("select[name='serviceNeeded']");
      if (sel) sel.value = SERVICE_SLUGS[LEAD.serviceSlug];
    }
  });

  /* ============================================================
     SYNELIGHT integrations — config, tracking, WhatsApp, booking
     Public values are served by /api/site-config (no secrets here).
     ============================================================ */
  var SL = window.SYNELIGHT = {
    config: {},
    track: function (name, params) {
      try {
        if (typeof window.gtag === "function") {
          var p = params ? JSON.parse(JSON.stringify(params)) : {};
          p.page_path = window.location.pathname;
          if (LEAD.utm.utm_source) p.utm_source = LEAD.utm.utm_source;
          if (LEAD.utm.utm_campaign) p.utm_campaign = LEAD.utm.utm_campaign;
          window.gtag("event", name, p);
        }
      } catch (e) {}
    }
  };

  var CONSENT_KEY = "sl_consent";

  function consentGranted() {
    try { return localStorage.getItem(CONSENT_KEY) === "granted"; } catch (e) { return false; }
  }

  function loadGA4() {
    if (!SL.config.ga4Id || document.getElementById("ga4-script")) return;
    var s = document.createElement("script");
    s.id = "ga4-script";
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(SL.config.ga4Id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    /* page_view fires automatically with send_page_view default */
    window.gtag("config", SL.config.ga4Id);
  }

  function showConsentBanner() {
    if (!SL.config.ga4Id || consentGranted()) return;
    var decided = null;
    try { decided = localStorage.getItem(CONSENT_KEY); } catch (e) {}
    if (decided === "denied" || document.getElementById("sl-consent")) return;

    var bar = document.createElement("div");
    bar.id = "sl-consent";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie consent");
    bar.innerHTML =
      '<p>We use optional analytics cookies to understand how the site is used. No ad networks.</p>' +
      '<div class="sl-consent-actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-consent="denied">Decline</button>' +
      '<button type="button" class="btn btn--primary btn--sm" data-consent="granted">Accept</button>' +
      "</div>";
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("is-visible"); });
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-consent]");
      if (!btn) return;
      try { localStorage.setItem(CONSENT_KEY, btn.getAttribute("data-consent")); } catch (err) {}
      bar.classList.remove("is-visible");
      setTimeout(function () { bar.remove(); }, 300);
      if (btn.getAttribute("data-consent") === "granted") loadGA4();
    });
  }

  function waLink(messageKey) {
    var num = SL.config.whatsappNumber;
    var messages = {
      website: "Hi SYNELIGHT, I'm interested in website development.",
      automation: "Hi SYNELIGHT, I'm interested in AI automation for my business.",
      leadgen: "Hi SYNELIGHT, I'm interested in AI lead generation.",
      calling: "Hi SYNELIGHT, I'm interested in an AI calling agent.",
      social: "Hi SYNELIGHT, I'm interested in social media management.",
      growth: "Hi SYNELIGHT, I'm interested in a complete digital growth system.",
      general: "Hi SYNELIGHT, I'd like to discuss a project."
    };
    var msg = messages[messageKey] || messages.general;
    if (!num) return "";
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
  }

  function showToast(text) {
    var t = document.createElement("div");
    t.className = "sl-toast";
    t.setAttribute("role", "status");
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-visible"); });
    setTimeout(function () {
      t.classList.remove("is-visible");
      setTimeout(function () { t.remove(); }, 350);
    }, 4200);
  }

  function initWhatsApp() {
    document.querySelectorAll("a[data-wa]").forEach(function (a) {
      var key = a.getAttribute("data-wa") || "general";
      var href = waLink(key);
      a.setAttribute("data-wa-service", key);
      if (href) {
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener";
      } else {
        /* Not configured yet — professional placeholder behavior */
        a.addEventListener("click", function (e) {
          e.preventDefault();
          showToast("WhatsApp will be connected shortly — meanwhile, the project form reaches us directly.");
        });
      }
    });
  }

  function initBooking() {
    document.querySelectorAll("a[data-book]").forEach(function (a) {
      if (SL.config.bookingUrl) {
        a.href = SL.config.bookingUrl;
        a.target = "_blank";
        a.rel = "noopener";
      }
      /* Without a configured scheduling system the link keeps pointing at
         /contact so visitors always have a working next step. */
    });
  }

  /* ---------- Global click tracking ---------- */
  document.addEventListener("click", function (e) {
    var wa = e.target.closest("a[data-wa]");
    if (wa) {
      SL.track("whatsapp_click", { service: wa.getAttribute("data-wa-service") || "", source: LEAD.source });
      SL.track("whatsapp_lead", { service: wa.getAttribute("data-wa-service") || "" });
      return;
    }
    var book = e.target.closest("a[data-book]");
    if (book) {
      SL.track("book_call_click", {});
      if (SL.config.bookingUrl && book.hostname && book.hostname !== window.location.hostname) {
        SL.track("call_booking", {});
      }
      return;
    }
    var cta = e.target.closest(".btn, .link-arrow");
    if (cta) {
      SL.track("cta_click", { label: (cta.textContent || "").trim().slice(0, 60) });
    }
  }, true);

  /* ---------- Page-type events ---------- */
  var pageType = document.body.getAttribute("data-page") || "";
  if (/^solution-/.test(pageType)) {
    SL.track("service_view", { service: pageType.replace("solution-", "") });
  } else if (pageType === "case-study") {
    SL.track("case_study_view", {});
  }

  var projectFormSection = document.getElementById("project-form");
  if (projectFormSection && "IntersectionObserver" in window) {
    var seen = false;
    var fo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seen) {
          seen = true;
          SL.track("project_form_view");
          fo.disconnect();
        }
      });
    }, { threshold: 0.2 });
    fo.observe(projectFormSection);
  }

  /* ---------- Boot integrations ---------- */
  fetch("/api/site-config")
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      SL.config = cfg || {};
      initWhatsApp();
      initBooking();
      if (consentGranted()) loadGA4();
      else showConsentBanner();
    })
    .catch(function () {
      initWhatsApp();
      initBooking();
    });

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
