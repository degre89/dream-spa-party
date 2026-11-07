import { decor, decorKeys } from './decor.mjs?v=07b';

// Crops and effect origins use the coordinates of the shared room SVG.
const objectViews = {
  mirror: { crop: '240 39 150 168', center: [317, 112] },
  chair: { crop: '222 163 182 175', center: [313, 240] },
  rug: { crop: '145 304 328 100', center: [309, 360] },
  plant: { crop: '82 190 98 131', center: [134, 259] },
  lamp: { crop: '519 153 78 172', center: [558, 194] },
  wall: { crop: '419 35 128 75', center: [484, 76] },
};
const svgNS = 'http://www.w3.org/2000/svg';

export function mountHub({ wallet, onSkinCare, onMakeup, changed, bindAction }) {
  const room = document.querySelector('#home');
  const get = id => room.querySelector('#' + id);
  const panel = get('decorPanel');
  const menu = get('hubMenu');
  const opener = get('openDecor');
  const categories = get('decorCategories');
  const variants = get('decorVariants');
  const apply = get('applyDecor');
  const confirmation = get('decorConfirm');
  const confirm = get('confirmDecor');
  const status = get('decorStatus');
  const layers = [...room.querySelectorAll('[data-decor]')];
  let category = decorKeys[0];
  let variant;
  let pending = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const effect = get('decorEffect');
  const sparks = effect.firstElementChild;
  let sparkle;

  function shine(celebrate = false) {
    sparkle?.cancel();
    if (reducedMotion.matches) return;
    const [x, y] = objectViews[category].center;
    effect.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
    sparkle = sparks.animate([
      { opacity: 0, transform: 'translateY(5px) scale(.8)' },
      { opacity: celebrate ? .95 : .7, offset: .35 },
      { opacity: 0, transform: 'translateY(-9px) scale(1.2)' },
    ], { duration: celebrate ? 720 : 460, easing: 'ease-out' });
  }

  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) sparkle?.cancel();
  });

  const equipped = id => wallet.state.room[id] ?? 'basic';
  const owned = () => variant === 'basic' || wallet.state.decorations.includes(category);

  function refresh() {
    for (const layer of layers) {
      const id = layer.dataset.decor;
      const choice = !panel.hidden && id === category ? variant : equipped(id);
      layer.setAttribute('href', 'assets/spa-decor.svg#' + id + '-' + choice);
    }
    if (panel.hidden) return;
    const entry = decor[category];
    for (const button of categories.children) {
      button.setAttribute('aria-pressed', button.dataset.category === category);
    }
    for (const button of variants.children) {
      const key = button.dataset.variant;
      button.setAttribute('aria-pressed', key === variant);
      const thumbnail = button.firstElementChild;
      thumbnail.setAttribute('viewBox', objectViews[category].crop);
      thumbnail.firstElementChild.setAttribute('href', 'assets/spa-decor.svg#' + category + '-' + key);
      button.querySelector('strong').textContent = entry[key];
      button.lastElementChild.textContent = key === 'basic' ? 'Gratis' :
        wallet.state.decorations.includes(category) ? 'Acquistato' : entry.price + ' ★';
    }
    const applied = equipped(category) === variant;
    apply.textContent = applied ? 'In uso' : owned() ? 'Usa' : 'Compra · ' + entry.price + ' ★';
    apply.disabled = applied || pending;
  }

  async function equip(purchase) {
    if (pending) return;
    pending = true;
    confirm.disabled = true;
    refresh();
    try {
      const result = await wallet.setDecoration(category, variant, { purchase });
      if (confirmation.open) confirmation.close();
      if (result === 'ok') shine(purchase);
      status.textContent = result === 'ok' ? 'Decorazione applicata! ✧' :
        result === 'insufficient' ? 'Ti servono più stelline.' : 'Impossibile salvare. Riprova.';
    } finally {
      pending = false;
      confirm.disabled = false;
      changed();
      variants.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    }
  }

  for (const [id, entry] of Object.entries(decor)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = id;
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = entry.icon;
    button.append(icon, entry.label);
    categories.append(button);
    button.addEventListener('click', () => {
      if (pending) return;
      category = id;
      variant = equipped(id);
      status.textContent = '';
      refresh();
    });
  }
  for (const key of ['basic', 'special']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.variant = key;
    const thumbnail = document.createElementNS(svgNS, 'svg');
    thumbnail.setAttribute('aria-hidden', 'true');
    thumbnail.append(document.createElementNS(svgNS, 'use'));
    button.append(thumbnail, document.createElement('strong'), document.createElement('small'));
    variants.append(button);
    button.addEventListener('click', () => {
      if (pending) return;
      variant = key;
      status.textContent = '';
      refresh();
      shine();
    });
  }

  opener.addEventListener('click', () => {
    panel.hidden = false;
    menu.hidden = true;
    opener.setAttribute('aria-expanded', 'true');
    variant = equipped(category);
    status.textContent = '';
    refresh();
    categories.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  });
  get('closeDecor').addEventListener('click', () => {
    if (pending) return;
    panel.hidden = true;
    menu.hidden = false;
    opener.setAttribute('aria-expanded', 'false');
    refresh();
    opener.focus({ preventScroll: true });
  });
  apply.addEventListener('click', () => {
    if (owned()) return void equip(false);
    get('decorConfirmText').textContent = 'Vuoi usare ' + decor[category].price + ' stelline per ' + decor[category].special + '?';
    confirmation.showModal();
  });
  confirm.addEventListener('click', () => void equip(true));
  bindAction(get('play'), onSkinCare);
  bindAction(get('makeup'), onMakeup);
  return { refresh };
}
