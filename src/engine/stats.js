// Derived player stats from a profile (ascension, upgrades, externals, cards)
// and a skill-point allocation. Formulas follow the game's code as reverse-engineered
// by IoM-Arch-Optimizer-Web, including its rounding quirks.

import { UPGRADE_BY_ID, INFERNAL_BONUS, BASE_STAT_CAPS, STAT_MIN_ASC, BASE_DAMAGE } from './data.js';

// Python's round(): half to even.
export function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// Python's round(x, 2): correctly rounded on the exact binary value, ties to even.
export function round2(x) {
  const s = x * 100;
  if (Number.isInteger(x * 8) && Math.abs(s % 1) === 0.5) return roundHalfEven(s) / 100;
  return Number(x.toFixed(2));
}

// GameMaker round(): half away from zero.
const gmRound = (x) => (x >= 0 ? Math.trunc(x + 0.5) : Math.trunc(x - 0.5));

export function statCaps(profile) {
  const inc = upgradeLevel(profile, 45) ? 5 : 0;
  const caps = {};
  for (const [s, c] of Object.entries(BASE_STAT_CAPS)) caps[s] = profile.asc >= STAT_MIN_ASC[s] ? c + inc : 0;
  return caps;
}

export function statBudget(profile) {
  return profile.archLevel + (profile.asc >= 1 ? upgradeLevel(profile, 12) : 0);
}

export function upgradeLevel(profile, id) {
  const u = UPGRADE_BY_ID[id];
  if (!u || profile.asc < u.asc) return 0;
  let lvl = Math.max(0, Math.min(profile.upgrades[id] || 0, u.cap));
  if (u.gem) lvl = Math.min(lvl, profile.archLevel + 4);
  return lvl;
}

// Builds the lookup helpers shared by every stat formula.
function context(profile) {
  const asc1 = profile.asc >= 1;
  const asc2 = profile.asc >= 2;
  const F = (id) => {
    if (id === 42) return upgradeLevel(profile, 42) ? 1.25 : 1;
    const u = UPGRADE_BY_ID[id];
    return u.f === undefined ? 0 : upgradeLevel(profile, id) * u.f;
  };
  const H = (id) => {
    const u = UPGRADE_BY_ID[id];
    return u.h === undefined ? 0 : upgradeLevel(profile, id) * u.h;
  };

  const e = profile.ext;
  const on = (b) => (b ? 1 : 0);
  const cardInf = { 0: 0, 1: -0.03, 2: -0.06, 3: -0.1 };
  const W = {
    hestia: asc1 ? (e.hestia || 0) * 0.0001 : 0,
    axolotl: (1 + (e.axolotl ?? -1)) * 0.03,
    geoduck: Math.min(asc2 ? 0.75 : 0.5, (e.geoduck || 0) * 0.0025),
    avadaDuration: 5 * on(e.avada),
    avadaCooldown: -10 * on(e.avada),
    avadaInsta: 0.03 * on(e.avada),
    bbDamage: 0.01 * on(e.blockBonker),
    bbStamina: 0.01 * on(e.blockBonker),
    bbSpeed: 1 * on(e.blockBonker),
    archBundle: e.archBundle ? 1.25 : 1,
    ascBundleExp: e.ascBundle ? 1.15 : 1,
    ascBundleAutoTap: 0.05 * on(e.ascBundle),
    ascBundleLootMod: 0.02 * on(e.ascBundle),
    ascBundleGold: 0.02 * on(e.ascBundle),
    archCard: e.archCard >= 4 ? -Math.abs(e.archCardInfernal || 0) / 100 : cardInf[e.archCard || 0],
  };

  // Card bonuses and infernal (level 4) global bonuses.
  const infCards = asc1 ? Object.values(profile.cards).filter((l) => l === 4).length : 0;
  const hades = asc1 ? (e.hades || 0) * 0.000045 : 0;
  const infMult = (1 + 0.04 * infCards + 0.002 * (e.totalInfernalCards || 0)) * (1 + hades)
    * (1 + (e.lynx || 0) * 0.0025) * (1 + (e.kromak ? (e.kromakGilded || 0) * 0.01 : 0))
    * (e.wq22 ? 1.02 : 1) * (e.challenge17 ? 1.05 : 1);
  const inf = (id) => {
    if (!asc1) return 0;
    if (id.endsWith('4') && !asc2) return 0;
    return profile.cards[id] === 4 ? INFERNAL_BONUS[id].v * infMult : 0;
  };
  const card = (id) => {
    if (id.endsWith('4') && !asc2) return { hp: 1, exp: 1, loot: 1 };
    const lvl = profile.cards[id] || 0;
    if (lvl === 1) return { hp: 0.9, exp: 1.1, loot: 1.1 };
    if (lvl === 2) return { hp: 0.8, exp: 1.2, loot: 1.2 };
    if (lvl >= 3) {
      const b = 0.35 + F(41);
      return { hp: 1 - b, exp: 1 + b, loot: 1 + b };
    }
    return { hp: 1, exp: 1, loot: 1 };
  };
  return { asc1, asc2, F, H, W, inf, card, e };
}

// alloc: { Str, Agi, Per, Int, Luck, Div, Corr } skill points.
export function computeStats(profile, alloc) {
  const { asc1, asc2, F, H, W, inf, card, e } = context(profile);
  const S = (k) => {
    if (k === 'Div' && !asc1) return 0;
    if (k === 'Corr' && !asc2) return 0;
    return alloc[k] || 0;
  };
  const floorCap = Math.min(100, profile.highestFloor || 0);
  const modMulti = 1 + F(55) + S('Corr') * (0.01 + H(52));

  const maxSta = roundHalfEven(
    (100 + F(14) + F(23) + H(39) + F(3) + roundHalfEven(inf('leg4')) + S('Agi') * (5 + F(26)))
    * (1 + H(28) + F(54)) * (1 - 0.03 * S('Corr'))
    * (1 + W.bbStamina * floorCap) * (1 + inf('epic3')));

  const flatBase = F(9) + F(15) + F(20) + F(32) + F(49) + roundHalfEven(inf('rare2'))
    + S('Str') * (1 + F(25)) + S('Div') * (2 + F(34)) + BASE_DAMAGE;
  const mult1 = 1 + F(51) + F(36) + S('Str') * (0.01 + F(47) + H(25)) + inf('div1');
  const mult2 = (0.06 + F(52)) * S('Corr');
  const bbDmg = 1 + W.bbDamage * floorCap;
  const enrageBonus = 0.2 + F(18);
  const damage = roundHalfEven(flatBase * (mult1 + mult2) * bbDmg);
  const enragedDamage = roundHalfEven(flatBase * (mult1 + mult2 + enrageBonus) * bbDmg);

  const armorPen = roundHalfEven(
    (F(10) + F(17) + H(36) + S('Per') * (2 + H(33)) + roundHalfEven(inf('leg3')))
    * (1 + 0.03 * S('Int') + F(29)) * (1 + inf('rare3')));

  const critChance = F(13) + 0.02 * S('Luck') + 0.01 * S('Agi') + inf('com4');
  const critInner = (1 + H(13) + F(30) + (0.03 + H(47)) * S('Str')) * (1 + inf('com1')) * (1 + inf('epic4'));
  const critDmg = round2(1.5 * critInner);
  const enragedCritDmg = round2(1.5 * (critInner + (1 + F(18))));
  const superCritChance = H(20) + F(37) + (0.02 + 0.01 * F(34)) * S('Div') + inf('epic2') + inf('com4');
  const superCritDmg = superCritChance <= 0 ? 0 : round2(2 * (1 + H(30) + F(53)) * (1 + inf('com2')));
  const ultraCritChance = H(37) + H(49) + inf('com4');
  const ultraCritDmg = ultraCritChance <= 0 ? 0 : round2(3 * (1 + F(40)) * (1 + inf('com3')));

  const expGain = round2((1 + F(4) + F(11) + F(21) + F(28) + H(51) + S('Int') * (0.05 + F(35)))
    * Math.max(1, F(45)) * W.ascBundleExp * (1 + inf('dirt2')));
  const fragGain = round2((1 + F(5) + H(21) + S('Per') * 0.04)
    * (1 + W.hestia) * (1 + W.axolotl) * (1 + W.geoduck)
    * F(42) * W.archBundle * (e.challenge14 ? 1.1 : 1) * (1 + inf('dirt3')) * (1 + inf('leg1')));

  const allMod = F(24) + F(44);
  const luckMod = 0.002 * S('Luck');
  const expModChance = H(38) + H(4) + luckMod + (0.003 + H(35)) * S('Int') + allMod + inf('div4');
  const expModGain = (3 + F(38) + H(53)) * modMulti;
  const lootModChance = H(5) + allMod + W.ascBundleLootMod + (0.003 + F(33)) * S('Per') + luckMod + inf('myth2') + inf('div4');
  const lootModGain = (2 + F(16) + F(27)) * modMulti * (1 + inf('dirt1')) * (1 + inf('rare4'));
  const speedModChance = allMod + (0.002 + H(26)) * S('Agi') + luckMod + inf('div4');
  const speedModGain = gmRound((10 + 15 * W.bbSpeed) * modMulti);
  const staModChance = H(3) + H(14) + allMod + H(40) + H(50) + luckMod + inf('myth3') + inf('div4');
  const staModGain = roundHalfEven((3 + F(43) + H(23) + roundHalfEven(inf('div3'))) * modMulti);

  const div = (0.02 + 0.01 * F(34)) * S('Div');
  const cdMult = 1 + W.archCard;
  const abilities = upgradeLevel(profile, 8);

  return {
    maxSta, damage, enragedDamage, armorPen,
    critChance, critDmg, enragedCritDmg, superCritChance, superCritDmg, ultraCritChance, ultraCritDmg,
    expGain, fragGain,
    expModChance, expModGain, lootModChance, lootModGain,
    speedModChance, speedModGain, staModChance, staModGain,
    gleamChance: asc2 ? F(19) + inf('myth1') + inf('div2') : 0,
    gleamMulti: asc2 ? (3 + F(46)) * (1 + inf('dirt4')) : 1,
    abilityInsta: W.avadaInsta + F(39) + F(50) + inf('myth4'),
    autoTap: W.ascBundleAutoTap + H(48) + H(54) + div + inf('rare1'),
    goldChance: W.ascBundleGold + F(48) + 0.005 * S('Luck') + inf('leg2'),
    goldMult: round2(3 * (1 + inf('epic1'))),
    enrage: abilities >= 1 && {
      charges: 5 + W.avadaDuration,
      cooldown: Math.ceil(-1e-9 + (60 + H(18) + H(29) + H(32) + W.avadaCooldown) * cdMult),
    },
    flurry: abilities >= 2 && {
      duration: 5 + W.avadaDuration,
      cooldown: Math.ceil(-1e-9 + (120 + H(22) + H(29) + H(32) + W.avadaCooldown) * cdMult),
      stamina: 5 + F(22),
    },
    quake: abilities >= 3 && {
      charges: 5 + F(31) + W.avadaDuration,
      cooldown: Math.ceil(-1e-9 + (180 + H(29) + H(31) + H(32) + W.avadaCooldown) * cdMult),
      fraction: 0.2,
    },
    atkSpeed: profile.atkSpeed || 1,
    card,
    asc1, asc2,
  };
}

// Final per-block numbers on a given floor (HP after card, XP and fragments after multipliers).
const FLOOR_STEPS = [100, 150, 200, 250, 300, 300, 350, 400, 450, 500];
export function floorScale(floor) {
  let hp = 1, armor = 1;
  for (const s of FLOOR_STEPS) {
    if (floor < s) continue;
    hp *= 2;
    if (s !== 150) armor *= 1.5; // the game skips the armor step at 150 and doubles 300
  }
  return { hp, armor };
}

export function blockOnFloor(stats, base, id, floor) {
  const c = stats.card(id);
  const sc = floorScale(floor);
  const rawExp = base.xp * stats.expGain * c.exp;
  let xp = Math.floor((rawExp + 1e-9) * 1000) / 1000;
  if (xp > 100) xp = Math.floor(xp + 1e-9);
  return {
    id,
    hp: roundHalfEven(base.hp * sc.hp * c.hp),
    armor: base.a * sc.armor,
    xp,
    frag: Math.floor((base.fa * stats.fragGain * c.loot + 1e-9) * 1000 + 0.5) / 1000,
    ft: base.ft,
  };
}
