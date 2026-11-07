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
        if (!localStorage.getItem('dsp-stars')) localStorage.setItem('dsp-stars', '0');
      });
      await at('2026-11-06T22:59:00Z');
      await page.goto(baseURL);
      await el('#play:enabled').waitFor();
      assert.equal(await el('#stars').innerText(), '0');
      await tap('#play');
      await page.waitForFunction(() => document.querySelectorAll('.client:enabled').length === 10);
      assert.equal(await el('.client').count(), 10);
      assert.equal(await el('.client[data-client="azzurrina"]').innerText(), 'Azzurrina');
      await tap('.client[data-client="azzurrina"]');
      await el('#spa.on .portrait[data-client="azzurrina"]').waitFor();
      await page.evaluate(key => {
        localStorage.setItem(key, JSON.stringify({
          version: 1, balance: 85, earned: 200, clients: ['martina'],
          products: ['steamer-stars'], choices: { steamer: 'steamer-stars' },
        }));
      }, SAVE_KEY);
      const secondMigration = await context.newPage();
      await Promise.all([page.reload(), secondMigration.goto(baseURL)]);
      await secondMigration.close();
      await el('#stars').filter({ hasText: /^165$/ }).waitFor();
      assert.equal((await saved()).version, 3);
      assert.equal((await saved()).earned, 200);
      assert.deepEqual((await saved()).clients, ['martina']);
      assert.equal((await saved()).choices.steamer, 'steamer-stars');
      await page.reload();
      await tap('#openShop');
      await balance(165);
      assert.ok(await el('#shopStars').evaluate(node => {
        const { left, right, top, bottom } = node.getBoundingClientRect();
        return left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight;
      }));
      assert.equal(await el('.gift-art').evaluate(node => getComputedStyle(node).animationName), 'gift-bob');
      await shot('01-shop-regalo-disponibile');
      assert.equal(await el('.shop-clients .shop-card').count(), 10);
      assert.equal(await el('.shop-clients .shop-buy, .shop-clients .shop-price').count(), 0);
      await shot('02-le-tue-clienti');
      await tap('#claimGift');
      await el('.gift-art.gift-opened').waitFor();
      assert.equal(await el('.gift-art').evaluate(node => getComputedStyle(node).animationName), 'gift-pop');
      await balance(175);
      assert.ok(await el('#claimGift').isDisabled());
      assert.match(await el('#giftStatus').innerText(), /già ritirato/);
      await shot('05-regalo-ritirato');
      await tap('#shopProductsTab');
      await shot('06-prodotti-magici');
      assert.equal(await el('[data-shop-item="steamer-stars"]').count(), 0);
      await tap('[data-shop-item="cleanser-peach"]');
      await el('#shopConfirm[open] #confirmText').filter({ hasText: /25/ }).waitFor();
      await tap('#cancelPurchase');
      await balance(175);
      for (const [id, amount] of [['cleanser-peach', 150], ['sponge-heart', 120], ['cream-vanilla', 95], ['steamer-cloud', 60]]) {
        await tap('[data-shop-item="' + id + '"]');
        await tap('#confirmPurchase');
        await balance(amount);
        assert.equal(await el('[data-shop-item="' + id + '"]').count(), 0);
      }
      assert.deepEqual(await page.evaluate(async () => {
        const { createWallet } = await import(new URL('phase06/wallet.mjs', document.baseURI));
        return createWallet().buy({ id: 'steamer-cloud', price: 35 });
      }), 'owned');
      await tap('[data-shop-item="steamer-pearl"]');
      await tap('#confirmPurchase');
      await balance(25);
      await tap('[data-shop-item="sponge-star"]');
      assert.ok(await el('#confirmPurchase').isDisabled());
      await tap('#cancelPurchase');
      await page.reload();
      await tap('#openShop');
      await balance(25);
      assert.ok(await el('#claimGift').isDisabled());
      assert.deepEqual((await saved()).clients, ['martina']);
      assert.deepEqual((await saved()).products,
        ['steamer-stars', 'cleanser-peach', 'sponge-heart', 'cream-vanilla', 'steamer-cloud', 'steamer-pearl']);
      assert.equal((await saved()).earned, 210);
      await at('2026-11-06T21:30:00Z');
      assert.equal(await page.evaluate(async () => {
        const { createWallet } = await import(new URL('phase06/wallet.mjs', document.baseURI));
        return createWallet().gift();
      }), 'unavailable');
      await at('2026-11-06T23:00:00Z');
      await el('#claimGift:enabled').waitFor();
      await tap('#claimGift');
      await balance(35);
      await at('2026-11-11T12:00:00Z');
      const second = await context.newPage();
      second.on('pageerror', error => errors.push(error.message));
      await second.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
      await second.goto(baseURL);
      const claim = target => target.evaluate(async () => {
        const { createWallet } = await import(new URL('phase06/wallet.mjs', document.baseURI));
        return createWallet().gift();
      });
      assert.deepEqual((await Promise.all([claim(page), claim(second)])).sort(), ['ok', 'unavailable']);
      await second.close();
      await page.reload();
      await tap('#openShop');
      await balance(45);
      await tap('#shopBack');
      await tap('#play');
      await tap('.client[data-client="martina"]');
      await el('#spa.on .portrait[data-client="martina"]').waitFor();
      await tap('#steamModels');
      assert.ok(await el('[data-variant="steamer-stars"]').isEnabled());
      assert.ok(await el('[data-variant="steamer-cloud"]').isEnabled());
      await tap('[data-variant="steamer-cloud"]');
      await el('[data-variant="steamer-cloud"]').waitFor({ state: 'hidden' });
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).choices.steamer === 'steamer-cloud', SAVE_KEY);
      const proof = await saved();
      await page.evaluate(key => localStorage.setItem(key, '{invalid'), SAVE_KEY);
      await page.reload();
      await el('#play:enabled').waitFor();
      assert.equal(await el('#stars').innerText(), '45');
      assert.deepEqual(errors, []);
      await writeFile(dir + '/proof.json', JSON.stringify({ refunded: 80, final: proof, corruptedBalanceRecovery: 45, errors }, null, 2));
    } catch (error) {
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      await browser.close();
    }
  });
}
