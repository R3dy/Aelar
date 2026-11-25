const { chromium } = require('playwright');
(async () => {
  const jobs = JSON.parse(process.argv[2]);
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 640 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('ERR', e.message));
  for (const [qs, out] of jobs) {
    await page.goto('http://localhost:8765/index.html?' + qs);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    if (out.endsWith('_info')) { console.log(qs, JSON.stringify(await page.evaluate(() => window.__info))); continue; }
    await page.screenshot({ path: out });
  }
  await browser.close();
})();
