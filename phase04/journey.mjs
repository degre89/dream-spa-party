import { createSession, endStroke, MASK_TOOLS, readSkin, seededRandom, treat } from '../phase03/facial-state.mjs';

const steps = {
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
  const opening = openings[client][Math.floor(random() * 3)];
  const sequence = [opening, ...preparations[Math.floor(random() * preparations.length)], 'mask'];
  const session = createSession({ ...skin, seed, conditionKinds: [opening] });
  return { session, sequence, index: 0, mistakes: 0, mask: null, rinseFrom: 0, pending: false };
}

export function currentStep(journey) {
  return steps[journey.sequence[journey.index]];
}

export function currentAction(journey) {
  return journey.rinseFrom ? steps.rinse : currentStep(journey);
}

export function acceptsTool(journey, tool) {
  const action = currentAction(journey);
  return action.tool ? action.tool === tool : journey.mask ? tool === journey.mask : MASK_TOOLS.includes(tool);
}

function progress(journey, skin) {
  const kind = journey.sequence[journey.index];
  const { session, rinseFrom } = journey;
  if (rinseFrom) return 1 - skin.covered / rinseFrom;
  if (kind === 'mask') return skin.covered / session.cells.length / 0.96;
  if (kind === 'cleanse') return skin.covered / session.cells.length / 0.52;
  if (kind === 'cream') return skin.hydration / 0.28;
  const { conditions } = session;
  if (!conditions.length) return 0;
  return conditions.reduce((sum, item) => sum + 1 - item.intensity / item.initial, 0) / conditions.length;
}

export function journeyPercent(journey) {
  return Math.floor(Math.min(1, progress(journey, readSkin(journey.session))) * 100);
}

export function applyGesture(journey, tool, point) {
  if (journey.pending || !acceptsTool(journey, tool)) return null;
  const { session } = journey;
  if (!treat(session, tool, point)) return null;
  if (MASK_TOOLS.includes(tool)) journey.mask = tool;

  const skin = readSkin(session);
  if (progress(journey, skin) < 1) return 'improved';
  endStroke(session);
  if (!journey.rinseFrom && (tool === 'cleanser' || MASK_TOOLS.includes(tool))) {
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
