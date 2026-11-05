import { advice, completeSession, createSession, endStroke, MASK_TOOLS, readSkin, SPA_TOOLS, treat } from './phase03/facial-state.mjs';
import { clients } from './phase03/clients.mjs';
import { createSkinView, loadStencil } from './phase03/skin-view.mjs';

const $ = selector => document.querySelector(selector);
const canvas = $('#mask');
const { width, height } = canvas;
const character = $('#character');
const cursor = $('#tool');
const next = $('#next');
const cart = $('#cart');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const draw = createSkinView(canvas);
const drawComparison = createSkinView($('#comparison'));

const tools = {
  cleanser: { label: 'Detergente', icon: true, hint: 'Stendi la schiuma sulla pelle.' },
  brush: { label: 'Spazzolina', icon: true, hint: 'Fai piccoli cerchi dove vedi i pori.' },
  sponge: { label: 'Spugnetta', icon: true, hint: 'Passa la spugnetta sul prodotto rimasto.' },
  gel: { label: 'Gel', icon: true, hint: 'Tocca i puntini con una goccia di gel.' },
  serum: { label: 'Siero', icon: true, hint: 'Massaggia piano le zone arrossate.' },
  strawberry: { label: 'Fragola', hint: 'Stendi la maschera alla fragola.' },
  avocado: { label: 'Avocado', hint: 'Stendi la maschera all’avocado.' },
  blueberry: { label: 'Mirtillo', hint: 'Stendi la maschera al mirtillo.' },
  honey: { label: 'Miele', hint: 'Stendi la maschera al miele.' },
  cream: { label: 'Crema', icon: true, hint: 'Massaggia la crema sulla pelle pulita.' }
};

let stars = 0;
try {
  const saved = Number(localStorage.getItem('dsp-stars'));
  if (Number.isSafeInteger(saved) && saved >= 0) stars = saved;
} catch {}
$('#stars').textContent = stars;

let client, skin, session, selected;
let portrait = $('#home .portrait');
let blinkTimer, openTimer, reactionTimer;
let pointer = null;
let handledTap;
let frame = 0;
let lastEffect = 0;
let nextReaction = 0;
let rinseStart = 0;
let seed;
const stencils = new Map();

function scheduleBlink() {
  if (reducedMotion.matches || document.hidden || !portrait) return;
  blinkTimer = setTimeout(() => {
    if (!portrait.classList.contains('relax')) {
      portrait.classList.add('blink');
      openTimer = setTimeout(() => portrait.classList.remove('blink'), 145);
    }
    scheduleBlink();
  }, 2800 + Math.random() * 2900);
}

function resetBlink() {
  clearTimeout(blinkTimer);
  clearTimeout(openTimer);
  portrait?.classList.remove('blink');
  scheduleBlink();
}

function show(id) {
  clearTimeout(reactionTimer);
  portrait?.classList.remove('blink', 'relax', 'smile');
  for (const screen of document.querySelectorAll('.screen')) {
    screen.classList.toggle('on', screen.id === id);
  }
  portrait = document.getElementById(id).querySelector('.portrait');
  resetBlink();
}

function react(expression) {
  clearTimeout(reactionTimer);
  portrait.classList.remove('smile', 'relax');
  portrait.classList.add(expression);
  reactionTimer = setTimeout(() => portrait.classList.remove(expression), 520);
}

function setPortrait(container, id) {
  const profile = clients[id];
  container.dataset.client = id;
  const image = container.querySelector('.hero');
  image.src = 'assets/' + profile.portrait;
  image.alt = profile.name;
  container.querySelector('.eyelids').src = 'assets/' + profile.eyelids;
  const smile = container.querySelector('.grin');
  if (profile.smile) smile.src = 'assets/' + profile.smile;
  else smile.removeAttribute('src');
}

function setCart(open) {
  cart.hidden = !open;
  $('#cartToggle').setAttribute('aria-expanded', String(open));
}

function selectTool(id) {
  stopStroke();
  selected = id;
  rinseStart = id === 'sponge' ? readSkin(session).covered : 0;
  for (const button of cart.children) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  character.classList.toggle('rinsing', id === 'sponge');
  cursor.replaceChildren();
  if (tools[id].icon && id !== 'sponge') cursor.append(toolIcon(id));
  if (!tools[id].icon) cursor.textContent = '✦';
  setCart(false);
  $('#cartToggle').focus({ preventScroll: true });
  react('smile');
  render();
}

function render() {
  cancelAnimationFrame(frame);
  frame = 0;
  draw(session, skin.stencil);
  const { cleanliness, glow, hydration, covered } = readSkin(session);
  const suggested = advice(session);
  const applied = Math.floor(100 * covered / session.cells.length);
  const rinsed = rinseStart ? Math.round(100 * (1 - covered / rinseStart)) : 0;
  const improvement = Math.min(1, (glow - (1 - session.dullness)) / 0.12);
  const conditionProgress = session.conditions.length ?
    session.conditions.reduce((sum, item) => sum + Math.min(1, (1 - item.intensity / item.initial) / 0.6), 0) /
      session.conditions.length : 1;
  const progress = suggested ? Math.min(99, Math.round((0.72 * conditionProgress + 0.28 * improvement) * 100)) : 100;
  const percent = selected === 'sponge' && rinseStart ? rinsed : MASK_TOOLS.includes(selected) ? applied : progress;
  const meter = $('#meter');
  $('#fill').style.width = percent + '%';
  meter.setAttribute('aria-valuenow', percent);
  meter.setAttribute('aria-label', selected === 'sponge' && rinseStart ? 'Risciacquo' :
    MASK_TOOLS.includes(selected) ? 'Pelle coperta' : 'Progresso del trattamento');
  $('#percent').textContent = percent + '%';
  const label = client.name + ' · ' + (selected ? tools[selected].label : 'Spa');
  if ($('#step').textContent !== label) $('#step').textContent = label;
  const message = !suggested ? 'Pelle luminosa! Puoi concludere o provare altri prodotti.' :
    suggested === selected ? tools[selected].hint :
    (selected ? tools[selected].hint + ' ' : '') + 'Prova: ' + tools[suggested].label.toLowerCase() + '.';
  const hint = '✿ Aiutante · ' + message;
  if ($('#hint').textContent !== hint) $('#hint').textContent = hint;
  // Allow a quick transition at the original mask threshold. The cart always stays available.
  const quickRinse = MASK_TOOLS.includes(selected) && applied >= 96;
  next.dataset.action = quickRinse ? 'rinse' : 'finish';
  const nextLabel = quickRinse ? 'Risciacqua' : 'Concludi ✦';
  if (next.textContent !== nextLabel) next.textContent = nextLabel;
  next.disabled = Boolean(suggested) && !quickRinse;
  canvas.setAttribute('aria-description', 'Pulizia ' + Math.round(cleanliness * 100) +
    '%, luminosità ' + Math.round(glow * 100) + '%, idratazione ' + Math.round(hydration * 100) + '%.');
}

function stopStroke() {
  const id = pointer;
  pointer = null;
  if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  if (session) endStroke(session);
  cursor.classList.remove('held');
}

function move(event) {
  if (event.pointerId !== pointer) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(width - 1, (event.clientX - rect.left) * width / rect.width));
  const y = Math.max(0, Math.min(height - 1, (event.clientY - rect.top) * height / rect.height));
  cursor.style.left = x / width * 100 + '%';
  cursor.style.top = y / height * 100 + '%';
  cursor.classList.add('held');
  if (!treat(session, selected, { x, y })) return;
  if (!frame) frame = requestAnimationFrame(render);
  const now = performance.now();
  if (now >= nextReaction) {
    react(selected === 'sponge' ? 'smile' : 'relax');
    nextReaction = now + 3100;
  }
  if (now - lastEffect < 100 || reducedMotion.matches) return;
  lastEffect = now;
  const particle = document.createElement('span');
  particle.className = 'particle';
  particle.textContent = selected === 'sponge' ? '○ ✦ °' : '✧';
  particle.style.left = cursor.style.left;
  particle.style.top = cursor.style.top;
  particle.addEventListener('animationend', () => particle.remove(), { once: true });
  character.append(particle);
}

function compare(before) {
  $('#before').setAttribute('aria-pressed', String(before));
  $('#after').setAttribute('aria-pressed', String(!before));
  portrait.classList.toggle('smile', !before);
  $('#comparison').setAttribute('aria-label', 'Pelle ' + (before ? 'prima' : 'dopo') + ' il trattamento');
  drawComparison(session, skin.stencil, before);
}

function advance() {
  if (!$('#spa').classList.contains('on') || next.disabled) return;
  if (next.dataset.action === 'rinse') {
    selectTool('sponge');
    return;
  }
  if (!completeSession(session)) return;
  stopStroke();
  stars += 3;
  try { localStorage.setItem('dsp-stars', String(stars)); } catch {}
  $('#stars').textContent = stars;
  $('#totalStars').textContent = '★ ' + stars;
  setPortrait($('#done .portrait'), client.id);
  show('done');
  compare(false);
}

function start(id) {
  skin = stencils.get(id);
  if (!skin) return;
  client = { ...clients[id], id };
  seed = (seed === undefined ? crypto.getRandomValues(new Uint32Array(1))[0] : seed + 1) >>> 0;
  session = createSession({
    width, height, skinAt: skin.skinAt, seed,
    regions: client.regions.map(([x, y, radius]) => ({ x, y, radius }))
  });
  selected = undefined;
  rinseStart = 0;
  nextReaction = 0;
  lastEffect = 0;
  character.classList.remove('rinsing');
  character.querySelectorAll('.particle').forEach(particle => particle.remove());
  for (const button of cart.children) button.setAttribute('aria-pressed', 'false');
  setPortrait($('#spa .portrait'), id);
  show('spa');
  render();
  setCart(true);
}

for (const id of SPA_TOOLS) {
  const { label, icon } = tools[id];
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tool = id;
  button.className = 'spa-tool';
  button.setAttribute('aria-pressed', 'false');
  const graphic = icon ? toolIcon(id) : document.createElement('img');
  if (!icon) {
    graphic.src = 'assets/jar-' + id + '.svg';
    graphic.alt = '';
  }
  button.append(graphic, label);
  bindAction(button, () => selectTool(id));
  cart.append(button);
}

for (const button of document.querySelectorAll('.client')) {
  const id = button.dataset.client;
  bindAction(button, () => start(id));
  loadStencil('assets/' + clients[id].stencil, width, height).then(stencil => {
    stencils.set(id, stencil);
    button.disabled = false;
    $('#play').disabled = false;
  }).catch(() => {
    $('#chooseStatus').textContent = 'Un ritratto non è disponibile. Ricarica la pagina per riprovare.';
    if (!stencils.size) $('#status').textContent = 'Caricamento non riuscito. Ricarica la pagina.';
  });
}

canvas.addEventListener('pointerdown', event => {
  if (!selected || !cart.hidden || pointer !== null || event.button !== 0) return;
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  move(event);
});
canvas.addEventListener('pointermove', move);
canvas.addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  move(event);
  stopStroke();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, event => { if (event.pointerId === pointer) stopStroke(); });
}

for (const selector of ['#play', '#again']) bindAction($(selector), () => show('choose'));
function goHome() {
  stopStroke();
  cancelAnimationFrame(frame);
  frame = 0;
  setCart(false);
  show('home');
}
for (const selector of ['#chooseHome', '#back', '#goHome']) bindAction($(selector), goHome);
bindAction($('#cartToggle'), () => setCart(cart.hidden));
bindAction($('#before'), () => compare(true));
bindAction($('#after'), () => compare(false));
bindAction(next, advance);

function toolIcon(id) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', 'icon');
  icon.setAttribute('viewBox', '0 0 32 32');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(namespace, 'use');
  use.setAttribute('href', 'assets/spa-tools.svg#' + id);
  icon.append(use);
  return icon;
}

// A canvas drag can suppress Chromium's synthesized click on the following tap.
function bindAction(button, action) {
  let touchPress;
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary && !button.disabled) {
      touchPress = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  });
  button.addEventListener('pointercancel', event => {
    if (event.pointerId === touchPress?.id) touchPress = null;
  });
  button.addEventListener('pointerup', event => {
    if (event.pointerId !== touchPress?.id) return;
    const distance = Math.hypot(event.clientX - touchPress.x, event.clientY - touchPress.y);
    touchPress = null;
    if (distance > 12 || button.disabled || !button.contains(document.elementFromPoint(event.clientX, event.clientY))) return;
    handledTap = { x: event.clientX, y: event.clientY, time: performance.now() };
    action();
  });
  button.addEventListener('click', action);
}

// A synthesized click can land on a different control after pointerup changes screens.
document.addEventListener('click', event => {
  if (!handledTap || !event.detail ||
      (event.pointerType !== 'touch' && !event.sourceCapabilities?.firesTouchEvents)) return;
  const nearby = Math.hypot(event.clientX - handledTap.x, event.clientY - handledTap.y) <= 16;
  if (nearby && performance.now() - handledTap.time < 650) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

document.addEventListener('visibilitychange', resetBlink);
reducedMotion.addEventListener('change', resetBlink);
scheduleBlink();
