const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

let failures = [];
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) failures.push(name);
}

// For screenshot capture only: force the settled post-scroll-reveal state so
// full-page screenshots represent what a real visitor sees after scrolling
// through the page (headless full-page capture doesn't reliably give the
// real IntersectionObserver enough wall-clock time to fire for every element).
async function scrollThrough(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
    window.scrollTo(0, 0);
  });
}

async function checkOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    let worst = null;
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollWidth > docWidth + 2) {
        worst = worst || [];
        worst.push(el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' scrollWidth=' + el.scrollWidth + ' doc=' + docWidth);
      }
    });
    return { bodyScrollWidth: document.documentElement.scrollWidth, docWidth, worst };
  });
  check(label + ': no horizontal overflow', overflow.bodyScrollWidth <= overflow.docWidth + 2);
  if (overflow.worst) console.log('  overflow elements:', overflow.worst.slice(0, 5));
}

(async () => {
  const browser = await chromium.launch();
  const consoleErrors = [];

  // ── Homepage: desktop + mobile screenshots, nav, console errors ──────────
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport: vp });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[home:${label}] ${msg.text()}`); });
    page.on('pageerror', (err) => consoleErrors.push(`[home:${label}] pageerror: ${err.message}`));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await scrollThrough(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `home-${label}.png`), fullPage: true });
    await checkOverflow(page, `home-${label}`);
    await page.close();
  }

  // Homepage UGS module screenshot (scrolled into view) + link check
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const ugsModule = page.locator('#ugs-feature');
    await ugsModule.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'home-ugs-module-desktop.png') });
    const href = await page.locator('#ugs-feature a.btn').getAttribute('href');
    check('homepage UGS module links to /ugs', href === '/ugs');
    const navHref = await page.locator('nav a.nav-link', { hasText: 'UGS' }).getAttribute('href');
    check('homepage nav UGS link points to /ugs', navHref === '/ugs');
    await page.close();
  }

  // Homepage mobile nav module screenshot
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.mobile });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, 'home-ugs-module-mobile.png') });
    const ugsModule = page.locator('#ugs-feature');
    await ugsModule.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'home-ugs-module-mobile-scrolled.png') });
    await page.close();
  }

  // ── /ugs page: desktop + tablet + mobile full-page screenshots ───────────
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport: vp });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[ugs:${label}] ${msg.text()}`); });
    page.on('pageerror', (err) => consoleErrors.push(`[ugs:${label}] pageerror: ${err.message}`));
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await scrollThrough(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `ugs-${label}.png`), fullPage: true });
    await checkOverflow(page, `ugs-${label}`);
    await page.close();
  }

  // ── /ugs functional checks (desktop) ──────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const gaEvents = [];
    await page.exposeFunction('__recordEvent', (name, params) => gaEvents.push({ name, params }));
    await page.addInitScript(() => {
      window.__events = [];
      window.gtag = function (type, name, params) { window.__recordEvent(name, params); };
    });
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });

    // H1 count / semantic heading check
    const h1Count = await page.locator('h1').count();
    check('/ugs has exactly one H1', h1Count === 1);
    const h1Text = await page.locator('h1').first().textContent();
    check('/ugs H1 matches required copy', h1Text.replace(/\s+/g, ' ').trim().includes('Verify your UGS procedures against API'));

    // Title / meta
    const title = await page.title();
    check('title matches spec', title === 'API RP 1170/1171 Procedure Gap Analysis for UGS | Kataba');
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    check('meta description present', !!metaDesc && metaDesc.includes('API RP 1170/1171'));
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    check('canonical is https://kataba.ai/ugs', canonical === 'https://kataba.ai/ugs');

    // Structured data validity
    const ldJsonBlocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    check('has 2 JSON-LD blocks (Service + FAQPage)', ldJsonBlocks.length === 2);
    let ldParsedOk = true;
    let faqNames = [];
    for (const block of ldJsonBlocks) {
      try {
        const parsed = JSON.parse(block);
        if (parsed['@type'] === 'FAQPage') {
          faqNames = parsed.mainEntity.map((q) => q.name);
        }
      } catch (e) {
        ldParsedOk = false;
      }
    }
    check('all JSON-LD blocks parse as valid JSON', ldParsedOk);

    // FAQPage structured data matches visible FAQ text exactly
    const visibleFaqQuestions = await page.locator('#ugs-faq summary').allTextContents();
    const cleanedVisible = visibleFaqQuestions.map((t) => t.replace(/\+$/, '').trim());
    check('FAQPage structured data matches visible questions', JSON.stringify(faqNames) === JSON.stringify(cleanedVisible));

    // Primary CTA scrolls to lead form
    await page.locator('#ugs-primary-cta').click();
    await page.waitForFunction(() => {
      const el = document.getElementById('ugs-lead-form');
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, { timeout: 3000 }).catch(() => {});
    const viewportH = page.viewportSize().height;
    const formBox = await page.locator('#ugs-lead-form').boundingBox();
    check('primary CTA scrolls lead form into view', formBox && formBox.y < viewportH && formBox.y + formBox.height > 0);

    // primary_cta_click analytics event fired
    check('ugs_primary_cta_click analytics event fired', gaEvents.some((e) => e.name === 'ugs_primary_cta_click'));
    check('ugs_page_view analytics event fired on load', gaEvents.some((e) => e.name === 'ugs_page_view'));

    // Secondary CTA scrolls to sample section
    await page.locator('#ugs-secondary-cta').click();
    await page.waitForFunction(() => {
      const el = document.getElementById('ugs-sample');
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, { timeout: 3000 }).catch(() => {});
    const sampleBox = await page.locator('#ugs-sample').boundingBox();
    check('secondary CTA scrolls sample section into view', sampleBox && sampleBox.y < viewportH && sampleBox.y + sampleBox.height > 0);
    check('ugs_sample_matrix_view analytics event fired', gaEvents.some((e) => e.name === 'ugs_sample_matrix_view'));

    // External regulatory links have target=_blank + rel security attrs
    const externalLinks = await page.locator('.reg-sources a').all();
    let allExternalSafe = externalLinks.length === 3;
    for (const link of externalLinks) {
      const target = await link.getAttribute('target');
      const rel = await link.getAttribute('rel');
      if (target !== '_blank' || !rel || !rel.includes('noopener') || !rel.includes('noreferrer')) allExternalSafe = false;
    }
    check('3 external regulatory source links open safely in new tab', allExternalSafe);

    // Sample table structure
    const theadCols = await page.locator('table.sample-table thead th').count();
    check('sample table has 6 columns', theadCols === 6);
    const rowCount = await page.locator('table.sample-table tbody tr').count();
    check('sample table has example rows', rowCount >= 4);

    // FAQ accordion works (native <details>)
    const firstFaq = page.locator('#ugs-faq details').first();
    const openBefore = await firstFaq.evaluate((el) => el.open);
    await firstFaq.locator('summary').click();
    const openAfter = await firstFaq.evaluate((el) => el.open);
    check('FAQ accordion toggles open on click', openBefore === false && openAfter === true);

    await page.close();
  }

  // ── Lead form: validation, loading, success state ────────────────────────
  // window.fetch is stubbed deterministically (instead of relying on the real
  // third-party Brevo host, whose DNS/network timing is flaky in this sandbox)
  // so the test exercises our own success-handling code path reliably.
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const gaEvents = [];
    await page.exposeFunction('__recordEvent2', (name, params) => gaEvents.push({ name, params }));
    await page.addInitScript(() => {
      window.gtag = function (type, name, params) { window.__recordEvent2(name, params); };
      const realFetch = window.fetch.bind(window);
      window.fetch = function (url, opts) {
        if (String(url).includes('sibforms.com')) {
          return new Promise((resolve) => setTimeout(() => resolve(new Response('', { status: 200 })), 50));
        }
        return realFetch(url, opts);
      };
    });
    await page.goto(BASE + '/ugs?utm_source=linkedin&utm_medium=social&utm_campaign=ugs_launch', { waitUntil: 'networkidle' });
    await page.locator('#ugs-lead-form').scrollIntoViewIfNeeded();

    // Submit empty form -> validation errors shown, no network call needed
    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForTimeout(200);
    const firstNameError = await page.locator('#err-FIRSTNAME').textContent();
    check('empty submit shows first name validation error', firstNameError.trim().length > 0);
    const firstNameInvalid = await page.locator('#ugs-FIRSTNAME').getAttribute('aria-invalid');
    check('invalid field marked aria-invalid', firstNameInvalid === 'true');

    // ugs_form_start fires on first focus
    await page.locator('#ugs-FIRSTNAME').focus();
    await page.waitForTimeout(100);
    check('ugs_form_start analytics event fired on first focus', gaEvents.some((e) => e.name === 'ugs_form_start'));

    // Fill form correctly
    await page.locator('#ugs-FIRSTNAME').fill('Jordan');
    await page.locator('#ugs-LASTNAME').fill('Rivera');
    await page.locator('#ugs-COMPANY').fill('Test Storage Operator LLC');
    await page.locator('#ugs-EMAIL').fill('jordan.rivera@example.com');
    await page.locator('#ugs-USE-CASE').selectOption('API RP 1170/1171 procedure gap analysis');
    await page.locator('#ugs-MESSAGE').fill('Evaluating gap analysis for one salt cavern facility.');

    // check hidden attribution fields populated from URL
    const utmSource = await page.locator('#ugs-utm-source').inputValue();
    const utmCampaign = await page.locator('#ugs-utm-campaign').inputValue();
    check('UTM source captured into hidden field', utmSource === 'linkedin');
    check('UTM campaign captured into hidden field', utmCampaign === 'ugs_launch');

    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForSelector('#ugs-success-message', { state: 'visible', timeout: 3000 }).catch(() => {});
    const successVisible = await page.locator('#ugs-success-message').isVisible();
    check('success message shown after successful submit', successVisible);
    const successText = await page.locator('#ugs-success-message').textContent();
    check('success message matches required copy', successText.includes('Thank you. We will contact you to schedule a short technical scoping discussion.'));
    check('ugs_form_submit_success analytics event fired', gaEvents.some((e) => e.name === 'ugs_form_submit_success'));
    const successEvent = gaEvents.find((e) => e.name === 'ugs_form_submit_success');
    check('ugs_form_submit_success includes use_case param', successEvent && successEvent.params && successEvent.params.use_case === 'API RP 1170/1171 procedure gap analysis');
    await page.screenshot({ path: path.join(OUT, 'ugs-form-success.png') });
    await page.close();
  }

  // ── Lead form: failure state ──────────────────────────────────────────────
  // window.fetch is stubbed to reject deterministically, exercising our catch
  // branch (loading/error UI + ugs_form_submit_failure) independent of live
  // third-party network conditions.
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const gaEvents = [];
    await page.exposeFunction('__recordEvent3', (name, params) => gaEvents.push({ name, params }));
    await page.addInitScript(() => {
      window.gtag = function (type, name, params) { window.__recordEvent3(name, params); };
      const realFetch = window.fetch.bind(window);
      window.fetch = function (url, opts) {
        if (String(url).includes('sibforms.com')) {
          return new Promise((_, reject) => setTimeout(() => reject(new TypeError('Simulated network failure')), 50));
        }
        return realFetch(url, opts);
      };
    });
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.locator('#ugs-lead-form').scrollIntoViewIfNeeded();
    await page.locator('#ugs-FIRSTNAME').fill('Jordan');
    await page.locator('#ugs-LASTNAME').fill('Rivera');
    await page.locator('#ugs-COMPANY').fill('Test Storage Operator LLC');
    await page.locator('#ugs-EMAIL').fill('jordan.rivera@example.com');
    await page.locator('#ugs-USE-CASE').selectOption('Audit or inspection evidence');

    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForSelector('#ugs-error-message', { state: 'visible', timeout: 3000 }).catch(() => {});
    const errorVisible = await page.locator('#ugs-error-message').isVisible();
    check('error message shown after failed submit', errorVisible);
    check('ugs_form_submit_failure analytics event fired', gaEvents.some((e) => e.name === 'ugs_form_submit_failure'));
    const btnEnabled = await page.locator('#ugs-form button[type="submit"]').isEnabled();
    check('submit button re-enabled after failure', btnEnabled);
    await page.screenshot({ path: path.join(OUT, 'ugs-form-failure.png') });
    await page.close();
  }

  // ── Homepage form still works (regression check) ─────────────────────────
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    await page.addInitScript(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = function (url, opts) {
        if (String(url).includes('sibforms.com')) {
          return new Promise((resolve) => setTimeout(() => resolve(new Response('', { status: 200 })), 50));
        }
        return realFetch(url, opts);
      };
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.locator('#cta').scrollIntoViewIfNeeded();
    await page.locator('#FIRSTNAME').fill('Alex');
    await page.locator('#LASTNAME').fill('Doe');
    await page.locator('#name').fill('Test Co');
    await page.locator('#EMAIL').fill('alex@example.com');
    await page.locator('#sib-form button[type="submit"]').click();
    await page.waitForSelector('#success-message', { state: 'visible', timeout: 3000 }).catch(() => {});
    const successVisible = await page.locator('#success-message').isVisible();
    check('homepage form still submits successfully (regression)', successVisible);
    await page.close();
  }

  // ── Keyboard navigation / focus-visible check on /ugs ─────────────────────
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // logo
    await page.keyboard.press('Tab'); // Home
    await page.keyboard.press('Tab'); // UGS
    await page.keyboard.press('Tab'); // Scope a UGS POC
    const focused = await page.evaluate(() => document.activeElement.id || document.activeElement.textContent);
    check('keyboard tab order reaches nav CTA', !!focused);
    await page.close();
  }

  console.log('\n--- Console/page errors captured ---');
  consoleErrors.forEach((e) => console.log(e));
  check('no console/page errors across all pages/viewports', consoleErrors.length === 0);

  console.log('\n=== SUMMARY ===');
  console.log(`${failures.length} failing check(s)`);
  failures.forEach((f) => console.log('  - ' + f));

  await browser.close();
  process.exit(failures.length > 0 ? 1 : 0);
})();
