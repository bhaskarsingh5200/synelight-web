/* SYNELIGHT Admin — blog (post/story) management.
   Vanilla JS. All server data rendered as TEXT via esc() — no HTML injection. */
"use strict";
(function () {
  var listEl = document.getElementById("blog-list");
  var editor = document.getElementById("blog-editor");
  var msg = document.getElementById("blog-msg");
  var editingId = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    if (!iso) return "not published";
    var d = new Date(iso);
    return isNaN(d) ? "not published" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function api(url, options) {
    return fetch(url, options).then(function (r) {
      if (r.status === 401) { location.href = "/admin/login/"; throw new Error("unauthenticated"); }
      return r.json().then(function (j) {
        if (!j.success) throw new Error(j.message || "Request failed.");
        return j;
      });
    });
  }

  function renderList(posts) {
    document.getElementById("blog-count").textContent = posts.length ? "(" + posts.length + ")" : "";
    if (!posts.length) {
      listEl.innerHTML = '<p class="blog-empty">No posts yet — create your first one.</p>';
      return;
    }
    listEl.innerHTML = posts.map(function (p) {
      var view = p.status === "published"
        ? '<a class="btn-admin btn-admin--ghost btn-admin--sm" href="/blog/' + encodeURIComponent(p.slug) + '/" target="_blank" rel="noopener">View</a>'
        : "";
      return '<article class="blog-row" data-id="' + esc(p.id) + '">' +
        '<div class="blog-row-main">' +
        "<h3>" + esc(p.title) + "</h3>" +
        '<p class="blog-row-meta"><span class="status-pill s-' + esc(p.status) + '">' + esc(p.status) + "</span>" +
        "<span>" + esc(p.category) + "</span>" +
        "<span>" + fmtDate(p.date) + "</span>" +
        "<span>" + p.reading_minutes + " min read</span></p>" +
        "</div>" +
        '<div class="blog-row-actions">' + view +
        '<button class="btn-admin btn-admin--ghost btn-admin--sm" type="button" data-edit="' + esc(p.id) + '">Edit</button>' +
        "</div></article>";
    }).join("");
  }

  function load() {
    api("/api/admin/blog").then(function (j) {
      renderList(j.posts || []);
    }).catch(function () {
      listEl.innerHTML = '<p class="blog-empty">Failed to load posts.</p>';
    });
  }

  function openEditor(post) {
    editingId = post ? post.id : null;
    document.getElementById("b-title").value = post ? post.title : "";
    document.getElementById("b-category").value = post ? post.category : "Insights";
    document.getElementById("b-slug").value = post ? post.slug : "";
    document.getElementById("b-status").value = post ? post.status : "draft";
    document.getElementById("b-excerpt").value = post ? post.excerpt : "";
    document.getElementById("b-body").value = post ? post.body : "";
    document.getElementById("delete-post-btn").hidden = !post;
    var viewBtn = document.getElementById("view-post-btn");
    viewBtn.hidden = !(post && post.status === "published");
    if (post && post.status === "published") {
      viewBtn.href = "/blog/" + encodeURIComponent(post.slug) + "/";
    }
    msg.textContent = "";
    msg.classList.remove("err");
    editor.hidden = false;
    if (window.innerWidth < 680) editor.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("b-title").focus();
  }

  function save() {
    var payload = {
      title: document.getElementById("b-title").value,
      category: document.getElementById("b-category").value,
      slug: document.getElementById("b-slug").value,
      status: document.getElementById("b-status").value,
      excerpt: document.getElementById("b-excerpt").value,
      body: document.getElementById("b-body").value
    };
    if (!payload.title.trim()) { msg.textContent = "Title is required."; msg.classList.add("err"); return; }
    var url = editingId ? "/api/admin/blog/" + encodeURIComponent(editingId) : "/api/admin/blog";
    var method = editingId ? "PATCH" : "POST";
    api(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (j) {
      msg.classList.remove("err");
      msg.textContent = "Saved.";
      editingId = j.post.id;
      var viewBtn = document.getElementById("view-post-btn");
      viewBtn.hidden = !(j.post.status === "published");
      if (j.post.status === "published") viewBtn.href = "/blog/" + encodeURIComponent(j.post.slug) + "/";
      document.getElementById("delete-post-btn").hidden = false;
      load();
      setTimeout(function () { msg.textContent = ""; }, 2500);
    }).catch(function (e) {
      msg.classList.add("err");
      msg.textContent = (e && e.message) || "Save failed.";
    });
  }

  document.getElementById("new-post-btn").addEventListener("click", function () { openEditor(null); });

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-edit]");
    if (!btn) return;
    var id = btn.getAttribute("data-edit");
    var btnEl = btn;
    btnEl.disabled = true;
    api("/api/admin/blog/" + encodeURIComponent(id)).then(function (j) {
      openEditor(j.post);
    }).catch(function () {}).finally(function () { btnEl.disabled = false; });
  });

  document.getElementById("save-post-btn").addEventListener("click", save);
  document.getElementById("cancel-post-btn").addEventListener("click", function () {
    editor.hidden = true;
    editingId = null;
  });

  document.getElementById("delete-post-btn").addEventListener("click", function () {
    if (!editingId) return;
    if (!window.confirm("Delete this post permanently?")) return;
    api("/api/admin/blog/" + encodeURIComponent(editingId), { method: "DELETE" }).then(function () {
      editor.hidden = true;
      editingId = null;
      load();
    }).catch(function () {
      msg.classList.add("err");
      msg.textContent = "Delete failed.";
    });
  });

  document.getElementById("logout-btn").addEventListener("click", function () {
    fetch("/api/admin/logout", { method: "POST" }).finally(function () {
      location.href = "/admin/login/";
    });
  });

  api("/api/admin/session").then(function (j) {
    if (!j.authenticated) location.href = "/admin/login/";
  }).catch(function () {});

  load();
})();