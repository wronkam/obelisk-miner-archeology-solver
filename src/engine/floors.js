// Floor layout generation: which block can appear in each slot, and how likely.

import { RARITIES, TIER_UNLOCKS, CHANCE_SETS, BOSS_FLOORS, BLOCKS } from './data.js';

function tierFor(rarity, floor, asc) {
  const t = TIER_UNLOCKS[rarity];
  let tier = floor >= t[3] ? 4 : floor >= t[2] ? 3 : floor >= t[1] ? 2 : 1;
  if (tier === 4 && asc < 2) tier = 3;
  return tier;
}

function fixBossId(id, asc) {
  if (asc < 1 && id.startsWith('div')) id = id.replace('div', 'myth');
  return id;
}

export function bossLayout(floor, asc) {
  const table = asc >= 2 ? BOSS_FLOORS.asc2 : BOSS_FLOORS.asc1;
  const grid = table[floor];
  return grid ? grid.map((id) => fixBossId(id, asc)) : null;
}

// Distribution of a single random slot on a normal floor: [{ id, p }], plus empty chance.
export function slotDistribution(floor, asc) {
  const chances = CHANCE_SETS.find(([min]) => floor >= min)[1];
  const out = [];
  let remaining = 1;
  for (let r = 6; r >= 0; r--) {
    if (r === 6 && asc < 1) continue;
    if (floor < TIER_UNLOCKS[r][0]) continue;
    const p = remaining / chances[r];
    out.push({ id: `${RARITIES[r]}${tierFor(r, floor, asc)}`, p });
    remaining -= p;
  }
  return { blocks: out, empty: remaining };
}

// Per-slot distributions for all 24 slots (indexed by grid slot, not path order).
const cache = new Map();
export function floorSlots(floor, asc) {
  const key = floor * 4 + asc;
  if (cache.has(key)) return cache.get(key);
  let slots, d;
  const boss = bossLayout(floor, asc);
  if (boss) {
    slots = boss.map((id) => ({ blocks: [{ id, p: 1 }], empty: 0 }));
  } else {
    d = slotDistribution(floor, asc);
    slots = Array(24).fill(d);
  }
  slots.key = boss ? `boss${floor}/${asc}` : d.blocks.map((x) => x.id + x.p).join();
  cache.set(key, slots);
  return slots;
}

// Random layout for the Monte Carlo simulator.
export function rollFloor(floor, asc, rng) {
  const boss = bossLayout(floor, asc);
  if (boss) return boss.slice();
  const chances = CHANCE_SETS.find(([min]) => floor >= min)[1];
  const grid = Array(24).fill(null);
  for (let i = 0; i < 24; i++) {
    for (let r = 6; r >= 0; r--) {
      if (r === 6 && asc < 1) continue;
      if (floor < TIER_UNLOCKS[r][0]) continue;
      if (Math.floor(rng() * chances[r]) === 0) {
        grid[i] = `${RARITIES[r]}${tierFor(r, floor, asc)}`;
        break;
      }
    }
  }
  return grid;
}

export const isBlock = (id) => id in BLOCKS;
