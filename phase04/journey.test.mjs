import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endStroke, MASK_TOOLS, SPA_TOOLS } from '../phase03/facial-state.mjs';
import { acceptsTool, advanceJourney, applyGesture, beginCleanserRinse, createJourney, currentAction, journeyPercent } from './journey.mjs';

const clients = ['sofia', 'emma', 'maya'];
const options = {
  width: 512, height: 640,
  skinAt: (x, y) => x >= 142 && x <= 370 && y >= 151 && y <= 471,
  regions: [{x: 255, y: 198, radius: 54}, {x: 180, y: 338, radius: 38},
    {x: 330, y: 338, radius: 38}, {x: 255, y: 426, radius: 35}]
};

test('seeded sessions cover all clients, condition types and preparation combinations', () => {
  for (const client of clients) {
    const sequences = new Set();
    const spotCounts = new Set();
    for (let seed = 0; seed < 160; seed++) {
      const sessionSeed = Math.imul(seed, 2654435761) >>> 0;
      const journey = createJourney({ ...options, seed: sessionSeed, client });
      const repeat = createJourney({ ...options, seed: sessionSeed, client });
      assert.deepEqual(journey.sequence, repeat.sequence);
      assert.deepEqual(journey.session.conditions, repeat.session.conditions);
      assert.ok([3, 4].includes(journey.sequence.length));
      assert.equal(journey.sequence.at(-1), 'mask');
      assert.ok(journey.session.conditions.length > 0);
      assert.deepEqual(new Set(journey.session.conditions.map(mark => mark.kind)), new Set([journey.sequence[0]]));
      if (journey.sequence[0] === 'spot') spotCounts.add(journey.session.conditions.length);
      sequences.add(journey.sequence.join('/'));
    }
    assert.equal(sequences.size, 9);
    assert.ok(spotCounts.size >= 4 && Math.max(...spotCounts) >= 9);
  }
});

test('wrong products and gestures on protected areas never change the skin', () => {
  const journey = createJourney({ ...options, seed: 86032, client: 'sofia' });
  const initial = structuredClone(journey.session.conditions);
  const correct = currentAction(journey).tool;
  const point = initial[0];
  for (const wrong of SPA_TOOLS.filter(tool => tool !== correct)) {
    for (let repeat = 0; repeat < 20; repeat++) {
      assert.equal(applyGesture(journey, wrong, point), null);
    }
  }
  assert.equal(applyGesture(journey, correct, { x: 0, y: 0 }), null);
  endStroke(journey.session);
  assert.deepEqual(journey.session.conditions, initial);
  assert.equal(journeyPercent(journey), 0);
  assert.equal(advanceJourney(journey), false);
  assert.equal(journey.index, 0);
  applyGesture(journey, correct, point);
  applyGesture(journey, correct, { x: point.x + 5, y: point.y });
  assert.ok(journeyPercent(journey) > 0);
  assert.ok(journeyPercent(journey) < 100);
});

function sweep(journey, tool) {
  for (let y = 156; y <= 472; y += 16) {
    for (const x of [143, 255, 369]) {
      const result = applyGesture(journey, tool, { x, y });
      if (result === 'complete' || result === 'rinse' || result === 'cleanser-ready') return result;
    }
    endStroke(journey.session);
  }
  return null;
}

test('all generated route types can finish, with four mask choices and one reward', () => {
  for (let index = 0; index < 24; index++) {
    const journey = createJourney({ ...options, seed: Math.imul(index, 2654435761), client: clients[index % 3] });
    const tool = currentAction(journey).tool;
    for (const { x, y } of journey.session.conditions) {
      for (let pass = 0; pass < 12 && !journey.pending; pass++) {
        applyGesture(journey, tool, { x, y });
        applyGesture(journey, tool, { x: x + 6, y });
        endStroke(journey.session);
      }
    }
    assert.ok(journey.pending);
    while (!advanceJourney(journey)) {
      const correct = currentAction(journey).tool ?? MASK_TOOLS[index % MASK_TOOLS.length];
      let outcome = sweep(journey, correct);
      if (outcome === 'cleanser-ready') {
        assert.equal(acceptsTool(journey, 'cleanser'), true);
        assert.equal(acceptsTool(journey, 'sponge'), true);
        assert.equal(journey.rinseFrom, 0);
        beginCleanserRinse(journey);
        outcome = 'rinse';
      }
      if (outcome === 'rinse') {
        assert.equal(currentAction(journey).tool, 'sponge');
        assert.equal(acceptsTool(journey, correct), false);
        assert.equal(applyGesture(journey, correct, { x: 254, y: 200 }), null);
        outcome = sweep(journey, 'sponge');
      }
      assert.equal(outcome, 'complete');
    }
    assert.equal(advanceJourney(journey), false);
    assert.ok(journey.session.completed);
  }
});

test('the cleanser can fill the remaining skin after rinsing becomes available', () => {
  const journey = createJourney({ ...options, seed: 5, client: 'sofia' });
  journey.index = journey.sequence.indexOf('cleanse');
  assert.ok(journey.index > 0);
  assert.equal(sweep(journey, 'cleanser'), 'cleanser-ready');
  const untouched = journey.session.cells.find(cell => !cell.product);
  assert.ok(untouched);
  const readyPercent = journeyPercent(journey);
  assert.ok(readyPercent < 100);
  endStroke(journey.session);
  assert.equal(applyGesture(journey, 'cleanser', untouched), 'improved');
  assert.equal(untouched.product, 'foam');
  assert.ok(journeyPercent(journey) > readyPercent);
  beginCleanserRinse(journey);
  assert.equal(journeyPercent(journey), 0);
  assert.equal(acceptsTool(journey, 'cleanser'), false);
});

test('coverage is weighted by treatable area, including tiles clipped by the stencil', () => {
  const journey = createJourney({ ...options, seed: 5, client: 'sofia',
    sampleCell: (x, y) => options.skinAt(x, y) && { x, y, area: x < 255 ? .5 : 1 }
  });
  journey.index = journey.sequence.indexOf('cleanse');
  for (const cell of journey.session.cells) {
    if (cell.x < 255) cell.product = 'foam';
  }
  const left = journey.session.cells.filter(cell => cell.product);
  const expected = Math.floor(left.length * .5 / journey.session.area * 100);
  assert.equal(journeyPercent(journey), expected);
  assert.ok(expected < Math.floor(left.length / journey.session.cells.length * 100));
});
