import { faces, palettes } from './geometry.mjs';

// One versioned session record per client. Coordinates remain in portrait units.
export function createLook(client) {
  return { version: 1, client, strokes: [], decorations: [], completed: false };
}

const ellipse = ([x, y, rx, ry]) => {
  const path = new Path2D();
  path.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  return path;
};
const regionCache = new Map();
export function regions(client, category, closed = false) {
  const key = client + '/' + category + '/' + closed;
  if (!regionCache.has(key)) {
    const face = faces[client];
    const definition = face[category === 'shadow' && closed ? 'closed' : category];
    regionCache.set(key, definition.map(entry => typeof entry === 'string' ? new Path2D(entry) : ellipse(entry)));
  }
  return regionCache.get(key);
}

export function allowed(context, client, category, x, y, closed = false) {
  return regions(client, category, closed).some(path => context.isPointInPath(path, x, y));
}

function dot(context, x, y, radius, color) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(.55, color + '26');
  gradient.addColorStop(1, color + '00');
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function paintStroke(context, client, stroke, closed = false) {
  const { category, color, points } = stroke;
  const paths = regions(client, category, closed);
  for (const path of paths) {
    context.save();
    context.clip(path);
    for (const [x, y] of points) {
      dot(context, x, y, palettes[category].radius, color ?? '#ffffff');
    }
    context.restore();
  }
}

export function drawDecoration(context, item, preview = false) {
  context.save();
  context.globalAlpha = preview ? .55 : 1;
  context.translate(item.x, item.y);
  context.shadowColor = '#ffffff';
  context.shadowBlur = 2;
  context.fillStyle = item.color;
  context.strokeStyle = '#fff5db';
  context.lineWidth = .8;
  const shapes = {
    '★': 'M0 -9 2.6 -3 9 -2.8 4 1.6 5.5 8 0 4.5 -5.5 8 -4 1.6 -9 -2.8 -2.6 -3Z',
    '♥': 'M0 7 C-17 -3 -6 -14 0 -5 C6 -14 17 -3 0 7Z',
    '◆': 'M0 -8 7 0 0 8 -7 0Z',
    'butterfly': 'M0 -1 C-15 -18 -14 5 -3 2 C-13 11 -1 13 0 3 C1 13 13 11 3 2 C14 5 15 -18 0 -1Z',
  };
  const shape = new Path2D(shapes[item.symbol]);
  context.fill(shape);
  context.stroke(shape);
  if (item.symbol === 'butterfly') {
    context.strokeStyle = '#7755a2';
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(0, 6);
    context.stroke();
  }
  context.restore();
}

// Layers cap pigment opacity, retaining the portrait's natural lighting.
export function createPaintView(context) {
  const layers = new Map();
  for (const key of ['shadow', 'blush', 'lips', 'gloss']) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 640;
    layers.set(key, canvas);
  }
  const blushFeather = document.createElement('canvas');
  blushFeather.width = 512;
  blushFeather.height = 640;
  const featherContext = blushFeather.getContext('2d');
  const softened = document.createElement('canvas');
  softened.width = 512;
  softened.height = 640;
  const shine = document.createElement('canvas');
  shine.width = 512;
  shine.height = 640;
  const light = shine.getContext('2d');
  let featherClient;
  function feather(client) {
    if (featherClient === client) return;
    featherClient = client;
    featherContext.clearRect(0, 0, 512, 640);
    for (const [x, y, rx, ry] of faces[client].blush) {
      featherContext.save();
      featherContext.translate(x, y);
      featherContext.scale(rx, ry);
      const fade = featherContext.createRadialGradient(0, 0, 0, 0, 0, 1);
      fade.addColorStop(0, '#fff');
      fade.addColorStop(.45, '#fffe');
      fade.addColorStop(1, '#fff0');
      featherContext.fillStyle = fade;
      featherContext.fillRect(-1, -1, 2, 2);
      featherContext.restore();
    }
  }
  const layerKey = stroke => stroke.category === 'lips' && stroke.color === null ? 'gloss' : stroke.category;
  function append(client, stroke, closed = false) {
    paintStroke(layers.get(layerKey(stroke)).getContext('2d'), client, stroke, closed);
  }
  function rebuild(look, closed = false) {
    for (const canvas of layers.values()) canvas.getContext('2d').clearRect(0, 0, 512, 640);
    for (const stroke of look.strokes) append(look.client, stroke, closed);
  }
  function draw(look, preview, time = 0) {
    context.clearRect(0, 0, 512, 640);
    for (const [key, layer] of layers) {
      let visible = layer;
      if (key === 'blush') {
        feather(look.client);
        const soft = softened.getContext('2d');
        soft.clearRect(0, 0, 512, 640);
        soft.globalCompositeOperation = 'source-over';
        soft.drawImage(layer, 0, 0);
        soft.globalCompositeOperation = 'destination-in';
        soft.drawImage(blushFeather, 0, 0);
        visible = softened;
      }
      context.save();
      context.globalAlpha = { shadow: .63, blush: .38, lips: .64, gloss: .23 }[key];
      context.drawImage(visible, 0, 0);
      context.restore();
    }
    // The gloss highlight is clipped to pigment actually applied by the player.
    if (look.strokes.some(stroke => layerKey(stroke) === 'gloss')) {
      light.clearRect(0, 0, 512, 640);
      light.globalCompositeOperation = 'source-over';
      light.fillStyle = '#fff6ff';
      light.globalAlpha = .2 + .12 * Math.sin(time);
      light.beginPath();
      light.ellipse(255, look.client === 'sofia' ? 393 : 392, 14, 1.2, -.05, 0, Math.PI * 2);
      light.fill();
      light.globalCompositeOperation = 'destination-in';
      light.globalAlpha = 1;
      light.drawImage(layers.get('gloss'), 0, 0);
      context.drawImage(shine, 0, 0);
    }
    for (const decoration of look.decorations) drawDecoration(context, decoration);
    if (preview) drawDecoration(context, preview, true);
  }
  return { append, rebuild, draw };
}
