const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
  page.on('console', (m) => console.log(m.type(), m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('requestfailed', (r) => console.log('REQFAIL', r.url()));
  await page.goto(process.argv[2], { waitUntil: 'commit' });
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const r = await Promise.race([page.evaluate(() => ({ ready: window.__ready, has: !!window.__game })), new Promise((r) => setTimeout(() => r('busy'), 3000))]);
    console.log(i * 5, JSON.stringify(r));
    if (r && r.ready) break;
  }
  await browser.close();
})();
