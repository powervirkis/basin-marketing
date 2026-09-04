const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8080';
const OUT = path.join(__dirname, 'screenshots');

function installFetchStub(mode) {
  const realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (String(url).includes('sibforms.com')) {
      return new Promise((resolve, reject) => setTimeout(() => {
        if (mode === 'success') resolve(new Response('', { status: 200 }));
        else reject(new TypeError('Simulated network failure'));
      }, 80));
    }
    return realFetch(url, opts);
  };
}

async function settle(page) {
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => { el.style.transitionDelay = '0s'; el.style.transitionDuration = '0s'; el.classList.add('visible'); }));
  await page.waitForTimeout(120);
}

(async () => {
  const browser = await chromium.launch();

  // Success state
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    await page.addInitScript(installFetchStub, 'success');
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.locator('#ugs-lead-form').scrollIntoViewIfNeeded();
    await settle(page);
    await page.locator('#ugs-FIRSTNAME').fill('Jordan');
    await page.locator('#ugs-LASTNAME').fill('Rivera');
    await page.locator('#ugs-COMPANY').fill('Example Storage Operator LLC');
    await page.locator('#ugs-EMAIL').fill('jordan.rivera@example.com');
    await page.locator('#ugs-USE-CASE').selectOption('API RP 1170/1171 procedure gap analysis');
    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForSelector('#ugs-success-message', { state: 'visible', timeout: 3000 });
    await page.waitForTimeout(150);
    await page.locator('#ugs-lead-form').screenshot({ path: path.join(OUT, 'ugs-form-success.png') });
    await page.close();
  }

  // Loading state (captured mid-flight)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    await page.addInitScript(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = function (url, opts) {
        if (String(url).includes('sibforms.com')) {
          return new Promise((resolve) => setTimeout(() => resolve(new Response('', { status: 200 })), 4000));
        }
        return realFetch(url, opts);
      };
    });
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.locator('#ugs-lead-form').scrollIntoViewIfNeeded();
    await settle(page);
    await page.locator('#ugs-FIRSTNAME').fill('Jordan');
    await page.locator('#ugs-LASTNAME').fill('Rivera');
    await page.locator('#ugs-COMPANY').fill('Example Storage Operator LLC');
    await page.locator('#ugs-EMAIL').fill('jordan.rivera@example.com');
    await page.locator('#ugs-USE-CASE').selectOption('API RP 1170/1171 procedure gap analysis');
    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForTimeout(200);
    await page.locator('#ugs-lead-form').screenshot({ path: path.join(OUT, 'ugs-form-loading.png') });
    await page.close();
  }

  // Failure state
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    await page.addInitScript(installFetchStub, 'failure');
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.locator('#ugs-lead-form').scrollIntoViewIfNeeded();
    await settle(page);
    await page.locator('#ugs-FIRSTNAME').fill('Jordan');
    await page.locator('#ugs-LASTNAME').fill('Rivera');
    await page.locator('#ugs-COMPANY').fill('Example Storage Operator LLC');
    await page.locator('#ugs-EMAIL').fill('jordan.rivera@example.com');
    await page.locator('#ugs-USE-CASE').selectOption('Audit or inspection evidence');
    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForSelector('#ugs-error-message', { state: 'visible', timeout: 3000 });
    await page.waitForTimeout(150);
    await page.locator('#ugs-lead-form').screenshot({ path: path.join(OUT, 'ugs-form-failure.png') });
    await page.close();
  }

  // Validation state
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    await page.goto(BASE + '/ugs', { waitUntil: 'networkidle' });
    await page.locator('#ugs-lead-form').scrollIntoViewIfNeeded();
    await settle(page);
    await page.locator('#ugs-EMAIL').fill('not-an-email');
    await page.locator('#ugs-form button[type="submit"]').click();
    await page.waitForTimeout(150);
    await page.locator('#ugs-lead-form').screenshot({ path: path.join(OUT, 'ugs-form-validation.png') });
    await page.close();
  }

  await browser.close();
  console.log('done');
})();
