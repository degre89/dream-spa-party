import { clients } from '../phase03/clients.mjs?v=06a';

export function eyeShadows(client) {
  return clients[client].patchAnchors.map(([x, y], index) => ({
    kind: 'darkCircles', x, y, side: index ? -1 : 1, initial: 1, intensity: 1, patch: 'empty'
  }));
}

export function patchStage(journey, now = performance.now()) {
  if (!journey.patchesReadyAt) return 'apply';
  return now < journey.patchesReadyAt ? 'rest' : 'remove';
}

export function usePatch(journey, point, now = performance.now()) {
  const { session } = journey;
  const mark = session.conditions.find(eye =>
    ((eye.x - point.x) / 39) ** 2 + ((eye.y - point.y) / 23) ** 2 <= 1);
  if (!mark || !session.skinAt(point.x, point.y)) return null;

  const stage = patchStage(journey, now);
  if (stage === 'apply' && mark.patch === 'empty') {
    mark.patch = 'on';
    if (session.conditions.every(eye => eye.patch === 'on')) {
      journey.patchesReadyAt = now + 1400;
      return 'patches-rest';
    }
    return 'patch-on';
  }
  if (stage !== 'remove' || mark.patch !== 'on') return null;

  mark.patch = 'off';
  mark.intensity *= .14;
  for (const cell of session.cells) {
    if (Math.hypot(mark.x - cell.x, mark.y - cell.y) < 32) cell.glow = Math.max(cell.glow, .45);
  }
  if (session.conditions.some(eye => eye.patch === 'on')) return 'patch-off';
  journey.pending = true;
  return 'complete';
}

export function patchProgress(session) {
  return session.conditions.reduce((total, eye) => total + (eye.patch === 'on' ? 1 : eye.patch === 'off' ? 2 : 0), 0) / 4;
}

let crescent;
const useCrescent = () => crescent ??= new Path2D('M-30-4 C-25-10-16-9-5-4 C6 1 19 0 29-6 C33-8 35-4 32 1 C25 12 9 16-7 13 C-23 10-34 3-30-4Z');

export function drawEyeShadow(view, { x, y, side, intensity }, client) {
  view.save();
  view.translate(x, y - 5);
  view.rotate(.11 * side);
  view.scale(side, .27);
  const tone = clients[client].shadowTone ?? '115,53,112';
  const shade = view.createRadialGradient(0, 0, 2, 0, 0, 35);
  shade.addColorStop(0, `rgba(${tone},.51)`);
  shade.addColorStop(.58, `rgba(${tone},.32)`);
  shade.addColorStop(1, `rgba(${tone},0)`);
  view.globalAlpha = intensity;
  view.fillStyle = shade;
  view.fillRect(-35, -35, 70, 70);
  view.restore();
}

export function drawEyePatches(view, conditions, stage, showTargets) {
  for (const { x, y, side, patch } of conditions) {
    if (patch === 'off' || (patch === 'empty' && !showTargets)) continue;
    view.save();
    view.translate(x, y);
    view.scale(side, 1);
    const shape = useCrescent();
    if (patch === 'empty') {
      view.fillStyle = '#fce0f235';
      view.fill(shape);
      view.strokeStyle = '#fff7fa';
      view.lineWidth = 1.7;
      view.setLineDash([4, 4]);
      view.stroke(shape);
    } else {
      const jelly = view.createLinearGradient(0, -9, 0, 15);
      jelly.addColorStop(0, '#ffedf8');
      jelly.addColorStop(.45, '#f4a7d5');
      jelly.addColorStop(1, '#ad66bb');
      view.shadowColor = '#813f6f88';
      view.shadowOffsetY = 2;
      view.shadowBlur = 3;
      view.fillStyle = jelly;
      view.fill(shape);
      view.shadowColor = 'transparent';
      view.strokeStyle = '#ffd9ee';
      view.lineWidth = 1.2;
      view.stroke(shape);
      view.strokeStyle = '#fff8fc';
      view.lineWidth = 1.6;
      view.lineCap = 'round';
      view.beginPath();
      view.moveTo(-22, -2);
      view.quadraticCurveTo(-18, -5, -9, 0);
      view.stroke();
      if (stage === 'remove') {
        view.fillStyle = '#fff6d6';
        view.fillText('✦', 9, 8);
      }
    }
    view.restore();
  }
}
