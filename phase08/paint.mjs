import { decorations, decorationDetails, stampFinish } from './fantasy.mjs?v=08b3';
import { faces, palettes } from './geometry.mjs?v=08b2';
import { createShadowFinish, drawGloss, makeupBuffer } from './finish.mjs?v=08b3';

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

function dot(context, x, y, radius, color, sheer) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color + (sheer ? '22' : '40'));
  gradient.addColorStop(.55, color + (sheer ? '13' : '26'));
  gradient.addColorStop(1, color + '00');
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function paintStroke(context, client, stroke) {
  const { category, color, points } = stroke;
  const paths = regions(client, category);
  for (const path of paths) {
    context.save();
    context.clip(path);
    for (const [x, y] of points) {
      dot(context, x, y, palettes[category].radius, color ?? '#ffffff', category === 'shadow');
      stampFinish(context, stroke, x, y);
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
  const shape = new Path2D(decorations[item.symbol]);
  context.fill(shape);
  context.stroke(shape);
  const detail = decorationDetails[item.symbol];
  if (detail) {
    context.strokeStyle = '#62417a99';
    context.stroke(new Path2D(detail));
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
  const light = makeupBuffer();
  const shadowFinish = createShadowFinish(regions);
  let shadowImage = null;
  let closedEyes = false;
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
  function append(client, stroke) {
    paintStroke(layers.get(layerKey(stroke)).getContext('2d'), client, stroke);
    if (stroke.category === 'shadow') shadowImage = null;
  }
  function rebuild(look, closed = false) {
    closedEyes = closed;
    shadowImage = null;
    for (const canvas of layers.values()) canvas.getContext('2d').clearRect(0, 0, 512, 640);
    for (const stroke of look.strokes) append(look.client, stroke);
  }
  function draw(look, preview, pulse = 0, reveal = false, includeDecorations = true) {
    context.clearRect(0, 0, 512, 640);
    for (const [key, layer] of layers) {
      let visible = layer;
      if (key === 'shadow') {
        shadowImage ??= shadowFinish(look.client, layer, closedEyes);
        visible = shadowImage;
      }
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
      context.globalAlpha = { shadow: .82, blush: .65, lips: .64, gloss: .04 }[key];
      context.drawImage(visible, 0, 0);
      context.restore();
    }
    // The gloss highlight is clipped to pigment actually applied by the player.
    if (look.strokes.some(stroke => layerKey(stroke) === 'gloss')) {
      drawGloss(light, faces[look.client].gloss, layers.get('gloss'), pulse);
      context.drawImage(light.canvas, 0, 0);
    }
    if (includeDecorations) for (const decoration of look.decorations) drawDecoration(context, decoration);
    if (reveal && pulse > 0) {
      // Source-atop keeps the sweep and glints inside the visible pigment and decals.
      context.save();
      context.globalCompositeOperation = 'source-atop';
      for (const [index, stroke] of look.strokes.entries()) {
        const [x, y] = stroke.points[Math.floor(stroke.points.length / 2)];
        const radius = stroke.finish === 'Sparkle' ? 5 : 12;
        const fade = context.createRadialGradient(x, y, 0, x, y, radius);
        fade.addColorStop(0, '#fff9e8');
        fade.addColorStop(1, '#fff0');
        context.globalAlpha = pulse * (stroke.finish === 'Soft' ? .28 : .68);
        context.fillStyle = fade;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        if (index >= 23) break;
      }
      for (const { x, y } of look.decorations) {
        context.globalAlpha = pulse * .58;
        context.fillStyle = '#fff9ed';
        context.fill(new Path2D(`M${x} ${y-5}l1 4 4 1-4 1-1 4-1-4-4-1 4-1z`));
      }
      context.restore();
    }
    if (preview) drawDecoration(context, preview, true);
  }
  return { append, rebuild, draw };
}
