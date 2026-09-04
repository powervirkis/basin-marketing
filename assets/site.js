/* ────────────────────────────────────────────────────────────────────────
   Kataba shared site script
   - Reveal-on-scroll animation
   - Analytics shim (routes to whatever analytics tool is already installed:
     gtag/GA4, GTM dataLayer, or Plausible. No new vendor is introduced here;
     if none of those are present, events are dropped after an optional
     console.debug on localhost.)
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  document.documentElement.classList.add('js-ready');

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

  document.querySelectorAll('.reveal').forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 0.07 + 's';
    observer.observe(el);
  });

  window.kataba = window.kataba || {};

  /**
   * Fire an analytics event through whichever analytics tool is already
   * present on the page. Never send document/form content — only
   * short, enumerable event names and non-sensitive parameters.
   */
  window.kataba.track = function track(eventName, params) {
    params = params || {};
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
      } else if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push(Object.assign({ event: eventName }, params));
      } else if (typeof window.plausible === 'function') {
        window.plausible(eventName, { props: params });
      } else if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
        // eslint-disable-next-line no-console
        console.debug('[kataba:analytics]', eventName, params);
      }
    } catch (err) {
      /* Analytics must never break the page. */
    }
  };

  /** Read a limited allow-list of UTM params + referrer for lead-source attribution. */
  window.kataba.getAttribution = function getAttribution() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term: params.get('utm_term') || '',
      utm_content: params.get('utm_content') || '',
      referrer: document.referrer || ''
    };
  };
})();
