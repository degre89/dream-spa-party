import { decor, decorKeys } from '../phase07/decor.mjs?v=07b';
import { products } from './products.mjs?v=06b';

export const SAVE_KEY = 'dsp-progress';
export const GIFT = 10;
export const SESSION_REWARD = 3;
export const PRODUCT_PRICES = { cleanser: 25, cream: 25, sponge: 30, steamer: 35 };
// Frozen Phase 06-C prices for verifying the spend recorded by version 1.
const formerClientPrices = new Map(['martina', 'federica', 'rachele', 'ginevra', 'chiara'].map(id => [id, 80]));
const formerProductPrices = new Map([
  ['cleanser-peach', 25], ['cleanser-lavender', 25], ['cleanser-coconut', 25],
  ['cream-vanilla', 25], ['cream-aloe', 25], ['cream-blueberry', 25],
  ['sponge-heart', 30], ['sponge-flower', 30], ['sponge-star', 30],
  ['steamer-stars', 35], ['steamer-cloud', 35], ['steamer-pearl', 35],
]);

const shopPrices = new Map(Object.values(products).flat()
  .filter(variant => variant.availability !== 'free')
  .map(variant => [variant.id, PRODUCT_PRICES[variant.category]]));

const legacyKey = 'dsp-stars';
const validAmount = value => Number.isSafeInteger(value) && value >= 0;
const ids = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : [];
const dateKey = date => [String(date.getFullYear()).padStart(4, '0'), date.getMonth() + 1, date.getDate()]
  .map(part => String(part).padStart(2, '0')).join('-');

export function giftAvailable(state, now = new Date()) {
  return Number.isFinite(+now) && +now >= state.lastGiftAt &&
    (!state.lastGiftDay || dateKey(now) > state.lastGiftDay);
}

function clientRefund(saved, clients, products) {
  if (saved?.version !== 1 || !validAmount(saved.balance) || !validAmount(saved.earned) ||
      !clients.length || !Array.isArray(saved.products) ||
      saved.clients.length !== clients.length || saved.products.length !== products.length ||
      !clients.every(id => formerClientPrices.has(id)) || !products.every(id => formerProductPrices.has(id))) return 0;
  const clientSpend = clients.reduce((sum, id) => sum + formerClientPrices.get(id), 0);
  const productSpend = products.reduce((sum, id) => sum + formerProductPrices.get(id), 0);
  return saved.earned - saved.balance === clientSpend + productSpend ? clientSpend : 0;
}

export function createWallet() {
  let state = read();

  function read() {
    let legacy = 0;
    let saved;
    try {
      const raw = Number(localStorage.getItem(legacyKey));
      if (validAmount(raw)) legacy = raw;
      saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch {}
    const clients = ids(saved?.clients);
    const products = ids(saved?.products);
    const refund = clientRefund(saved, clients, products);
    const balance = validAmount(saved?.balance) ? saved.balance + refund : legacy;
    const decorations = ids(saved?.decorations).filter(id => decorKeys.includes(id));
    const room = Object.fromEntries(decorations
      .filter(id => saved?.room?.[id] === 'special')
      .map(id => [id, 'special']));
    return {
      version: 3,
      decorations,
      room,
      balance,
      earned: Math.max(balance, validAmount(saved?.earned) ? saved.earned : balance),
      clients,
      products,
      lastGiftDay: typeof saved?.lastGiftDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastGiftDay) ? saved.lastGiftDay : null,
      lastGiftAt: validAmount(saved?.lastGiftAt) ? saved.lastGiftAt : 0,
      choices: saved?.choices && typeof saved.choices === 'object' && !Array.isArray(saved.choices) ? saved.choices : {},
    };
  }

  function change(update) {
    const commit = () => {
      const draft = read();
      const result = update(draft);
      if (result !== 'ok') {
        state = draft;
        return result;
      }
      try {
        // Balance, ownership and claim date are committed together in one write.
        localStorage.setItem(SAVE_KEY, JSON.stringify(draft));
      } catch {
        return 'storage';
      }
      state = draft;
      try { localStorage.setItem(legacyKey, String(state.balance)); } catch {}
      return result;
    };
    return navigator.locks?.request ? navigator.locks.request(SAVE_KEY, commit) : Promise.resolve(commit());
  }

  function credit(draft, amount) {
    if (!validAmount(draft.balance + amount) || !validAmount(draft.earned + amount)) return 'limit';
    draft.balance += amount;
    draft.earned += amount;
    return 'ok';
  }

  return {
    get state() { return state; },
    refresh() { state = read(); },
    initialize() { return change(() => 'ok'); },
    reward() { return change(draft => credit(draft, SESSION_REWARD)); },
    gift() {
      return change(draft => {
        const now = new Date();
        if (!giftAvailable(draft, now)) return 'unavailable';
        const result = credit(draft, GIFT);
        if (result === 'ok') {
          draft.lastGiftDay = dateKey(now);
          draft.lastGiftAt = +now;
        }
        return result;
      });
    },
    buy({ id }) {
      return change(draft => {
        const price = shopPrices.get(id);
        if (price === undefined) return 'unavailable';
        if (draft.products.includes(id)) return 'owned';
        if (draft.balance < price) return 'insufficient';
        draft.balance -= price;
        draft.products.push(id);
        return 'ok';
      });
    },
    setDecoration(id, variant, { purchase = false } = {}) {
      return change(draft => {
        if (!decorKeys.includes(id) || !['basic', 'special'].includes(variant)) return 'unavailable';
        if (variant === 'special' && !draft.decorations.includes(id)) {
          if (!purchase) return 'unavailable';
          if (draft.balance < decor[id].price) return 'insufficient';
          draft.balance -= decor[id].price;
          draft.decorations.push(id);
        }
        if (variant === 'special') draft.room[id] = variant;
        else delete draft.room[id];
        return 'ok';
      });
    },
    choose(category, variant) {
      return change(draft => {
        if (variant.availability !== 'free' && !draft.products.includes(variant.id)) return 'unavailable';
        draft.choices[category] = variant.id;
        return 'ok';
      });
    },
  };
}
