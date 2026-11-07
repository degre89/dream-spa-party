import { mountMakeup } from './phase08/studio.mjs?v=08ar';
import { mountHub } from './phase07/hub.mjs?v=08a';
import { createWallet, SAVE_KEY } from './phase06/wallet.mjs?v=07b';
import { mountShop } from './phase06/shop.mjs?v=07b';
import { products } from './phase06/products.mjs?v=06b';
import { endStroke, MASK_TOOLS, SPA_TOOLS } from './phase03/facial-state.mjs?v=04e';
import { acceptsTool, advanceJourney, applyGesture, beginCleanserRinse, createJourney, currentAction, currentStep, journeyPercent } from './phase04/journey.mjs?v=07a';
import { drawFace } from './phase04/expressions.mjs?v=07a';
import { clients } from './phase03/clients.mjs?v=07a';
import { createSkinView, loadStencil } from './phase03/skin-view.mjs?v=07a';
import { patchStage } from './phase05/eye-patches.mjs?v=07a';

const $ = selector => document.querySelector(selector);
const canvas = $('#mask');
const { width, height } = canvas;
const character = $('#character');
const cursor = $('#tool');
const next = $('#next');
const steamStart = $('#steamStart');
const steamModels = $('#steamModels');
const productPanel = $('#productPanel');
const productOptions = $('#productOptions');
const productBack = $('#productBack');
const productChoices = Object.fromEntries(Object.entries(products).map(([category, variants]) => [category, variants[0]]));
const wallet = createWallet();
const ownsProduct = variant => variant.availability === 'free' || wallet.state.products.includes(variant.id);
for (const [category, variants] of Object.entries(products)) {
  productChoices[category] = variants.find(variant => ownsProduct(variant) &&
    variant.id === wallet.state.choices[category]) ?? productChoices[category];
}
const categoryButtons = {};
const cart = $('#cart');
const cartToggle = $('#cartToggle');
const cartTools = $('#cartTools');
const maskToggle = $('#maskToggle');
const maskPanel = $('#maskPanel');
const maskOptions = $('#maskOptions');
const hint = $('#hint');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const draw = createSkinView(canvas);
const drawComparison = createSkinView($('#comparison'));

const tools = {
  steamer: { name: 'il vaporizzatore', label: 'Vaporizzatore', icon: true, hint: 'Passa sulla fronte, sulle guance e sul mento.' },
  cleanser: { name: 'il detergente', label: 'Detergente', icon: true, hint: 'Stendi la schiuma sulla pelle.' },
  brush: { name: 'la spazzolina', label: 'Spazzolina', icon: true, hint: 'Fai piccoli cerchi dove vedi i pori.' },
  sponge: { name: 'la spugnetta', label: 'Spugnetta', icon: true, hint: 'Passa la spugnetta sul prodotto rimasto.' },
  gel: { name: 'il gel', label: 'Gel', icon: true, hint: 'Tocca i puntini con una goccia di gel.' },
  serum: { name: 'il siero', label: 'Siero', icon: true, hint: 'Massaggia piano le zone arrossate.' },
  strawberry: { name: 'la maschera alla fragola', label: 'Fragola', hint: 'Stendi la maschera alla fragola.' },
  avocado: { name: 'la maschera all’avocado', label: 'Avocado', hint: 'Stendi la maschera all’avocado.' },
  blueberry: { name: 'la maschera al mirtillo', label: 'Mirtillo', hint: 'Stendi la maschera al mirtillo.' },
  honey: { name: 'la maschera al miele', label: 'Miele', hint: 'Stendi la maschera al miele.' },
  patches: { name: 'le patch', label: 'Patch occhi', icon: true, hint: 'Metti una patch sotto ogni occhio.' },
  cream: { name: 'la crema', label: 'Crema', icon: true, hint: 'Massaggia la crema sulla pelle pulita.' }
};

let client, skin, journey, selected;
let portrait;
let blinkTimer, openTimer, reactionTimer, transitionTimer, steamTimer, patchTimer;
let feedback;
let lastCue, bubbleTimer, mouthTimer;
let creamTrace = [];
let pointer = null;
let patchOrigin;
let handledTap;
let closeProducts;
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
  clearTimeout(patchTimer);
  dismissBubble();
  lastCue = null;
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

function stopTalking() {
  clearInterval(mouthTimer);
  if (!portrait?.dataset.mouth) return;
  delete portrait.dataset.mouth;
  drawFace(portrait);
}

function dismissBubble() {
  clearTimeout(bubbleTimer);
  stopTalking();
  hint.textContent = '';
}

function say(message) {
  dismissBubble();
  hint.textContent = message;
  hint.dataset.feedback = feedback?.expression ?? '';
  bubbleTimer = setTimeout(dismissBubble, 3800);
  if (reducedMotion.matches) return;
  const mouth = [1, 2, 1, 2, 1, 2, 1];
  let syllable = 0;
  const speak = () => {
    if (syllable === mouth.length) {
      stopTalking();
      return;
    }
    portrait.dataset.mouth = mouth[syllable++];
    drawFace(portrait);
  };
  speak();
  mouthTimer = setInterval(speak, 155);
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
  cartToggle.setAttribute('aria-expanded', String(open));
  if (!open) {
    showMasks(false);
    productPanel.hidden = true;
    productOptions.replaceChildren();
    steamModels.setAttribute('aria-expanded', 'false');
    for (const button of Object.values(categoryButtons)) button.setAttribute('aria-expanded', 'false');
  }
}

function showMasks(open) {
  cartTools.hidden = open;
  maskPanel.hidden = !open;
  maskToggle.setAttribute('aria-expanded', String(open));
}

function showProducts(category, trigger) {
  stopStroke();
  const guided = category === 'steamer';
  setCart(false);
  setCart(true);
  cartTools.hidden = true;
  productPanel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  productBack.textContent = guided ? '‹ Vaporizzatore' : '‹ Carrello';
  productOptions.setAttribute('aria-label', tools[category].label);
  productOptions.replaceChildren();
  closeProducts = () => {
    setCart(!guided);
    productPanel.hidden = true;
    productOptions.replaceChildren();
    cartTools.hidden = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({ preventScroll: true });
  };
  for (const variant of products[category]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spa-tool';
    button.dataset.variant = variant.id;
    button.setAttribute('aria-pressed', String(productChoices[category] === variant));
    button.append(productGraphic(variant), variant.name);
    if (!ownsProduct(variant)) {
      button.disabled = true;
      button.append(' · Negozio');
    }
    bindAction(button, () => {
      if (journey.pending || !ownsProduct(variant)) return;
      void wallet.choose(category, variant);
      productChoices[category] = variant;
      trigger.querySelector('img')?.replaceWith(productGraphic(variant));
      if (guided) {
        steamStart.querySelector('img').replaceWith(productGraphic(variant));
        setCart(false);
        if (selected === 'steamer') updateTool('steamer');
        steamStart.focus({ preventScroll: true });
      } else selectTool(category);
    });
    productOptions.append(button);
  }
  productBack.focus({ preventScroll: true });
}

function updateTool(id) {
  selected = id;
  for (const button of cart.querySelectorAll('[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === id));
  }
  character.classList.toggle('rinsing', id === 'sponge');
  character.classList.toggle('steaming', id === 'steamer');
  steamStart.setAttribute('aria-pressed', String(id === 'steamer'));
  cursor.replaceChildren();
  if (!id) return;
  cursor.append(toolGraphic(id));
  if (id === 'steamer') {
    const plume = document.createElement('span');
    plume.className = 'steam-plume';
    plume.style.setProperty('--vapor', productChoices.steamer.effect.color);
    for (let index = 0; index < 3; index++) plume.append(document.createElement('i'));
    cursor.prepend(plume);
  }
}

function selectTool(id) {
  if (journey.pending) return;
  stopStroke();
  if (id === 'sponge') beginCleanserRinse(journey);
  updateTool(id);
  setCart(false);
  cartToggle.focus({ preventScroll: true });
  if (acceptsTool(journey, id)) {
    if (id === 'patches') clearReaction();
    else react('smile', 'Proviamo sul viso!', 1800);
  } else {
    journey.mistakes++;
    const message = journey.mistakes === 1 ? 'Mmm… proviamo qualcos’altro?' : help();
    react('puzzled', message, 2000);
  }
  render();
}

function help() {
  const action = currentAction(journey);
  const tool = action.tool ?? journey.mask;
  return tool ? 'Prova con ' + tools[tool].name + '!' : 'Scegli una maschera dal carrello!';
}

function render() {
  cancelAnimationFrame(frame);
  frame = 0;
  const now = performance.now();
  creamTrace = creamTrace.filter(point => point.expires > now);
  const percent = journeyPercent(journey);
  const action = currentAction(journey);
  const steaming = action.tool === 'steamer';
  const patches = action.tool === 'patches' && !journey.pending ? patchStage(journey, now) : null;
  const showTargets = selected === 'patches';
  character.classList.toggle('patch-rest', patches === 'rest');
  draw(journey.session, skin.stencil, false, client.id, creamTrace.map(point => ({
    ...point, alpha: 0.55 * (point.expires - now) / 680
  })), steaming ? percent / 100 : null, patches && { stage: patches, showTargets });
  if (creamTrace.length || journey.session.cells.some(cell => cell.creamUntil > now)) frame = requestAnimationFrame(render);

  const patchHint = patches === 'rest' ? 'Un attimo di relax…' :
    patches === 'remove' ? 'Ora togli tutte e due le patch!' : null;
  const step = currentStep(journey);
  steamStart.hidden = !steaming;
  steamModels.hidden = !steaming || journey.pending;
  cartToggle.hidden = steaming;
  const meter = $('#meter');
  $('#fill').style.width = percent + '%';
  meter.setAttribute('aria-valuenow', percent);
  meter.setAttribute('aria-label', steaming ? 'Preparazione con il vapore' : journey.rinseFrom ? 'Risciacquo' : 'Progresso del trattamento');
  $('#percent').textContent = percent + '%';
  const label = client.name + ' · ' + (journey.index + 1) + '/' + journey.sequence.length;
  if ($('#step').textContent !== label) $('#step').textContent = label;
  const patchTitle = patches === 'apply' && showTargets ? 'Metti le patch' :
    patches === 'rest' ? 'Un po’ di relax' : patches === 'remove' ? 'Togli le patch' : null;
  const title = step.icon + ' ' + (patchTitle ?? step.title);
  if ($('#goal').textContent !== title) $('#goal').textContent = title;
  const message = feedback?.message ?? patchHint ?? (journey.cleanserReady ?
    'Puoi finire di stendere la schiuma o risciacquare.' : selected && acceptsTool(journey, selected) ?
      tools[selected].hint : journey.mistakes >= 2 ? help() : action.prompt);
  const cue = feedback ?? message;
  if (cue !== lastCue) {
    lastCue = cue;
    say(message);
  }
  next.hidden = Boolean(journey.mask) || !(journey.rinseFrom || journey.cleanserReady) ||
    journey.pending || selected === 'sponge';
  canvas.setAttribute('aria-description', patchHint ?? action.prompt);
}

function stopStroke() {
  const id = pointer;
  pointer = null;
  patchOrigin = null;
  if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  if (journey) endStroke(journey.session);
  cursor.classList.remove('held', 'emitting');
  character.classList.remove('relaxing');
  clearTimeout(steamTimer);
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

function paintSample(event, rect, released = false) {
  const rawX = (event.clientX - rect.left) * width / rect.width;
  const rawY = (event.clientY - rect.top) * height / rect.height;
  const x = Math.max(0, Math.min(width - 1, rawX));
  const y = Math.max(0, Math.min(height - 1, rawY));
  cursor.style.left = x / width * 100 + '%';
  cursor.style.top = (selected === 'steamer' ? rawY : y) / height * 100 + '%';
  if (selected === 'patches' && patchStage(journey) === 'remove') cursor.classList.remove('held');
  else cursor.classList.add('held');
  if (selected === 'steamer' && (rawX !== x || rawY !== y)) {
    endStroke(journey.session);
    return;
  }
  if (selected === 'patches' && !released) {
    patchOrigin ??= { x, y };
    return;
  }
  const point = selected === 'patches' && patchStage(journey) === 'remove' ? patchOrigin : { x, y };
  if (!point || (selected === 'patches' && patchStage(journey) !== 'remove' && (rawX !== x || rawY !== y))) return;
  const result = applyGesture(journey, selected, point);
  if (!result) return;

  const now = performance.now();
  if (selected === 'cream' && !reducedMotion.matches && now - lastEffect >= 60) {
    creamTrace.push({ x, y, expires: now + 680 });
  }
  if (result === 'steam') {
    character.classList.add('relaxing');
    cursor.classList.add('emitting');
    clearTimeout(steamTimer);
    steamTimer = setTimeout(() => cursor.classList.remove('emitting'), 200);
  } else if (result === 'patches-rest') {
    clearReaction();
    patchTimer = setTimeout(render, Math.max(0, journey.patchesReadyAt - performance.now()) + 16);
  } else if (result === 'patch-on' || result === 'patch-off') {
    sparkle(point.x, point.y, '✧');
  } else if (result === 'cleanser-ready') {
    react('smile', 'Puoi ancora stendere la schiuma!', 1800);
  } else if (result === 'rinse' || result === 'complete') {
    stopStroke();
    if (result === 'rinse') updateTool(undefined);
    react('smile', result === 'rinse' ? 'Fatto! Scegli la spugnetta nel carrello.' : selected === 'steamer' ? 'Ora sono pronta! ✦' : 'Che bello! ✦');
    sparkle(x, y, '✧ ✦', true);
    if (result === 'complete') transitionTimer = setTimeout(nextStep, 780);
  } else if (now >= nextReaction) {
    react('smile', 'Che sollievo!', 1800);
    nextReaction = now + 2300;
  }
  if (!frame) frame = requestAnimationFrame(render);
  if (now - lastEffect < 100) return;
  lastEffect = now;
  const effect = productChoices[selected]?.effect;
  if (effect?.glyph && result !== 'complete' && result !== 'rinse') {
    sparkle(x, y, effect.glyph, false, effect);
  } else if (result === 'improved') sparkle(x, y, '✧');
}

function sparkle(x, y, text, success = false, effect) {
  if (reducedMotion.matches) return;
  const particle = document.createElement('span');
  particle.className = success ? 'particle celebration' : 'particle';
  particle.textContent = text;
  if (effect) {
    particle.classList.add('product-particle');
    particle.style.setProperty('--spark-color', effect.color);
    particle.style.setProperty('--spark-shadow', effect.shadow);
  }
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
  updateTool(undefined);
  setCart(false);
  if (!advanceJourney(journey)) {
    render();
    return;
  }
  const reward = wallet.reward();
  $('#done .reward').textContent = 'Hai guadagnato 3 stelle!';
  reward.then(result => {
    syncWallet();
    if (result !== 'ok') $('#done .reward').textContent = 'Impossibile salvare le stelline in questo browser.';
  });
  setPortrait($('#done .portrait'), client.id);
  show('done');
  compare(false);
}

function start(id) {
  skin = stencils.get(id);
  if (!skin) return;
  client = { ...clients[id], id };
  journey = createJourney({
    width, height, client: id, skinAt: skin.skinAt, sampleCell: skin.sampleCell, seed: crypto.getRandomValues(new Uint32Array(1))[0],
    regions: client.regions.map(([x, y, radius]) => ({ x, y, radius }))
  });
  creamTrace = [];
  nextReaction = 0;
  lastEffect = 0;
  updateTool(undefined);
  character.querySelectorAll('.particle').forEach(particle => particle.remove());
  setPortrait($('#spa .portrait'), id);
  $('#spa .spa-eyelids').src = 'assets/' + client.eyelids;
  show('spa');
  render();
  setCart(false);
}

for (const id of [...SPA_TOOLS, 'patches']) {
  const { label } = tools[id];
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tool = id;
  button.className = 'spa-tool';
  button.setAttribute('aria-pressed', 'false');
  button.append(toolGraphic(id), label);
  if (products[id]) {
    categoryButtons[id] = button;
    button.dataset.category = id;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'productPanel');
    bindAction(button, () => showProducts(id, button));
  } else bindAction(button, () => selectTool(id));
  if (MASK_TOOLS.includes(id)) maskOptions.append(button);
  else cartTools.insertBefore(button, maskToggle);
}

const clientList = $('.clients');
for (const [id, profile] of Object.entries(clients)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'client';
  button.dataset.client = id;
  button.disabled = true;
  const image = document.createElement('img');
  image.src = 'assets/' + profile.portrait;
  image.alt = '';
  image.loading = 'lazy';
  const name = document.createElement('span');
  name.textContent = profile.name;
  button.append(image, name);
  clientList.append(button);
  bindAction(button, () => start(id));
  loadStencil('assets/' + profile.stencil, width, height).then(stencil => {
    stencils.set(id, stencil);
    button.disabled = false;
    $('#play').disabled = false;
  }).catch(() => {
    $('#chooseStatus').textContent = 'Un ritratto non è disponibile. Ricarica la pagina per riprovare.';
    if (!stencils.size) $('#status').textContent = 'Caricamento non riuscito. Ricarica la pagina.';
  });
}

function beginStroke(event) {
  pointer = event.pointerId;
  cursor.classList.toggle('touch', event.pointerType === 'touch');
  canvas.setPointerCapture(pointer);
  move(event);
}

steamStart.prepend(toolGraphic('steamer'));
bindAction(steamModels, () => {
  if (productPanel.hidden) showProducts('steamer', steamModels);
  else {
    setCart(false);
    steamModels.focus({ preventScroll: true });
  }
});
steamStart.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointer !== null || journey.pending) return;
  setCart(false);
  updateTool('steamer');
  render();
  // Transfer capture so one continuous drag can start on the device in the tray.
  beginStroke(event);
});
bindAction(steamStart, () => {
  if (journey.pending) return;
  updateTool('steamer');
  render();
});

canvas.addEventListener('pointerdown', event => {
  if (!selected || !cart.hidden || pointer !== null || event.button !== 0) return;
  beginStroke(event);
});
canvas.addEventListener('pointermove', move);
canvas.addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  if (selected === 'patches') paintSample(event, canvas.getBoundingClientRect(), true);
  else move(event);
  stopStroke();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, event => { if (event.pointerId === pointer) stopStroke(); });
}

bindAction($('#again'), () => show('choose'));
function goHome() {
  stopStroke();
  cancelAnimationFrame(frame);
  frame = 0;
  setCart(false);
  show('home');
  $('#roomTitle').focus({ preventScroll: true });
}
for (const selector of ['#chooseHome', '#back', '#goHome']) bindAction($(selector), goHome);
bindAction(productBack, () => closeProducts());
bindAction(cartToggle, () => setCart(cart.hidden));
bindAction(maskToggle, () => {
  showMasks(true);
  $('#maskBack').focus({ preventScroll: true });
});
bindAction($('#maskBack'), () => {
  showMasks(false);
  maskToggle.focus({ preventScroll: true });
});
bindAction($('#repeatHint'), () => {
  if (lastCue) say(lastCue.message ?? lastCue);
});
bindAction($('#before'), () => compare(true));
bindAction($('#after'), () => compare(false));
bindAction(next, () => {
  if (!next.hidden) showProducts('sponge', categoryButtons.sponge);
});

function productGraphic(variant) {
  const graphic = document.createElement('img');
  graphic.src = variant.asset;
  graphic.alt = '';
  graphic.draggable = false;
  return graphic;
}

function toolGraphic(id) {
  if (productChoices[id]) return productGraphic(productChoices[id]);
  if (tools[id].icon) return toolIcon(id);
  const jar = document.createElement('img');
  jar.src = 'assets/jar-' + id + '.svg';
  jar.alt = '';
  return jar;
}

function toolIcon(id) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', 'icon');
  icon.setAttribute('viewBox', '0 0 32 32');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(namespace, 'use');
  use.setAttribute('href', 'assets/spa-tools.svg?v=05#' + id);
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
reducedMotion.addEventListener('change', () => {
  resetBlink();
  if (reducedMotion.matches) stopTalking();
});
scheduleBlink();


function syncWallet() {
  $('#stars').textContent = wallet.state.balance;
  $('#totalStars').textContent = '★ ' + wallet.state.balance;
  hub.refresh();
}

const makeup = mountMakeup({ bindAction,
  onHome: () => { show('home'); $('#makeup').focus(); }
});
const hub = mountHub({ wallet, onSkinCare: () => show('choose'),
  onMakeup: () => { show('makeupStudio'); makeup.open(); }, changed: syncWallet, bindAction });
const shop = mountShop({ wallet, clients, products, productGraphic, changed: syncWallet, bindAction });
let shopReturn;
for (const [selector, screen] of [['#openShop', 'home'], ['#chooseShop', 'choose']]) {
  bindAction($(selector), () => {
    shopReturn = { selector, screen };
    show('shop');
    shop.open();
    $('#shopTitle').focus();
  });
}
bindAction($('#shopBack'), () => {
  show(shopReturn.screen);
  $(shopReturn.selector).focus();
});
window.addEventListener('storage', event => {
  if (event.key !== SAVE_KEY && event.key !== null) return;
  wallet.refresh();
  syncWallet();
  shop.refresh();
});
syncWallet();
wallet.initialize().then(syncWallet);
