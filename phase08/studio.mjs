import { clients } from '../phase03/clients.mjs?v=07a';
import { drawExpression } from '../phase04/expressions.mjs?v=08a';
import { faces, palettes } from './geometry.mjs?v=08b2';
import { createLook, allowed, createPaintView } from './paint.mjs?v=08b2';

import { decorations, decorationDetails, finishes } from './fantasy.mjs?v=08b2';

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
  let active = null, stroke = null, previous = null, preview = null;
  let closed = false, result = false, blinkTimer, openTimer, effect;
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
    if (closed && lids) faceContext.drawImage(lids, 0, 0, 768, 960);
  }

  function redraw() {
    if (!look || !image) return;
    if (!result) drawPortrait();
    portrait.dataset.eyes = closed ? 'closed' : 'open';
    paint.rebuild(look, closed);
    compose();
    get('Undo').disabled = !histories.get(client).length;
  }

  function compose() {
    if (result) drawPortrait();
    paint.draw(look, preview, shinePulse);
    if (result) {
      // Warp the finished composite together so lips and pigment keep alignment.
      faceContext.drawImage(surface, 0, 0, 768, 960);
      const original = faceContext.getImageData(0, 0, 768, 960);
      faceContext.putImageData(drawExpression(faceContext, original, client, true), 0, 0);
      context.clearRect(0, 0, 512, 640);
    }
  }

  function cancelBlink() {
    clearTimeout(blinkTimer);
    clearTimeout(openTimer);
    closed = false;
  }
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (reduced.matches || document.hidden || editor.hidden || result ||
        !document.getElementById('makeupStudio').classList.contains('on')) return;
    blinkTimer = setTimeout(() => {
      if (!active) {
        closed = true;
        redraw();
        openTimer = setTimeout(() => { closed = false; redraw(); }, 145);
      }
      scheduleBlink();
    }, 4100);
  }

  function controls() {
    const entry = palettes[category];
    for (const button of get('Categories').children) button.setAttribute('aria-pressed', button.dataset.category === category);
    get('Palette').replaceChildren();
    entry.colors.forEach(([name, color, symbol], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', name);
      button.setAttribute('aria-pressed', index === choice);
      const swatch = document.createElement('span');
      swatch.style.background = color ?? 'linear-gradient(135deg, #fff, #edd8ff, #fff)';
      if (symbol) {
        swatch.innerHTML = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path fill="' + color +
          '" stroke="#fff5db" d="' + decorations[symbol] + '"/><path fill="none" stroke="#62417a99" d="' +
          (decorationDetails[symbol] ?? '') + '"/></svg>';
        swatch.style.background = '#8a62a7';
      } else if (!color) swatch.textContent = '✧';
      button.append(swatch);
      bindAction(button, () => {
        stopGesture();
        choice = index;
        controls();
        get('Palette').children[index].focus({ preventScroll: true });
      });
      get('Palette').append(button);
    });
    get('Hint').textContent = entry.hint;
    updateFinishes();
    announceChoice();
    get('Clear').textContent = 'Pulisci ' + entry.label.toLowerCase();
    cursor.firstElementChild.setAttribute('href', 'phase08/tools.svg#' + category);
  }

  function updateFinishes() {
    get('Finishes').hidden = category === 'jewels' || selected()[1] === null;
    for (const button of get('Finishes').children) button.setAttribute('aria-pressed', button.textContent === finish);
    get('Hearts').hidden = category !== 'blush';
    get('Hearts').setAttribute('aria-pressed', hearts);
  }

  function announceChoice() {
    const detail = category === 'jewels' ? (look?.decorations.length ?? 0) + '/6' :
      selected()[1] === null ? '' : finish + (category === 'blush' && hearts ? ' + microcuoricini' : '');
    get('Choice').textContent = [selected()[0], detail].filter(Boolean).join(' · ');
  }

  for (const name of finishes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    bindAction(button, () => {
      stopGesture();
      finish = name;
      updateFinishes();
      announceChoice();
    });
    get('Finishes').append(button);
  }
  bindAction(get('Hearts'), () => {
    stopGesture();
    hearts = !hearts;
    updateFinishes();
    announceChoice();
  });

  for (const [id, entry] of Object.entries(palettes)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = id;
    button.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><use href="phase08/tools.svg#' + id + '"/></svg>';
    button.append(entry.label);
    bindAction(button, () => {
      stopGesture();
      category = id;
      choice = 0;
      controls();
    });
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
      controls();
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
    if (result || active !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    stopShine();
    cancelBlink();
    redraw();
    active = event.pointerId;
    surface.setPointerCapture(active);
    previous = point(event);
    cursorAt(event);
    if (category === 'jewels') previewAt(previous);
    else apply([previous]);
  });
  surface.addEventListener('pointermove', event => {
    if (result || (active !== null && event.pointerId !== active)) return;
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
    if (full) get('Choice').textContent = 'Hai già 6 decori. Toccane uno per toglierlo.';
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
    if (!document.hidden) scheduleBlink();
  });
  reduced.addEventListener('change', () => { cancelBlink(); stopShine(); effect?.cancel(); redraw(); scheduleBlink(); });

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
  bindAction(get('Finish'), () => {
    stopGesture();
    cancelBlink();
    look.completed = true;
    result = true;
    get('Tools').hidden = true;
    get('Result').hidden = false;
    redraw();
    shimmer([256, 175]);
    if (look.strokes.some(item => item.category === 'lips' && item.color === null)) animateShine();
    get('Result').querySelector('h3').focus({ preventScroll: true });
  });
  bindAction(get('Resume'), () => {
    stopShine();
    result = false;
    get('Tools').hidden = false;
    get('Result').hidden = true;
    redraw();
    scheduleBlink();
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
