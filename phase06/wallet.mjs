export const SAVE_KEY = 'dsp-progress';
export const GIFT = 10;
export const SESSION_REWARD = 3;
export const PRODUCT_PRICES = { cleanser: 25, cream: 25, sponge: 30, steamer: 35 };
export const CLIENT_PRICE = 80;

const legacyKey = 'dsp-stars';
const validAmount = value => Number.isSafeInteger(value) && value >= 0;
const ids = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : [];
const dateKey = date => [String(date.getFullYear()).padStart(4, '0'), date.getMonth() + 1, date.getDate()]
  .map(part => String(part).padStart(2, '0')).join('-');

export function giftAvailable(state, now = new Date()) {
  return Number.isFinite(+now) && +now >= state.lastGiftAt &&
    (!state.lastGiftDay || dateKey(now) > state.lastGiftDay);
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
    const balance = validAmount(saved?.balance) ? saved.balance : legacy;
    return {
      version: 1,
      balance,
      earned: Math.max(balance, validAmount(saved?.earned) ? saved.earned : balance),
      clients: ids(saved?.clients),
      products: ids(saved?.products),
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
    buy({ kind, id, price }) {
      return change(draft => {
        if (draft[kind].includes(id)) return 'owned';
        if (draft.balance < price) return 'insufficient';
        draft.balance -= price;
        draft[kind].push(id);
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
