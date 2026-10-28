// Static game data for the Obelisk Miner Archaeology minigame.
//
// Sources:
//  - Block stats, upgrade tables, skills: https://shminer.miraheze.org/wiki/Archaeology (v2.2.23)
//  - Spawn tables, boss floors, exact formulas: lobogrande/IoM-Arch-Optimizer-Web (MIT),
//    which reverse-engineered them from the game and calibrated against real saves.
//    Armor values use that project's integer-rounded numbers (the wiki lists e.g. 8.25
//    where the game uses 8).

export const RARITIES = ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div'];
export const FRAG_NAMES = ['Dirt', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Divine'];

// hp, xp, armor (a), fragment type (ft) and amount (fa) per block id.
export const BLOCKS = {
  dirt1: { hp: 100, xp: 0.05, a: 0, ft: 0, fa: 0 },
  com1: { hp: 250, xp: 0.15, a: 5, ft: 1, fa: 0.01 },
  rare1: { hp: 550, xp: 0.35, a: 12, ft: 2, fa: 0.01 },
  epic1: { hp: 1150, xp: 1.0, a: 25, ft: 3, fa: 0.01 },
  leg1: { hp: 1950, xp: 3.5, a: 50, ft: 4, fa: 0.01 },
  myth1: { hp: 3500, xp: 7.5, a: 150, ft: 5, fa: 0.01 },
  div1: { hp: 25000, xp: 20.0, a: 300, ft: 6, fa: 0.01 },

  dirt2: { hp: 300, xp: 0.15, a: 0, ft: 0, fa: 0 },
  com2: { hp: 750, xp: 0.45, a: 8, ft: 1, fa: 0.02 },
  rare2: { hp: 1650, xp: 1.05, a: 20, ft: 2, fa: 0.02 },
  epic2: { hp: 3450, xp: 3.0, a: 41, ft: 3, fa: 0.02 },
  leg2: { hp: 5850, xp: 10.5, a: 83, ft: 4, fa: 0.02 },
  myth2: { hp: 10500, xp: 22.5, a: 248, ft: 5, fa: 0.02 },
  div2: { hp: 75000, xp: 60.0, a: 495, ft: 6, fa: 0.02 },

  dirt3: { hp: 900, xp: 0.45, a: 0, ft: 0, fa: 0 },
  com3: { hp: 2250, xp: 1.35, a: 14, ft: 1, fa: 0.04 },
  rare3: { hp: 4950, xp: 3.15, a: 33, ft: 2, fa: 0.04 },
  epic3: { hp: 10350, xp: 9.0, a: 68, ft: 3, fa: 0.04 },
  leg3: { hp: 17550, xp: 31.5, a: 136, ft: 4, fa: 0.04 },
  myth3: { hp: 31500, xp: 67.5, a: 408, ft: 5, fa: 0.04 },
  div3: { hp: 225000, xp: 180.0, a: 817, ft: 6, fa: 0.04 },

  dirt4: { hp: 2700, xp: 1.35, a: 0, ft: 0, fa: 0 },
  com4: { hp: 6750, xp: 4.05, a: 22, ft: 1, fa: 0.08 },
  rare4: { hp: 14850, xp: 9.45, a: 54, ft: 2, fa: 0.08 },
  epic4: { hp: 31050, xp: 27.0, a: 112, ft: 3, fa: 0.08 },
  leg4: { hp: 52650, xp: 94.5, a: 225, ft: 4, fa: 0.08 },
  myth4: { hp: 94500, xp: 202.5, a: 674, ft: 5, fa: 0.08 },
  div4: { hp: 675000, xp: 540.0, a: 1348, ft: 6, fa: 0.08 },
};

export const BLOCK_IDS = Object.keys(BLOCKS);

// Floor at which each rarity reaches tier 1..4.
export const TIER_UNLOCKS = [
  [1, 12, 24, 81],
  [1, 18, 30, 96],
  [3, 26, 36, 111],
  [6, 30, 42, 126],
  [12, 32, 45, 136],
  [20, 35, 50, 141],
  [50, 75, 100, 150],
];

// [min floor, 1-in-X spawn chance for dirt..divine]. Each slot rolls divine first,
// then down to dirt; the first success spawns. If every roll fails the slot is empty.
export const CHANCE_SETS = [
  [150, [3, 6, 6, 6, 6, 10, 15]],
  [100, [3, 6, 7, 7, 7, 14, 30]],
  [70, [3, 6, 7, 7, 8, 17, 40]],
  [60, [3, 7, 7, 6, 8, 18, 45]],
  [50, [3, 7, 7, 6, 8, 18, 50]],
  [30, [3, 7, 9, 7, 8, 20, 21]],
  [25, [3, 8, 8, 7, 9, 20, 21]],
  [20, [3, 9, 9, 7, 11, 20, 21]],
  [15, [3, 9, 9, 8, 13, 20, 21]],
  [10, [3, 9, 9, 9, 14, 20, 21]],
  [5, [3, 8, 8, 10, 14, 20, 21]],
  [1, [3, 7, 9, 10, 14, 20, 21]],
];

const fill = (id) => Array(24).fill(id);
const BOSS_COMMON = {
  11: fill('dirt1'), 17: fill('com1'), 23: fill('dirt2'), 25: fill('rare1'), 29: fill('epic1'),
  31: fill('leg1'),
  34: fill('com3').map((b, i) => ([8, 9, 14, 15].includes(i) ? 'myth1' : b)),
  35: fill('rare2'), 41: fill('epic2'), 44: fill('leg2'),
  49: [...fill('dirt3').slice(0, 6), ...fill('com3').slice(0, 6), ...fill('rare3').slice(0, 6), ...fill('myth2').slice(0, 6)],
  74: fill('dirt3').map((b, i) => (i === 20 || i === 21 ? 'div1' : b)),
  98: fill('myth3'),
};
const row99 = (c) => [c, 'rare3', 'epic3', 'leg3', 'myth3', 'div2'];
// Boss / gauntlet floors replace the random layout with a fixed full grid.
// Ascension 0 uses the Ascension 1 table (divine blocks downgraded to mythic).
export const BOSS_FLOORS = {
  asc1: { ...BOSS_COMMON, 99: [0, 1, 2, 3].flatMap(() => row99('com3')) },
  asc2: {
    ...BOSS_COMMON,
    80: fill('dirt3'), 95: fill('com3'),
    99: [0, 1, 2, 3].flatMap(() => row99('com4')),
    110: fill('rare3'), 125: fill('epic3'), 135: fill('leg3'), 140: fill('myth3'), 149: fill('div3'),
  },
};

// Order in which the miner walks the 4x6 grid (snake pattern).
export const PATH_ORDER = [0, 1, 2, 3, 4, 5, 11, 10, 9, 8, 7, 6, 12, 13, 14, 15, 16, 17, 23, 22, 21, 20, 19, 18];

export const STATS = ['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'];
export const STAT_NAMES = {
  Str: 'Strength', Agi: 'Agility', Per: 'Perception', Int: 'Intellect', Luck: 'Luck', Div: 'Divinity', Corr: 'Corruption',
};
export const BASE_STAT_CAPS = { Str: 50, Agi: 50, Per: 25, Int: 25, Luck: 25, Div: 10, Corr: 10 };
export const STAT_MIN_ASC = { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 1, Corr: 2 };

// Internal upgrades. f/h = per-level value of the first/second effect.
// asc = ascension needed, stage = highest stage needed to show in the shop.
export const UPGRADES = [
  { id: 3, name: 'Max Stamina / Stamina Mod Chance (gems)', cap: 50, f: 2, h: 0.0005, asc: 0, stage: 0, gem: true },
  { id: 4, name: 'Exp Gain / Exp Mod Chance (gems)', cap: 25, f: 0.05, h: 0.0005, asc: 0, stage: 0, gem: true },
  { id: 5, name: 'Fragment Gain / Loot Mod Chance (gems)', cap: 25, f: 0.02, h: 0.0005, asc: 0, stage: 0, gem: true },
  { id: 8, name: 'Unlock New Ability (Enrage, Flurry, Quake)', cap: 3, asc: 0, stage: 0 },
  { id: 9, name: 'Flat Damage +1', cap: 25, f: 1, asc: 0, stage: 0 },
  { id: 10, name: 'Armor Penetration +1', cap: 25, f: 1, asc: 0, stage: 2 },
  { id: 11, name: 'Exp Gain +2%', cap: 25, f: 0.02, asc: 0, stage: 3 },
  { id: 12, name: 'Stat Points +1', cap: 5, f: 1, asc: 1, stage: 4 },
  { id: 13, name: 'Crit Chance / Crit Damage', cap: 25, f: 0.0025, h: 0.01, asc: 0, stage: 4 },
  { id: 14, name: 'Max Stamina / Stamina Mod Chance', cap: 20, f: 2, h: 0.0005, asc: 0, stage: 5 },
  { id: 15, name: 'Flat Damage +2', cap: 20, f: 2, asc: 0, stage: 6 },
  { id: 16, name: 'Loot Mod Gain +0.3x', cap: 10, f: 0.3, asc: 0, stage: 6 },
  { id: 17, name: 'Unlock Crosshair Fairy / Armor Pen +3', cap: 15, f: 3, asc: 1, stage: 7 },
  { id: 18, name: 'Enrage Damage & Crit Dmg / Enrage Cooldown', cap: 15, f: 0.02, h: -1, asc: 0, stage: 7 },
  { id: 19, name: 'Gleaming Floor Chance', cap: 30, f: 0.001, asc: 2, stage: 8 },
  { id: 20, name: 'Flat Damage / Super Crit Chance', cap: 25, f: 2, h: 0.0035, asc: 0, stage: 9 },
  { id: 21, name: 'Exp Gain / Fragment Gain', cap: 20, f: 0.03, h: 0.02, asc: 0, stage: 10 },
  { id: 22, name: 'Flurry Stamina Gain / Flurry Cooldown', cap: 10, f: 1, h: -1, asc: 0, stage: 11 },
  { id: 23, name: 'Max Stamina / Stamina Mod Gain', cap: 5, f: 4, h: 1, asc: 0, stage: 12 },
  { id: 24, name: 'All Mod Chances', cap: 30, f: 0.0002, asc: 1, stage: 12 },
  { id: 25, name: 'Strength Buff: Flat Damage / Damage', cap: 5, f: 0.2, h: 0.001, asc: 0, stage: 13 },
  { id: 26, name: 'Agility Buff: Max Stamina / Mod Chance', cap: 5, f: 1, h: 0.0002, asc: 0, stage: 15 },
  { id: 27, name: 'Unlock Ability Fairy / Loot Mod Gain', cap: 30, f: 0.05, asc: 2, stage: 16 },
  { id: 28, name: 'Exp Gain / Max Stamina %', cap: 15, f: 0.05, h: 0.01, asc: 0, stage: 17 },
  { id: 29, name: 'Armor Pen % / Ability Cooldowns', cap: 10, f: 0.02, h: -1, asc: 0, stage: 18 },
  { id: 30, name: 'Crit Damage / Super Crit Damage', cap: 20, f: 0.02, h: 0.02, asc: 0, stage: 20 },
  { id: 31, name: 'Quake Attacks / Quake Cooldown', cap: 10, f: 1, h: -2, asc: 0, stage: 20 },
  { id: 32, name: 'Flat Damage +3 / Enrage Cooldown', cap: 5, f: 3, h: -1, asc: 1, stage: 21 },
  { id: 33, name: 'Perception Buff: Mod Chance / Armor Pen', cap: 5, f: 0.0001, h: 1, asc: 0, stage: 22 },
  { id: 34, name: 'Buff Divinity: All Div Stats', cap: 5, f: 0.2, asc: 2, stage: 23 },
  { id: 35, name: 'Intellect Buff: Exp Gain / Mod Chance', cap: 5, f: 0.01, h: 0.0001, asc: 0, stage: 24 },
  { id: 36, name: 'Damage / Armor Pen', cap: 20, f: 0.02, h: 3, asc: 0, stage: 26 },
  { id: 37, name: 'Super Crit / Ultra Crit Chance', cap: 20, f: 0.0035, h: 0.01, asc: 0, stage: 28 },
  { id: 38, name: 'Exp Mod Gain / Chance', cap: 20, f: 0.1, h: 0.001, asc: 0, stage: 30 },
  { id: 39, name: 'Ability Instacharge / Max Stamina', cap: 20, f: 0.003, h: 4, asc: 0, stage: 32 },
  { id: 40, name: 'Ultra Crit Damage / Stamina Mod Chance', cap: 20, f: 0.02, h: 0.0003, asc: 1, stage: 33 },
  { id: 41, name: 'Polychrome Card Bonus +15%', cap: 1, f: 0.15, asc: 0, stage: 34 },
  { id: 42, name: 'Fragment Gain x1.25', cap: 1, asc: 0, stage: 36 },
  { id: 43, name: 'Stamina Mod Gain +2', cap: 1, f: 2, asc: 0, stage: 38 },
  { id: 44, name: 'All Mod Chances +1.5%', cap: 1, f: 0.015, asc: 0, stage: 40 },
  { id: 45, name: 'Exp Gain x2 / All Stat Caps +5', cap: 1, f: 2, h: 5, asc: 0, stage: 42 },
  { id: 46, name: 'Gleaming Floor Multi', cap: 30, f: 0.03, asc: 2, stage: 45 },
  { id: 47, name: 'Strength Buff: Damage / Crit Damage', cap: 1, f: 0.01, h: 0.01, asc: 1, stage: 50 },
  { id: 48, name: 'Gold Crosshair / Auto-Tap Chance', cap: 5, f: 0.01, h: 0.01, asc: 1, stage: 55 },
  { id: 49, name: 'Flat Damage +3 / Ultra Crit Chance', cap: 5, f: 3, h: 0.005, asc: 1, stage: 60 },
  { id: 50, name: 'Ability Instacharge / Stamina Mod Chance', cap: 25, f: 0.001, h: 0.001, asc: 1, stage: 65 },
  { id: 51, name: 'Damage / Exp Gain +10%', cap: 5, f: 0.1, h: 0.1, asc: 1, stage: 70 },
  { id: 52, name: 'Corruption Buff: Damage / Mod Multi', cap: 10, f: 0.002, h: 0.0002, asc: 2, stage: 72 },
  { id: 53, name: 'Super Crit Damage / Exp Mod Gain', cap: 40, f: 0.005, h: 0.02, asc: 1, stage: 85 },
  { id: 54, name: 'Max Stamina % / Auto-Tap Chance', cap: 50, f: 0.005, h: 0.002, asc: 1, stage: 90 },
  { id: 55, name: 'All Mod Multipliers +2%', cap: 10, f: 0.02, asc: 2, stage: 92 },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Infernal (level 4) card global bonuses: base value per block id.
// Values marked round are applied as rounded integers.
export const INFERNAL_BONUS = {
  dirt1: { v: 0.1, text: 'Loot Mod Gain' }, dirt2: { v: 0.12, text: 'Exp Gain' },
  dirt3: { v: 0.08, text: 'Fragment Gain' }, dirt4: { v: 0.1, text: 'Gleaming Multi' },
  com1: { v: 0.06, text: 'Crit Dmg' }, com2: { v: 0.07, text: 'Super Crit Dmg' },
  com3: { v: 0.08, text: 'Ultra Crit Dmg' }, com4: { v: 0.015, text: 'All Crit Chances' },
  rare1: { v: 0.05, text: 'Auto-Tap Chance' }, rare2: { v: 20, round: true, text: 'Flat Damage' },
  rare3: { v: 0.4, text: 'Armor Pen Multi' }, rare4: { v: 0.08, text: 'Loot Mod Gain' },
  epic1: { v: 0.3, text: 'Gold Crosshair Multi' }, epic2: { v: 0.04, text: 'Super Crit Chance' },
  epic3: { v: 0.05, text: 'Max Stamina Multi' }, epic4: { v: 0.1, text: 'Crit Dmg' },
  leg1: { v: 0.04, text: 'Fragment Gain' }, leg2: { v: 0.05, text: 'Gold Crosshair Chance' },
  leg3: { v: 40, round: true, text: 'Flat Armor Pen' }, leg4: { v: 20, round: true, text: 'Flat Max Stamina' },
  myth1: { v: 0.013, text: 'Gleaming Chance' }, myth2: { v: 0.008, text: 'Loot Mod Chance' },
  myth3: { v: 0.007, text: 'Stamina Mod Chance' }, myth4: { v: 0.01, text: 'Ability Instacharge' },
  div1: { v: 0.1, text: 'Damage Multi' }, div2: { v: 0.0125, text: 'Gleaming Chance' },
  div3: { v: 1, round: true, text: 'Stamina Mod Gain' }, div4: { v: 0.005, text: 'All Mod Chances' },
};

export const CROSSHAIR_INTERVAL = 3.5; // seconds between crosshair spawns
export const BASE_DAMAGE = 10;

// Experience needed to go from level n to n+1.
export const expToNext = (n) => 10 * Math.pow(1.2, n + 1);

export function defaultProfile() {
  return {
    asc: 0,
    archLevel: 1,
    highestFloor: 1,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    ext: {
      hestia: 0, hades: 0, axolotl: -1, geoduck: 0, avada: false, blockBonker: false,
      archBundle: false, ascBundle: false, archCard: 0, archCardInfernal: 0,
      lynx: 0, kromak: false, kromakGilded: 0, wq22: false, challenge14: false, challenge17: false,
      totalInfernalCards: 0,
    },
    cards: Object.fromEntries(BLOCK_IDS.map((b) => [b, 0])),
  };
}
