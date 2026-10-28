// Example profiles. "screenshot" was rebuilt from in-game screenshots (Asc 1,
// Arch level 100) and reproduces every number on that player's stats page.

import { defaultProfile, BLOCK_IDS } from './data.js';

export function screenshotPreset() {
  const p = defaultProfile();
  p.asc = 1;
  p.archLevel = 100;
  p.highestFloor = 145;
  p.atkSpeed = 2;
  Object.assign(p.upgrades, {
    3: 50, 4: 25, 5: 25, 8: 3, 9: 25, 10: 25, 11: 25, 12: 5, 13: 25, 14: 20, 15: 20, 16: 10,
    17: 15, 18: 15, 20: 25, 21: 20, 22: 10, 23: 5, 24: 30, 25: 5, 26: 5, 28: 15, 29: 10, 30: 20,
    31: 10, 32: 5, 33: 5, 35: 5, 36: 20, 37: 20, 38: 20, 39: 20, 40: 20, 41: 1, 42: 1, 43: 1,
    44: 1, 45: 1, 47: 1, 48: 5, 49: 5, 50: 25, 51: 5, 53: 33, 54: 27,
  });
  // Fragment-gain externals are not visible on the stats page; these values
  // reproduce its 6.91x total and can be replaced with the real ones.
  Object.assign(p.ext, { avada: true, blockBonker: true, geoduck: 200, axolotl: 5, hestia: 80, archCard: 4, archCardInfernal: 14.07 });
  for (const id of BLOCK_IDS) if (!id.endsWith('4')) p.cards[id] = 3;
  return { profile: p, alloc: { Str: 0, Agi: 0, Per: 30, Int: 30, Luck: 30, Div: 15, Corr: 0 } };
}
