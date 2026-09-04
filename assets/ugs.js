/* ────────────────────────────────────────────────────────────────────────
   /ugs page behavior: analytics events, attribution capture, and the
   UGS lead form's validation / loading / success / failure states.
   Depends on assets/site.js (window.kataba.track / getAttribution).
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  var track = function (name, params) {
    if (window.kataba && typeof window.kataba.track === 'function') {
      window.kataba.track(name, params);
    }
  };
  var attribution = (window.kataba && window.kataba.getAttribution)
    ? window.kataba.getAttribution()
    : { utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '', referrer: '' };

  // ── ugs_page_view (include UTM campaign values, no PII) ──────────────────
  track('ugs_page_view', {
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign
  });

  // ── Primary CTA clicks (hero, POC section, nav) ───────────────────────────
  ['ugs-primary-cta', 'ugs-poc-cta', 'nav-ugs-cta'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', function () {
        track('ugs_primary_cta_click', { cta_location: id });
      });
    }
  });

  var secondaryCta = document.getElementById('ugs-secondary-cta');
  if (secondaryCta) {
    secondaryCta.addEventListener('click', function () {
      track('ugs_secondary_cta_click', { cta_location: 'hero' });
    });
  }

  // ── ugs_sample_matrix_view — fire once when the sample table scrolls into view ──
  var sampleSection = document.getElementById('ugs-sample');
  if (sampleSection && 'IntersectionObserver' in window) {
    var sampleObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          track('ugs_sample_matrix_view');
          sampleObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    sampleObserver.observe(sampleSection);
  }

  // ── Populate hidden attribution fields on the lead form ──────────────────
  var setValue = function (id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  setValue('ugs-utm-source', attribution.utm_source);
  setValue('ugs-utm-medium', attribution.utm_medium);
  setValue('ugs-utm-campaign', attribution.utm_campaign);
  setValue('ugs-utm-term', attribution.utm_term);
  setValue('ugs-utm-content', attribution.utm_content);
  setValue('ugs-referrer', attribution.referrer);

  // ── Lead form: validation, loading, success, failure states ──────────────
  var form = document.getElementById('ugs-form');
  if (!form) return;

  var submitBtn   = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn ? submitBtn.querySelector('.ugs-submit-label') : null;
  var successMsg  = document.getElementById('ugs-success-message');
  var errorMsg    = document.getElementById('ugs-error-message');
  var container   = document.getElementById('ugs-sib-container');

  var fieldErrors = {
    FIRSTNAME: 'Please enter your first name.',
    LASTNAME: 'Please enter your last name.',
    COMPANY: 'Please enter your company.',
    EMAIL: 'Please enter a valid work email.',
    'USE-CASE': 'Please select a primary use case.'
  };

  var hasStartedForm = false;
  form.addEventListener('focusin', function () {
    if (!hasStartedForm) {
      hasStartedForm = true;
      track('ugs_form_start');
    }
  });

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function fieldKeyFor(input) {
    // ids look like "ugs-FIRSTNAME" / "ugs-USE-CASE" — strip the "ugs-" prefix.
    return input.id.replace(/^ugs-/, '');
  }

  function showFieldError(input, message) {
    input.setAttribute('aria-invalid', 'true');
    var key = fieldKeyFor(input);
    var errEl = document.getElementById('err-' + key);
    if (errEl) errEl.textContent = message;
  }

  function clearFieldError(input) {
    input.removeAttribute('aria-invalid');
    var key = fieldKeyFor(input);
    var errEl = document.getElementById('err-' + key);
    if (errEl) errEl.textContent = '';
  }

  function validateField(input) {
    var key = fieldKeyFor(input);
    var value = input.value.trim();
    if (!value) {
      showFieldError(input, fieldErrors[key] || 'This field is required.');
      return false;
    }
    if (input.type === 'email' && !emailPattern.test(value)) {
      showFieldError(input, 'Please enter a valid work email.');
      return false;
    }
    clearFieldError(input);
    return true;
  }

  form.querySelectorAll('[data-required="true"]').forEach(function (input) {
    input.addEventListener('blur', function () { validateField(input); });
    input.addEventListener('input', function () { if (input.getAttribute('aria-invalid')) validateField(input); });
    input.addEventListener('change', function () { if (input.getAttribute('aria-invalid')) validateField(input); });
  });

  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('is-loading', isLoading);
    if (submitLabel) submitLabel.textContent = isLoading ? 'Sending…' : 'Request a Technical Scoping Call';
  }

  function hideMessages() {
    if (successMsg) { successMsg.style.display = 'none'; successMsg.setAttribute('aria-hidden', 'true'); }
    if (errorMsg) { errorMsg.style.display = 'none'; errorMsg.setAttribute('aria-hidden', 'true'); }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideMessages();

    var requiredFields = Array.prototype.slice.call(form.querySelectorAll('[data-required="true"]'));
    var allValid = true;
    var firstInvalid = null;
    requiredFields.forEach(function (input) {
      var ok = validateField(input);
      if (!ok) {
        allValid = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });

    if (!allValid) {
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    var useCaseEl = document.getElementById('ugs-USE-CASE');
    var selectedUseCase = useCaseEl ? useCaseEl.value : '';

    setLoading(true);

    // Reuses the same "POST as form data, no-cors, to the Brevo embed endpoint"
    // pattern as the homepage lead form (see index.html #cta) so behavior and
    // reliability stay consistent across the site. [VERIFY WITH VLAD]: confirm
    // the destination list/form for UGS submissions and that the custom
    // attributes (USE_CASE, LEAD_SOURCE, PROJECT_DESCRIPTION, UTM_*,
    // REFERRER_URL) exist in Brevo so this data is actually captured — see the
    // delivery report for details.
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      mode: 'no-cors'
    }).then(function () {
      setLoading(false);
      form.reset();
      if (container) container.style.display = 'none';
      if (successMsg) { successMsg.style.display = 'block'; successMsg.setAttribute('aria-hidden', 'false'); }
      track('ugs_form_submit_success', {
        use_case: selectedUseCase,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign
      });
    }).catch(function () {
      setLoading(false);
      if (errorMsg) { errorMsg.style.display = 'block'; errorMsg.setAttribute('aria-hidden', 'false'); }
      track('ugs_form_submit_failure', { use_case: selectedUseCase });
    });
  });
})();
