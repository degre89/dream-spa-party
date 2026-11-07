import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const shades = ['Rosa confetto', 'Lilla', 'Azzurro cielo', 'Turchese', 'Viola', 'Oro perlato',
  'Verde menta', 'Pesca perlato', 'Argento lunare'];
const finishes = ['Sparkle', 'Soft', 'Pearl'];
const jewels = ['Stellina', 'Cuoricino', 'Farfallina', 'Brillantino', 'Luna', 'Fiorellino', 'Gemma', 'Petalo'];

for (const [width, height, touch] of [[320, 568, true], [412, 915, true], [1280, 720, false]]) {
  test(`${width} × ${height} · every cart option is reachable without scrolling the page`, async () => {
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    try {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch,
        isMobile: touch, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const el = selector => page.locator(selector);
      const choose = selector => el(selector)[touch ? 'tap' : 'click']();
      const cart = el('#studioCart');
      const expanded = () => cart.getAttribute('aria-expanded');
      const stage = () => el('#studioPaint').boundingBox();
      const saved = () => page.evaluate(() => ['dsp-stars', 'dsp-progress'].map(key => localStorage.getItem(key)));
      const category = id => '#studioCategories [data-category=' + id + ']';
      const color = name => '#studioPalette button[aria-label="' + name + '"]';
      const finish = name => '#studioFinishes button:text-is("' + name + '")';
      const directory = 'test-results/cart/' + width + 'x' + height;
      await mkdir(directory, { recursive: true });
      const screenshot = name => page.screenshot({ path: directory + '/' + name + '.png',
        animations: 'disabled', style: '#studioDrawer button { -webkit-tap-highlight-color: transparent; }' });
      await page.goto(process.env.SPA_URL || 'http://127.0.0.1:8000/');
      await choose('#makeup');
      await choose('#studioCards [data-client=sofia]');
      await el('#studioPaint').waitFor();
      const initial = await stage();
      const original = await saved();
      await page.evaluate(() => {
        window.cartScrollEvents = 0;
        window.addEventListener('scroll', () => window.cartScrollEvents++);
      });

      // Playwright locator clicks may silently scroll their targets into view.
      // Hit-test viewport coordinates first and dispatch actual touch or mouse input.
      async function hit(selector) {
        const box = await el(selector).boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, selector + ' has a usable target');
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height,
          selector + ' fits inside the viewport');
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        assert.ok(await el(selector).evaluate((node, { x, y }) =>
          node.contains(document.elementFromPoint(x, y)), point), selector + ' has an unobstructed center');
        await (touch ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y));
        assert.deepEqual(await stage(), initial, 'portrait stays in the same viewport rectangle');
        assert.deepEqual(await page.evaluate(() => [
          scrollX, scrollY, document.documentElement.scrollWidth, window.cartScrollEvents
        ]), [0, 0, width, 0]);
      }

      assert.equal(await expanded(), 'false');
      for (const [i, shade] of shades.entries()) {
        const texture = finishes[i % finishes.length];
        await hit('#studioCart');
        await hit(category('shadow'));
        await hit(color(shade));
        assert.equal(await expanded(), 'true');
        if (i === 0 || i === shades.length - 1) await screenshot(i === 0 ? 'primo-colore' : 'ultimo-colore');
        await hit(finish(texture));
        assert.equal(await expanded(), 'false');
        assert.equal(await el('#studioChoice').innerText(), `Ombretto · ${shade} · ${texture}`);
        await hit('#studioCart');
        assert.equal(await el(color(shade)).getAttribute('aria-pressed'), 'true');
        assert.equal(await el(finish(texture)).getAttribute('aria-pressed'), 'true');
        if (i < finishes.length) await screenshot(texture.toLowerCase());
        await hit('#studioCart');
      }

      await hit(category('blush'));
      await hit(color('Pesca'));
      await hit('#studioHearts');
      await hit(finish('Pearl'));
      assert.match(await el('#studioChoice').innerText(), /Pesca · Pearl \+ microcuoricini/);
      await hit(category('lips'));
      await hit(color('Fucsia'));
      await hit(finish('Soft'));
      await hit(category('lips'));
      await screenshot('gloss-scelta');
      await hit('#studioProducts button:text-is("Gloss")');
      assert.equal(await expanded(), 'false');
      assert.match(await el('#studioChoice').innerText(), /Gloss trasparente/);
      await hit('#studioCart');
      assert.equal(await el('#studioProducts button:text-is("Gloss")').getAttribute('aria-pressed'), 'true');
      await screenshot('gloss');
      await hit(category('jewels'));
      await screenshot('decorazioni');
      for (const jewel of jewels) {
        if (await expanded() === 'false') await hit(category('jewels'));
        await hit(color(jewel));
        assert.equal(await expanded(), 'false');
        assert.match(await el('#studioChoice').innerText(), new RegExp(jewel));
      }
      const paintPoint = { x: initial.x + 178 * initial.width / 512, y: initial.y + 339 * initial.height / 640 };
      await (touch ? page.touchscreen.tap(paintPoint.x, paintPoint.y) : page.mouse.click(paintPoint.x, paintPoint.y));
      await hit('#studioUndo');
      await hit('#studioClear');
      await hit('#studioReset');
      await choose('#studioConfirm form button');
      await hit('#studioFinish');
      await el('#studioEditor[data-reveal=final]').waitFor();
      assert.equal(await el('.studio-chevron').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
      assert.deepEqual(await saved(), original);

      await choose('#studioBack');
      await el('#home.on').waitFor();
      await choose('#makeup');
      await choose('#studioCards [data-client=sofia]');
      await el('#studioPaint').waitFor();
      await hit('#studioCart');
      await hit('#studioCart');
      await choose('#studioHome');
      await el('#home.on').waitFor();
      await choose('#play');
      await choose('#choose [data-client=sofia]');
      await el('#spa.on').waitFor();
      await choose('#back');
      await el('#home.on').waitFor();
      await choose('#makeup');
      await choose('#studioCards [data-client=sofia]');
      await el('#studioPaint').waitFor();
      await hit('#studioCart');
      await hit('#studioCart');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test('a short viewport with enlarged text scrolls the drawer instead of the page', async () => {
  const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
    { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 320 }, hasTouch: true,
      isMobile: true, reducedMotion: 'reduce' });
    const tap = selector => page.locator(selector).tap();
    await page.goto(process.env.SPA_URL || 'http://127.0.0.1:8000/');
    await tap('#makeup');
    await tap('#studioCards [data-client=sofia]');
    await page.locator('#studioPaint').waitFor();
    await page.addStyleTag({ content: 'html { font-size: 150%; }' });
    await tap('#studioCategories [data-category=lips]');
    await page.evaluate(() => window.scrollTo(0, 0));
    const tray = page.locator('#studioOptions');
    const before = await tray.evaluate(node => [node.clientHeight, node.scrollHeight]);
    assert.ok(before[1] > before[0], 'the options need internal scrolling at this height');
    const box = await tray.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2;
    const y = box.y + box.height - 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let dy = 15; dy < box.height - 18; dy += 15) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - dy }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('#studioOptions').scrollTop > 0);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await tap('#studioPalette [aria-label="Fucsia"]');
    await tap('#studioFinishes button:text-is("Sparkle")');
    assert.match(await page.locator('#studioChoice').innerText(), /Fucsia · Sparkle/);
    assert.equal(await page.locator('#studioCart').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => scrollY), 0);
  } finally {
    await browser.close();
  }
});
