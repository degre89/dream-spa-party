import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const shadowColors = ['Rosa confetto', 'Lilla', 'Azzurro cielo', 'Turchese', 'Viola', 'Oro perlato',
  'Verde menta', 'Pesca perlato', 'Argento lunare'];
const finishes = ['Soft', 'Pearl', 'Sparkle'];
const decals = ['Stellina', 'Cuoricino', 'Farfallina', 'Brillantino', 'Luna', 'Fiorellino', 'Gemma', 'Petalo'];
const { chromium } = createRequire(import.meta.url)('playwright');

// Independent sample points from the original portraits, in 512 × 640 units.
const clients = {
  sofia: { eyes: [[188, 258], [326, 254]], iris: [[188, 290], [326, 290]], cheeks: [[178, 345], [334, 345]], lips: [256, 380, 393], jewels: [[178, 339], [334, 339], [257, 204]] },
  azzurrina: { eyes: [[190, 251], [325, 251]], iris: [[190, 285], [325, 285]], cheeks: [[182, 339], [331, 339]], lips: [256, 380, 392], jewels: [[181, 334], [332, 334], [256, 203]] },
  emma: { eyes: [[186, 262], [326, 262]], iris: [[196, 286], [313, 286]], cheeks: [[181, 346], [333, 344]], lips: [256, 393, 407], jewels: [[179, 341], [332, 341], [256, 203]] },
  maya: { eyes: [[186, 274], [328, 273]], iris: [[195, 306], [314, 306]], cheeks: [[178, 357], [334, 357]], lips: [258, 400, 419], jewels: [[177, 350], [335, 350], [255, 207]] },
  alice: { eyes: [[185, 251], [326, 250]], iris: [[202, 282], [307, 282]], cheeks: [[178, 339], [336, 338]], lips: [257, 379, 391], jewels: [[178, 334], [336, 334], [258, 195]] },
  martina: { eyes: [[185, 254], [327, 252]], iris: [[202, 284], [311, 283]], cheeks: [[180, 339], [334, 337]], lips: [257, 377, 389], jewels: [[180, 334], [334, 334], [256, 189]] },
  federica: { eyes: [[189, 252], [327, 249]], iris: [[202, 284], [306, 282]], cheeks: [[177, 337], [335, 338]], lips: [256, 377, 389], jewels: [[177, 333], [336, 333], [255, 192]] },
  rachele: { eyes: [[195, 256], [322, 253]], iris: [[207, 283], [315, 282]], cheeks: [[184, 338], [329, 338]], lips: [258, 374, 385], jewels: [[183, 333], [330, 333], [257, 202]] },
  ginevra: { eyes: [[189, 252], [325, 250]], iris: [[202, 282], [304, 282]], cheeks: [[177, 339], [336, 339]], lips: [258, 383, 396], jewels: [[177, 333], [336, 333], [256, 196]] },
  chiara: { eyes: [[191, 253], [322, 252]], iris: [[208, 285], [306, 283]], cheeks: [[182, 337], [331, 337]], lips: [257, 375, 387], jewels: [[183, 331], [331, 331], [256, 197]] },
};

for (const [width, height, touch] of [[320, 568, true], [412, 915, true], [1280, 720, false]]) {
  const viewport = width + 'x' + height;
  if (process.env.SPA_VIEWPORT && process.env.SPA_VIEWPORT !== viewport) continue;
  test(viewport + ' interactive makeup · ten clients', { timeout: 900000 }, async () => {
    const dir = 'test-results/makeup/' + viewport;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, reducedMotion: 'reduce' });
    if (process.env.SPA_TRACE) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
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
    const portraitShot = (name, stage) => viewport === '412x915' &&
      el('.studio-face').screenshot({ path: dir + '/' + name + '-' + stage + '.png', animations: 'disabled',
        style: '.studio-tool, .studio-spark { visibility: hidden !important; }' });
    const select = async id => {
      await tap('#studioCards [data-client="' + id + '"]');
      await el('#studioEditor[data-client="' + id + '"]:not([hidden])').waitFor();
    };
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
    const sweep = (x, y, length = 26) => Array.from({ length: 9 }, (_, i) => [x - length / 2 + length * i / 8, y]);
    let category, shade;
    const product = { shadow: 'Ombretto', blush: 'Blush', lips: 'Rossetto', jewels: 'Decorazione' };
    const expanded = () => el('#studioCart').getAttribute('aria-expanded');
    const activeChoice = () => el('#studioChoice').innerText();
    const chooseProduct = name => tap('#studioProducts button:text-is("' + name + '")');
    const chooseColor = label => tap('#studioPalette button[aria-label="' + label + '"]');
    async function open(id) {
      if (!(await el('#studioCategories [data-category="' + id + '"][aria-pressed=true]').count())) {
        await tap('#studioCategories [data-category="' + id + '"]');
      }
      assert.equal(await expanded(), 'true');
    }
    async function ensureProduct() {
      await open(category);
      if (!await el('#studioProducts [aria-pressed=true]').count()) await chooseProduct(product[category]);
    }
    async function finish(name) {
      if (await expanded() === 'false' || await el('#studioFinishes').isHidden()) await color(shade);
      assert.equal(await expanded(), 'true', 'color browsing keeps the tray open');
      await tap('#studioFinishes button:text-is("' + name + '")');
      assert.equal(await expanded(), 'false', 'a finish activates the tool and closes the tray');
      assert.match(await activeChoice(), new RegExp(name));
    }
    const imageBytes = selector => el(selector).evaluate(canvas => canvas.toDataURL());
    const paintBytes = () => imageBytes('#studioPaint');
    const eyeState = () => el('#studioPortrait').getAttribute('data-eyes');
    async function tool(id) {
      category = id;
      shade = { shadow: 'Rosa confetto', blush: 'Rosa', lips: 'Fucsia' }[id];
      await ensureProduct();
    }
    async function color(label) {
      shade = label;
      const prior = await activeChoice();
      if (label === 'Gloss trasparente') {
        await open('lips');
        await chooseProduct('Gloss');
      } else {
        await ensureProduct();
        await chooseColor(label);
      }
      if (category === 'jewels' || label === 'Gloss trasparente') {
        assert.equal(await expanded(), 'false');
        assert.ok((await activeChoice()).includes(label));
      } else {
        assert.equal(await expanded(), 'true');
        assert.equal(await activeChoice(), prior, 'a draft does not replace the active product');
      }
    }
    async function clear() { await tap('#studioClear'); }
    const maskLeaks = (id, closed, category = 'shadow') => page.evaluate(async ({ id, closed, category }) => {
      const { regions } = await import('./phase08/paint.mjs');
      const c = document.querySelector('#studioPaint').getContext('2d');
      const masks = regions(id, category, closed);
      const data = c.getImageData(0, 0, 512, 640).data;
      let leaks = 0;
      for (let y = 0; y < 640; y++) for (let x = 0; x < 512; x++) {
        if (data[(y * 512 + x) * 4 + 3] <= 8) continue;
        // Allow one pixel for Chromium's antialiased clip raster.
        if (!masks.some(mask => [[.5, .5], [-.5, .5], [1.5, .5], [.5, -.5], [.5, 1.5], [0, 0], [0, 1], [1, 0], [1, 1]]
          .some(([dx, dy]) => c.isPointInPath(mask, x + dx, y + dy)))) leaks++;
      }
      return leaks;
    }, { id, closed, category });
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
      assert.equal(await el('#studioCards button:enabled').count(), 10);
      assert.match(await el('#studioSelection').innerText(), /dieci clienti e i cosmetici sono gratuiti/);
      const ids = Object.keys(clients);

      for (const [index, client] of ids.entries()) {
        const { eyes: [shadowPoint, rightPoint], iris, cheeks, lips: [cx, upper, lower], jewels } = clients[client];
        const safe = [[256, 90], [256, 224], ...iris, [256, 344], [400, 200]];
        const lip = [cx, lower];
        const corner = [cx + 35, upper];
        const belowLip = [cx, lower + 20];
        await select(client);
        assert.equal(await sumAlpha(), 0, 'look starts empty for each client');
        await portraitShot(client, 'prima');
        const portraitMatches = async (eyes = 'open') => page.evaluate(async ({ id, eyes }) => {
          const { clients } = await import('./phase03/clients.mjs');
          const portrait = document.querySelector('#studioPortrait');
          const load = async asset => {
            const image = new Image();
            image.src = 'assets/' + asset;
            await image.decode();
            return image;
          };
          const { portrait: original, eyelids } = clients[id];
          const canvas = document.createElement('canvas');
          canvas.width = portrait.width;
          canvas.height = portrait.height;
          const context = canvas.getContext('2d');
          context.drawImage(await load(original), 0, 0, canvas.width, canvas.height);
          if (eyes !== 'open') {
            const lids = await load(eyelids);
            const width = eyes === 'closed' ? canvas.width : canvas.width / 2;
            const x = eyes === 'right-wink' ? canvas.width / 2 : 0;
            context.beginPath();
            context.rect(x, 0, width, canvas.height);
            context.clip();
            context.drawImage(lids, 0, 0, canvas.width, canvas.height);
          }
          return canvas.toDataURL() === portrait.toDataURL();
        }, { id: client, eyes });
        assert.ok(await portraitMatches(), 'editor loads the original portrait');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        if (index === 0) {
          const portraitPosition = () => el('#studioPaint').evaluate(canvas => {
            const rect = canvas.getBoundingClientRect();
            return [rect.x, rect.y + window.scrollY, rect.width, rect.height];
          });
          const stage = await portraitPosition();
          const finishBox = await el('#studioFinish').boundingBox();
          if (touch) {
            assert.ok(finishBox.y + finishBox.height <= height, 'Finish fits on screen with the closed tray');
            await shot('carrello-chiuso', false);
          }
          await tap('#studioCart');
          assert.equal(await expanded(), 'true');
          await tap('#studioCart');
          assert.equal(await expanded(), 'false');
          await tool('shadow');
          await color('Rosa confetto');
          const expandedStage = await portraitPosition();
          assert.deepEqual(expandedStage, stage, 'expanding the tray does not move the portrait');
          await stroke([shadowPoint]);
          assert.equal(await expanded(), 'true', 'touching the face cannot toggle the tray');
          assert.equal(await sumAlpha(), 0, 'incomplete selection cannot apply pigment');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
          if (touch) {
            await page.evaluate(() => window.scrollTo(0, 0));
            await shot('carrello-aperto', false);
          }
          if (touch) await shot('palette-completa');
        }
        await tool('shadow');
        assert.deepEqual(await el('#studioPalette button').evaluateAll(buttons =>
          buttons.map(button => button.getAttribute('aria-label'))), shadowColors);
        await finish('Soft');
        const left = sweep(...shadowPoint);
        const right = sweep(...rightPoint);
        assert.equal((await pixels([shadowPoint]))[0][3], 0, 'selection alone applies no product');
        await stroke([shadowPoint]);
        const first = (await pixels([shadowPoint]))[0][3];
        assert.ok(first > 0 && first < 160, client + ' applies a light first coat');
        await stroke(left, async () => {
          assert.equal(await el('.studio-tool').isVisible(), true, 'brush follows an active gesture');
          assert.equal(await eyeState(), 'closed', 'brush closes eyes while held');
          assert.ok(await portraitMatches('closed'), 'SVG eyelids match the portrait at their displayed scale');
        });
        assert.equal(await eyeState(), 'open', 'eyes reopen on release');
        const second = (await pixels([shadowPoint]))[0][3];
        assert.ok(second > first, 'pigment is progressive');
        assert.equal((await pixels([rightPoint]))[0][3], 0, 'other eyelid stays clean');
        await stroke(right);
        assert.ok((await pixels([rightPoint]))[0][3] > 0);
        const [pink, untouchedEye] = await pixels([shadowPoint, rightPoint]);
        await color('Turchese');
        await finish('Sparkle');
        assert.deepEqual((await pixels([shadowPoint, rightPoint])), [pink, untouchedEye],
          'choosing a finish never modifies existing strokes');
        await stroke(left);
        assert.notDeepEqual((await pixels([shadowPoint]))[0], pink, 'color changes where stroked');
        assert.deepEqual((await pixels([rightPoint]))[0], untouchedEye, 'changing one eyelid preserves the other');
        await portraitShot(client, 'ombretti-aperti');
        await stroke(left, async () => {
          assert.equal(await eyeState(), 'closed');
          assert.ok(await sumAlpha() > 0);
          assert.equal(await maskLeaks(client, true), 0);
          await portraitShot(client, 'ombretti-chiusi');
        });
        await tap('#studioUndo');
        await tap('#studioUndo');
        assert.deepEqual((await pixels([shadowPoint]))[0], pink, 'undo restores exact pigment');

        // Paint across protected landmarks and verify independently selected pixels.
        await stroke(safe);
        assert.ok((await pixels(safe)).every(p => p[3] === 0));
        assert.equal(await maskLeaks(client, false), 0, 'shadow stays inside both eye stencils');
        await clear();
        assert.equal(await sumAlpha(), 0);

        const shadowRenders = [];
        for (const name of finishes) {
          await color('Viola');
          await finish(name);
          await stroke(left);
          await stroke(right);
          shadowRenders.push(await paintBytes());
          await portraitShot(client, 'ombretto-' + name);
          await clear();
        }
        assert.equal(new Set(shadowRenders).size, finishes.length, 'three static eyeshadow finishes');
        if (viewport === '412x915') {
          for (const [index, name] of shadowColors.entries()) {
            await color(name);
            await finish('Soft');
            await stroke(left);
            await stroke(right);
            await portraitShot(client, 'tonalita-' + (index + 1));
            await clear();
          }
        }
        await color('Lilla');
        await finish('Pearl');
        await stroke(left);
        await finish('Sparkle');
        await stroke(right);
        await tool('blush');
        assert.equal(await el('#studioPalette button').count(), 4);
        await color('Pesca');
        const eyesOnly = await paintBytes();
        await finish('Soft');
        for (const cheek of cheeks) await stroke(sweep(...cheek));
        assert.ok((await pixels(cheeks)).every(p => p[3] > 0));
        const softCheeks = await paintBytes();
        await portraitShot(client, 'blush-Soft');
        await clear();
        assert.equal(await paintBytes(), eyesOnly, 'blush clearing preserves finished eyeshadow');
        await finish('Pearl');
        for (const cheek of cheeks) await stroke(sweep(...cheek));
        const pearlCheeks = await paintBytes();
        assert.notEqual(pearlCheeks, softCheeks);
        await clear();
        await finish('Sparkle');
        for (const cheek of cheeks) await stroke(sweep(...cheek));
        const sparkleCheeks = await paintBytes();
        assert.notEqual(sparkleCheeks, pearlCheeks);
        await color('Pesca');
        await tap('#studioHearts');
        await finish('Sparkle');
        for (const cheek of cheeks) await stroke(sweep(...cheek));
        const fantasyCheeks = await paintBytes();
        assert.notEqual(fantasyCheeks, sparkleCheeks);
        await portraitShot(client, 'blush-Fantasy');
        await tap('#studioUndo');
        await tap('#studioUndo');
        assert.equal(await paintBytes(), sparkleCheeks, 'undo removes both heart strokes exactly');
        for (const cheek of cheeks) await stroke(sweep(...cheek));
        assert.equal(await paintBytes(), fantasyCheeks, 'identical gestures replay deterministically');
        await clear();
        assert.equal(await paintBytes(), eyesOnly, 'category clear also removes hearts and sparkles');
        await tap('#studioUndo');
        await tool('lips');
        assert.equal(await el('#studioPalette button').count(), 4);
        await color('Gloss trasparente');
        assert.deepEqual(await pixels([lip, corner]), [[0, 0, 0, 0], [0, 0, 0, 0]]);
        await stroke(sweep(cx, lower, 12));
        const naturalGloss = await pixels([lip, corner, belowLip]);
        assert.ok(naturalGloss[0][3] > 0, 'gloss appears under the applicator');
        assert.deepEqual(naturalGloss.slice(1), [[0, 0, 0, 0], [0, 0, 0, 0]]);
        await page.waitForTimeout(180);
        assert.deepEqual(await pixels([lip, corner, belowLip]), naturalGloss, 'reduced motion keeps a steady sheen');
        await clear();
        const lipstickRenders = [];
        for (const name of finishes) {
          await color('Fucsia');
          await finish(name);
          await stroke(sweep(cx, upper, 54));
          await stroke(sweep(cx, lower, 40));
          lipstickRenders.push(await paintBytes());
          await portraitShot(client, 'labbra-' + name);
          if (name !== 'Sparkle') await clear();
        }
        assert.equal(new Set(lipstickRenders).size, finishes.length, 'three static lipstick finishes');
        assert.ok((await pixels([[cx, upper], lip])).every(p => p[3] > 0), client + ' lipstick covers both lips');
        assert.equal((await pixels([belowLip]))[0][3], 0);
        const beforeGloss = (await pixels([lip]))[0];
        const lipstick = await paintBytes();
        await color('Gloss trasparente');
        await stroke(sweep(cx, lower, 50));
        assert.notDeepEqual((await pixels([lip]))[0], beforeGloss);
        await portraitShot(client, 'labbra-gloss');
        await tap('#studioUndo');
        assert.equal(await paintBytes(), lipstick, 'undoing gloss restores the finished lipstick exactly');
        await stroke(sweep(cx, lower, 50));
        await tool('jewels');
        assert.deepEqual(await el('#studioPalette button').evaluateAll(buttons =>
          buttons.map(button => button.getAttribute('aria-label'))), decals);
        const decorRenders = [];
        for (const [index, name] of decals.entries()) {
          await color(name);
          await stroke([jewels[2]]);
          decorRenders.push(await paintBytes());
          await portraitShot(client, 'decoro-' + (index + 1));
          await stroke([jewels[2]]);
          assert.match(await el('#studioChoice').innerText(), /0\/6/);
        }
        assert.equal(new Set(decorRenders).size, decals.length, 'all eight decorations have a distinct rendered shape');
        await color('Stellina');
        const noDecor = await pixels([jewels[0]]);
        await stroke([jewels[0]], async () => {
          assert.notDeepEqual(await pixels([jewels[0]]), noDecor, 'preview appears before release');

        });
        assert.match(await el('#studioChoice').innerText(), /1\/6/);
        assert.notDeepEqual(await pixels([jewels[0]]), noDecor);
        await stroke([jewels[0]]);
        assert.match(await el('#studioChoice').innerText(), /0\/6/);
        await stroke([jewels[0]], null, true);
        assert.match(await el('#studioChoice').innerText(), /0\/6/);
        assert.deepEqual(await pixels([jewels[0]]), noDecor, 'canceled gesture leaves no preview or sticker');
        await color('Farfallina');
        await stroke([jewels[1]]);
        await color('Stellina');
        await stroke([jewels[0]]);
        await stroke([jewels[2]]);
        const beforeInvalid = await sumAlpha();
        await stroke([iris[0]]);
        if (client === 'martina') await stroke([[256, 224]]);
        assert.equal(await sumAlpha(), beforeInvalid, 'eye rejects decoration');
        await portraitShot(client, 'dopo');
        if (client === 'sofia') {
          await clear();
          for (const point of [[160, 335], [196, 335], [178, 348], [321, 339], [347, 339], [246, 204], [268, 204]]) {
            await stroke([point]);
          }
          assert.match(await el('#studioStatus').innerText(), /Hai già 6 decori/);
          for (let move = 0; move < 7; move++) await tap('#studioUndo');
        }
        assert.equal(await el('#studioPortrait').getAttribute('data-eyes'), 'open');
        {
          const pose = { alice: 'left-wink', chiara: 'right-wink' }[client] ?? 'closed';
          const closed = page.waitForFunction(value => document.querySelector('#studioPortrait').dataset.eyes === value, pose, { timeout: 7000 });
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await closed;
          await page.waitForFunction(() => document.querySelector('#studioPortrait').dataset.eyes === 'open');
          await page.emulateMedia({ reducedMotion: 'reduce' });
          assert.equal(await el('#studioPortrait').getAttribute('data-eyes'), 'open');
        }
        const clipping = (await pixels(safe)).every(p => p[3] === 0);
        assert.ok(clipping, 'finished look keeps independently selected protected pixels clear');
        await tap('#studioClients');
        await el('#studioConfirm[open]').waitFor();
        await tap('#studioConfirm form button');
        await el('#studioEditor:not([hidden])').waitFor();
        const beforeNavigation = await sumAlpha();
        const beforeResize = await paintBytes();
        await page.setViewportSize({ width: width + 12, height: height + 22 });
        assert.equal(await paintBytes(), beforeResize, 'resize preserves the exact Canvas contents');
        await page.setViewportSize({ width, height });
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
        const exactLook = await paintBytes();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await tap('#studioFinish');
        const stage = name => el('#studioEditor[data-reveal="' + name + '"]').waitFor();
        await stage('eyes');
        assert.equal(await eyeState(), 'closed');
        assert.ok(await portraitMatches('closed'), 'closed Reveal eyes use the original calibrated overlay');
        await portraitShot(client, 'reveal-1-palpebre');
        await stage('magic');
        await page.waitForTimeout(350);
        await portraitShot(client, 'reveal-2-magia');
        await stage('smile');
        await portraitShot(client, 'reveal-3-sorriso');
        await stage('final');
        await portraitShot(client, 'reveal-4-finale');
        const finalPortrait = await imageBytes('#studioPortrait');
        assert.equal(await eyeState(), 'open');
        assert.equal(await el('.studio-tool').isVisible(), false);
        await tap('#studioReplay');
        await stage('eyes');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await stage('final');
        assert.equal(await imageBytes('#studioPortrait'), finalPortrait, 'replay and reduced motion preserve the final composite');
        await portraitShot(client, 'movimento-ridotto');
        await tap('#studioResume');
        assert.equal(await paintBytes(), exactLook, 'resuming restores pigment and decals byte for byte');
        await tap('#studioFinish');
        await stage('final');
        if (client === 'chiara') await tap('#studioBack');
        else await tap('#studioClients');
        if (client !== 'chiara') await el('#studioSelection:not([hidden])').waitFor();
        checks.push({ client, originalPortrait: true, shadowColors: 9, finishes: 3, microhearts: true, decorations: 8, resize: true, progressiveAlpha: [first, second], clipping, blink: true, reducedMotion: true, savedSession: true, complete: true });
      }
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
      if (process.env.SPA_TRACE) await context.tracing.stop({ path: dir + '/trace.zip' });
      await browser.close();
    }
  });
}

test('Reveal accepts empty and single-product looks, and leaving cancels pending stages', { timeout: 45000 }, async () => {
  const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
    { executablePath: process.env.SPA_CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const tap = selector => page.locator(selector).tap();
    const studio = page.locator('#studioEditor');
    const stage = value => studio.and(page.locator('[data-reveal="' + value + '"]')).waitFor();
    const paint = page.locator('#studioPaint');
    const bytes = () => paint.evaluate(canvas => canvas.toDataURL());
    await page.goto(process.env.SPA_URL || 'http://127.0.0.1:8000/');
    await tap('#makeup');
    await tap('#studioCards [data-client=sofia]');
    await studio.waitFor();
    const saved = await page.evaluate(() => ({ ...localStorage }));
    const empty = await bytes();
    await tap('#studioFinish');
    await stage('eyes');
    await stage('magic');
    assert.equal(await bytes(), empty, 'an empty look has no celebratory pigment or particles');
    await stage('final');
    await tap('#studioResume');
    assert.equal(await bytes(), empty);
    await paint.scrollIntoViewIfNeeded();
    const box = await paint.boundingBox();
    await page.touchscreen.tap(box.x + 188 * box.width / 512, box.y + 258 * box.height / 640);
    const single = await bytes();
    assert.notEqual(single, empty);
    await tap('#studioFinish');
    await stage('eyes');
    await tap('#studioHome');
    await page.locator('#home.on').waitFor();
    await page.waitForTimeout(4200);
    assert.equal(await studio.getAttribute('data-reveal'), null, 'the old timers do not advance a hidden Studio');
    await tap('#makeup');
    await tap('#studioCards [data-client=sofia]');
    await studio.waitFor();
    assert.equal(await bytes(), single, 'the interrupted Reveal preserves the single product');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tap('#studioFinish');
    await stage('final');
    await tap('#studioReplay');
    await stage('final');
    await tap('#studioResume');
    assert.equal(await bytes(), single);
    assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), saved);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
