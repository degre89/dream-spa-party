import { createSession, endStroke, MASK_TOOLS, readSkin, seededRandom, treat } from '../phase03/facial-state.mjs?v=04e';

import { eyeShadows, patchProgress, usePatch } from '../phase05/eye-patches.mjs?v=05';
import { prepareSkin } from '../phase05/steam.mjs?v=05';

const steps = {
  steam: { tool: 'steamer', icon: '☁', title: 'Nuvole di vapore', prompt: 'Trascina il vaporizzatore sul viso.', hint: 'Passa sulla fronte, sulle guance e sul mento.' },
  darkCircles: { tool: 'patches', icon: '☾', title: 'Patch sotto gli occhi', prompt: 'Coccoliamo il contorno occhi?', hint: 'Cerca le due mezzelune rosa.' },
  spot: { tool: 'gel', icon: '✦', title: 'Brufolini', prompt: 'Mi aiuti con questi brufolini?', hint: 'Cerca il tubetto per i puntini.' },
  redness: { tool: 'serum', icon: '♡', title: 'Guance rosate', prompt: 'Coccoliamo le guance rosate?', hint: 'Cerca la boccetta con il contagocce.' },
  pores: { tool: 'brush', icon: '❋', title: 'Piccoli pori', prompt: 'Vedi quei gruppetti di puntini?', hint: 'Cerca qualcosa di morbido con le setole.' },
  cleanse: { tool: 'cleanser', icon: '○', title: 'Nuvole di schiuma', prompt: 'Facciamo un po’ di schiuma?', hint: 'Cerca il flacone che fa la schiuma.' },
  cream: { tool: 'cream', icon: '♡', title: 'Una carezza', prompt: 'Vorrei una carezza morbida!', hint: 'Cerca il vasetto della crema.' },
  mask: { icon: '✿', title: 'Maschera magica', prompt: 'Quale maschera scegli?', hint: 'Cerca uno dei quattro vasetti colorati.' },
  rinse: { tool: 'sponge', icon: '○', prompt: 'Via tutto con la spugnetta!', hint: 'Cerca la spugnetta gialla.' }
};

const openings = {
  sofia: ['spot', 'pores', 'redness'],
  emma: ['redness', 'spot', 'pores'],
  maya: ['pores', 'redness', 'spot']
};
const preparations = [['cream'], ['cleanse'], ['cleanse', 'cream']];

export function createJourney({ client, seed, ...skin }) {
  const random = seededRandom(seed);
  const first = Math.floor(random() * openings[client].length);
  const opening = (seed >>> 0) % 4 === 0 ? 'darkCircles' : openings[client][first];
  const sequence = ['steam', opening, ...preparations[Math.floor(random() * preparations.length)], 'mask'];
  const session = createSession({ ...skin, seed, conditionKinds: [opening] });
  if (opening === 'darkCircles') session.conditions = eyeShadows(client);
  return { session, sequence, index: 0, mistakes: 0, mask: null, rinseFrom: 0, cleanserReady: false, pending: false };
}

export function currentStep(journey) {
  return steps[journey.sequence[journey.index]];
}

export function currentAction(journey) {
  return journey.rinseFrom ? steps.rinse : currentStep(journey);
}

export function acceptsTool(journey, tool) {
  const action = currentAction(journey);
  if (tool === 'sponge' && journey.cleanserReady) return true;
  return action.tool ? action.tool === tool : journey.mask ? tool === journey.mask : MASK_TOOLS.includes(tool);
}

// Each reachable stencil cell is counted once, regardless of repeated strokes.
function spatialCoverage(session, isCovered, target = .88, zoneTarget = .55) {
  const { cells } = session;
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const top = minY + (maxY - minY) * .36;
  const bottom = minY + (maxY - minY) * .73;
  const regions = new Map();
  let treated = 0;
  for (const cell of cells) {
    const region = cell.y < top ? 'forehead' :
      cell.y > bottom ? 'chin' :
      Math.abs(cell.x - midX) < (maxX - minX) * .12 ? 'nose' :
      cell.x < midX ? 'leftCheek' : 'rightCheek';
    const bucket = regions.get(region) || { total: 0, covered: 0 };
    bucket.total += cell.area;
    if (isCovered(cell)) { bucket.covered += cell.area; treated += cell.area; }
    regions.set(region, bucket);
  }
  const overall = treated / session.area;
  const minimum = Math.min(...[...regions.values()].filter(r => r.total >= 8)
    .map(r => r.covered / r.total));
  // 88% total, with at least 55% of each reachable macrozone.
  // Show immediate local feedback, but never award completion until the
  // whole face and every reachable macrozone have received treatment.
  if (overall >= target && minimum >= zoneTarget) return 1;
  return Math.min(.99, .7 * Math.min(1, overall / target) + .3 * Math.min(1, minimum / zoneTarget));
}

function progress(journey, skin) {
  const kind = journey.sequence[journey.index];
  const { session, rinseFrom } = journey;
  if (rinseFrom) return 1 - skin.covered / rinseFrom;
  if (kind === 'mask') return skin.covered / session.area / 0.96;
  if (kind === 'darkCircles') return patchProgress(session);
  if (kind === 'steam') return spatialCoverage(session, cell => cell.prepared, .72, .36);
  if (kind === 'cleanse') return spatialCoverage(session, cell => cell.product === 'foam');
  if (kind === 'cream') return spatialCoverage(session, cell => cell.hydration > 0);
  const { conditions } = session;
  if (!conditions.length) return 0;
  return conditions.reduce((sum, item) => sum + 1 - item.intensity / item.initial, 0) / conditions.length;
}

export function journeyPercent(journey) {
  const skin = readSkin(journey.session);
  const fraction = journey.sequence[journey.index] === 'cleanse' && !journey.rinseFrom ?
    skin.covered / journey.session.area : progress(journey, skin);
  return Math.floor(Math.min(1, fraction) * 100);
}

export function beginCleanserRinse(journey) {
  if (!journey.cleanserReady || journey.rinseFrom) return;
  endStroke(journey.session);
  journey.rinseFrom = readSkin(journey.session).covered;
  journey.cleanserReady = false;
  journey.mistakes = 0;
}

export function applyGesture(journey, tool, point) {
  if (journey.pending || !acceptsTool(journey, tool)) return null;
  if (tool === 'sponge') beginCleanserRinse(journey);
  const { session } = journey;
  if (tool === 'patches') return usePatch(journey, point);
  if (tool === 'steamer') {
    if (!prepareSkin(session, point)) return null;
    if (progress(journey) < 1) return 'steam';
    endStroke(session);
    journey.pending = true;
    return 'complete';
  }
  if (!treat(session, tool, point)) return null;
  if (MASK_TOOLS.includes(tool)) journey.mask = tool;

  const skin = readSkin(session);
  if (tool === 'cleanser' && journey.cleanserReady) return 'improved';
  if (progress(journey, skin) < 1) return 'improved';
  if (tool === 'cleanser') {
    journey.cleanserReady = true;
    journey.mistakes = 0;
    return 'cleanser-ready';
  }
  endStroke(session);
  if (!journey.rinseFrom && MASK_TOOLS.includes(tool)) {
    journey.rinseFrom = skin.covered;
    journey.mistakes = 0;
    return 'rinse';
  }
  journey.pending = true;
  return 'complete';
}

export function advanceJourney(journey) {
  if (!journey.pending || journey.session.completed) return false;
  if (journey.index === journey.sequence.length - 1) {
    journey.session.completed = true;
    return true;
  }
  journey.index++;
  journey.pending = false;
  journey.mistakes = 0;
  journey.rinseFrom = 0;
  return false;
}
