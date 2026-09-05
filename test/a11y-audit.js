const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const BASE = 'http://localhost:8080';

(async () => {
  const browser = await chromium.launch();
  for (const url of [BASE + '/', BASE + '/ugs', BASE + '/insights', BASE + '/insights/api-rp-1170-1171-procedure-gap-analysis', BASE + '/insights/cited-ai-answer-ugs-evidence-completeness']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    // Force the settled post-scroll-reveal state so axe evaluates real, final
    // colors/opacity rather than the opacity:0 pre-scroll animation state.
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => {
      el.style.transitionDuration = '0s';
      el.style.transitionDelay = '0s';
      el.classList.add('visible');
    }));
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    console.log(`\n=== ${url} ===`);
    console.log(`Violations: ${results.violations.length}`);
    results.violations.forEach((v) => {
      console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
      v.nodes.slice(0, 20).forEach((n) => {
        console.log('    ' + n.target.join(' ') + ' :: ' + (n.failureSummary || '').replace(/\n/g, ' '));
      });
    });
    await context.close();
  }
  await browser.close();
})();
