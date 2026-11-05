import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASK_TOOLS, createSession, treat, endStroke, readSkin, advice, completeSession } from './facial-state.mjs';

const inFace = (x, y) => x >= 30 && x < 220 && y >= 25 && y < 255;
const protectedEye = (x, y) => x >= 75 && x <= 160 && y >= 80 && y <= 112;
const skinAt = (x, y) => inFace(x, y) && !protectedEye(x, y);
const config = {
  width: 256, height: 280, skinAt,
  regions: [{ x: 65, y: 162, radius: 31 }, { x: 172, y: 168, radius: 38 }, { x: 120, y: 60, radius: 38 }]
};
const start = (seed = 38) => createSession({ ...config, seed });

function stroke(session, tool, from, to) {
  endStroke(session);
  treat(session, tool, from);
  if (to) treat(session, tool, to);
  endStroke(session);
}

test('the same seed reproduces conditions and all effects fit within skin', () => {
  const first = start();
  assert.deepEqual(first.conditions, start().conditions);
  assert.notDeepEqual(first.conditions, start(41).conditions);
  assert.deepEqual(new Set(first.conditions.map(item => item.kind)), new Set(['redness', 'spot', 'pores']));
  for (const { x, y, radius } of first.conditions) {
    for (const dx of [-radius, 0, radius]) {
      for (const dy of [-radius, 0, radius]) assert.ok(skinAt(x + dx, y + dy));
    }
  }
  assert.equal(treat(first, 'cleanser', { x: 115, y: 94 }), false);
  assert.equal(readSkin(first).covered, 0);
});

test('foam and each fruit mask can be applied and rinsed progressively', () => {
  for (const tool of ['cleanser', ...MASK_TOOLS]) {
    const session = start();
    const first = { x: 60, y: 158 };
    const second = { x: 175, y: 175 };
    stroke(session, tool, first);
    stroke(session, tool, second);
    const covered = readSkin(session).covered;
    assert.ok(covered > 0);
    assert.equal(advice(session), 'sponge');
    stroke(session, 'sponge', first);
    assert.ok(readSkin(session).covered > 0 && readSkin(session).covered < covered);
    stroke(session, 'sponge', second);
    assert.equal(readSkin(session).covered, 0);
  }
});

test('localized treatment requires the matching tool and a valid gesture', () => {
  const session = start();
  const spot = session.conditions.find(condition => condition.kind === 'spot');
  const redness = session.conditions.find(condition => condition.kind === 'redness');
  const pores = session.conditions.find(condition => condition.kind === 'pores');
  stroke(session, 'cream', spot, { x: spot.x + 6, y: spot.y });
  assert.equal(spot.intensity, spot.initial);
  stroke(session, 'gel', spot);
  assert.ok(spot.intensity > 0 && spot.intensity < spot.initial);
  assert.equal(redness.intensity, redness.initial);
  stroke(session, 'serum', redness);
  assert.equal(redness.intensity, redness.initial);
  stroke(session, 'serum', redness, { x: redness.x + 8, y: redness.y });
  assert.ok(redness.intensity < redness.initial);
  stroke(session, 'brush', pores);
  assert.equal(pores.intensity, pores.initial);
  stroke(session, 'brush', pores, { x: pores.x - 8, y: pores.y });
  assert.ok(pores.intensity < pores.initial);
  assert.ok(readSkin(session).cleanliness > 0);
  assert.ok(readSkin(session).hydration > 0);
});

test('completion needs sufficient improvement and can happen only once', () => {
  const session = start();
  assert.equal(completeSession(session), false);
  for (const condition of session.conditions) {
    const tool = { spot: 'gel', redness: 'serum', pores: 'brush' }[condition.kind];
    for (let pass = 0; pass < 10; pass++) {
      stroke(session, tool, condition, { x: condition.x + 8, y: condition.y });
    }
  }
  assert.equal(advice(session), 'cream');
  for (const y of [40, 64, 130, 154, 178, 202, 226, 246]) {
    stroke(session, 'strawberry', { x: 35, y }, { x: 215, y });
    stroke(session, 'sponge', { x: 35, y }, { x: 215, y });
  }
  assert.equal(completeSession(session), true);
  assert.equal(completeSession(session), false);
  assert.equal(treat(session, 'gel', session.conditions[0]), false);
  assert.deepEqual([...session.treatments].sort(), ['brush', 'gel', 'serum', 'sponge', 'strawberry']);
});
