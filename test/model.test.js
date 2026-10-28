import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/engine/stats.js';
import { evaluateRun, expectedFloor } from '../src/engine/model.js';
import { simulate } from '../src/engine/sim.js';
import { optimize, evaluateAlloc } from '../src/engine/optimizer.js';
import { screenshotPreset } from '../src/engine/presets.js';

const builds = {
  current: { Per: 30, Int: 30, Luck: 30, Div: 15 },
  strength: { Str: 53, Agi: 7, Luck: 30, Div: 15 },
};

for (const [name, alloc] of Object.entries(builds)) {
  test(`analytic model agrees with simulation: ${name} build`, () => {
    const { profile } = screenshotPreset();
    const st = computeStats(profile, alloc);
    const m = evaluateRun(st, profile.asc);
    const s = simulate(st, profile.asc, 400, 5);
    assert.ok(Math.abs(expectedFloor(m.reach) - s.expFloor) < 2, `floor ${expectedFloor(m.reach)} vs ${s.expFloor}`);
    assert.ok(Math.abs(m.xp / s.xp - 1) < 0.05, `xp ${m.xp} vs ${s.xp}`);
    const tm = m.frags.reduce((a, b) => a + b), ts = s.frags.reduce((a, b) => a + b);
    assert.ok(Math.abs(tm / ts - 1) < 0.05, `frags ${tm} vs ${ts}`);
  });
}

test('optimizer beats the starting build and respects limits', async () => {
  const { profile, alloc } = screenshotPreset();
  const goal = { type: 'floorChance', chance: 0.05 };
  const limits = { Luck: { max: 20 } };
  const r = await optimize({
    profile, limits, start: alloc,
    evalBatch: async (as) => as.map((a) => evaluateAlloc(profile, a, goal, true).score),
  });
  const best = r.top[0].alloc;
  assert.ok(best.Luck <= 20);
  const spent = Object.entries(best).reduce((s, [, v]) => s + v, 0);
  assert.equal(spent, 105);
  assert.ok(r.top[0].score > evaluateAlloc(profile, { ...alloc, Luck: 20, Per: 30, Int: 30, Div: 15, Str: 10 }, goal, true).score);
});
