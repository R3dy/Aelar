// Render the running game headless and save a screenshot.
// usage: node tools/shot.js <url> <out.png> [width] [height] [waitMs]
const { chromium } = require('playwright');
(async () => {
  const [url, out, w = 1672, h = 941, wait = 2500] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__shotDone === true || (window.__ready === true && !location.search.includes('shot')), null, { timeout: 120000 }).catch(() => logs.push('TIMEOUT waiting for ready'));
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out });
  console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
  await browser.close();
})();
