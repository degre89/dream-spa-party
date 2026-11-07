import { clients } from './clients.mjs?v=07a';
import { drawEyePatches, drawEyeShadow } from '../phase05/eye-patches.mjs?v=07a';

// Paint the state model's cells, then clip every layer with the client's stencil.
const materials = {
  strawberry: ['#ed619a', 0.85],
  avocado: ['#8bc872', 0.87],
  blueberry: ['#a580df', 0.86],
  honey: ['#e8a33d', 0.83]
};

export async function loadStencil(path, width, height) {
  const image = new Image();
  image.src = path;
  await image.decode();
  const stencil = document.createElement('canvas');
  stencil.width = width;
  stencil.height = height;
  const context = stencil.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  const alpha = context.getImageData(0, 0, width, height).data;
  const opacityAt = (x, y) => alpha[(y * width + x) * 4 + 3];
  const skinAt = (x, y) => x >= 0 && x < width && y >= 0 && y < height &&
    opacityAt(Math.floor(x), Math.floor(y)) >= 128;
  const samples = new Map();
  return {
    stencil, skinAt,
    sampleCell(x, y) {
      const key = y * width + x;
      if (!samples.has(key)) {
        let area = 0;
        let nearest = Infinity;
        let anchor;
        for (let row = y - 4; row < Math.min(y + 4, height); row++) {
          for (let col = x - 4; col < Math.min(x + 4, width); col++) {
            const opacity = opacityAt(col, row);
            area += opacity;
            const distance = (col - x) ** 2 + (row - y) ** 2;
            if (opacity >= 128 && distance < nearest) {
              nearest = distance;
              anchor = { x: col, y: row };
            }
          }
        }
        samples.set(key, anchor && { ...anchor, area: area / (64 * 255) });
      }
      return samples.get(key);
    }
  };
}

function halo(context, x, y, radius, color, edge) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, edge);
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function conditionMark(context, { kind, x, y, radius, initial, intensity }, palette) {
  const remaining = intensity / initial;
  context.globalAlpha = intensity;
  if (kind === 'pores') {
    context.fillStyle = palette.pores;
    for (const [dx, dy, size] of [[-.48, -.21, 2.5], [-.1, -.42, 2.6], [.35, -.26, 2.35],
      [.51, .16, 2.4], [-.25, .18, 2.55], [.13, .07, 2.25], [.18, .47, 2.35], [-.42, .43, 2]]) {
      context.beginPath();
      context.arc(x + dx * radius, y + dy * radius, size * (0.5 + remaining * 0.5), 0, Math.PI * 2);
      context.fill();
    }
  } else if (kind === 'redness') {
    const [r, g, b] = palette.redness;
    context.save();
    context.translate(x, y);
    context.scale(1, 0.78);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, `rgba(${r},${g},${b},.78)`);
    gradient.addColorStop(.48, `rgba(${r},${g},${b},.59)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  } else {
    const size = radius * (0.45 + remaining * 0.55);
    halo(context, x, y, size, '#b92e5ded', '#e8617300');
    halo(context, x - size * 0.18, y - size * 0.24, size * 0.45, '#ffd3b8', '#ffd3b800');
  }
  context.globalAlpha = 1;
}

export function createSkinView(canvas) {
  const { width, height } = canvas;
  const grid = document.createElement('canvas');
  grid.width = Math.ceil(width / 8);
  grid.height = Math.ceil(height / 8);
  const small = grid.getContext('2d');
  const view = canvas.getContext('2d');

  return (session, stencil, before = false, client = "sofia", creamTrace = [], preparation = null, patches = null) => {
    view.clearRect(0, 0, width, height);
    if (!before) {
      small.clearRect(0, 0, grid.width, grid.height);
      const foam = new Path2D();
      for (const { x, y, product, clean, glow, hydration, area, prepared, creamUntil = 0 } of session.cells) {
        if (product === 'foam') {
          // Overlap neighboring treated cells, then composite once to keep the
          // opacity uniform. The same cells drive progress and rinsing.
          if (area < 1) foam.rect(Math.floor(x / 8) * 8, Math.floor(y / 8) * 8, 8, 8);
          foam.moveTo(x + 8, y);
          foam.arc(x, y, 8, 0, Math.PI * 2);
          continue;
        }
        const material = materials[product];
        const light = Math.max(glow, hydration * 0.7, clean * 0.4, preparation !== null && prepared ? .62 : 0);
        const creamAlpha = Math.max(0, Math.min(1, (creamUntil - performance.now()) / 1500));
        if (!material && !light) continue;
        small.fillStyle = creamAlpha > 0 ? '#fff8e8' : material?.[0] ?? '#fff0d8';
        small.globalAlpha = creamAlpha > 0 ? creamAlpha * .68 : material?.[1] ?? light * 0.19;
        small.fillRect(Math.floor(x / 8), Math.floor(y / 8), 1, 1);
      }
      view.imageSmoothingEnabled = true;
      view.drawImage(grid, 0, 0, width, height);
      view.fillStyle = '#fff6fc';
      view.globalAlpha = .78;
      view.fill(foam);
      view.globalAlpha = 1;
    }
    for (const condition of session.conditions) {
      const intensity = before ? condition.initial : condition.intensity * (preparation === null ? 1 : .09 + .91 * preparation);
      if (intensity <= 0) continue;
      if (condition.kind === 'darkCircles') drawEyeShadow(view, { ...condition, intensity }, client);
      else conditionMark(view, { ...condition, intensity }, clients[client].palette);
    }
    if (!before) {
      for (const { x, y, product } of session.cells) {
        if (!product) continue;
        const fleck = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 127;
        if (product === 'foam' && fleck < 42) {
          halo(view, x, y, 5, '#fff', '#fff0');
        } else if (product !== 'foam' && fleck < 18) {
          const shade = product === 'strawberry' ? '#aa29595c' : '#fffad980';
          halo(view, x, y, 2.6, shade, '#fff0');
        }
      }
    }
    for (const { x, y, alpha } of creamTrace) {
      view.globalAlpha = alpha;
      halo(view, x, y, 25, '#fff8e6', '#fff8e600');
    }
    if (patches) drawEyePatches(view, session.conditions, patches.stage, patches.showTargets);
    view.globalAlpha = 1;
    view.globalCompositeOperation = 'destination-in';
    view.drawImage(stencil, 0, 0);
    view.globalCompositeOperation = 'source-over';
  };
}
