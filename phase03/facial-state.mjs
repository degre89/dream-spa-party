export const MASK_TOOLS = Object.freeze(['strawberry', 'avocado', 'blueberry', 'honey']);
export const SPA_TOOLS = Object.freeze([
  'cleanser', 'brush', 'sponge', 'gel', 'serum', ...MASK_TOOLS, 'cream'
]);

const clamp = value => Math.max(0, Math.min(1, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const maskTools = new Set(MASK_TOOLS);

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function validCenter(point, skinAt, radius) {
  for (const dx of [-radius, 0, radius]) {
    for (const dy of [-radius, 0, radius]) {
      if (!skinAt(point.x + dx, point.y + dy)) return false;
    }
  }
  return true;
}

function makeCells(width, height, skinAt) {
  const cells = [];
  const spacing = 8;
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      if (!skinAt(x, y)) continue;
      cells.push({ x, y, clean: 0, glow: 0, hydration: 0, product: null });
    }
  }
  if (!cells.length) throw new Error('Sagoma cutanea vuota');
  return cells;
}

function makeConditions(cells, skinAt, regions, random, conditionKinds) {
  const conditions = [];
  const profiles = conditionKinds ? [
    ['redness', 25, 2 + Math.floor(random() * 2), 14, 8],
    ['spot', 10, 5 + Math.floor(random() * 7), 11, 7],
    ['pores', 15, 2 + Math.floor(random() * 3), 14, 4]
  ] : [
    ['redness', 15, 1 + Number(random() > 0.7), 15, 0],
    ['spot', 7, 1 + Math.floor(random() * 3), 7, 0],
    ['pores', 11, 1 + Number(random() > 0.5), 11, 0]
  ];
  for (const [kind, maxRadius, count, margin, variation] of profiles) {
    if (conditionKinds && !conditionKinds.includes(kind)) continue;
    const candidates = cells.filter(point =>
      regions.some(region => distance(point, region) <= region.radius) &&
      validCenter(point, skinAt, margin)
    );
    for (let index = 0; index < count; index++) {
      const radius = variation ? maxRadius - random() * variation : maxRadius;
      let available = candidates.filter(point =>
        conditions.every(other => distance(point, other) >= radius + other.radius + 5)
      );
      if (!available.length) break;
      // Prefer a patch on each cheek before scattering a third one.
      if (conditionKinds && kind === 'redness' && index < 2) {
        const cheek = regions[index + 1];
        const onCheek = available.filter(point => distance(point, cheek) <= cheek.radius);
        if (onCheek.length) available = onCheek;
      }
      const { x, y } = available[Math.floor(random() * available.length)];
      const initial = conditionKinds ? 0.85 + random() * 0.15 : 0.65 + random() * 0.35;
      conditions.push({ kind, x, y, radius, initial, intensity: initial });
    }
  }
  return conditions;
}

export function createSession({ width, height, skinAt, regions, seed, conditionKinds }) {
  const random = seededRandom(seed);
  const cells = makeCells(width, height, skinAt);
  const conditions = makeConditions(cells, skinAt, regions, random, conditionKinds);
  const dullness = 0.55 + random() * 0.4;
  return {
    cells, conditions, dullness, skinAt,
    treatments: new Set(),
    lastPoint: null,
    lastTool: null,
    completed: false
  };
}

function changeCell(cell, tool, strength) {
  const before = [cell.clean, cell.glow, cell.hydration, cell.product];
  if (tool === 'cleanser' && (!cell.product || cell.product === 'foam')) {
    cell.product = 'foam';
    cell.clean = Math.max(cell.clean, 0.38);
  }
  if (tool === 'brush') cell.clean = clamp(cell.clean + strength * 0.21);
  if (tool === 'sponge') cell.product = null;
  if (maskTools.has(tool) && (!cell.product || cell.product === tool)) {
    cell.product = tool;
    cell.glow = Math.max(cell.glow, 0.46);
  }
  if (tool === 'cream' && !cell.product) {
    cell.hydration = clamp(cell.hydration + strength * 0.18);
    cell.glow = clamp(cell.glow + strength * 0.13);
  }
  const after = [cell.clean, cell.glow, cell.hydration, cell.product];
  return before.some((value, index) => value !== after[index]);
}

const toolsForConditions = { gel: 'spot', serum: 'redness', brush: 'pores' };

function applyPoint(session, tool, point, movement) {
  if (!session.skinAt(point.x, point.y)) return false;
  const strength = movement / 8;
  let changed = false;
  if (tool === 'sponge' || tool === 'cleanser' || maskTools.has(tool) || strength > 0) {
    const radius = tool === 'sponge' ? 34 : 25;
    for (const cell of session.cells) {
      if (Math.abs(cell.x - point.x) > radius || Math.abs(cell.y - point.y) > radius) continue;
      if (distance(cell, point) <= radius) changed = changeCell(cell, tool, strength) || changed;
    }
  }
  for (const condition of session.conditions) {
    if (condition.kind !== toolsForConditions[tool]) continue;
    if (distance(point, condition) > condition.radius + 9) continue;
    const dose = tool === 'gel' ? (strength || 0.7) * 0.17 : strength * 0.12;
    const previous = condition.intensity;
    condition.intensity = clamp(previous - dose);
    changed = changed || previous !== condition.intensity;
  }
  return changed;
}

export function endStroke(session) {
  session.lastPoint = null;
  session.lastTool = null;
}

export function treat(session, tool, point) {
  if (session.completed || !SPA_TOOLS.includes(tool)) return false;
  if (session.lastTool !== tool) endStroke(session);
  const from = session.lastPoint ?? point;
  const length = distance(from, point);
  if (session.lastPoint && !length) return false;
  const steps = Math.max(1, Math.ceil(length / 8));
  let changed = false;
  for (let step = 1; step <= steps; step++) {
    const x = from.x + (point.x - from.x) * step / steps;
    const y = from.y + (point.y - from.y) * step / steps;
    changed = applyPoint(session, tool, { x, y }, length / steps) || changed;
  }
  session.lastPoint = { x: point.x, y: point.y };
  session.lastTool = tool;
  if (changed) session.treatments.add(tool);
  return changed;
}

export function readSkin(session) {
  const totals = { cleanliness: 0, glow: 0, hydration: 0, covered: 0 };
  for (const cell of session.cells) {
    totals.cleanliness += cell.clean;
    totals.glow += cell.glow;
    totals.hydration += cell.hydration;
    totals.covered += Number(Boolean(cell.product));
  }
  const count = session.cells.length;
  const pores = session.conditions.filter(condition => condition.kind === 'pores');
  return {
    cleanliness: totals.cleanliness / count,
    glow: clamp(1 - session.dullness + totals.glow / count),
    hydration: totals.hydration / count,
    covered: totals.covered,
    pores: pores.length ? pores.reduce((sum, condition) => sum + condition.intensity, 0) / pores.length : 0
  };
}

export function advice(session) {
  if (session.cells.some(cell => cell.product)) return 'sponge';
  const condition = session.conditions.find(item => item.intensity > item.initial * 0.4);
  if (condition) return { spot: 'gel', redness: 'serum', pores: 'brush' }[condition.kind];
  const skin = readSkin(session);
  if (skin.glow < 1 - session.dullness + 0.12) return 'cream';
  return null;
}

export function completeSession(session) {
  if (session.completed || advice(session)) return false;
  session.completed = true;
  endStroke(session);
  return true;
}
