// These buffers stay in portrait units and never change the stored gestures.
export function makeupBuffer() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  return canvas.getContext('2d');
}

function columns(context, path) {
  const result = new Map();
  for (let x = 139; x < 374; x++) {
    let top, bottom;
    for (let y = 232; y < 335; y++) {
      if (!context.isPointInPath(path, x + .5, y + .5)) continue;
      top ??= y;
      bottom = y + 1;
    }
    if (top !== undefined) result.set(x, [top, bottom]);
  }
  return result;
}

const smooth = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function softMask(eyes, sources = eyes, lashFade = 1.9) {
  const context = makeupBuffer();
  const raster = context.createImageData(512, 640);
  for (const [index, eye] of eyes.entries()) {
    const columns = [...eye.keys()].filter(x => sources[index].has(x));
    const left = columns[0];
    const right = columns.at(-1);
    for (const [x, [top, bottom]] of eye) {
      const corner = smooth((Math.min(x - left, right - x) + .5) / 10);
      for (let y = top; y < bottom; y++) {
        const depth = (y + .5 - top) / (bottom - top);
        // The strongest pigment sits near the lashes, with a broad fade to the fold.
        const strength = smooth(depth / .71) * smooth((bottom - y - .5) / lashFade);
        raster.data[(y * 512 + x) * 4 + 3] = Math.round(255 * corner * strength);
      }
    }
  }
  context.putImageData(raster, 0, 0);
  return context.canvas;
}

export function createShadowFinish(regions) {
  const cache = new Map();
  const finish = makeupBuffer();
  return (client, layer, closed) => {
    if (!cache.has(client)) {
      const open = regions(client, 'shadow').map(path => columns(finish, path));
      const shut = regions(client, 'shadow', true).map(path => columns(finish, path));
      cache.set(client, { open, shut, openMask: softMask(open), shutMask: softMask(shut, open, 3.5) });
    }
    const { open, shut, openMask, shutMask } = cache.get(client);
    finish.globalCompositeOperation = 'source-over';
    finish.clearRect(0, 0, 512, 640);
    if (closed) {
      // Stretch each painted column between the matching fold and lash line.
      // The original pigment, colour split and partial coverage are preserved.
      for (const [index, eye] of shut.entries()) {
        for (const [x, [top, bottom]] of eye) {
          const source = open[index].get(x);
          if (source) finish.drawImage(layer, x, source[0], 1, source[1] - source[0],
            x, top, 1, bottom - top);
        }
      }
    } else finish.drawImage(layer, 0, 0);
    finish.globalCompositeOperation = 'destination-in';
    finish.drawImage(closed ? shutMask : openMask, 0, 0);
    return finish.canvas;
  };
}

function reflection(context, x, y, rx, ry, opacity) {
  context.save();
  context.translate(x, y);
  context.scale(rx, ry);
  const fade = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  fade.addColorStop(0, 'rgba(255,248,255,' + opacity + ')');
  fade.addColorStop(.45, 'rgba(255,245,255,' + opacity * .62 + ')');
  fade.addColorStop(1, '#fff0');
  context.fillStyle = fade;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

export function drawGloss(context, [center, lower, upper], coverage, pulse) {
  context.globalCompositeOperation = 'source-over';
  context.clearRect(0, 0, 512, 640);
  context.save();
  context.translate(center - 256, 0);
  reflection(context, 254, lower, 22, 3, .65);
  reflection(context, 246, upper, 14, 2.1, .30);
  reflection(context, 270, lower - 2, 7, 2.2, .34);
  for (const [x, y, size] of [[240, lower - 2, 1.7], [249, lower, 1.3],
    [259, lower + 1, 1.8], [271, lower - 3, 1.6], [265, upper, 1.4], [279, upper + 3, 1.3]]) {
    reflection(context, x, y, size, size, .90);
  }
  context.save();
  context.translate(259, lower + 1);
  context.globalAlpha = .50 + pulse * .45;
  context.fillStyle = '#fff5ff';
  context.fill(new Path2D('M0 -3 .65 -.65 3 0 .65 .65 0 3 -.65 .65 -3 0 -.65 -.65Z'));
  context.restore();
  context.restore();
  // All specular effects are confined to coverage from the actual applicator.
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(coverage, 0, 0);
}
