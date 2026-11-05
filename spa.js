const $ = selector => document.querySelector(selector);
const canvas = $('#mask');
const context = canvas.getContext('2d');
const { width, height } = canvas;
const overlay = context.createImageData(width, height);
const coverage = new Uint8Array(width * height);
const stencil = new Image();
let eligible, area, remaining, rinseArea;
let rinsing = false;
let pointer = null;
let last = null;
let frame = 0;
let lastEffect = 0;
const masks = {
  "strawberry": {
    "label": "Fragola",
    "dark": "#b71956",
    "tint": "#ff87b8",
    "rgb": [
      232,
      88,
      146
    ],
    "line": "Mmm, fragola!",
    "pattern": "berry"
  },
  "avocado": {
    "label": "Avocado",
    "dark": "#357047",
    "tint": "#93c873",
    "rgb": [
      105,
      193,
      111
    ],
    "line": "Che freschezza!",
    "pattern": "soft"
  },
  "blueberry": {
    "label": "Mirtillo",
    "dark": "#6748a2",
    "tint": "#a687ec",
    "rgb": [
      158,
      113,
      219
    ],
    "line": "Che profumino!",
    "pattern": "glow"
  },
  "honey": {
    "label": "Miele",
    "dark": "#a36017",
    "tint": "#ffbd4f",
    "rgb": [
      219,
      148,
      55
    ],
    "line": "Dolcissimo!",
    "pattern": "silk"
  }
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const jarButtons = [...document.querySelectorAll('.jar')];
let chosen;
let portrait;
let blinkTimer, openTimer, reactionTimer, bubbleTimer;
let nextReaction = 0;

function scheduleBlink() {
  if (reducedMotion.matches || document.hidden) return;
  blinkTimer = setTimeout(() => {
    if (!portrait.classList.contains('relax')) {
      portrait.classList.add('blink');
      openTimer = setTimeout(() => portrait.classList.remove('blink'), 135);
    }
    scheduleBlink();
  }, 2800 + Math.random() * 2900);
}

function switchPortrait(screen) {
  clearTimeout(blinkTimer);
  clearTimeout(openTimer);
  clearTimeout(reactionTimer);
  clearTimeout(bubbleTimer);
  portrait?.classList.remove('blink', 'relax', 'smile');
  $('#bubble').hidden = true;
  portrait = screen.querySelector('.portrait');
  nextReaction = 0;
  if (screen.id === 'done') portrait.classList.add('smile');
  scheduleBlink();
}

document.addEventListener('visibilitychange', () => {
  clearTimeout(blinkTimer);
  clearTimeout(openTimer);
  portrait?.classList.remove('blink');
  scheduleBlink();
});
reducedMotion.addEventListener('change', () => {
  clearTimeout(blinkTimer);
  clearTimeout(openTimer);
  portrait?.classList.remove('blink');
  scheduleBlink();
});

function react(expression, duration) {
  clearTimeout(reactionTimer);
  portrait.classList.remove('relax', 'smile');
  portrait.classList.add(expression);
  reactionTimer = setTimeout(() => portrait.classList.remove(expression), duration);
}

function chooseMask() {
  chosen = undefined;
  $('#begin').disabled = true;
  for (const jar of jarButtons) {
    jar.setAttribute('aria-pressed', 'false');
    jar.classList.remove('pop');
  }
  show('choose');
}

for (const jar of jarButtons) {
  jar.addEventListener('click', () => {
    chosen = masks[jar.dataset.mask];
    for (const button of jarButtons) {
      button.setAttribute('aria-pressed', String(button === jar));
      button.classList.remove('pop');
    }
    jar.classList.add('pop');
    $('#begin').disabled = false;
    react('smile', 1350);
    const bubble = $('#bubble');
    bubble.textContent = chosen.line;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 1750);
  });
}

function materialTexture(col, row) {
  const fleck = ((Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0) % 127;
  switch (chosen.pattern) {
    case 'berry': return fleck < 4 ? 24 : 7 * Math.sin((row + col * 0.3) / 18);
    case 'soft': return 7 * Math.sin(row / 28) + 5 * Math.cos(col / 33);
    case 'glow': return fleck < 6 ? 22 : 8 * Math.cos(row / 24 + col / 31);
    case 'silk': return 30 * Math.max(0, Math.cos((row + col * 0.7) / 19)) ** 6 - 4;
  }
}

function show(id) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.toggle('on', screen.id === id);
  });
  switchPortrait(document.getElementById(id));
}

stencil.onload = () => {
  context.drawImage(stencil, 0, 0, width, height);
  eligible = context.getImageData(0, 0, width, height).data;
  area = 0;
  for (let i = 3; i < eligible.length; i += 4) area += eligible[i];
  context.clearRect(0, 0, width, height);
  $('#play').disabled = !area;
};
stencil.onerror = () => { $('#status').textContent = 'Caricamento non riuscito. Ricarica la pagina.'; };
stencil.src = 'assets/skin.svg';

function render() {
  frame = 0;
  context.putImageData(overlay, 0, 0);
  const fraction = rinsing ? (rinseArea - remaining) / rinseArea : remaining / area;
  const complete = rinsing ? remaining === 0 : fraction >= 0.96;
  const percent = remaining === (rinsing ? 0 : area) ? 100 : Math.floor(fraction * 100);
  $('#fill').style.width = percent + '%';
  $('#meter').setAttribute('aria-valuenow', percent);
  $('#percent').textContent = percent + '%';
  $('#next').disabled = !complete;
}

function start() {
  if (!chosen || !area) return;
  cancelAnimationFrame(frame);
  const spa = $('#spa');
  spa.style.setProperty('--mask-dark', chosen.dark);
  spa.style.setProperty('--mask-light', chosen.tint);
  rinsing = false;
  remaining = 0;
  coverage.fill(0);
  overlay.data.fill(0);
  $('#step').textContent = '1 / 2 · ' + chosen.label;
  $('#hint').textContent = 'Stendi la maschera sulla pelle!';
  $('#next').textContent = 'Risciacqua';
  $('#character').classList.remove('rinsing');
  show('spa');
  render();
}

function dab(x, y, radius) {
  let changed = false;
  for (let row = Math.max(0, Math.ceil(y - radius)); row <= Math.min(height - 1, y + radius); row++) {
    for (let col = Math.max(0, Math.ceil(x - radius)); col <= Math.min(width - 1, x + radius); col++) {
      if ((col - x) ** 2 + (row - y) ** 2 > radius ** 2) continue;
      const index = row * width + col;
      const offset = index * 4;
      const alpha = eligible[offset + 3];
      if (!alpha || coverage[index] === Number(!rinsing)) continue;
      coverage[index] = Number(!rinsing);
      remaining += rinsing ? -alpha : alpha;
      if (rinsing) {
        overlay.data[offset + 3] = 0;
      } else {
        const shade = materialTexture(col, row);
        overlay.data[offset] = chosen.rgb[0] + shade;
        overlay.data[offset + 1] = chosen.rgb[1] + shade;
        overlay.data[offset + 2] = chosen.rgb[2] + shade;
        overlay.data[offset + 3] = Math.round(alpha * 0.83);
      }
      changed = true;
    }
  }
  return changed;
}

function move(event) {
  if (event.pointerId !== pointer) return;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * width / rect.width;
  const y = (event.clientY - rect.top) * height / rect.height;
  const tool = $('#tool');
  tool.style.left = x / width * 100 + '%';
  tool.style.top = y / height * 100 + '%';
  tool.classList.add('held');
  const from = last ?? { x, y };
  const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / 9));
  let changed = false;
  for (let i = 1; i <= steps; i++) {
    changed = dab(from.x + (x - from.x) * i / steps, from.y + (y - from.y) * i / steps, rinsing ? 34 : 25) || changed;
  }
  last = { x, y };
  if (changed && !frame) frame = requestAnimationFrame(render);
  const now = performance.now();
  if (changed && now >= nextReaction) {
    react(rinsing ? 'smile' : 'relax', rinsing ? 850 : 670);
    nextReaction = now + (rinsing ? 2300 : 3500);
  }
  if (changed && now - lastEffect > 75) {
    lastEffect = now;
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.textContent = rinsing ? '○ ✦ °' : '✧';
    particle.style.left = tool.style.left;
    particle.style.top = tool.style.top;
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    $('#character').append(particle);
  }
}

function release(event) {
  if (event.pointerId !== pointer) return;
  pointer = last = null;
  $('#tool').classList.remove('held');
}

canvas.addEventListener('pointerdown', event => {
  if (pointer !== null || event.button !== 0) return;
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  move(event);
});
canvas.addEventListener('pointermove', move);
canvas.addEventListener('pointerup', event => { move(event); release(event); });
for (const name of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(name, release);

let stars = 0;
try { stars = Number(localStorage.getItem('dsp-stars')) || 0; } catch {}
$('#stars').textContent = stars;
$('#play').onclick = $('#again').onclick = chooseMask;
$('#begin').onclick = start;
$('#chooseHome').onclick = $('#back').onclick = $('#goHome').onclick = () => {
  if (pointer !== null) {
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    release({ pointerId: pointer });
  }
  show('home');
};
switchPortrait($('#home'));
const nextButton = $('#next');
nextButton.onclick = advance;
let touchPress = null;

// A drag on the canvas can suppress Chromium's synthesized click on the next tap.
nextButton.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || !event.isPrimary || nextButton.disabled) return;
  touchPress = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
nextButton.addEventListener('pointercancel', event => {
  if (event.pointerId === touchPress?.id) touchPress = null;
});
nextButton.addEventListener('pointerup', event => {
  if (event.pointerId !== touchPress?.id) return;
  const distance = Math.hypot(event.clientX - touchPress.x, event.clientY - touchPress.y);
  touchPress = null;
  if (distance > 12 || nextButton.disabled) return;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (nextButton.contains(target)) advance();
});

function advance() {
  if (!$('#spa').classList.contains('on')) return;
  if (rinsing) {
    if (remaining !== 0) return;
    stars += 3;
    try { localStorage.setItem('dsp-stars', stars); } catch {}
    $('#stars').textContent = stars;
    show('done');
    return;
  }
  if (remaining / area < 0.96) return;
  if (pointer !== null) {
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    release({ pointerId: pointer });
  }
  clearTimeout(reactionTimer);
  portrait.classList.remove('relax');
  nextReaction = 0;
  rinsing = true;
  rinseArea = remaining;
  $('#character').classList.add('rinsing');
  $('#step').textContent = '2 / 2 · Risciacquo';
  $('#hint').textContent = 'Passa la spugnetta sulla maschera!';
  $('#next').textContent = 'Finisci ✨';
  render();
}
