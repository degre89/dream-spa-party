// Shared vector paths for the palette previews and the Canvas decorations.
export const decorations = {
  '★': 'M0 -9 2.6 -3 9 -2.8 4 1.6 5.5 8 0 4.5 -5.5 8 -4 1.6 -9 -2.8 -2.6 -3Z',
  '♥': 'M0 7 C-17 -3 -6 -14 0 -5 C6 -14 17 -3 0 7Z',
  '◆': 'M0 -8 7 0 0 8 -7 0Z',
  butterfly: 'M0 -1 C-15 -18 -14 5 -3 2 C-13 11 -1 13 0 3 C1 13 13 11 3 2 C14 5 15 -18 0 -1Z',
  moon: 'M4 -8A8 8 0 1 0 8 4Q-4 7 4 -8Z',
  flower: 'M0 -4C-6 -13 -11 -4 -5 -1C-14 3 -5 10 -2 5C1 13 10 8 5 3C14 0 8 -8 3 -4C3 -11 -3 -11 0 -4Z',
  gem: 'M-4 -8H4L8 -3L0 8L-8 -3Z',
  petal: 'M-6 7C-10 -2 -2 -8 8 -8C8 2 1 10 -6 7Z',
};

export const decorationDetails = {
  butterfly: 'M0 -6V6',
  flower: 'M-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  gem: 'M-8 -3H8M-4 -8L-2 -3 0 8 2 -3 4 -8',
  petal: 'M-4 5Q-2 0 4 -4',
};

export const finishes = ['Soft', 'Pearl', 'Sparkle'];

const star = new Path2D('M0 -3.2 .9 -.9 3.2 0 .9 .9 0 3.2 -.9 .9 -3.2 0 -.9 -.9Z');
const textures = {
  shadow: { satin: .42, rx: 12, ry: 4.8, grid: 7, speck: .9 },
  blush: { satin: .24, rx: 19, ry: 8.2, grid: 11, speck: 1.14 },
  lips: { satin: .35, rx: 14, ry: 3.6, grid: 8, speck: .89 },
};
const heart = new Path2D(decorations['♥']);

// Every stamp depends on its stored position, never on frame timing or the viewport.
export function stampFinish(context, { category, color, finish, hearts }, x, y) {
  if (color === null) return;
  const cheek = category === 'blush';
  const texture = textures[category];
  if (finish === 'Pearl' || finish === 'Sparkle') {
    const intensity = texture.satin * (finish === 'Pearl' ? 1 : .27);
    context.save();
    context.translate(x, y - (cheek ? 2 : 0));
    context.scale(texture.rx, texture.ry);
    const satin = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    satin.addColorStop(0, 'rgba(255,245,250,' + intensity + ')');
    satin.addColorStop(.5, 'rgba(255,249,255,' + intensity * .58 + ')');
    satin.addColorStop(1, '#fff0');
    context.fillStyle = satin;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }
  if (finish === 'Sparkle') {
    const column = Math.round(x / texture.grid);
    const row = Math.round(y / texture.grid);
    const glintX = column * texture.grid + (column % 3 - 1) * 1.4;
    const glintY = row * texture.grid + (column % 4 - 1.5) * 1.1;
    const bright = (column + row) % 3 === 0;
    context.save();
    context.translate(glintX, glintY);
    context.scale(texture.speck, texture.speck);
    context.fillStyle = bright ? '#fff9ed' : '#fff5ffd9';
    if (bright) context.fill(star);
    else {
      context.beginPath();
      context.arc(0, 0, 1.45, 0, 2 * Math.PI);
      context.fill();
    }
    context.restore();
  }
  if (cheek && hearts) {
    const column = Math.round(x / 15);
    const row = Math.round(y / 15);
    context.save();
    context.translate(column * 15, row * 15 + (column % 2) * 3);
    context.scale(.41, .41);
    context.fillStyle = color;
    context.strokeStyle = '#fff4f9';
    context.lineWidth = 2.7;
    context.fill(heart);
    context.stroke(heart);
    context.restore();
  }
}
