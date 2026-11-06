import { endStroke, MASK_TOOLS, SPA_TOOLS } from './phase03/facial-state.mjs';
import { acceptsTool, advanceJourney, applyGesture, createJourney, currentAction, currentStep, journeyPercent } from './phase04/journey.mjs';
import { drawFace } from './phase04/expressions.mjs';
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

let client, skin, journey, selected;
let portrait = $('#home .portrait');
let blinkTimer, openTimer, reactionTimer, transitionTimer;
let feedback;
let creamTrace = [];
let pointer = null;
let handledTap;
let frame = 0;
let lastEffect = 0;
let nextReaction = 0;
const stencils = new Map();

function scheduleBlink() {
  if (reducedMotion.matches || document.hidden || !portrait?.querySelector('.eyelids')) return;
  blinkTimer = setTimeout(() => {
    portrait.classList.add('blink');
    openTimer = setTimeout(() => portrait.classList.remove('blink'), 145);
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
  clearTimeout(transitionTimer);
  clearReaction();
  portrait?.classList.remove('blink');
  for (const screen of document.querySelectorAll('.screen')) {
    screen.classList.toggle('on', screen.id === id);
  }
  portrait = document.getElementById(id).querySelector('.portrait');
  resetBlink();
}

function clearReaction() {
  clearTimeout(reactionTimer);
  portrait?.classList.remove('smile', 'puzzled');
  if (portrait) drawFace(portrait);
  feedback = null;
}

function react(expression, message, duration = 950) {
  clearReaction();
  portrait.classList.add(expression);
  drawFace(portrait);
  feedback = { expression, message };
  reactionTimer = setTimeout(() => {
    clearReaction();
    render();
  }, duration);
}

function setPortrait(container, id) {
  const profile = clients[id];
  container.dataset.client = id;
  const image = container.querySelector('.hero');
  image.src = 'assets/' + profile.portrait;
  image.alt = profile.name;
  image.decode().then(() => drawFace(container), () => {});
}

function setCart(open) {
  cart.hidden = !open;
  $('#cartToggle').setAttribute('aria-expanded', String(open));
}

function updateTool(id) {
  selected = id;
  for (const button of cart.children) button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  character.classList.toggle('rinsing', id === 'sponge');
  cursor.replaceChildren();
  if (!id || id === 'sponge') return;
  if (tools[id].icon) cursor.append(toolIcon(id));
  else cursor.textContent = '✦';
}

function selectTool(id) {
  stopStroke();
  updateTool(id);
  setCart(false);
  $('#cartToggle').focus({ preventScroll: true });
  if (!journey.pending) {
    if (acceptsTool(journey, id)) {
      react('smile', 'Proviamo sul viso!', 1800);
    } else {
      journey.mistakes++;
      const message = journey.mistakes === 1 ? 'Mmm… proviamo qualcos’altro?' : help();
      react('puzzled', message, 2000);
    }
  }
  render();
}

function help() {
  const action = currentAction(journey);
  if (journey.mistakes >= 3) {
    if (action.tool) return 'Prova: ' + tools[action.tool].label + '.';
    if (journey.mask) return 'Continua con ' + tools[journey.mask].label + '.';
  }
  if (journey.mask && !action.tool) return 'Cerca il vasetto già usato.';
  return action.hint;
}

function render() {
  cancelAnimationFrame(frame);
  frame = 0;
  const now = performance.now();
  creamTrace = creamTrace.filter(point => point.expires > now);
  draw(journey.session, skin.stencil, false, client.id, creamTrace.map(point => ({
    ...point, alpha: 0.55 * (point.expires - now) / 680
  })));
  if (creamTrace.length || journey.session.cells.some(cell => cell.creamUntil > now)) frame = requestAnimationFrame(render);

  const step = currentStep(journey);
  const action = currentAction(journey);
  const percent = journeyPercent(journey);
  const meter = $('#meter');
  $('#fill').style.width = percent + '%';
  meter.setAttribute('aria-valuenow', percent);
  meter.setAttribute('aria-label', journey.rinseFrom ? 'Risciacquo' : 'Progresso del trattamento');
  $('#percent').textContent = percent + '%';
  const label = client.name + ' · ' + (journey.index + 1) + '/' + journey.sequence.length;
  if ($('#step').textContent !== label) $('#step').textContent = label;
  const title = step.icon + ' ' + step.title;
  if ($('#goal').textContent !== title) $('#goal').textContent = title;
  const message = feedback?.message ?? (selected && acceptsTool(journey, selected) ?
    tools[selected].hint : journey.mistakes >= 2 ? help() : action.prompt);
  const hint = $('#hint');
  hint.dataset.feedback = feedback?.expression ?? '';
  if (hint.textContent !== message) hint.textContent = message;
  next.hidden = !journey.rinseFrom || journey.pending || selected === 'sponge';
  canvas.setAttribute('aria-description', action.prompt);
}

function stopStroke() {
  const id = pointer;
  pointer = null;
  if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  if (journey) endStroke(journey.session);
  cursor.classList.remove('held');
}

function move(event) {
  if (event.pointerId !== pointer) return;
  const rect = canvas.getBoundingClientRect();
  const samples = selected === 'cleanser' ? event.getCoalescedEvents?.() : null;
  for (const sample of samples?.length ? samples : [event]) {
    if (pointer === null) break;
    paintSample(sample, rect);
  }
}

function paintSample(event, rect) {
  const x = Math.max(0, Math.min(width - 1, (event.clientX - rect.left) * width / rect.width));
  const y = Math.max(0, Math.min(height - 1, (event.clientY - rect.top) * height / rect.height));
  cursor.style.left = x / width * 100 + '%';
  cursor.style.top = y / height * 100 + '%';
  cursor.classList.add('held');
  const result = applyGesture(journey, selected, { x, y });
  if (!result) return;

  const now = performance.now();
  if (selected === 'cream' && !reducedMotion.matches && now - lastEffect >= 60) {
    creamTrace.push({ x, y, expires: now + 680 });
  }
  if (result === 'rinse' || result === 'complete') {
    stopStroke();
    react('smile', result === 'rinse' ? 'Fatto! Ora risciacquiamo.' : 'Che bello! ✦');
    sparkle(x, y, '✧ ✦', true);
    if (result === 'complete') transitionTimer = setTimeout(nextStep, 780);
  } else if (now >= nextReaction) {
    react('smile', 'Che sollievo!', 1800);
    nextReaction = now + 2300;
  }
  if (!frame) frame = requestAnimationFrame(render);
  if (now - lastEffect < 100) return;
  lastEffect = now;
  if (result === 'improved') sparkle(x, y, selected === 'sponge' ? '○ ✦' : '✧');
}

function sparkle(x, y, text, success = false) {
  if (reducedMotion.matches) return;
  const particle = document.createElement('span');
  particle.className = success ? 'particle celebration' : 'particle';
  particle.textContent = text;
  particle.style.left = x / width * 100 + '%';
  particle.style.top = y / height * 100 + '%';
  particle.addEventListener('animationend', () => particle.remove(), { once: true });
  character.append(particle);
}

function compare(before) {
  $('#before').setAttribute('aria-pressed', String(before));
  $('#after').setAttribute('aria-pressed', String(!before));
  portrait.classList.toggle('smile', !before);
  drawFace(portrait);
  $('#comparison').setAttribute('aria-label', 'Pelle ' + (before ? 'prima' : 'dopo') + ' il trattamento');
  drawComparison(journey.session, skin.stencil, before, client.id);
}

function nextStep() {
  stopStroke();
  clearReaction();
  nextReaction = 0;
  creamTrace = [];
  cancelAnimationFrame(frame);
  frame = 0;
  if (!advanceJourney(journey)) {
    updateTool(undefined);
    render();
    return;
  }
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
  journey = createJourney({
    width, height, client: id, skinAt: skin.skinAt, seed: crypto.getRandomValues(new Uint32Array(1))[0],
    regions: client.regions.map(([x, y, radius]) => ({ x, y, radius }))
  });
  creamTrace = [];
  nextReaction = 0;
  lastEffect = 0;
  updateTool(undefined);
  character.querySelectorAll('.particle').forEach(particle => particle.remove());
  setPortrait($('#spa .portrait'), id);
  show('spa');
  render();
  setCart(false);
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
bindAction(next, () => { if (!next.hidden) selectTool('sponge'); });

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
