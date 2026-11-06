import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { SAVE_KEY } from './wallet.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.SPA_URL || 'http://127.0.0.1:8000/';
for (const [width, height, touch] of [[320, 568, true], [412, 915, true], [1280, 720, false]]) {
  const viewport = width + 'x' + height;
  if (process.env.SPA_VIEWPORT && process.env.SPA_VIEWPORT !== viewport) continue;
  test(viewport + ' · Shop and daily gift', { timeout: 120000 }, async () => {
    const dir = 'test-results/shop/' + viewport;
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch(process.env.SPA_CHROME_PATH ?
      { executablePath: process.env.SPA_CHROME_PATH } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const at = date => page.clock.setFixedTime(new Date(date));
    const el = selector => page.locator(selector);
    const tap = selector => touch ? el(selector).tap() : el(selector).click();
    const shot = name => page.screenshot({ path: dir + '/' + name + '.png', animations: 'disabled' });
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
    const balance = async amount => {
      await el('#shopStars').filter({ hasText: new RegExp('^' + amount + '$') }).waitFor();
      assert.equal((await saved()).balance, amount);
    };

    try {
      await page.addInitScript(() => {
        if (!localStorage.getItem('dsp-stars')) localStorage.setItem('dsp-stars', '110');
      });
      await at('2026-11-06T22:59:00Z');
      await page.goto(baseURL);
      await el('#play:enabled').waitFor();
      assert.equal(await el('#stars').innerText(), '110');
      await page.reload();
      await tap('#play');
      await el('.client[data-client="alice"]:enabled').waitFor();
      assert.equal(await el('.client:enabled').count(), 4);
      assert.equal(await el('.client:disabled').count(), 5);
      await tap('#chooseShop');
      await balance(110);
      await shot('01-shop-regalo-disponibile');
      await el('[data-shop-item="martina"]').scrollIntoViewIfNeeded();
      await shot('02-nuove-clienti');
      await tap('[data-shop-item="martina"]');
      assert.match(await el('#confirmText').innerText(), /80/);
      assert.ok(await el('#confirmArt img').evaluate(async image => { await image.decode(); return image.naturalWidth; }));
      await shot('03-conferma-acquisto');
      await tap('#cancelPurchase');
      await balance(110);
      await tap('[data-shop-item="martina"]');
      await tap('#confirmPurchase');
      await balance(30);
      assert.equal(await el('[data-shop-item="martina"]').count(), 0);
      assert.equal(await page.evaluate(async () => {
        const { createWallet, CLIENT_PRICE } = await import('/phase06/wallet.mjs');
        return createWallet().buy({ kind: 'clients', id: 'martina', price: CLIENT_PRICE });
      }), 'owned');
      await el('#shopStatus').filter({ hasText: 'Martina' }).waitFor();
      await el('.shop-card').filter({ hasText: 'Martina' }).scrollIntoViewIfNeeded();
      await shot('04-cliente-sbloccata');
      await tap('[data-shop-item="federica"]');
      assert.ok(await el('#confirmPurchase').isDisabled());
      assert.match(await el('#confirmText').innerText(), /50/);
      await tap('#cancelPurchase');
      await balance(30);
      await tap('#claimGift');
      await balance(40);
      assert.ok(await el('#claimGift').isDisabled());
      assert.match(await el('#giftStatus').innerText(), /già ritirato/);
      await shot('05-regalo-ritirato');
      await tap('#shopProductsTab');
      await shot('06-prodotti-magici');
      await tap('[data-shop-item="steamer-stars"]');
      await tap('#confirmPurchase');
      await balance(5);
      await el('#shopStatus').filter({ hasText: 'Lilla con stelline' }).waitFor();
      await el('.shop-card').filter({ hasText: 'Lilla con stelline' }).scrollIntoViewIfNeeded();
      await shot('07-prodotto-sbloccato');

      await page.reload();
      await tap('#openShop');
      await balance(5);
      assert.ok(await el('#claimGift').isDisabled());
      assert.deepEqual((await saved()).clients, ['martina']);
      assert.deepEqual((await saved()).products, ['steamer-stars']);
      assert.equal((await saved()).earned, 120);
      await at('2026-11-06T21:30:00Z');
      assert.equal(await page.evaluate(async () => {
        const { createWallet } = await import('/phase06/wallet.mjs');
        return createWallet().gift();
      }), 'unavailable');
      await at('2026-11-06T23:00:00Z');
      await el('#claimGift:enabled').waitFor();
      await tap('#claimGift');
      await balance(15);
      await at('2026-11-11T12:00:00Z');
      const second = await context.newPage();
      second.on('pageerror', error => errors.push(error.message));
      await second.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
      await second.goto(baseURL);
      const claim = target => target.evaluate(async () => {
        const { createWallet } = await import('/phase06/wallet.mjs');
        return createWallet().gift();
      });
      assert.deepEqual((await Promise.all([claim(page), claim(second)])).sort(), ['ok', 'unavailable']);
      await second.close();
      await page.reload();
      await tap('#openShop');
      await balance(25);
      await tap('#shopBack');
      await tap('#play');
      await tap('.client[data-client="martina"]');
      await el('#spa.on .portrait[data-client="martina"]').waitFor();
      await tap('#steamModels');
      assert.ok(await el('[data-variant="steamer-stars"]').isEnabled());
      assert.ok(await el('[data-variant="steamer-cloud"]').isDisabled());
      await tap('[data-variant="steamer-stars"]');
      await el('[data-variant="steamer-stars"]').waitFor({ state: 'hidden' });
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).choices.steamer === 'steamer-stars', SAVE_KEY);
      const proof = await saved();
      await page.evaluate(key => localStorage.setItem(key, '{invalid'), SAVE_KEY);
      await page.reload();
      await el('#play:enabled').waitFor();
      assert.equal(await el('#stars').innerText(), '25');
      assert.deepEqual(errors, []);
      await writeFile(dir + '/proof.json', JSON.stringify({ migrated: 110, final: proof, corruptedBalanceRecovery: 25, errors }, null, 2));
    } catch (error) {
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await browser.close();
    }
  });
}
