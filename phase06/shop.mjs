import { GIFT, PRODUCT_PRICES, giftAvailable } from './wallet.mjs?v=07b';

const categoryNames = { cleanser: 'Detergenti', cream: 'Creme', sponge: 'Spugnette', steamer: 'Vaporizzatori' };

export function mountShop({ wallet, clients, products, productGraphic, changed, bindAction }) {
  const $ = selector => document.querySelector(selector);
  const catalog = $('#shopCatalog');
  const status = $('#shopStatus');
  const confirm = $('#shopConfirm');
  const claim = $('#claimGift');
  const giftStatus = $('#giftStatus');
  const buy = $('#confirmPurchase');
  let department = 'clients';
  let pending, opener;
  let claiming = false;

  const clientItems = Object.values(clients).map(profile => ({
    name: profile.name,
    art() {
      const image = document.createElement('img');
      image.src = 'assets/' + profile.portrait;
      image.alt = '';
      return image;
    },
  }));
  const productGroups = Object.entries(products).map(([category, variants]) => [
    categoryNames[category], variants.map(variant => ({
      id: variant.id, name: variant.name,
      price: variant.availability === 'free' ? 0 : PRODUCT_PRICES[category],
      art: () => productGraphic(variant),
    })),
  ]);

  function availableGift() {
    const available = giftAvailable(wallet.state);
    claim.disabled = !available || claiming;
    const message = available ? '+' + GIFT + ' stelline gratuite' : 'Regalo del giorno già ritirato.';
    if (giftStatus.textContent !== message) giftStatus.textContent = message;
  }

  function renderGroup(title, items) {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'shop-grid shop-' + department;
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'shop-card';
      const art = document.createElement('div');
      art.className = 'shop-art';
      art.append(item.art());
      const name = document.createElement('h4');
      name.textContent = item.name;
      card.append(art, name);
      if (department === 'clients') {
        grid.append(card);
        continue;
      }
      const price = document.createElement('span');
      const owned = wallet.state.products.includes(item.id);
      price.className = 'shop-price';
      price.textContent = !item.price ? 'Gratis' : owned ? '✓ Sbloccato' : '★ ' + item.price;
      card.append(price);
      if (item.price && !owned) {
        const button = document.createElement('button');
        button.className = 'pill shop-buy';
        button.dataset.shopItem = item.id;
        button.textContent = 'Sblocca';
        button.setAttribute('aria-label', 'Sblocca ' + item.name + ' per ' + item.price + ' stelline');
        bindAction(button, () => preview(item, button));
        card.append(button);
        if (wallet.state.balance < item.price) {
          const missing = document.createElement('small');
          missing.textContent = 'Mancano ' + (item.price - wallet.state.balance) + ' ★';
          card.append(missing);
        }
      }
      grid.append(card);
    }
    section.append(heading, grid);
    return section;
  }

  function render() {
    $('#shopStars').textContent = wallet.state.balance;
    availableGift();
    const groups = department === 'clients' ? [['Le tue clienti', clientItems]] : productGroups;
    catalog.replaceChildren(...groups.map(([title, items]) => renderGroup(title, items)));
  }

  function preview(item, button) {
    pending = item;
    opener = button;
    $('#confirmTitle').textContent = item.name;
    $('#confirmArt').replaceChildren(item.art());
    const missing = item.price - wallet.state.balance;
    $('#confirmText').textContent = missing > 0 ?
      'Costa ' + item.price + ' stelline. Te ne mancano ' + missing + '.' :
      'Vuoi usare ' + item.price + ' stelline per sbloccare questo premio?';
    buy.disabled = missing > 0;
    confirm.showModal();
  }

  bindAction($('#cancelPurchase'), () => confirm.close());
  confirm.addEventListener('close', () => {
    pending = undefined;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  bindAction(buy, async () => {
    if (!pending || buy.disabled) return;
    buy.disabled = true;
    const item = pending;
    const result = await wallet.buy(item);
    if (confirm.open) confirm.close();
    changed();
    render();
    status.textContent = {
      ok: '✦ ' + item.name + ' è nella tua collezione!',
      owned: 'Questo premio è già nella tua collezione.',
      insufficient: 'Ti mancano ' + (item.price - wallet.state.balance) + ' stelline.',
    }[result] ?? 'Impossibile salvare lo sblocco. Riprova.';
    status.focus();
  });

  bindAction(claim, async () => {
    if (claiming || !giftAvailable(wallet.state)) return;
    claiming = true;
    availableGift();
    const result = await wallet.gift();
    claiming = false;
    changed();
    render();
    if (result === 'ok') {
      const art = $('.gift-art');
      art.classList.add('gift-opened');
      setTimeout(() => art.classList.remove('gift-opened'), 700);
    }
    status.textContent = result === 'ok' ? '✦ Hai ricevuto ' + GIFT + ' stelline!' :
      result === 'unavailable' ? 'Regalo del giorno già ritirato.' : 'Impossibile salvare il regalo. Riprova.';
    status.focus();
  });

  const tabs = { clients: $('#shopClientsTab'), products: $('#shopProductsTab') };
  for (const [id, tab] of Object.entries(tabs)) {
    bindAction(tab, () => {
      department = id;
      status.textContent = '';
      for (const [key, button] of Object.entries(tabs)) button.setAttribute('aria-pressed', String(id === key));
      render();
    });
  }
  const visible = () => $('#shop').classList.contains('on');
  const refreshGift = () => { if (visible()) availableGift(); };
  setInterval(refreshGift, 1000);
  document.addEventListener('visibilitychange', refreshGift);
  window.addEventListener('focus', refreshGift);
  return {
    open() {
      status.textContent = '';
      wallet.refresh();
      render();
      $('#shop').scrollTop = 0;
    },
    refresh() { if (visible()) render(); },
  };
}
