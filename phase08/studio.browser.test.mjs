import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

for (const [width, height, touch] of [[320, 568, true], [412, 915, true], [1280, 720, false]]) {
  const viewport = width + 'x' + height;
  if (process.env.SPA_VIEWPORT && process.env.SPA_VIEWPORT !== viewport) continue;
  test(viewport + ' interactive makeup · both clients', { timeout: 180000 }, async () => {
    const dir = 'test-results/makeup/' + viewport;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const errors = [], checks = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url()); });
    page.on('console', message => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
    });
    const cdp = touch && await context.newCDPSession(page);
    const el = selector => page.locator(selector);
    const tap = async selector => touch ? el(selector).tap() : el(selector).click();
    const shot = (name, fullPage = true) => page.screenshot({ path: dir + '/' + name + '.png', fullPage, animations: 'disabled' });
    const pixels = positions => el('#studioPaint').evaluate((canvas, points) => points.map(([x, y]) =>
      [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]), positions);
    const sumAlpha = () => el('#studioPaint').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, 512, 640).data;
      let sum = 0;
      for (let index = 3; index < data.length; index += 4) sum += data[index];
      return sum;
    });
    async function stroke(points, held, cancel = false) {
      await el('#studioPaint').scrollIntoViewIfNeeded();
      const box = await el('#studioPaint').boundingBox();
      const positions = points.map(([x, y]) => ({ x: box.x + x * box.width / 512, y: box.y + y * box.height / 640 }));
      if (touch) {
        const send = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
        await send('touchStart', positions[0]);
        for (const position of positions.slice(1)) await send('touchMove', position);
        if (held) await held();
        await send(cancel ? 'touchCancel' : 'touchEnd');
      } else {
        await page.mouse.move(positions[0].x, positions[0].y);
        await page.mouse.down();
        for (const point of positions.slice(1)) await page.mouse.move(point.x, point.y);
        if (held) await held();
        if (cancel) await el('#studioPaint').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
        await page.mouse.up();
        await page.mouse.move(box.x - 3, box.y);
      }
    }
    const sweep = (x, y, length = 45) => Array.from({ length: 17 }, (_, i) => [x + length * i / 16, y + Math.sin(i / 3) * 2]);
    async function tool(id) { await tap('#studioCategories [data-category="' + id + '"]'); }
    async function color(label) { await tap('#studioPalette button[aria-label="' + label + '"]'); }
    async function clear() { await tap('#studioClear'); }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('dsp-stars', '55');
        localStorage.setItem('dsp-progress', JSON.stringify({
          version: 3, balance: 55, earned: 160, clients: ['martina'],
          products: ['cleanser-peach'], choices: { cleanser: 'cleanser-peach' },
          decorations: ['mirror'], room: { mirror: 'special' },
          lastGiftDay: '2026-10-31', lastGiftAt: 1793404800000,
        }));
      });
      await page.goto(process.env.SPA_URL || 'http://127.0.0.1:8000/');
      await el('#play:enabled').waitFor();
      const saved = await page.evaluate(() => ({ ...localStorage }));
      await shot('01-ingresso');
      await tap('#makeup');
      await el('#makeupStudio.on').waitFor();
      await shot('02-scelta-clienti');
      assert.equal(await el('#studioCards button').count(), 2);
      assert.match(await el('#studioSelection').innerText(), /altre otto clienti/);

      for (const client of ['sofia', 'azzurrina']) {
        await tap('#studioCards [data-client="' + client + '"]');
        await el('#studioEditor:not([hidden])').waitFor();
        assert.equal(await sumAlpha(), 0);
        await shot(client + '-prima');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        await tool('shadow');
        assert.equal(await el('#studioPalette button').count(), 6);
        const shadowPoint = client === 'sofia' ? [188, 258] : [190, 251];
        const rightPoint = client === 'sofia' ? [326, 254] : [325, 251];
        const left = sweep(shadowPoint[0] - 20, shadowPoint[1] + 1, 35);
        const right = sweep(rightPoint[0] - 18, rightPoint[1] + 1, 35);
        assert.equal((await pixels([shadowPoint]))[0][3], 0, 'selection alone applies no product');
        await stroke([shadowPoint]);
        const first = (await pixels([shadowPoint]))[0][3];
        assert.ok(first > 0 && first < 160);
        await stroke(left, async () => {
          assert.equal(await el('.studio-tool').isVisible(), true, 'brush follows an active gesture');
          await shot(client + '-pennello', false);
        });
        const second = (await pixels([shadowPoint]))[0][3];
        assert.ok(second > first, 'pigment is progressive');
        assert.equal((await pixels([rightPoint]))[0][3], 0, 'other eyelid stays clean');
        await stroke(right);
        assert.ok((await pixels([rightPoint]))[0][3] > 0);
        const [pink, untouchedEye] = await pixels([shadowPoint, rightPoint]);
        await color('Turchese');
        await stroke(left);
        assert.notDeepEqual((await pixels([shadowPoint]))[0], pink, 'color changes where stroked');
        assert.deepEqual((await pixels([rightPoint]))[0], untouchedEye, 'changing one eyelid preserves the other');
        await shot(client + '-tavolozza');
        await tap('#studioUndo');
        assert.deepEqual((await pixels([shadowPoint]))[0], pink, 'undo restores exact pigment');

        // Paint across protected landmarks and verify independently selected pixels.
        await stroke([[256, 90], [256, 200], [190, 285], [325, 285], [256, 345], [256, 382], [400, 200]]);
        assert.ok((await pixels([[190, 285], [325, 285], [256, 345], [256, 200], [400, 200], [256, 90]])).every(p => p[3] === 0));
        const leaks = await page.evaluate(async id => {
          const { regions } = await import('./phase08/paint.mjs');
          const c = document.querySelector('#studioPaint').getContext('2d');
          const masks = regions(id, 'shadow');
          const data = c.getImageData(0, 0, 512, 640).data;
          let leaks = 0;
          for (let y = 0; y < 640; y++) for (let x = 0; x < 512; x++) {
            if (data[(y * 512 + x) * 4 + 3] <= 8) continue;
            // Allow one pixel for Chromium's antialiased clip raster.
            if (!masks.some(mask => [[.5, .5], [-.5, .5], [1.5, .5], [.5, -.5], [.5, 1.5], [0, 0], [0, 1], [1, 0], [1, 1]]
              .some(([dx, dy]) => c.isPointInPath(mask, x + dx, y + dy)))) leaks++;
          }
          return leaks;
        }, client);
        assert.equal(leaks, 0, 'shadow stays inside both eye stencils');
        await clear();
        assert.equal(await sumAlpha(), 0);

        await color('Lilla');
        await stroke(left);
        await stroke(right);
        if (viewport === '412x915') {
          for (const name of ['Azzurro cielo', 'Viola', 'Oro perlato']) {
            await color(name);
            await stroke(left);
            await shot(client + '-ombretto-' + name.toLowerCase().replace(' ', '-'));
          }
        }
        await tool('blush');
        assert.equal(await el('#studioPalette button').count(), 4);
        await color('Pesca');
        for (const x of [168, 315]) await stroke(sweep(x, 343, 25));
        assert.ok((await pixels([[181, 343], [331, 343]])).every(p => p[3] > 0));
        await tool('lips');
        assert.equal(await el('#studioPalette button').count(), 5);
        const lip = [256, 393];
        const corner = [289, 381];
        await color('Gloss trasparente');
        assert.deepEqual(await pixels([lip, corner]), [[0, 0, 0, 0], [0, 0, 0, 0]]);
        await stroke(sweep(244, 391, 13));
        const naturalGloss = await pixels([lip, corner, [256, 409]]);
        assert.ok(naturalGloss[0][3] > 0, 'gloss appears under the applicator');
        assert.deepEqual(naturalGloss.slice(1), [[0, 0, 0, 0], [0, 0, 0, 0]]);
        await page.waitForTimeout(180);
        assert.deepEqual(await pixels([lip, corner, [256, 409]]), naturalGloss, 'reduced motion keeps a steady sheen');
        await clear();
        await color('Fucsia');
        await stroke(sweep(225, 382, 60));
        assert.ok((await pixels([[256, 380], [256, 393]])).every(p => p[3] > 0));
        assert.equal((await pixels([[256, 409]]))[0][3], 0);
        const beforeGloss = (await pixels([[256, 393]]))[0];
        await color('Gloss trasparente');
        await stroke(sweep(230, 391, 50));
        assert.notDeepEqual((await pixels([[256, 393]]))[0], beforeGloss);
        await tool('jewels');
        assert.equal(await el('#studioPalette button').count(), 4);
        const noDecor = await pixels([[181, 334]]);
        await stroke([[181, 334]], async () => {
          assert.notDeepEqual(await pixels([[181, 334]]), noDecor, 'preview appears before release');
          await shot(client + '-anteprima-decoro', false);
        });
        assert.match(await el('#studioChoice').innerText(), /1\/6/);
        assert.notDeepEqual(await pixels([[181, 334]]), noDecor);
        await stroke([[181, 334]]);
        assert.match(await el('#studioChoice').innerText(), /0\/6/);
        await stroke([[181, 334]], null, true);
        assert.match(await el('#studioChoice').innerText(), /0\/6/);
        assert.deepEqual(await pixels([[181, 334]]), noDecor, 'canceled gesture leaves no preview or sticker');
        await color('Farfallina');
        await stroke([[331, 335]]);
        await color('Stellina');
        await stroke([[181, 334]]);
        await stroke([[256, 203]]);
        const beforeInvalid = await sumAlpha();
        await stroke([[190, 282]]);
        assert.equal(await sumAlpha(), beforeInvalid, 'eye rejects decoration');
        await shot(client + '-dopo');
        assert.equal(await el('#studioPortrait').getAttribute('data-eyes'), 'open');
        {
          const closed = page.waitForFunction(() => document.querySelector('#studioPortrait').dataset.eyes === 'closed', null, { timeout: 7000 });
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await closed;
          await page.waitForFunction(() => document.querySelector('#studioPortrait').dataset.eyes === 'open');
          await page.emulateMedia({ reducedMotion: 'reduce' });
          assert.equal(await el('#studioPortrait').getAttribute('data-eyes'), 'open');
        }
        const clipping = (await pixels([[256, 345], [190, 285], [325, 285], [256, 90], [400, 200]])).every(p => p[3] === 0);
        assert.ok(clipping, 'finished look keeps independently selected protected pixels clear');
        await tap('#studioClients');
        await el('#studioConfirm[open]').waitFor();
        await tap('#studioConfirm form button');
        await el('#studioEditor:not([hidden])').waitFor();
        const beforeNavigation = await sumAlpha();
        await tap('#studioClients');
        await tap('#studioConfirmAction');
        await tap('#studioCards [data-client="' + client + '"]');
        await el('#studioEditor:not([hidden])').waitFor();
        assert.equal(await sumAlpha(), beforeNavigation, 'session survives screen navigation');
        await tap('#studioReset');
        await tap('#studioConfirm form button');
        assert.equal(await sumAlpha(), beforeNavigation, 'cancel reset preserves look');
        await tap('#studioReset');
        await tap('#studioConfirmAction');
        assert.equal(await sumAlpha(), 0);
        await tap('#studioUndo');
        assert.equal(await sumAlpha(), beforeNavigation, 'reset is reversible');
        await tap('#studioFinish');
        await el('#studioResult:not([hidden])').waitFor();
        await shot(client + '-risultato');
        assert.equal(await el('.studio-tool').isVisible(), false);
        await tap('#studioResume');
        assert.equal(await sumAlpha(), beforeNavigation);
        await tap('#studioFinish');
        await tap('#studioClients');
        await el('#studioSelection:not([hidden])').waitFor();
        checks.push({ client, progressiveAlpha: [first, second], clipping, blink: true, reducedMotion: true, savedSession: true, complete: true });
      }
      await tap('#studioHome');
      await el('#home.on').waitFor();
      assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), saved, 'wallet, gift, purchases and room are byte-preserved');
      await tap('#play');
      await page.waitForFunction(() => document.querySelectorAll('#choose .client:enabled').length === 10);
      await tap('#choose [data-client="sofia"]');
      await el('#spa.on').waitFor();
      await shot('skincare-preservata');
      assert.deepEqual(errors, []);
    } catch (error) {
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await writeFile(dir + '/results.json', JSON.stringify({ viewport, touch, checks, errors }, null, 2));
      await context.tracing.stop({ path: dir + '/trace.zip' });
      await browser.close();
    }
  });
}
