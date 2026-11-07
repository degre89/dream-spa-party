import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { SAVE_KEY } from '../phase06/wallet.mjs';
import { decor } from './decor.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.SPA_URL || 'http://127.0.0.1:8000/';

for (const [width, height, touch] of [[320, 568, true], [412, 915, true], [1280, 720, false]]) {
  const viewport = width + 'x' + height;
  if (process.env.SPA_VIEWPORT && process.env.SPA_VIEWPORT !== viewport) continue;
  test(viewport + ' · La mia Spa, anteprime, acquisti e navigazione', { timeout: 90000 }, async () => {
    const dir = 'test-results/hub/' + viewport;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url());
    });
    const el = selector => page.locator(selector);
    const tap = selector => touch ? el(selector).tap() : el(selector).click();
    const shot = name => page.screenshot({ path: dir + '/' + name + '.png', fullPage: true });
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
    const category = id => tap('#decorCategories [data-category="' + id + '"]');
    const layer = id => el('#roomScene [data-decor="' + id + '"]').getAttribute('href');
    const balance = amount => el('#stars').filter({ hasText: new RegExp('^' + amount + '$') }).waitFor();

    try {
      await page.addInitScript(key => {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, JSON.stringify({
          version: 2, balance: 55, earned: 160, clients: ['martina'], products: ['cleanser-peach'],
          choices: { cleanser: 'cleanser-peach' }, lastGiftDay: '2026-10-31',
          lastGiftAt: 1793404800000
        }));
      }, SAVE_KEY);
      await page.goto(baseURL);
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).version === 3, SAVE_KEY);
      await balance(55);
      assert.equal(await el('#roomTitle').innerText(), 'La mia Spa');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await el('#play:enabled').waitFor();
      await shot('01-stanza-e-hub');
      await tap('#makeup');
      await el('#makeupInfo[open]').waitFor();
      assert.match(await el('#makeupInfo').innerText(), /Prossimamente/);
      await shot('02-makeup-studio');
      await tap('#makeupInfo button');
      await tap('#play');
      await page.waitForFunction(() => document.querySelectorAll('.client:enabled').length === 10);
      await tap('#chooseHome');
      await tap('#openDecor');

      for (const [id, entry] of Object.entries(decor)) {
        await category(id);
        await tap('[data-variant="special"]');
        assert.match(await layer(id), new RegExp('#' + id + '-special$'));
        assert.match(await el('[data-variant="special"]').innerText(), new RegExp(String(entry.price)));
        assert.deepEqual((await saved()).room, {});
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), height);
      await shot('03-personalizzazione');
      await tap('#applyDecor');
      await el('#decorConfirm[open]').waitFor();
      await shot('04-conferma');
      await tap('#decorConfirm form button');
      await balance(55);
      assert.deepEqual((await saved()).decorations, []);
      await category('chair');
      await tap('[data-variant="special"]');
      await tap('#applyDecor');
      // Exercise a rapid second activation before the wallet resolves.
      await el('#confirmDecor').evaluate(button => { button.click(); button.click(); });
      await balance(20);
      assert.deepEqual((await saved()).decorations, ['chair']);
      await category('mirror');
      await tap('[data-variant="special"]');
      await tap('#applyDecor');
      await tap('#confirmDecor');
      await el('#decorStatus').filter({ hasText: 'Ti servono più stelline.' }).waitFor();
      await balance(20);

      await category('plant');
      await tap('[data-variant="special"]');
      await tap('#applyDecor');
      await tap('#confirmDecor');
      await balance(0);
      await tap('#closeDecor');
      await shot('05-stanza-speciale');
      await page.reload();
      await balance(0);
      for (const id of ['chair', 'plant']) assert.match(await layer(id), /-special$/);
      assert.match(await layer('mirror'), /-basic$/);
      const migrated = await saved();
      assert.deepEqual(migrated.decorations, ['chair', 'plant']);
      assert.deepEqual(migrated.room, { chair: 'special', plant: 'special' });
      assert.deepEqual(migrated.clients, ['martina']);
      assert.deepEqual(migrated.products, ['cleanser-peach']);
      assert.deepEqual(migrated.choices, { cleanser: 'cleanser-peach' });
      assert.equal(migrated.earned, 160);
      assert.equal(migrated.lastGiftDay, '2026-10-31');
      assert.equal(migrated.lastGiftAt, 1793404800000);

      await tap('#openDecor');
      await category('chair');
      await tap('[data-variant="basic"]');
      await tap('#applyDecor');
      await el('#applyDecor:disabled').waitFor();
      assert.match(await layer('chair'), /-basic$/);
      await tap('[data-variant="special"]');
      assert.match(await el('[data-variant="special"]').innerText(), /Acquistato/);
      await tap('#applyDecor');
      await el('#applyDecor:disabled').waitFor();
      await tap('#closeDecor');
      await balance(0);
      await tap('#openShop');
      await tap('#claimGift');
      await el('#shopStars').filter({ hasText: /^10$/ }).waitFor();
      await tap('#shopProductsTab');
      await el('#shopCatalog').filter({ hasText: /Pesca/ }).waitFor();
      await tap('#shopBack');
      await balance(10);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
