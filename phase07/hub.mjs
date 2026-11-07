import { decor, decorKeys } from './decor.mjs?v=07b';

export function mountHub({ wallet, onSkinCare, changed, bindAction }) {
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
      button.firstElementChild.textContent = entry[key];
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
    button.append(document.createElement('strong'), document.createElement('small'));
    variants.append(button);
    button.addEventListener('click', () => {
      if (pending) return;
      variant = key;
      status.textContent = '';
      refresh();
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
  get('makeup').addEventListener('click', () => get('makeupInfo').showModal());
  return { refresh };
}
