import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWallet, SAVE_KEY } from './wallet.mjs';

function storageWith(saved, legacy = 0) {
  const storage = new Map([['dsp-stars', String(legacy)]]);
  if (saved) storage.set(SAVE_KEY, JSON.stringify(saved));
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
}

const purchase = {
  version: 1, balance: 7, earned: 202, clients: ['chiara', 'martina'],
  products: ['steamer-cloud'], choices: { steamer: 'steamer-cloud' },
  lastGiftDay: '2026-11-06', lastGiftAt: 1793966400000,
};

test('verified ownership and spending trigger a one-time refund without changing earnings', async () => {
  storageWith(purchase);
  const wallets = [createWallet(), createWallet()];
  assert.deepEqual(await Promise.all(wallets.map(wallet => wallet.initialize())), ['ok', 'ok']);
  assert.deepEqual(createWallet().state, { ...purchase, version: 2, balance: 167 });
  assert.equal(localStorage.getItem('dsp-stars'), '167');
  assert.equal(await wallets[0].buy({ id: 'martina' }), 'unavailable');
  assert.equal(await wallets[0].buy({ id: 'steamer-cloud' }), 'owned');
  assert.equal(createWallet().state.balance, 167);
});

test('missing or inconsistent purchase evidence never generates a refund', async () => {
  for (const saved of [
    { ...purchase, earned: 201 }, { ...purchase, earned: undefined },
    { ...purchase, products: undefined }, { ...purchase, clients: ['chiara', 'chiara'] },
    { ...purchase, clients: ['chiara', 'alice'] }, { ...purchase, version: 2 },
  ]) {
    storageWith(saved);
    await createWallet().initialize();
    assert.equal(createWallet().state.balance, 7);
  }
  storageWith(null, 19);
  await createWallet().initialize();
  assert.equal(createWallet().state.balance, 19);
});
