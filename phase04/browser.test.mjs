import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const seeds = [5, 6, 7, 0, 4, 8, 9, 0];
const baseline = process.env.SPA_BASELINE === '1';
const baseURL = process.env.SPA_URL || 'http://127.0.0.1:8000/';
const devices = [[320, 568, true], [412, 915, true], [1280, 720, false]];
const clients = {
  sofia: { protected: [[194, 294], [316, 294], [257, 387], [190, 231], [257, 90]], forehead: [256, 184], tracks: [173, 224], fringe: [[256, 175], [186, 350], [326, 352], [255, 420]], hair: [168, 185] },
  emma: { protected: [[195, 288], [314, 288], [256, 402], [182, 239], [248, 116]], forehead: [254, 199], tracks: [181, 232], fringe: [[215, 166], [171, 196], [169, 354], [338, 353], [255, 447]], hair: [332, 181] },
  maya: { protected: [[197, 306], [315, 306], [257, 414], [186, 248], [249, 128]], forehead: [254, 201], tracks: [186, 237], fringe: [[245, 173], [175, 193], [166, 363], [343, 368], [257, 459]], hair: [167, 171] }
};
const masks = ['strawberry', 'avocado', 'blueberry', 'honey'];
const correctTools = { spot: 'gel', redness: 'serum', pores: 'brush', cleanse: 'cleanser', cream: 'cream' };

for (const [width, height, touch] of devices) {
  if (process.env.SPA_VIEWPORT && process.env.SPA_VIEWPORT !== `${width}x${height}`) continue;
  test(`${width}×${height} · ${touch ? 'touch' : 'mouse'} · three complete sessions`, { timeout: 230000 }, async () => {
    const dir = `test-results/${baseline ? 'before/' : ''}${width}x${height}`;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await context.tracing.start({ snapshots: true });
    const page = await context.newPage();
    const cdp = touch && await context.newCDPSession(page);
    const errors = [];
    const cleanserEvidence = [];
    const spaEvidence = [];
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

    async function gesture(points, whileHeld) {
      const [first, ...rest] = points;
      if (touch) {
        await dispatch('touchStart', first);
        for (const point of rest) await dispatch('touchMove', point);
        if (whileHeld) await whileHeld();
        await dispatch('touchEnd');
      } else {
        await page.mouse.move(first.x, first.y);
        await page.mouse.down();
        for (const { x, y } of rest) await page.mouse.move(x, y);
        if (whileHeld) await whileHeld();
        await page.mouse.up();
      }
    }

    async function facePoints(points) {
      const box = await element('#mask').boundingBox();
      return points.map(([x, y]) => ({
        x: Math.round(box.x + x * box.width / 512),
        y: Math.round(box.y + y * box.height / 640)
      }));
    }

    async function stroke(points, whileHeld) {
      await gesture(await facePoints(points), whileHeld);
    }

    async function pixels(points) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return element('#mask').evaluate((canvas, coords) => coords.map(([x, y]) =>
        Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data)), points);
    }

    const percent = async () => Number(await element('#meter').getAttribute('aria-valuenow'));
    const canvasPNG = selector => element(selector).evaluate(canvas => canvas.toDataURL());

    async function reaction(mood, id) {
      if (!baseline) {
        const active = element(`#spa .portrait[data-face="${mood}"] .reaction-face`);
        await active.waitFor({ state: 'visible' });
        assert.equal(await element('#spa img.hero').evaluate(image => getComputedStyle(image).opacity), '0');
        assert.ok(await active.evaluate(canvas => canvas.getContext('2d').getImageData(384, 430, 1, 1).data[3] > 240));
      }
      await shot(`expression-${id}-${mood}`);
    }

    async function viewportFits() {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1), 'screen fits the viewport');
    }

    async function fixture(id, seed, sample = false) {
      return page.evaluate(async ({ id, seed, sample, fringe, hair }) => {
        const { clients } = await import(new URL('phase03/clients.mjs', document.baseURI));
        const { createJourney } = await import(new URL('phase04/journey.mjs', document.baseURI));
        const { loadStencil } = await import(new URL('phase03/skin-view.mjs', document.baseURI));
        const client = clients[id];
        const { skinAt, sampleCell } = await loadStencil('assets/' + client.stencil, 512, 640);
        const options = {
          width: 512, height: 640, client: id, skinAt, sampleCell,
          regions: client.regions.map(([x, y, radius]) => ({ x, y, radius }))
        };
        const journey = createJourney({ ...options, seed });
        const samples = sample ? Array.from({ length: 64 }, (_, index) => {
          const trial = createJourney({ ...options, seed: Math.imul(index, 2654435761) });
          return { sequence: trial.sequence.join('/'), count: trial.session.conditions.length };
        }) : [];
        return { sequence: journey.sequence, conditions: journey.session.conditions, samples,
          geometry: { included: fringe.map(([x, y]) => skinAt(x, y)), excludesHair: !skinAt(...hair) } };
      }, { id, seed, sample, fringe: clients[id].fringe, hair: clients[id].hair });
    }

    async function fullCart() {
      await activate('#cartToggle');
      const buttons = element('#cart button');
      assert.equal(await buttons.count(), baseline ? 10 : 11);
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

    async function prepare(id, positions, record) {
      const goal = element('#goal');
      const bubble = element('#hint');
      const face = element('#spa .portrait');
      await goal.filter({ hasText: 'Nuvole di vapore' }).waitFor();
      await bubble.filter({ hasText: 'Trascina il vaporizzatore' }).waitFor();
      const box = await bubble.boundingBox();
      const skin = await element('#mask').boundingBox();
      assert.ok(box.y + box.height + 8 < skin.y + skin.height * .23, 'the bubble does not overlap the portrait');
      assert.ok(await bubble.evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        const panel = node.getBoundingClientRect();
        return text.height > 0 && text.left >= panel.left && text.right <= panel.right &&
          text.top >= panel.top && text.bottom <= panel.bottom;
      }), 'all lines of bubble text fit inside the panel');
      if (record && id === 'sofia') {
        await face.locator('xpath=self::*[@data-mouth="1"]').waitFor();
        const first = await canvasPNG('#spa .reaction-face');
        await face.locator('xpath=self::*[@data-mouth="2"]').waitFor();
        assert.notEqual(await canvasPNG('#spa .reaction-face'), first);
        assert.equal(await element('#spa img.hero').evaluate(image => getComputedStyle(image).opacity), '0');
        await shot('03-nuvoletta-parlante');
        await face.locator('xpath=self::*[not(@data-mouth)]').waitFor();
        await bubble.waitFor({ state: 'hidden' });
        await activate('#repeatHint');
        await bubble.waitFor();
      }

      const quiet = await pixels(positions);
      const steam = element('#steamStart');
      const button = await steam.boundingBox();
      const tray = { x: Math.round(button.x + button.width / 2), y: Math.round(button.y + button.height / 2) };
      const cheek = [[159, 350], [184, 352], [196, 350]];
      if (record && id === 'sofia') {
        await activate('#steamStart');
        assert.equal(await steam.getAttribute('aria-pressed'), 'true');
        await stroke([cheek[0]], async () => {
          await page.waitForTimeout(270);
          assert.equal(await percent(), 0, 'stationary device does not prepare the skin');
          assert.ok(await element('#tool:not(.emitting)').isVisible());
        });
      }
      await gesture([tray, ...await facePoints(cheek)], async () => {
        assert.equal(await steam.getAttribute('aria-pressed'), 'true');
        await element('#tool.held.emitting').waitFor();
        await element('#character.relaxing').waitFor();
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.steam-plume')).opacity) > .3);
        if (record) await shot('steam-' + id);
      });
      const firstPass = await percent();
      assert.ok(firstPass > 0 && firstPass < 100);
      if (record) {
        for (let attempt = 0; attempt < 8; attempt++) await stroke(cheek);
        assert.equal(await percent(), firstPass, 'one cheek stops adding steam coverage');
      }
      const partial = await pixels(positions);
      assert.ok(partial.some((rgba, index) => rgba[3] > quiet[index][3] + 5), 'conditions gradually appear');
      await gestureUntil(async () => (await steam.isHidden()) || await percent() === 100);
      await steam.waitFor({ state: 'hidden' });
      const visible = await pixels(positions);
      assert.ok(visible.some((rgba, index) => rgba[3] > partial[index][3] + 10));
      if (record) spaEvidence.push({ client: id, singleZoneSteam: firstPass, initialMarks: quiet, partialMarks: partial, revealedMarks: visible });
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
        const { sequence: route, conditions, samples, geometry } = await fixture(id, seeds[index], !index || width === 320);
        const sequence = baseline ? route : route.slice(1);
        const offset = baseline ? 0 : 1;
        if (samples.length) {
          assert.equal(new Set(samples.map(trial => trial.sequence)).size, baseline ? 9 : 12);
          assert.ok(samples.every(trial => trial.count > 0));
        }
        if (!baseline) {
          assert.ok(geometry.included.every(Boolean), id + ' visible skin at forehead, cheeks and chin');
          assert.ok(geometry.excludesHair, id + ' hair stays outside the stencil');
        }
        const kind = ['spot', 'redness', 'pores'][index];
        assert.deepEqual(new Set(conditions.map(mark => mark.kind)), new Set([kind]));
        await activate(`#choose [data-client="${id}"]`);
        await element(`#spa.on .portrait[data-client="${id}"]`).waitFor();
        await viewportFits();
        assert.ok(await element('#spa img.hero').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
        const positions = conditions.map(({ x, y, radius }) => kind === 'pores' ?
          [Math.round(x - .48 * radius), Math.round(y - .21 * radius)] : [x, y]);
        if (!baseline) {
          await prepare(id, positions, true);
          await element('#spa .portrait:not([data-mouth])').waitFor();
        }
        const initial = await canvasPNG('#mask');
        const visible = await pixels(positions);
        assert.ok(visible.every(pixel => pixel[3] > 145), 'marks stand out in the skin layer');
        assert.ok((await pixels(profile.protected)).every(pixel => pixel[3] === 0));
        if (!baseline) {
          assert.ok(await element('#spa .reaction-face').isHidden());
          assert.equal(await element('#spa img.hero').evaluate(image => getComputedStyle(image).opacity), '1');
        }
        await shot(`expression-${id}-neutral`);
        assert.equal(await percent(), 0);
        await fullCart();
        if (index === 0) await shot('04-carrello-completo');

        const [mark] = conditions;
        const correct = correctTools[kind];
        await pick('cream');
        await element('#spa .portrait.puzzled').waitFor();
        if (baseline) await element('#spa .puzzled-face').evaluate(image => image.decode());
        await reaction('sad', id);
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
        if (baseline) await element('#spa .grin').evaluate(image => image.decode());
        assert.equal(await percent(), 0, 'choosing the right product does not advance');
        await reaction('happy', id);

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
        await element('#step').filter({ hasText: (2 + offset) + '/' + route.length }).waitFor();
        assert.ok((await pixels(positions)).every(pixel => pixel[3] <= 40), 'only subtle treatment glow remains between phases');
        if (index === 0) await shot('08-fase-successiva');

        for (let phase = 1; phase < sequence.length; phase++) {
          const step = sequence[phase];
          const phaseLabel = await element('#step').innerText();
          const phaseFinished = () => page.evaluate(label =>
            document.querySelector('#done').classList.contains('on') ||
            document.querySelector('#step').textContent !== label ||
            document.querySelector('#meter').getAttribute('aria-valuenow') === '100', phaseLabel);
          await fullCart();
          const mask = masks[(index + devices.findIndex(device => device[0] === width)) % masks.length];
          await pick(step === 'mask' ? mask : correctTools[step]);
          if (step === 'cleanse') {
            const cheek = [[155, 350], [190, 350]];
            await stroke(cheek);
            await waitForFrame();
            const cheekPercent = await percent();
            for (let repeat = 0; repeat < 10; repeat++) await stroke(cheek);
            assert.ok(cheekPercent > 0 && cheekPercent < 100);
            await waitForFrame();
            assert.equal(await percent(), cheekPercent, 'repeat passes add no new coverage');
            assert.ok(await element('#next').isHidden(), 'one cheek cannot unlock rinsing');
            const untouched = await pixels([[340, 350], [256, profile.tracks[0]]]);
            assert.ok(untouched.every(pixel => pixel[3] < 40), 'distant skin remains free of foam');
            for (const y of profile.tracks) await stroke([[217, y], [291, y]]);
            const seam = profile.tracks[0] + 23;
            const corridor = Array.from({ length: 7 }, (_, row) =>
              Array.from({ length: 57 }, (_, col) => [225 + col, seam + row])).flat();
            const alphas = (await pixels(corridor)).map(pixel => pixel[3]);
            const belowOpacity = alphas.filter(alpha => alpha < 175).length;
            if (!baseline) assert.equal(belowOpacity, 0, 'close strokes have no visible seam');
            cleanserEvidence.push({ client: id, cheekPercent, samples: alphas.length, minAlpha: Math.min(...alphas), belowOpacity });
            await shot(`cleanser-${id}-nearby-passes`);
          }
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
            const [fresh] = await pixels([profile.forehead]);
            if (index === 0) await shot('08-crema-in-assorbimento');
            await page.waitForTimeout(1550);
            const [absorbed] = await pixels([profile.forehead]);
            assert.ok(fresh[3] > absorbed[3] + 25, `cream alpha falls as it absorbs: ${fresh[3]} → ${absorbed[3]}`);
            assert.equal(await percent(), creamPercent, 'absorbing cream keeps spatial progress');
            await gestureUntil(phaseFinished, 5);
          } else {
            await gestureUntil(() => element('#next').isVisible());
            if (step === 'cleanse' && !baseline) {
              assert.equal(await element('#meter').getAttribute('aria-label'), 'Progresso del trattamento');
              const readyPercent = await percent();
              for (let y = 160; y <= 480; y += 16) await stroke([[116, y], [254, y], [400, y]]);
              await waitForFrame();
              assert.ok(await percent() >= readyPercent && await percent() >= 99);
              const [hair, ...fringe] = await pixels([profile.hair, ...profile.fringe]);
              assert.equal(hair[3], 0, id + ' hair remains clean');
              assert.ok(fringe.every(pixel => pixel[3] > 130), id + ' forehead, cheeks and chin accept foam');
            }
            const [forehead, ...protectedPixels] = await pixels([profile.forehead, ...profile.protected]);
            assert.ok(forehead[3] > 130, 'applied product is visible');
            assert.ok(protectedPixels.every(pixel => pixel[3] === 0), 'eyes, eyebrows, lips and hair stay clear');
            if (step === 'mask') await shot('09-maschera-' + mask);
            if (step === 'cleanse') await shot(`cleanser-${id}-before-rinse`);
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
            await gestureUntil(phaseFinished);
          }
          if (phase < sequence.length - 1) {
            await element('#step').filter({ hasText: (phase + 2 + offset) + '/' + route.length }).waitFor();
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

      if (!baseline) {
        for (const [index, id] of Object.keys(clients).entries()) {
          const { sequence, conditions } = await fixture(id, seeds[index + 3]);
          assert.equal(sequence[1], 'darkCircles');
          const points = conditions.map(({ x, y }) => [x, y - 5]);
          await activate(`#choose [data-client="${id}"]`);
          await prepare(id, points, false);
          const shadows = await pixels(points);
          assert.ok(shadows.every(pixel => pixel[3] > 80));
          await fullCart();
          await pick('gel');
          await stroke([[conditions[0].x, conditions[0].y]]);
          assert.equal(await percent(), 0, 'another product cannot treat the eye shadows');
          await pick('patches');
          const eyes = clients[id].protected.slice(0, 2);
          await stroke([eyes[0]]);
          assert.equal(await percent(), 0, 'the patch cannot be placed over the eye');
          const [left, right] = conditions.map(({ x, y }) => [x, y]);
          await stroke([[255, 420], left]);
          await waitForFrame();
          assert.equal(await percent(), 25);
          await stroke([left]);
          assert.equal(await percent(), 25, 'the same patch cannot count twice');
          await stroke([[255, 420], right]);
          await element('#character.patch-rest').waitFor();
          assert.equal(await percent(), 50);
          const placed = await pixels([left, right, ...eyes]);
          assert.ok(placed.slice(0, 2).every(pixel => pixel[3] > 225));
          assert.ok(placed.slice(2).every(pixel => pixel[3] === 0), 'both eyes stay uncovered');
          await shot('patch-rest-' + id);
          await element('#goal').filter({ hasText: 'Togli le patch' }).waitFor();
          await shot('patch-removal-' + id);
          await stroke([left, [250, 423]]);
          await waitForFrame();
          assert.equal(await percent(), 75);
          const [firstRemoved] = await pixels(points);
          assert.ok(firstRemoved[3] < shadows[0][3] - 35);
          await stroke([right]);
          await waitForFrame();
          const improved = await pixels(points);
          assert.ok(improved.every((pixel, i) => pixel[3] < shadows[i][3] - 35));
          await shot('patch-after-' + id);
          await element('#step').filter({ hasText: '3/' + sequence.length }).waitFor();
          spaEvidence.push({ client: id, shadows, placed, improved });
          await activate('#back');
          await activate('#play');
        }
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
      await writeFile(dir + '/cleanser-coverage.json', JSON.stringify(cleanserEvidence, null, 2));
      await writeFile(dir + '/browser-errors.json', JSON.stringify(errors, null, 2));
      await context.tracing.stop(failed ? { path: dir + '/trace.zip' } : {});
      await writeFile(dir + '/spa-experience.json', JSON.stringify(spaEvidence, null, 2));
      await context.close();
      await browser.close();
    }
  });
}
