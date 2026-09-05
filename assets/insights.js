/* ────────────────────────────────────────────────────────────────────────
   Kataba Insights — table-of-contents behavior + analytics wiring.
   Small, dependency-free script shared by the article template and the
   Insights index page. No client-side Markdown rendering happens here —
   article HTML is generated at build time by scripts/build_insights.py.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  var track = function (name, params) {
    window.kataba && window.kataba.track && window.kataba.track(name, params || {});
  };

  var body = document.body;
  var slug = body.getAttribute('data-analytics-slug') || '';
  var category = body.getAttribute('data-analytics-category') || '';
  var baseProps = slug ? { article_slug: slug, category: category } : {};

  // ── Page-view events ─────────────────────────────────────────────────
  if (document.querySelector('.insight-article')) {
    track('article_view', baseProps);
  } else if (document.querySelector('.insights-index-list')) {
    track('insights_index_view');
  }

  // ── Mobile: collapse the TOC <details> by default, expanded on desktop ──
  var tocDetails = document.querySelector('.insight-toc-details');
  if (tocDetails) {
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      tocDetails.open = false;
    }
  }

  // ── TOC click tracking ────────────────────────────────────────────────
  document.querySelectorAll('.toc-link').forEach(function (link) {
    link.addEventListener('click', function () {
      track('article_toc_click', Object.assign({}, baseProps, { heading: link.getAttribute('href') || '' }));
    });
  });

  // ── CTA click tracking ────────────────────────────────────────────────
  document.querySelectorAll('[data-analytics-cta]').forEach(function (link) {
    link.addEventListener('click', function () {
      var kind = link.getAttribute('data-analytics-cta');
      if (kind === 'inline') {
        track('article_inline_cta_click', baseProps);
      } else if (kind === 'final-primary' || kind === 'final-secondary') {
        track('article_final_cta_click', Object.assign({}, baseProps, { cta_type: kind }));
      }
    });
  });

  // ── External source-link click tracking ───────────────────────────────
  document.querySelectorAll('.body-link--external').forEach(function (link) {
    link.addEventListener('click', function () {
      track('article_source_link_click', Object.assign({}, baseProps, { href: link.href }));
    });
  });

  // ── Active-section highlighting while scrolling ───────────────────────
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var idToLink = {};
    tocLinks.forEach(function (link) {
      var id = (link.getAttribute('href') || '').replace('#', '');
      if (id) idToLink[id] = link;
    });

    var headings = Object.keys(idToLink)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    var setActive = function (id) {
      tocLinks.forEach(function (l) { l.classList.remove('is-active'); });
      if (idToLink[id]) idToLink[id].classList.add('is-active');
    };

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries
        .filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });

    headings.forEach(function (h) { observer.observe(h); });
  }
})();
