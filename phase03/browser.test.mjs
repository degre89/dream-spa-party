import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const seed = 86032;
const baseURL = process.env.SPA_URL || 'http://127.0.0.1:8000/';
const devices = [[320, 568, true], [412, 915, true], [1280, 720, false]];
const clients = {
  sofia: { protected: [[194, 294], [316, 294], [257, 387], [190, 231], [257, 90]], forehead: [256, 184] },
  emma: { protected: [[195, 288], [314, 288], [256, 402], [182, 239], [248, 116]], forehead: [254, 199] },
  maya: { protected: [[197, 306], [315, 306], [257, 414], [186, 248], [249, 128]], forehead: [254, 201] }
};
const masks = ['strawberry', 'avocado', 'blueberry', 'honey'];

for (const [width, height, touch] of devices) {
  test(`${width}×${height} · ${touch ? 'touch' : 'mouse'} · three complete sessions`, { timeout: 230000 }, async () => {
    const dir = `test-results/${width}x${height}`;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    const cdp = touch && await context.newCDPSession(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        errors.push(response.status() + ' ' + response.url());
      }
    });
    page.on('console', message => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
    });
    await page.addInitScript(seed => {
      if (localStorage.getItem('dsp-stars') === null) localStorage.setItem('dsp-stars', '7');
      const random = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (!(array instanceof Uint32Array) || array.length !== 1) return random(array);
        array[0] = seed;
        return array;
      };
    }, seed);

    const shot = name => page.screenshot({ path: dir + '/' + name + '.png', animations: 'disabled' });
    const dispatch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
    const element = selector => page.locator(selector);

    async function activate(selector) {
      if (touch) await element(selector).tap();
      else await element(selector).click();
    }

    async function pick(tool) {
      if (await element('#cart').isHidden()) await activate('#cartToggle');
      await activate(`[data-tool="${tool}"]`);
      assert.equal(await element(`[data-tool="${tool}"]`).getAttribute('aria-pressed'), 'true');
      assert.ok(await element('#cart').isHidden());
    }

    async function stroke(points) {
      const box = await element('#mask').boundingBox();
      const mapped = points.map(([x, y]) => ({
        x: Math.round(box.x + x * box.width / 512),
        y: Math.round(box.y + y * box.height / 640)
      }));
      const [first, ...rest] = mapped;
      if (touch) {
        await dispatch('touchStart', first);
        for (const point of rest) await dispatch('touchMove', point);
        await dispatch('touchEnd');
      } else {
        await page.mouse.move(first.x, first.y);
        await page.mouse.down();
        for (const { x, y } of rest) await page.mouse.move(x, y);
        await page.mouse.up();
      }
    }

    async function sweep(from = 158, to = 482) {
      for (let y = from; y <= to; y += 18) await stroke([[104, y], [254, y], [409, y]]);
    }

    async function pixels(points) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return element('#mask').evaluate((canvas, coords) => coords.map(([x, y]) =>
        Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data)), points);
    }

    const percent = async () => Number(await element('#meter').getAttribute('aria-valuenow'));
    const canvasPNG = selector => element(selector).evaluate(canvas => canvas.toDataURL());
    const description = () => element('#mask').getAttribute('aria-description');

    async function viewportFits() {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1), 'screen fits the viewport');
    }

    async function knownConditions(id, sessionSeed) {
      return page.evaluate(async ({ id, sessionSeed }) => {
        const { clients } = await import(new URL('phase03/clients.mjs', document.baseURI));
        const { createSession } = await import(new URL('phase03/facial-state.mjs', document.baseURI));
        const { loadStencil } = await import(new URL('phase03/skin-view.mjs', document.baseURI));
        const client = clients[id];
        const { skinAt } = await loadStencil('assets/' + client.stencil, 512, 640);
        return createSession({
          width: 512, height: 640, seed: sessionSeed, skinAt,
          regions: client.regions.map(([x, y, radius]) => ({ x, y, radius }))
        }).conditions;
      }, { id, sessionSeed });
    }

    try {
      await page.goto(baseURL);
      await element('#play:enabled').waitFor();
      assert.equal(await element('#stars').innerText(), '7');
      await viewportFits();
      await shot('01-home');
      await activate('#play');
      await element('#choose [data-client="maya"]:enabled').waitFor();
      await shot('02-clienti');

      let index = 0;
      for (const [id, profile] of Object.entries(clients)) {
        await activate(`#choose [data-client="${id}"]`);
        await element(`#spa.on .portrait[data-client="${id}"]`).waitFor();
        await viewportFits();
        assert.ok(await element('#spa .hero').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
        if (index === 0) await shot('06-carrello');
        await activate('#cartToggle');
        await shot('0' + (3 + index) + '-' + id);
        assert.ok(await element('#next').isDisabled());
        const startImage = await canvasPNG('#mask');
        const initialStats = await description();
        const conditions = await knownConditions(id, seed + index);
        assert.deepEqual(new Set(conditions.map(condition => condition.kind)), new Set(['spot', 'redness', 'pores']));

        await pick('gel'); // Start outside the assistant's suggested order.
        const spot = conditions.find(condition => condition.kind === 'spot');
        await stroke([[spot.x, spot.y]]);
        await pixels([[spot.x, spot.y]]);
        assert.notEqual(await canvasPNG('#mask'), startImage, 'gel changes a spot');
        await pick('cleanser');
        await stroke([[profile.forehead[0] - 25, profile.forehead[1]], [profile.forehead[0] + 25, profile.forehead[1]]]);
        assert.ok((await pixels([profile.forehead]))[0][3] > 130, 'foam visible');
        assert.notEqual(await description(), initialStats, 'cleanliness improves');
        assert.match(await element('#hint').innerText(), /Aiutante.*spugnetta/i);
        if (index === 0) await shot('07-trattamento');

        for (const [kind, tool] of [['pores', 'brush'], ['redness', 'serum'], ['spot', 'gel']]) {
          await pick(tool);
          for (const { x, y } of conditions.filter(condition => condition.kind === kind)) {
            const [[,,, previous]] = await pixels([[x, y]]);
            for (let pass = 0; pass < 3; pass++) await stroke([[x - 7, y], [x + 7, y], [x - 7, y]]);
            await pixels([[x, y]]);
            if (kind === 'redness' && previous > 0) {
              assert.ok((await pixels([[x, y]]))[0][3] < previous, 'serum fades visible redness');
            }
          }
        }
        await pick('sponge');
        await sweep();
        assert.equal(await percent(), 100, 'foam fully rinsed');

        const colors = new Set();
        for (const mask of index === 0 ? masks : [masks[index]]) {
          await pick(mask);
          const [x, y] = profile.forehead;
          await stroke([[x - 23, y], [x + 23, y]]);
          const [forehead, ...protectedPixels] = await pixels([profile.forehead, ...profile.protected]);
          assert.ok(forehead[3] > 135, 'mask visible on skin');
          assert.ok(protectedPixels.every(pixel => pixel[3] === 0), 'eyes, eyebrow, lips and hair protected');
          colors.add(forehead.slice(0, 3).join(','));
          if (index === 0 && mask === masks[0]) {
            await sweep();
            await element('#next[data-action="rinse"]:enabled').waitFor();
            const afterSweep = await pixels(profile.protected);
            assert.ok(afterSweep.every(pixel => pixel[3] === 0), 'protected pixels stay clear after full application');
            await shot('08-maschera');
            await activate('#next');
          } else {
            await stroke([[x - 50, y + 126], [x + 55, y + 126]]);
            await pick('sponge');
          }
          assert.equal(await element('#meter').getAttribute('aria-label'), 'Risciacquo');
          await stroke([[x - 25, y], [x + 25, y]]);
          const [rinsed] = await pixels([profile.forehead]);
          assert.ok(rinsed[3] < 80, 'sponge removes the visible mask');
          assert.ok(await percent() > 0 && await percent() < 100, 'rinse progresses without clearing the entire mask');
          await sweep();
          assert.equal(await percent(), 100, 'mask fully rinsed');
        }
        assert.equal(colors.size, index === 0 ? 4 : 1);

        const beforeCream = await description();
        await pick('cream');
        await sweep(176, 442);
        assert.notEqual(await description(), beforeCream, 'cream increases hydration');
        await element('#next:enabled').waitFor();
        await activate('#next');
        await element('#done.on').waitFor();
        await viewportFits();
        assert.match(await element('.reward').innerText(), /3 stelle/);
        assert.equal(await page.evaluate(() => localStorage.getItem('dsp-stars')), String(10 + index * 3));
        if (index === 0) await shot('10-ricompensa');
        const after = await canvasPNG('#comparison');
        await activate('#before');
        assert.equal(await element('#before').getAttribute('aria-pressed'), 'true');
        assert.equal(await canvasPNG('#comparison'), startImage, 'comparison restores the original conditions');
        assert.notEqual(await canvasPNG('#comparison'), after);
        if (index === 0) await shot('09-prima-dopo');
        await activate('#after');
        assert.equal(await canvasPNG('#comparison'), after);
        await activate('#again');
        await element('#choose.on').waitFor();
        index++;
      }

      await activate('#choose [data-client="sofia"]');
      await element('#spa.on').waitFor();
      const nextConditions = await knownConditions('sofia', seed + index);
      assert.notDeepEqual(nextConditions, await knownConditions('sofia', seed));
      const renewed = await canvasPNG('#mask');
      await activate('#back');
      await activate('#play');
      await activate('#choose [data-client="sofia"]');
      assert.notEqual(await canvasPNG('#mask'), renewed, 'new sessions vary the visible imperfections');
      await page.reload();
      await element('#play:enabled').waitFor();
      assert.equal(await element('#stars').innerText(), '16');
      assert.deepEqual(errors, [], 'browser errors');
    } catch (error) {
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await writeFile(dir + '/browser-errors.json', JSON.stringify(errors, null, 2));
      await context.tracing.stop({ path: dir + '/trace.zip' });
      await browser.close();
    }
  });
}
