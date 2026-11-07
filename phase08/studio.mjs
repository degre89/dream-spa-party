import { clients } from '../phase03/clients.mjs?v=07a';
import { drawExpression } from '../phase04/expressions.mjs?v=08b3';
import { faces, palettes } from './geometry.mjs?v=08b2';
import { createLook, allowed, createPaintView, drawDecoration } from './paint.mjs?v=08b3';

import { eyeSlices, reactions, reactionFrames } from './reveal.mjs?v=08b3';
import { decorations, decorationDetails, finishes } from './fantasy.mjs?v=08b3';

export function mountMakeup({ onHome, bindAction }) {
  const get = id => document.getElementById('studio' + id);
  const selection = get('Selection');
  const editor = get('Editor');
  const surface = get('Paint');
  const portrait = get('Portrait');
  const context = surface.getContext('2d', { willReadFrequently: true });
  const paint = createPaintView(context);
  const faceContext = portrait.getContext('2d');
  const cursor = document.querySelector('.studio-tool');
  const spark = document.querySelector('.studio-spark');
  const confirm = get('Confirm');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const looks = new Map();
  const histories = new Map();
  const images = new Map();
  let client, look, image, lids;
  let category = 'shadow', choice = 0;
  let finish = 'Soft', hearts = false;
  let draft = null;
  let active = null, stroke = null, previous = null, preview = null;
  let closed = false, result = false, blinkTimer, effect;
  let revealPhase = '', smile = false;
  const blinkFrames = [];
  const revealTimers = [];
  let loadVersion = 0, pendingConfirmation, shineFrame;
  let shinePulse = 0;

  const selected = () => palettes[category].colors[choice];
  const checkpoint = () => {
    const history = histories.get(client);
    history.push({ ...look, strokes: [...look.strokes], decorations: [...look.decorations] });
    if (history.length > 30) history.shift();
    look.completed = false;
  };
  const dirty = () => look && !look.completed && (look.strokes.length || look.decorations.length);

  function ask(title, text, action) {
    stopGesture();
    get('ConfirmTitle').textContent = title;
    get('ConfirmText').textContent = text;
    pendingConfirmation = action;
    confirm.showModal();
  }
  bindAction(get('ConfirmAction'), () => {
    confirm.close();
    const action = pendingConfirmation;
    pendingConfirmation = null;
    action?.();
  });
  confirm.addEventListener('close', () => { pendingConfirmation = null; });
  function leave(action) {
    if (!editor.hidden && dirty()) ask('Conserviamo il tuo look?', 'Il look resta qui durante questa sessione. Potrai riprenderlo scegliendo la stessa cliente.', action);
    else action();
  }

  function drawPortrait() {
    if (!image) return;
    faceContext.clearRect(0, 0, 768, 960);
    faceContext.drawImage(image, 0, 0, 768, 960);
    if (lids) for (const [x, width] of eyeSlices(closed, 768)) {
      // The original SVGs have different intrinsic sizes. Clip in portrait
      // coordinates after scaling each overlay to the same portrait rectangle.
      faceContext.save();
      faceContext.beginPath();
      faceContext.rect(x, 0, width, 960);
      faceContext.clip();
      faceContext.drawImage(lids, 0, 0, 768, 960);
      faceContext.restore();
    }
  }

  function redraw() {
    if (!look || !image) return;
    if (!result) drawPortrait();
    portrait.dataset.eyes = closed === true ? 'closed' : closed ? closed + '-wink' : 'open';
    paint.rebuild(look, closed);
    compose();
    get('Undo').disabled = !histories.get(client).length;
  }

  function compose() {
    if (result) drawPortrait();
    paint.draw(look, preview, shinePulse, revealPhase === 'magic', !smile);
    if (smile) {
      // Pigment moves with the portrait. Decals are drawn afterward in their original positions.
      faceContext.drawImage(surface, 0, 0, 768, 960);
      const original = faceContext.getImageData(0, 0, 768, 960);
      faceContext.putImageData(drawExpression(faceContext, original, client, true, reactions[client]), 0, 0);
      context.clearRect(0, 0, 512, 640);
      for (const decoration of look.decorations) drawDecoration(context, decoration);
    }
  }

  function cancelBlink() {
    clearTimeout(blinkTimer);
    for (const timer of blinkFrames.splice(0)) clearTimeout(timer);
    closed = false;
  }
  function setEyePose(pose) {
    closed = pose;
    redraw();
  }
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (reduced.matches || document.hidden || editor.hidden || result ||
        !document.getElementById('makeupStudio').classList.contains('on')) return;
    const profile = reactions[client];
    blinkTimer = setTimeout(() => {
      if (active === null && !draft) {
        blinkFrames.length = 0;
        const frames = profile.wink ? reactionFrames(profile) : [[0, true], [profile.blink, false]];
        for (const [delay, pose] of frames) blinkFrames.push(setTimeout(() => setEyePose(pose), delay));
        if (profile.magic) {
          shimmer([329, 267]);
        }
      }
      scheduleBlink();
    }, profile.pause);
  }

  const categories = { shadow: 'Occhi', blush: 'Blush', lips: 'Labbra', jewels: 'Decorazioni' };
  const productNames = { shadow: 'Ombretto', blush: 'Blush', lips: 'Rossetto', gloss: 'Gloss', jewels: 'Decorazione' };
  const glossIndex = palettes.lips.colors.findIndex(([, color]) => color === null);
  const tray = get('Options');

  function setTray(next, returnFocus = false) {
    draft = next;
    controls();
    if (returnFocus) {
      get('Cart').focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function commitChoice(color, texture = 'Soft') {
    ({ category, hearts } = draft);
    choice = color;
    finish = texture;
    get('Status').textContent = '';
    setTray(null, true);
  }

  function controls() {
    tray.hidden = !draft;
    get('Cart').setAttribute('aria-expanded', Boolean(draft));
    get('Palette').replaceChildren();
    get('Products').replaceChildren();
    for (const button of get('Categories').children) {
      button.setAttribute('aria-pressed', button.dataset.category === draft?.category);
    }
    announceChoice();
    get('Clear').textContent = 'Pulisci ' + categories[category].toLowerCase();
    cursor.firstElementChild.setAttribute('href', 'phase08/tools.svg#' + category);
    if (!draft) return;

    const entry = palettes[draft.category];
    const products = draft.category === 'lips' ? ['lips', 'gloss'] : [draft.category];
    for (const product of products) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill';
      button.textContent = productNames[product];
      button.setAttribute('aria-pressed', product === draft.product);
      bindAction(button, () => {
        if (product === 'gloss') return commitChoice(glossIndex);
        draft.product = product;
        draft.choice = null;
        controls();
        get('Palette').firstElementChild.focus({ preventScroll: true });
      });
      get('Products').append(button);
    }
    get('Hint').textContent = !draft.product ? 'Scegli un prodotto.' :
      draft.choice !== null ? 'Scegli la finitura.' :
      draft.category === 'jewels' ? 'Scegli il tuo decoro.' : 'Scegli un colore.';
    if (draft.product) entry.colors.forEach(([name, color, symbol], index) => {
      if (color === null) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', name);
      button.title = name;
      button.setAttribute('aria-pressed', index === draft.choice);
      const swatch = document.createElement('span');
      swatch.style.background = color;
      if (symbol) {
        swatch.innerHTML = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path fill="' + color +
          '" stroke="#fff5db" d="' + decorations[symbol] + '"/><path fill="none" stroke="#62417a99" d="' +
          (decorationDetails[symbol] ?? '') + '"/></svg>';
        swatch.style.background = '#8a62a7';
      }
      button.append(swatch);
      bindAction(button, () => {
        if (draft.category === 'jewels') return commitChoice(index);
        draft.choice = index;
        controls();
        get('Palette').children[index].focus({ preventScroll: true });
      });
      get('Palette').append(button);
    });
    get('Finishes').hidden = draft.choice === null;
    get('Hearts').hidden = draft.category !== 'blush' || !draft.product;
    get('Hearts').setAttribute('aria-pressed', draft.hearts);
  }

  function announceChoice() {
    const product = selected()[1] === null ? 'gloss' : category;
    const detail = category === 'jewels' ? (look?.decorations.length ?? 0) + '/6' :
      product === 'gloss' ? '' : finish + (category === 'blush' && hearts ? ' + microcuoricini' : '');
    get('Choice').textContent = [productNames[product], selected()[0], detail].filter(Boolean).join(' · ');
  }

  for (const name of finishes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    bindAction(button, () => commitChoice(draft.choice, name));
    get('Finishes').append(button);
  }
  bindAction(get('Hearts'), () => {
    draft.hearts = !draft.hearts;
    get('Hearts').setAttribute('aria-pressed', draft.hearts);
  });

  function openCategory(id) {
    stopGesture();
    setTray(draft?.category === id ? null : { category: id, product: null, choice: null, hearts: id === category && hearts });
  }

  bindAction(get('Cart'), () => openCategory(draft?.category ?? category));
  tray.addEventListener('keydown', event => {
    if (event.key === 'Escape') setTray(null, true);
  });
  for (const [id, label] of Object.entries(categories)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = id;
    button.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><use href="phase08/tools.svg#' + id + '"/></svg>';
    button.append(label);
    bindAction(button, () => openCategory(id));
    get('Categories').append(button);
  }

  async function loadImage(path) {
    if (!images.has(path)) images.set(path, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { images.delete(path); reject(new Error('Immagine non disponibile')); };
      image.src = 'assets/' + path;
    }));
    return images.get(path);
  }

  async function choose(id) {
    const version = ++loadVersion;
    for (const button of get('Cards').children) button.disabled = true;
    try {
      const entry = clients[id];
      const loaded = await Promise.all([loadImage(entry.portrait), loadImage(entry.eyelids)]);
      if (version !== loadVersion) return;
      stopGesture();
      cancelBlink();
      client = id;
      [image, lids] = loaded;
      if (!looks.has(id)) { looks.set(id, createLook(id)); histories.set(id, []); }
      look = looks.get(id);
      result = false;
      selection.hidden = true;
      editor.hidden = false;
      editor.dataset.client = id;
      get('Clients').hidden = false;
      get('Tools').hidden = false;
      get('Result').hidden = true;
      get('Title').textContent = entry.name + ' · Makeup';
      surface.setAttribute('aria-label', 'Applica il trucco sul viso di ' + entry.name);
      setTray(null);
      get('Status').textContent = '';
      redraw();
      scheduleBlink();
      get('Title').focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } catch {
      get('Title').textContent = 'Caricamento non riuscito. Riprova.';
    } finally {
      for (const button of get('Cards').children) button.disabled = false;
    }
  }

  for (const id of Object.keys(faces)) {
    const entry = clients[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.client = id;
    button.innerHTML = '<img src="assets/' + entry.portrait + '" alt=""><strong>' + entry.name + '</strong><small>Cosmetici gratuiti ✦</small>';
    bindAction(button, () => void choose(id));
    get('Cards').append(button);
  }

  function selectionView() {
    ++loadVersion;
    stopGesture();
    cancelBlink();
    clearReveal();
    result = false;
    smile = false;
    selection.hidden = false;
    editor.hidden = true;
    get('Clients').hidden = true;
    get('Title').textContent = 'Magic Makeup Studio';
    get('Title').focus({ preventScroll: true });
  }
  bindAction(get('Home'), () => leave(() => { selectionView(); onHome(); }));
  bindAction(get('Clients'), () => leave(selectionView));

  function point(event) {
    const box = surface.getBoundingClientRect();
    return [(event.clientX - box.x) * 512 / box.width, (event.clientY - box.y) * 640 / box.height];
  }
  function cursorAt(event) {
    const box = surface.getBoundingClientRect();
    cursor.style.left = (event.clientX - box.x) + 'px';
    cursor.style.top = (event.clientY - box.y) + 'px';
    cursor.removeAttribute('hidden');
  }
  function shimmer([x, y]) {
    if (reduced.matches) return;
    spark.style.left = (x / 512 * 100) + '%';
    spark.style.top = (y / 640 * 100) + '%';
    effect?.cancel();
    effect = spark.animate([{ opacity: .85, transform: 'translate(-50%, -50%) scale(.7)' },
      { opacity: 0, transform: 'translate(-50%, -100%) scale(1.2)' }], { duration: 420 });
  }
  function apply(points) {
    const valid = points.filter(([x, y]) => allowed(context, client, category, x, y));
    if (!valid.length) return;
    if (!stroke) {
      checkpoint();
      stroke = { category, color: selected()[1], finish, hearts: category === 'blush' && hearts, points: [] };
      look.strokes.push(stroke);
    }
    const closeForBrush = category === 'shadow' && !closed;
    stroke.points.push(...valid);
    if (closeForBrush) {
      closed = true;
      redraw();
    } else {
      // Incremental stamps have the same result as replaying the session record.
      paint.append(client, { ...stroke, points: valid });
      paint.draw(look, null, shinePulse);
    }
    get('Undo').disabled = false;
  }
  function interpolate(from, to) {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const count = Math.ceil(distance / 3);
    return Array.from({ length: count }, (_, index) => {
      const t = (index + 1) / count;
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    });
  }
  function decorationAt([x, y]) {
    if (!allowed(context, client, 'jewels', x, y)) return null;
    return { x, y, color: selected()[1], symbol: selected()[2] };
  }
  function previewAt(position) {
    preview = decorationAt(position);
    paint.draw(look, preview, shinePulse);
  }

  surface.addEventListener('pointerdown', event => {
    if (result || draft || active !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    stopShine();
    cancelBlink();
    effect?.cancel();
    redraw();
    active = event.pointerId;
    surface.setPointerCapture(active);
    previous = point(event);
    cursorAt(event);
    if (category === 'jewels') previewAt(previous);
    else apply([previous]);
  });
  surface.addEventListener('pointermove', event => {
    if (result || draft || (active !== null && event.pointerId !== active)) return;
    cursorAt(event);
    const position = point(event);
    if (category === 'jewels') previewAt(position);
    else if (active === event.pointerId) apply(interpolate(previous, position));
    previous = position;
  });
  surface.addEventListener('pointerup', event => {
    if (active !== event.pointerId) return;
    let full = false;
    if (category === 'jewels') {
      const [x, y] = point(event);
      const decoration = decorationAt([x, y]);
      const index = look.decorations.findIndex(item => Math.hypot(item.x - x, item.y - y) < 18);
      if (index >= 0) {
        checkpoint();
        look.decorations.splice(index, 1);
      } else if (decoration && look.decorations.length < 6) {
        checkpoint();
        look.decorations.push(decoration);
        shimmer([x, y]);
      } else if (decoration) full = true;
    }
    const appliedGloss = stroke?.category === 'lips' && stroke.color === null;
    stopGesture();
    if (appliedGloss) animateShine();
    announceChoice();
    get('Status').textContent = full ? 'Hai già 6 decori. Toccane uno per toglierlo.' : '';
    scheduleBlink();
  });
  function stopGesture() {
    stopShine();
    const pointer = active;
    if (stroke?.category === 'shadow') closed = false;
    active = null;
    stroke = null;
    previous = null;
    preview = null;
    cursor.setAttribute('hidden', '');
    if (pointer !== null && surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer);
    redraw();
  }
  function cancelGesture() {
    if (active === null) return;
    stopGesture();
    scheduleBlink();
  }
  surface.addEventListener('pointercancel', event => { if (active === event.pointerId) cancelGesture(); });
  surface.addEventListener('lostpointercapture', cancelGesture);
  surface.addEventListener('pointerleave', () => {
    if (active === null) { preview = null; cursor.setAttribute('hidden', ''); redraw(); }
  });
  window.addEventListener('blur', stopGesture);
  document.addEventListener('visibilitychange', () => {
    cancelBlink();
    stopGesture();
    if (document.hidden && result && !editor.hidden) presentReveal();
    if (!document.hidden) scheduleBlink();
  });
  reduced.addEventListener('change', () => {
    cancelBlink();
    stopShine();
    effect?.cancel();
    if (result && !editor.hidden) presentReveal();
    else { redraw(); scheduleBlink(); }
  });

  bindAction(get('Undo'), () => {
    stopGesture();
    const last = histories.get(client).pop();
    if (!last) return;
    look = last;
    looks.set(client, look);
    controls();
    redraw();
  });
  bindAction(get('Clear'), () => {
    stopGesture();
    checkpoint();
    if (category === 'jewels') look.decorations = [];
    else look.strokes = look.strokes.filter(stroke => stroke.category !== category);
    controls();
    redraw();
  });
  bindAction(get('Reset'), () => ask('Un nuovo look?', 'Vuoi cancellare tutti i prodotti e i decori di questo look?', () => {
    checkpoint();
    look = createLook(client);
    looks.set(client, look);
    controls();
    redraw();
  }));
  function setRevealPhase(phase, eyes, smiling) {
    revealPhase = phase;
    editor.dataset.reveal = phase;
    smile = smiling;
    setEyePose(eyes);
  }

  function clearReveal() {
    for (const timer of revealTimers.splice(0)) clearTimeout(timer);
    stopShine();
    effect?.cancel();
    revealPhase = '';
    delete editor.dataset.reveal;
  }

  function presentReveal() {
    clearReveal();
    setRevealPhase('final', false, true);
    get('ResultTitle').textContent = 'Il tuo look è pronto! ✦';
    get('ResultActions').hidden = false;
    if (!document.hidden) get('ResultTitle').focus({ preventScroll: true });
  }

  function startReveal() {
    stopGesture();
    cancelBlink();
    clearReveal();
    setTray(null);
    look.completed = true;
    result = true;
    get('Tools').hidden = true;
    get('Result').hidden = false;
    get('ResultTitle').textContent = 'Magic Reveal ✦';
    get('ResultTitle').focus({ preventScroll: true });
    if (reduced.matches || document.hidden) return presentReveal();

    get('ResultActions').hidden = true;
    const later = (delay, action) => revealTimers.push(setTimeout(action, delay));
    const profile = reactions[client];
    setRevealPhase('eyes', true, false);
    later(1000, () => {
      setRevealPhase('magic', true, false);
      if (look.strokes.length || look.decorations.length) animateShine();
    });
    later(2000, () => {
      setRevealPhase('smile', false, true);
      for (const [delay, pose] of reactionFrames(profile)) later(delay, () => setEyePose(pose));
    });
    later(4000, presentReveal);
  }

  bindAction(get('Finish'), startReveal);
  bindAction(get('Replay'), startReveal);
  bindAction(get('Back'), () => { selectionView(); onHome(); });
  bindAction(get('Resume'), () => {
    clearReveal();
    result = false;
    smile = false;
    get('Tools').hidden = false;
    get('Result').hidden = true;
    redraw();
    scheduleBlink();
    get('Cart').focus({ preventScroll: true });
  });
  function stopShine() {
    cancelAnimationFrame(shineFrame);
    shinePulse = 0;
  }

  function animateShine() {
    stopShine();
    if (reduced.matches || document.hidden) return;
    const started = performance.now();
    let lastDraw = started;
    function frame(now) {
      const progress = Math.min(1, (now - started) / 960);
      if (now - lastDraw >= 100 || progress === 1) {
        shinePulse = Math.sin(Math.PI * progress);
        compose();
        lastDraw = now;
      }
      if (progress < 1) shineFrame = requestAnimationFrame(frame);
    }
    shineFrame = requestAnimationFrame(frame);
  }
  window.addEventListener('beforeunload', event => {
    if ([...looks.values()].some(item => !item.completed && (item.strokes.length || item.decorations.length))) event.preventDefault();
  });
  return { open: selectionView };
}
