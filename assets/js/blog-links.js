/* SYNELIGHT — render related blog links into [data-related-category] sections */
(function () {
  var wrappers = Array.prototype.slice.call(document.querySelectorAll("[data-related-category]"));
  if (!wrappers.length) return;
  fetch("/api/blog").then(function (r) { return r.json(); }).then(function (d) {
    var posts = d.posts || [];
    if (!posts.length) return;
    wrappers.forEach(function (w) {
      var cat = (w.getAttribute("data-related-category") || "").trim();
      var grid = w.querySelector("[data-related-grid]");
      var label = w.querySelector("[data-related-label]");
      if (!grid) return;
      var group = cat ? posts.filter(function (p) { return (p.category || "").toLowerCase() === cat.toLowerCase(); }) : [];
      var rest = posts.filter(function (p) { return group.indexOf(p) !== -1 ? false : true; });
      var picks = group.concat(rest).slice(0, 3);
      if (!picks.length) { grid.innerHTML = ""; return; }
      if (label && cat) label.textContent = cat;
      grid.innerHTML = picks.map(function (p) {
        return '<a class="card" href="/blog/' + encodeURIComponent(p.slug) + '/" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;">'
          + '<span class="card-index">' + (p.category || "Insights").toUpperCase() + '</span>'
          + '<h3 style="font-size:clamp(18px,1.3vw,22px);margin:0 0 10px;">' + p.title + '</h3>'
          + '<p style="font-size:14px;line-height:1.65;flex:1;">' + p.excerpt + '</p>'
          + '<span class="link-arrow" style="margin-top:auto;">Read article <span class="arr" aria-hidden="true">→</span></span>'
          + '</a>';
      }).join("");
    });
  }).catch(function () {});
})();