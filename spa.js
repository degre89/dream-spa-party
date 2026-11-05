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

const show = id => document.querySelectorAll('.screen').forEach(screen => {
  screen.classList.toggle('on', screen.id === id);
});

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
  rinsing = false;
  remaining = 0;
  coverage.fill(0);
  overlay.data.fill(0);
  $('#step').textContent = '1 / 2 · Maschera';
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
      overlay.data[offset] = 104;
      overlay.data[offset + 1] = 211 + Math.round(12 * Math.sin(row / 29));
      overlay.data[offset + 2] = 100;
      overlay.data[offset + 3] = rinsing ? 0 : Math.round(alpha * 0.83);
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
  if (changed && performance.now() - lastEffect > 75) {
    lastEffect = performance.now();
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
$('#play').onclick = start;
$('#again').onclick = start;
$('#back').onclick = $('#goHome').onclick = () => show('home');
$('#next').onclick = () => {
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
  rinsing = true;
  rinseArea = remaining;
  $('#character').classList.add('rinsing');
  $('#step').textContent = '2 / 2 · Risciacquo';
  $('#hint').textContent = 'Passa la spugnetta sulla maschera!';
  $('#next').textContent = 'Finisci ✨';
  render();
};
