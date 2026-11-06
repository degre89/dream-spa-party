import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { captureSpeech } from '../.github/scripts/speech.mjs';
import { clients } from '../phase03/clients.mjs';
import { MASK_TOOLS } from '../phase03/facial-state.mjs';
import { products } from './products.mjs';
import { probes } from './geometry.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const devices = [[320, 568, true], [412, 915, true], [1280, 720, false]];
const baseURL = process.env.SPA_URL || 'http://127.0.0.1:8000/';
const openingTools = { spot: 'gel', redness: 'serum', pores: 'brush' };

for (const [width, height, touch] of devices) {
  const viewport = `${width}x${height}`;
  if (process.env.SPA_VIEWPORT && process.env.SPA_VIEWPORT !== viewport) continue;
  test(`${viewport} · ${touch ? 'touch' : 'mouse'} · collection and six new clients`, { timeout: 540000 }, async () => {
    const dir = `test-results/collection/${viewport}`;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const cdp = touch && await context.newCDPSession(page);
    const errors = [];
    const results = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url());
    });
    page.on('console', message => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
    });
    await page.addInitScript(({ clientIds, productIds }) => {
      // Exercise the original gameplay matrix with a fully unlocked test collection.
      if (!localStorage.getItem('dsp-progress')) {
        localStorage.setItem('dsp-progress', JSON.stringify({
          version: 1, balance: 41, earned: 41, clients: clientIds, products: productIds,
        }));
      }
      if (localStorage.getItem('dsp-stars') === null) localStorage.setItem('dsp-stars', '41');
      const random = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (!(array instanceof Uint32Array) || array.length !== 1) return random(array);
        array[0] = window.testSeed ?? 5;
        return array;
      };
    }, { clientIds: Object.keys(clients), productIds: Object.values(products).flat().map(item => item.id) });

    const el = selector => page.locator(selector);
    const shot = (name, selector) => (selector ? el(selector) : page).screenshot({
      path: `${dir}/${name}.png`, animations: 'disabled'
    });
    const tap = async selector => {
      const target = el(selector);
      if (touch) await target.tap();
      else await target.click();
    };
    const step = (index, count) => el('#step').filter({ hasText: `${index}/${count}` }).waitFor();
    const stars = () => page.evaluate(() => localStorage.getItem('dsp-stars'));
    const percent = async () => Number(await el('#meter').getAttribute('aria-valuenow'));
    const waitForPercent = value => el('#meter[aria-valuenow="' + value + '"]').waitFor();
    const activeFace = '#spa .portrait';
    const reaction = activeFace + ' .reaction-face';

    async function stroke(points, held) {
      const box = await el('#mask').boundingBox();
      const positions = points.map(([x, y]) => ({
        x: Math.round(box.x + x * box.width / 512),
        y: Math.round(box.y + y * box.height / 640)
      }));
      if (touch) {
        const send = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
        await send('touchStart', positions[0]);
        for (const point of positions.slice(1)) await send('touchMove', point);
        if (held) await held();
        await send('touchEnd');
      } else {
        await page.mouse.move(positions[0].x, positions[0].y);
        await page.mouse.down();
        for (const { x, y } of positions.slice(1)) await page.mouse.move(x, y);
        if (held) await held();
        await page.mouse.up();
      }
    }

    const sweep = [];
    for (let y = 128, row = 0; y <= 480; y += 18, row++) {
      const left = [115, y], right = [397, y];
      sweep.push(...(row % 2 ? [right, left] : [left, right]));
    }

    async function cover(until) {
      for (let attempt = 0; attempt < 2 && !await until(); attempt++) await stroke(sweep);
      assert.ok(await until(), 'full-face strokes reach the treatment threshold');
    }

    let variantIndex = 0;
    let recordProducts = false;
    let variantCatalog;

    async function pickVariant(category) {
      const choices = variantCatalog[category];
      const options = el('#productOptions button');
      assert.deepEqual(await options.allTextContents(), choices.map(variant => variant.name));
      for (const option of await options.all()) {
        assert.ok(await option.locator('img').evaluate(async image => {
          await image.decode();
          return image.naturalWidth > 0;
        }));
      }
      if (recordProducts && variantIndex === 0) await shot('products-' + category);
      const variant = choices[variantIndex];
      await tap(`[data-variant="${variant.id}"]`);
      assert.ok(await el('#cart').isHidden());
      return variant;
    }

    async function checkProductStroke(category, points, variant) {
      await stroke(points, async () => {
        assert.equal(await el('#tool img').getAttribute('src'), variant.asset);
        const face = await el('#mask').boundingBox();
        const [x, y] = points.at(-1);
        const actual = await el('#tool').evaluate(node => [parseFloat(node.style.left), parseFloat(node.style.top)]);
        assert.ok(Math.abs(face.width * (actual[0] / 100 - x / 512)) <= 1);
        assert.ok(Math.abs(face.height * (actual[1] / 100 - y / 640)) <= 1);
        if (category === 'steamer') {
          assert.equal(await el('.steam-plume').evaluate(node => node.style.getPropertyValue('--vapor')), variant.effect.color);
        } else {
          await el('.product-particle').filter({ hasText: variant.effect.glyph }).first().waitFor({ timeout: 1000 });
        }
        if (recordProducts) await page.screenshot({ path: dir + '/effect-' + variant.id + '.png' });
      });
    }

    async function tool(id) {
      await tap('#cartToggle');
      if (MASK_TOOLS.includes(id)) {
        await tap('#maskToggle');
        assert.equal(await el('#maskOptions button:visible').count(), 4);
      }
      const selector = `[data-tool="${id}"]`;
      await tap(selector);
      const variant = variantCatalog?.[id] && await pickVariant(id);
      assert.equal(await el(selector).getAttribute('aria-pressed'), 'true');
      assert.ok(await el('#cart').isHidden());
      return variant;
    }

    const alpha = points => el('#mask').evaluate((canvas, points) => {
      const ctx = canvas.getContext('2d');
      return points.map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
    }, points);

    async function fixture(id) {
      return page.evaluate(async ({ id, probes }) => {
        const { clients } = await import(new URL('phase03/clients.mjs', document.baseURI));
        const { loadStencil } = await import(new URL('phase03/skin-view.mjs', document.baseURI));
        const { createJourney } = await import(new URL('phase04/journey.mjs', document.baseURI));
        const { skinAt, sampleCell } = await loadStencil(new URL('assets/' + clients[id].stencil, document.baseURI).href, 512, 640);
        const options = {
          width: 512, height: 640, client: id, skinAt, sampleCell,
          regions: clients[id].regions.map(([x, y, radius]) => ({ x, y, radius }))
        };
        const regular = new Map();
        let patches;
        for (let index = 0; index < 64; index++) {
          const seed = Math.imul(index, 2654435761) >>> 0;
          const { sequence, session } = createJourney({ ...options, seed });
          if (!sequence.includes('cleanse') || !sequence.includes('cream')) continue;
          const entry = { seed, sequence, marks: session.conditions };
          if (sequence[1] === 'darkCircles') patches ??= entry;
          else if (!regular.has(sequence[1])) regular.set(sequence[1], entry);
        }
        return { patches, regular: [...regular.values()], included: probes.skin.map(point => skinAt(...point)),
          excluded: probes.protected.map(point => !skinAt(...point)),
          marksReachable: [...regular.values(), patches].every(route => route.marks.length &&
            route.marks.every(mark => skinAt(mark.x, mark.y))) };
      }, { id, probes: probes[id] });
    }

    try {
      await page.goto(baseURL);
      await el('#play:enabled').waitFor();
      await tap('#play');
      const buttons = el('.client');
      assert.equal(await buttons.count(), 9);
      const expectedNames = Object.values(clients).map(profile => profile.name);
      assert.deepEqual(await buttons.allTextContents(), expectedNames);
      for (const button of await buttons.all()) {
        await button.scrollIntoViewIfNeeded();
        assert.ok(await button.isEnabled());
        const box = await button.boundingBox();
        assert.ok(box.width >= 76 && box.x >= 0 && box.x + box.width <= width);
        assert.ok(await button.locator('img').evaluate(async image => {
          await image.decode();
          return image.naturalWidth > 0;
        }));
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await buttons.first().scrollIntoViewIfNeeded();
      await shot('collection-top');
      await buttons.last().scrollIntoViewIfNeeded();
      await shot('collection-bottom');

      if (await el('#steamModels').count()) {
        variantCatalog = await page.evaluate(async () => (await import(new URL('phase06/products.mjs', document.baseURI))).products);
      }
      let total = 41;
      for (const id of Object.keys(probes)) {
        const { patches, regular, included, excluded, marksReachable } = await fixture(id);
        assert.equal(regular.length, 3, id + ' has all three non-patch openings');
        assert.ok(patches && marksReachable && included.every(Boolean) && excluded.every(Boolean), id + ' geometry');
        const scenarios = [...regular, patches];

        for (const [scenario, mask] of MASK_TOOLS.entries()) {
          const { seed, sequence, marks } = scenarios[scenario];
          const opening = sequence[1];
          const record = scenario === 0;
          variantIndex = scenario;
          recordProducts = id === Object.keys(probes)[0];
          await page.evaluate(seed => { window.testSeed = seed; }, seed);
          await tap(`.client[data-client="${id}"]`);
          await el(`${activeFace}[data-client="${id}"]`).waitFor();
          await el(activeFace + ' .hero').evaluate(image => image.decode());
          await el(activeFace + ' .spa-eyelids').evaluate(image => image.decode());
          const count = sequence.length;
          await step(1, count);
          assert.equal(await stars(), String(total));
          if (record) {
            const frames = await captureSpeech(el(activeFace));
            assert.ok(frames.changed, 'both speaking frames change the portrait pixels');
            assert.ok(frames.heroHidden, 'the speaking canvas replaces the original portrait');
            await shot(id + '-talk');
            await el(activeFace + ':not([data-mouth])').waitFor();
            await shot(id + '-neutral', activeFace);
          }

          let vapor;
          if (variantCatalog) {
            await tap('#steamModels');
            vapor = await pickVariant('steamer');
            assert.equal(await percent(), 0);
          }
          await tap('#steamStart');
          const [forehead, leftCheek, rightCheek] = probes[id].skin;
          await stroke([leftCheek, [leftCheek[0] + 20, leftCheek[1]]], async () => {
            await el('#character.relaxing').waitFor();
            if (record) {
              await page.waitForFunction(() => +getComputedStyle(document.querySelector('.spa-eyelids')).opacity > .9);
              await shot(id + '-relaxed', activeFace);
            }
          });
          if (vapor) await checkProductStroke('steamer', [forehead, [forehead[0] + 12, forehead[1]]], vapor);
          assert.ok(await percent() > 0 && await percent() < 100);
          await cover(async () => await percent() === 100 || await el('#steamStart').isHidden());
          await step(2, count);

          const markPixels = await alpha(marks.map(({ x, y }) => [x, y]));
          assert.ok(markPixels.some(value => value > 70), 'marks become visible');
          if (record) {
            await tool('cream');
            await stroke([forehead, leftCheek, rightCheek]);
            await el(activeFace + '[data-face="sad"]').waitFor();
            assert.equal(await el(activeFace + ' .hero').evaluate(image => getComputedStyle(image).opacity), '0');
            assert.ok(await el(reaction).isVisible());
            await shot(id + '-sad', activeFace);
            await tool('sponge');
            await el('#hint').filter({ hasText: 'Prova con' }).waitFor();
          }

          if (opening === 'darkCircles') {
            await tool('patches');
            const [left, right] = marks.map(({ x, y }) => [x, y]);
            await stroke([left]);
            await waitForPercent(25);
            await stroke([right]);
            await el('#character.patch-rest').waitFor();
            assert.equal(await percent(), 50);
            assert.ok((await alpha([left, right])).every(value => value > 220));
            await shot(id + '-patches');
            await el('#goal').filter({ hasText: 'Togli le patch' }).waitFor();
            await stroke([left]);
            await waitForPercent(75);
            await stroke([right]);
          } else {
            await tool(openingTools[opening]);
            for (let pass = 0; pass < 24 && await percent() < 100 &&
              (await el('#step').innerText()).includes(`2/${count}`); pass++) {
              for (const { x, y } of marks) await stroke(opening === 'spot' ? [[x, y]] : [[x - 5, y], [x + 5, y], [x - 5, y]]);
            }
          }
          await step(3, count);
          const cleanser = await tool('cleanser');
          if (cleanser) await checkProductStroke('cleanser', [leftCheek, [leftCheek[0] + 10, leftCheek[1]]], cleanser);
          await cover(() => el('#next').isVisible());
          assert.ok((await alpha(probes[id].protected)).every(value => value === 0));
          const treated = await alpha(probes[id].skin);
          assert.ok(treated.every(value => value > 50), id + ' cleanser reaches every sampled facial zone');
          if (record) await shot(id + '-cleanser', '#character');
          let sponge;
          if (variantCatalog && recordProducts && variantIndex === 0) {
            await tap('#cartToggle');
            await tap('#maskToggle');
            await tap('#next');
            assert.ok(await el('#maskPanel').isHidden());
            assert.equal(await el('[data-category="sponge"]').getAttribute('aria-pressed'), 'false');
            sponge = await pickVariant('sponge');
          } else sponge = await tool('sponge');
          if (sponge) await checkProductStroke('sponge', [forehead, [forehead[0] + 8, forehead[1]]], sponge);
          await cover(async () => await percent() === 100 || (await el('#step').innerText()).includes(`4/${count}`));
          await step(4, count);
          const cream = await tool('cream');
          if (cream) await checkProductStroke('cream', [rightCheek, [rightCheek[0] - 10, rightCheek[1]]], cream);
          await cover(async () => await percent() === 100 || (await el('#step').innerText()).includes(`5/${count}`));
          if (record) await shot(id + '-cream', '#character');
          await step(5, count);
          await tool(mask);
          await cover(() => el('#hint').filter({ hasText: 'spugnetta' }).isVisible());
          assert.ok(await el('#next').isHidden());
          assert.ok((await alpha(probes[id].protected)).every(value => value === 0), id + ' mask clips at protected pixels');
          const beforeRinse = await percent();
          await stroke(sweep);
          assert.equal(await percent(), beforeRinse, 'rinsing requires selecting the sponge');
          await shot(id + '-' + mask, '#character');
          await tool('sponge');
          await cover(async () => await percent() === 100 || await el('#done.on').isVisible());
          await el('#done.on').waitFor();
          await el('#done .portrait[data-face="happy"]').waitFor();
          total += 3;
          assert.equal(await stars(), String(total));
          if (record) await shot(id + '-happy', '#done .portrait');
          results.push({ id, opening, mask, sequence, cleanserAlpha: treated, stars: total });
          await tap('#again');
        }
      }
      await page.reload();
      await el('#play:enabled').waitFor();
      assert.equal(await stars(), String(total));
      assert.equal(await el('#stars').innerText(), String(total));
      assert.deepEqual(errors, []);
    } catch (error) {
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await writeFile(dir + '/results.json', JSON.stringify({ results, errors }, null, 2));
      await browser.close();
    }
  });
}

