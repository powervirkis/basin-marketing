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

  // ── Insights index: screenshots, draft exclusion, empty state ────────────
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport: vp });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[insights-index:${label}] ${msg.text()}`); });
    page.on('pageerror', (err) => consoleErrors.push(`[insights-index:${label}] pageerror: ${err.message}`));
    await page.goto(BASE + '/insights', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `insights-index-${label}.png`), fullPage: true });
    await checkOverflow(page, `insights-index-${label}`);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const events = [];
    await page.exposeFunction('__recordInsightsIndex', (name, params) => events.push({ name, params }));
    await page.addInitScript(() => {
      window.gtag = function (type, name, params) { window.__recordInsightsIndex(name, params); };
    });
    await page.goto(BASE + '/insights', { waitUntil: 'networkidle' });
    const title = await page.title();
    check('/insights title is "Technical Insights | Kataba"', title === 'Technical Insights | Kataba');
    const h1Text = await page.locator('h1').textContent();
    check('/insights H1 is "Technical Insights"', h1Text.trim() === 'Technical Insights');
    check('insights_index_view analytics event fired', events.some((e) => e.name === 'insights_index_view'));
    // The gap-analysis article is published (draft: false), so it must
    // appear as a public card on the index and the empty state must be gone.
    const publishedCardLink = await page.locator('a[href="/insights/api-rp-1170-1171-procedure-gap-analysis"]').count();
    check('published article appears on the public Insights index', publishedCardLink >= 1);
    const emptyState = await page.locator('.insights-index-empty').count();
    check('empty-state message is not shown once an article is published', emptyState === 0);
    await page.close();
  }

  // ── Homepage / /ugs must link to the now-published article ───────────────
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const homeLinksToArticle = await page.locator('#ugs-feature a[href="/insights/api-rp-1170-1171-procedure-gap-analysis"]').count();
    check('homepage "Latest insight" card links to the published article', homeLinksToArticle >= 1);
    const homeInsightsFooterLink = await page.locator('footer a[href="/insights"]').count();
    check('homepage footer links to /insights', homeInsightsFooterLink === 1);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    const ugsLinksToArticle = await page.locator('#ugs-related-insight a[href="/insights/api-rp-1170-1171-procedure-gap-analysis"]').count();
    check('/ugs "Related insight" card links to the published article', ugsLinksToArticle >= 1);
    const ugsInsightsFooterLink = await page.locator('footer a[href="/insights"]').count();
    check('/ugs footer links to /insights', ugsInsightsFooterLink === 1);
    // #poc and #cta anchors must exist for the article's CTAs to land on.
    const pocAnchor = await page.locator('#poc').count();
    const ctaAnchor = await page.locator('#cta').count();
    check('/ugs has a #poc anchor', pocAnchor === 1);
    check('/ugs has a #cta anchor', ctaAnchor === 1);
    await page.close();
  }

  // ── Sitemap includes the now-published article ───────────────────────────
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const res = await page.goto(BASE + '/sitemap.xml', { waitUntil: 'networkidle' });
    const body = await res.text();
    check('sitemap.xml includes /insights', body.includes('https://kataba.ai/insights</loc>'));
    check('sitemap.xml includes the published article', body.includes('api-rp-1170-1171-procedure-gap-analysis'));
    await page.close();
  }

  // ── Article page ───────────────────────────────────────────────────────────
  const ARTICLE_PATH = '/insights/api-rp-1170-1171-procedure-gap-analysis';
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport: vp });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[article:${label}] ${msg.text()}`); });
    page.on('pageerror', (err) => consoleErrors.push(`[article:${label}] pageerror: ${err.message}`));
    await page.goto(BASE + ARTICLE_PATH, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `article-${label}.png`), fullPage: true });
    await checkOverflow(page, `article-${label}`);
    // tables must scroll within their own container, never overflow the page
    const tableOverflow = await page.evaluate(() => {
      const doc = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll('table')).every((t) => t.closest('.article-table-wrapper'));
    });
    check(`article-${label}: all tables are wrapped in a scrollable container`, tableOverflow);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const events = [];
    await page.exposeFunction('__recordArticle', (name, params) => events.push({ name, params }));
    await page.addInitScript(() => {
      window.gtag = function (type, name, params) { window.__recordArticle(name, params); };
    });
    await page.goto(BASE + ARTICLE_PATH, { waitUntil: 'networkidle' });

    const h1Count = await page.locator('h1').count();
    check('article page has exactly one H1', h1Count === 1);
    const h1Text = (await page.locator('h1').textContent()).trim();
    check('article H1 matches frontmatter title', h1Text.startsWith('API RP 1170 and 1171 Second Editions'));

    const robotsCount = await page.locator('meta[name="robots"]').count();
    check('published article has no noindex/nofollow meta tag', robotsCount === 0);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    check('article canonical is self-referencing', canonical === 'https://kataba.ai' + ARTICLE_PATH);

    const breadcrumbText = (await page.locator('.breadcrumb').textContent()).replace(/\s+/g, ' ').trim();
    check('breadcrumb reads Home / Insights / UGS', breadcrumbText === 'Home / Insights / UGS');

    const metaLine = (await page.locator('.insight-meta').textContent()).replace(/\s+/g, ' ').trim();
    check('metadata line follows "Kataba · <date> · N min read"', /^Kataba . September 4, 2026 . \d+ min read$/.test(metaLine));

    const ldBlocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    check('article has 2 JSON-LD blocks (TechArticle + BreadcrumbList)', ldBlocks.length === 2);
    let ldParsedOk = true;
    let hasTechArticle = false;
    for (const block of ldBlocks) {
      try {
        const parsed = JSON.parse(block);
        if (parsed['@type'] === 'TechArticle') hasTechArticle = true;
      } catch (e) { ldParsedOk = false; }
    }
    check('all article JSON-LD blocks parse as valid JSON', ldParsedOk);
    check('a TechArticle JSON-LD block is present', hasTechArticle);

    check('article_view analytics event fired on load', events.some((e) => e.name === 'article_view'));
    const viewEvent = events.find((e) => e.name === 'article_view');
    check('article_view includes article_slug', viewEvent && viewEvent.params && viewEvent.params.article_slug === 'api-rp-1170-1171-procedure-gap-analysis');

    // Heading anchors: every TOC link's target id must exist on the page
    const tocHrefs = await page.locator('.toc-link').evaluateAll((links) => links.map((l) => l.getAttribute('href')));
    check('TOC has multiple entries', tocHrefs.length > 5);
    const allAnchorsResolve = await page.evaluate((hrefs) => hrefs.every((h) => !!document.getElementById(h.replace('#', ''))), tocHrefs);
    check('every TOC link resolves to a heading id on the page', allAnchorsResolve);

    // Clicking a TOC link scrolls to and fires analytics
    const secondTocLink = page.locator('.toc-link').nth(1);
    const targetHref = await secondTocLink.getAttribute('href');
    await secondTocLink.click();
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, targetHref, { timeout: 3000 }).catch(() => {});
    const targetBox = await page.locator(targetHref).boundingBox();
    check('TOC link scrolls target heading into view', targetBox && targetBox.y < page.viewportSize().height && targetBox.y > -50);
    check('article_toc_click analytics event fired', events.some((e) => e.name === 'article_toc_click'));

    // Inline CTA (mid-article) points to /ugs#poc
    const inlineCtaHref = await page.locator('.article-inline-cta a.btn').getAttribute('href');
    check('inline CTA links to /ugs#poc', inlineCtaHref === '/ugs#poc');
    await page.locator('.article-inline-cta a.btn').click();
    await page.waitForTimeout(100);
    check('article_inline_cta_click analytics event fired', events.some((e) => e.name === 'article_inline_cta_click'));

    await page.close();
  }
  {
    // Final CTA + source-link tracking on a fresh page load
    const page = await browser.newPage({ viewport: VIEWPORTS.desktop });
    const events = [];
    await page.exposeFunction('__recordArticle2', (name, params) => events.push({ name, params }));
    await page.addInitScript(() => {
      window.gtag = function (type, name, params) { window.__recordArticle2(name, params); };
    });
    await page.goto(BASE + ARTICLE_PATH, { waitUntil: 'networkidle' });

    const finalPrimaryHref = await page.locator('.article-final-cta a.btn').getAttribute('href');
    check('final CTA primary button links to /ugs#cta', finalPrimaryHref === '/ugs#cta');
    const finalSecondaryHref = await page.locator('.article-final-cta-secondary').getAttribute('href');
    check('final CTA secondary link points to /ugs', finalSecondaryHref === '/ugs');

    // External source links: open in new tab, use noopener/noreferrer, tracked.
    // Must run before the final-CTA click below, since that click navigates
    // this page away to /ugs (it's a same-tab link, not target="_blank").
    const sourceLinks = await page.locator('.insight-body a.body-link--external').all();
    check('article has external source links', sourceLinks.length >= 5);
    let allSourcesSafe = true;
    for (const link of sourceLinks) {
      const target = await link.getAttribute('target');
      const rel = await link.getAttribute('rel');
      if (target !== '_blank' || !rel || !rel.includes('noopener') || !rel.includes('noreferrer')) allSourcesSafe = false;
    }
    check('all external source links open safely in a new tab', allSourcesSafe);
    if (sourceLinks.length) {
      // target="_blank" opens a real popup page; close it immediately so the
      // test doesn't wait on/depend on a live third-party (phmsa.dot.gov) load.
      const popupPromise = page.context().waitForEvent('page', { timeout: 2000 }).catch(() => null);
      await sourceLinks[0].click();
      const popup = await popupPromise;
      if (popup) await popup.close().catch(() => {});
      await page.waitForTimeout(100);
      check('article_source_link_click analytics event fired', events.some((e) => e.name === 'article_source_link_click'));
    }

    // Reading-time + word-derived value is present and plausible for ~2,250 words
    const metaLine = await page.locator('.insight-meta').textContent();
    const minutesMatch = metaLine.match(/(\d+) min read/);
    check('reading time is a plausible calculated value (8-14 min)', !!minutesMatch && +minutesMatch[1] >= 8 && +minutesMatch[1] <= 14);

    // Final CTA click navigates away to /ugs#cta -- keep this last.
    await page.locator('.article-final-cta a.btn').scrollIntoViewIfNeeded();
    await page.locator('.article-final-cta a.btn').click();
    await page.waitForTimeout(100);
    check('article_final_cta_click analytics event fired', events.some((e) => e.name === 'article_final_cta_click'));

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
