import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const seeds = [0, 1, 5, 7, 9];
const baseURL = process.env.SPA_URL || 'http://127.0.0.1:8000/';
const devices = [[320, 568, true], [412, 915, true], [1280, 720, false]];
const clients = {
  sofia: { protected: [[194, 294], [316, 294], [257, 387], [190, 231], [257, 90]], forehead: [256, 184] },
  emma: { protected: [[195, 288], [314, 288], [256, 402], [182, 239], [248, 116]], forehead: [254, 199] },
  maya: { protected: [[197, 306], [315, 306], [257, 414], [186, 248], [249, 128]], forehead: [254, 201] }
};
const masks = ['strawberry', 'avocado', 'blueberry', 'honey'];
const correctTools = { spot: 'gel', redness: 'serum', pores: 'brush', cleanse: 'cleanser', cream: 'cream' };

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
    await page.addInitScript(seeds => {
      let index = 0;
      if (localStorage.getItem('dsp-stars') === null) localStorage.setItem('dsp-stars', '7');
      const random = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (!(array instanceof Uint32Array) || array.length !== 1) return random(array);
        array[0] = seeds[index++ % seeds.length];
        return array;
      };
    }, seeds);

    const shot = name => page.screenshot({ path: dir + '/' + name + '.png', animations: 'disabled' });
    const dispatch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
    const element = selector => page.locator(selector);

    async function activate(selector) {
      const button = element(selector);
      if (!touch) {
        await button.click();
        return;
      }
      await button.waitFor();
      assert.ok(await button.isEnabled(), selector + ' is enabled');
      const box = await button.boundingBox();
      const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      await dispatch('touchStart', point);
      // A real tap has time between contact and release, including after a swipe.
      await page.waitForTimeout(55);
      await dispatch('touchEnd');
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

    async function pixels(points) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return element('#mask').evaluate((canvas, coords) => coords.map(([x, y]) =>
        Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data)), points);
    }

    const percent = async () => Number(await element('#meter').getAttribute('aria-valuenow'));
    const canvasPNG = selector => element(selector).evaluate(canvas => canvas.toDataURL());

    async function viewportFits() {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1), 'screen fits the viewport');
    }

    async function fixture(id, seed, sample = false) {
      return page.evaluate(async ({ id, seed, sample }) => {
        const { clients } = await import(new URL('phase03/clients.mjs', document.baseURI));
        const { createJourney } = await import(new URL('phase04/journey.mjs', document.baseURI));
        const { loadStencil } = await import(new URL('phase03/skin-view.mjs', document.baseURI));
        const client = clients[id];
        const { skinAt } = await loadStencil('assets/' + client.stencil, 512, 640);
        const options = {
          width: 512, height: 640, client: id, skinAt,
          regions: client.regions.map(([x, y, radius]) => ({ x, y, radius }))
        };
        const journey = createJourney({ ...options, seed });
        const samples = sample ? Array.from({ length: 64 }, (_, index) => {
          const trial = createJourney({ ...options, seed: Math.imul(index, 2654435761) });
          return { sequence: trial.sequence.join('/'), count: trial.session.conditions.length };
        }) : [];
        return { sequence: journey.sequence, conditions: journey.session.conditions, samples };
      }, { id, seed, sample });
    }

    async function fullCart() {
      await activate('#cartToggle');
      const buttons = element('#cart button');
      assert.equal(await buttons.count(), 10);
      for (const button of await buttons.all()) assert.ok(await button.isEnabled() && await button.isVisible());
    }

    async function waitForFrame() {
      await pixels([]);
    }

    async function gestureUntil(predicate, maximumSweeps = 3) {
      for (let pass = 0; pass < maximumSweeps; pass++) {
        for (let y = 160; y <= 480; y += 16) {
          if (await predicate()) return;
          await stroke([[116, y], [254, y], [400, y]]);
        }
      }
      assert.ok(await predicate(), 'the gestures can complete the current action');
    }

    let failed = false;
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
        const { sequence, conditions, samples } = await fixture(id, seeds[index], !index || width === 320);
        if (samples.length) {
          assert.equal(new Set(samples.map(trial => trial.sequence)).size, 9);
          assert.ok(samples.every(trial => trial.count > 0));
        }
        const kind = ['spot', 'redness', 'pores'][index];
        assert.deepEqual(new Set(conditions.map(mark => mark.kind)), new Set([kind]));
        await activate(`#choose [data-client="${id}"]`);
        await element(`#spa.on .portrait[data-client="${id}"]`).waitFor();
        await viewportFits();
        assert.ok(await element('#spa .hero').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
        const initial = await canvasPNG('#mask');
        const positions = conditions.map(({ x, y, radius }) => kind === 'pores' ?
          [Math.round(x - .48 * radius), Math.round(y - .21 * radius)] : [x, y]);
        const visible = await pixels(positions);
        assert.ok(visible.every(pixel => pixel[3] > 145), 'marks stand out in the skin layer');
        assert.ok((await pixels(profile.protected)).every(pixel => pixel[3] === 0));
        await shot('03-' + id + '-' + kind);
        assert.equal(await percent(), 0);
        await fullCart();
        if (index === 0) await shot('04-carrello-completo');

        const [mark] = conditions;
        const correct = correctTools[kind];
        await pick('cream');
        await element('#spa .portrait.puzzled').waitFor();
        assert.ok(await element('#spa .puzzled-face').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
        await shot('05-reazione-perplessa-' + id);
        assert.equal(await element('#spa .puzzled-face').evaluate(el => getComputedStyle(el).opacity), '1');
        for (let attempt = 0; attempt < 8; attempt++) await stroke([[mark.x, mark.y], [mark.x + 10, mark.y]]);
        assert.equal(await canvasPNG('#mask'), initial, 'wrong tool never changes the visible skin');
        assert.equal(await percent(), 0, 'repeated wrong gestures never complete a stage');
        await element('#spa .portrait:not(.puzzled)').waitFor();
        await pick('honey');
        assert.match(await element('#hint').innerText(), /^Cerca/);
        await pick('cleanser');
        assert.match(await element('#hint').innerText(), /^Prova:/);
        await pick(correct);
        await element('#spa .portrait.smile').waitFor();
        assert.ok(await element('#spa .grin').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
        assert.equal(await percent(), 0, 'choosing the right product does not advance');
        await shot('06-sorriso-' + id);
        assert.equal(await element('#spa .grin').evaluate(el => getComputedStyle(el).opacity), '1');

        await stroke([[mark.x, mark.y], [mark.x + 7, mark.y]]);
        await waitForFrame();
        assert.ok(await percent() > 0 && await percent() < 100);
        const partial = await pixels(positions);
        assert.ok(partial[0][3] < visible[0][3], 'treated mark visibly fades');
        if (conditions.length > 1) assert.deepEqual(partial.at(-1), visible.at(-1), 'distant untreated mark is unchanged');
        if (index === 0) await shot('07-miglioramento-parziale');
        for (const { x, y } of conditions) {
          for (let pass = 0; pass < 4; pass++) await stroke([[x - 6, y], [x + 6, y], [x - 6, y]]);
        }
        await element('#step').filter({ hasText: '2/' + sequence.length }).waitFor();
        assert.ok((await pixels(positions)).every(pixel => pixel[3] <= 40), 'only subtle treatment glow remains between phases');
        if (index === 0) await shot('08-fase-successiva');

        for (let phase = 1; phase < sequence.length; phase++) {
          const step = sequence[phase];
          await fullCart();
          const mask = masks[(index + devices.findIndex(device => device[0] === width)) % masks.length];
          await pick(step === 'mask' ? mask : correctTools[step]);
          if (step === 'cream') {
            for (let repeat = 0; repeat < 12; repeat++) await stroke([[155, 345], [192, 345], [155, 345]]);
            const cheekPercent = await percent();
            assert.ok(cheekPercent > 0 && cheekPercent < 100, `one cheek must progress without completing: ${cheekPercent}%`);
            await shot('08-crema-una-guancia-' + id);
            await stroke([[218, profile.forehead[1]], [278, profile.forehead[1]]]);
            await waitForFrame();
            const creamPercent = await percent();
            assert.ok(creamPercent > 0 && creamPercent < 100, `cream after cheek and forehead: ${creamPercent}%`);
            assert.notEqual(await canvasPNG('#mask'), initial, 'cream leaves a visible trace');
            if (index === 0) await shot('08-crema-in-assorbimento');
            await gestureUntil(async () => (await percent()) === 100, 5);
          } else {
            await gestureUntil(() => element('#next').isVisible());
            const [forehead, ...protectedPixels] = await pixels([profile.forehead, ...profile.protected]);
            assert.ok(forehead[3] > 130, 'applied product is visible');
            assert.ok(protectedPixels.every(pixel => pixel[3] === 0), 'eyes, eyebrows, lips and hair stay clear');
            if (step === 'mask') await shot('09-maschera-' + mask);
            await fullCart();
            await pick(step === 'mask' ? 'cream' : 'gel');
            const coated = await canvasPNG('#mask');
            await stroke([[230, profile.forehead[1]], [278, profile.forehead[1]]]);
            assert.equal(await canvasPNG('#mask'), coated);
            await activate('#next');
            assert.equal(await element('#meter').getAttribute('aria-label'), 'Risciacquo');
            await stroke([[230, profile.forehead[1]], [278, profile.forehead[1]]]);
            await waitForFrame();
            assert.ok(await percent() > 0 && await percent() < 100, 'rinsing progresses locally');
            const [rinsed] = await pixels([profile.forehead]);
            assert.ok(rinsed[3] < forehead[3], 'sponge removes product');
            if (step === 'mask' && index === 0) await shot('10-risciacquo-parziale');
            await gestureUntil(async () => (await percent()) === 100);
          }
          if (phase < sequence.length - 1) {
            await element('#step').filter({ hasText: (phase + 2) + '/' + sequence.length }).waitFor();
          }
        }

        await element('#done.on').waitFor();
        await viewportFits();
        assert.match(await element('.reward').innerText(), /3 stelle/);
        assert.equal(await page.evaluate(() => localStorage.getItem('dsp-stars')), String(10 + index * 3));
        if (index === 0) await shot('12-ricompensa-dopo');
        const after = await canvasPNG('#comparison');
        await activate('#before');
        assert.equal(await element('#before').getAttribute('aria-pressed'), 'true');
        assert.equal(await canvasPNG('#comparison'), initial, 'comparison restores initial skin');
        assert.notEqual(await canvasPNG('#comparison'), after);
        if (index === 0) await shot('11-prima-dopo');
        await activate('#after');
        assert.equal(await canvasPNG('#comparison'), after);
        await activate('#again');
        await element('#choose.on').waitFor();
        index++;
      }

      await activate('#choose [data-client="sofia"]');
      await element('#spa.on').waitFor();
      const renewed = await canvasPNG('#mask');
      await activate('#back');
      await activate('#play');
      await activate('#choose [data-client="sofia"]');
      assert.notEqual(await canvasPNG('#mask'), renewed, 'new sessions vary the visible imperfections');
      assert.notDeepEqual((await fixture('sofia', seeds[0])).sequence, (await fixture('sofia', seeds[3])).sequence);
      await page.reload();
      await element('#play:enabled').waitFor();
      assert.equal(await element('#stars').innerText(), '16');
      assert.deepEqual(errors, [], 'browser errors');
    } catch (error) {
      failed = true;
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await writeFile(dir + '/browser-errors.json', JSON.stringify(errors, null, 2));
      await context.tracing.stop(failed ? { path: dir + '/trace.zip' } : {});
      await browser.close();
    }
  });
}
