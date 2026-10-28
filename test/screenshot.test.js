import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/engine/stats.js';
import { screenshotPreset } from '../src/engine/presets.js';

// Values read off the in-game Archaeology stats popup.
const SHOWN = {
  maxSta: 874, damage: 703, armorPen: 714,
  critChance: 0.6625, critDmg: 2.47, superCritChance: 0.4575, superCritDmg: 3.13,
  ultraCritChance: 0.225, ultraCritDmg: 4.2, abilityInsta: 0.115, autoTap: 0.404,
  goldChance: 0.2, goldMult: 3, expGain: 15.2, fragGain: 6.91,
  expModChance: 0.2185, expModGain: 5.66, lootModChance: 0.1985, lootModGain: 5,
  speedModChance: 0.081, speedModGain: 25, staModChance: 0.147, staModGain: 10,
};

test('screenshot profile reproduces the in-game stats page', () => {
  const { profile, alloc } = screenshotPreset();
  const st = computeStats(profile, alloc);
  for (const [k, v] of Object.entries(SHOWN)) {
    assert.ok(Math.abs(st[k] - v) < 1e-6, `${k}: got ${st[k]}, shown ${v}`);
  }
});
