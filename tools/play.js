// Boot normal mode at phone size with touch, drag to walk, tap attack; report errors and position.
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });
  await page.goto(process.argv[2], { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const p0 = await page.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
  await page.evaluate(() => { window.__game.G.talked = true; });
  // simulate keyboard walk forward
  await page.keyboard.down('KeyW'); await page.waitForTimeout(6000); await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
  await page.keyboard.press('Digit4'); await page.waitForTimeout(1500);
  await page.screenshot({ path: process.argv[3] });
  console.log('pos before', p0, 'after', p1);
  await browser.close();
})();
