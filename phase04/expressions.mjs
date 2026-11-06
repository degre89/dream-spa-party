// Landmarks use the same 512 × 640 coordinates as the treatment stencil.
// Each tuple is [centerX, centerY, halfWidth, halfHeight].
const landmarks = {
  sofia: { mouth: [256, 382, 50, 18], eyes: [[181, 291, 50, 35], [331, 291, 50, 35]],
    brows: [[183, 230, 45, 12], [330, 230, 45, 12]] },
  emma: { mouth: [256, 396, 54, 19], eyes: [[187, 284, 46, 29], [325, 284, 46, 29]],
    brows: [[184, 240, 43, 12], [325, 240, 43, 12]] },
  maya: { mouth: [256, 412, 56, 23], eyes: [[189, 302, 46, 30], [324, 302, 46, 30]],
    brows: [[186, 250, 45, 14], [325, 250, 45, 14]] }
};

const width = 768;
const height = 960;
const scale = 1.5;
const cache = new Map();

function taper(distance, inner, margin) {
  const t = Math.min(1, Math.max(0, (Math.abs(distance) - inner) / margin));
  return 1 - t * t * (3 - 2 * t);
}

function copySample(source, target, index, x, y) {
  const left = Math.floor(x), top = Math.floor(y);
  const dx = x - left, dy = y - top;
  const start = (top * width + left) * 4;
  for (let channel = 0; channel < 4; channel++) {
    const offset = start + channel;
    const upper = source[offset] * (1 - dx) + source[offset + 4] * dx;
    const lower = source[offset + width * 4] * (1 - dx) + source[offset + (width + 1) * 4] * dx;
    target[index + channel] = upper * (1 - dy) + lower * dy;
  }
}

// Resample the original feature and surrounding skin together, with a smooth
// return to the original pixels at the edges of the affected area.
function warp(source, target, feature, marginX, marginY, offset) {
  const [cx, cy, rx, ry] = feature;
  for (let row = Math.ceil((cy - ry - marginY) * scale); row < (cy + ry + marginY) * scale; row++) {
    for (let col = Math.ceil((cx - rx - marginX) * scale); col < (cx + rx + marginX) * scale; col++) {
      const x = col / scale - cx, y = row / scale - cy;
      const weight = taper(x, rx, marginX) * taper(y, ry, marginY);
      const [dx, dy] = offset(x, y);
      copySample(source, target, (row * width + col) * 4,
        col - dx * weight * scale, row - dy * weight * scale);
    }
  }
}

function drawExpression(context, original, id, happy) {
  const result = context.createImageData(width, height);
  result.data.set(original.data);
  const { mouth, eyes, brows } = landmarks[id];
  warp(original.data, result.data, mouth, 19, 20, (x, y) => {
    const corner = Math.min(1, (x / mouth[2]) ** 2);
    return happy ? [x * .13, 4 - 13 * corner + y * .10] :
      [-x * .10, -9 + 29 * corner - y * .30];
  });
  for (const [index, eye] of eyes.entries()) {
    const inner = index === 0 ? 1 : -1;
    warp(original.data, result.data, eye, 11, 8, (x, y) =>
      happy ? [0, -3 - Math.max(0, y) * .23] : [0, -inner * x * .08 - y * .11]);
  }
  for (const [index, brow] of brows.entries()) {
    const inner = index === 0 ? 1 : -1;
    warp(original.data, result.data, brow, 9, 8, (x) =>
      happy ? [0, -4] : [0, -3 - inner * x * .20]);
  }
  return result;
}

export function drawFace(portrait) {
  const face = portrait.querySelector('.reaction-face');
  if (!face) return;
  const mood = portrait.classList.contains('smile') ? 'happy' :
    portrait.classList.contains('puzzled') ? 'sad' : '';
  face.hidden = true;
  delete portrait.dataset.face;
  const image = portrait.querySelector('.hero');
  if (!mood || !image.complete || !image.naturalWidth) return;
  const id = portrait.dataset.client;
  const key = id + '/' + mood;
  const context = face.getContext('2d');
  if (!cache.has(key)) {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    cache.set(key, drawExpression(context, context.getImageData(0, 0, width, height), id, mood === 'happy'));
  }
  context.putImageData(cache.get(key), 0, 0);
  face.hidden = false;
  portrait.dataset.face = mood;
}
