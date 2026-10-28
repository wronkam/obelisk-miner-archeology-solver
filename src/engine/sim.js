// Hit-by-hit Monte Carlo simulator, a direct port of the reference combat loop.
// Used to cross-check the analytic model.

import { BLOCKS, PATH_ORDER, CROSSHAIR_INTERVAL } from './data.js';
import { blockOnFloor } from './stats.js';
import { rollFloor } from './floors.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateRun(st, asc, rng, maxFloor = 1000, trace = null) {
  const blockCache = new Map();
  const blockAt = (id, f) => {
    const key = `${id}@${f}`;
    let b = blockCache.get(key);
    if (!b) { b = blockOnFloor(st, BLOCKS[id], id, f); blockCache.set(key, b); }
    return b;
  };
  const roll = (c) => {
    if (rng() < st.critChance) {
      const base = c ? st.enragedCritDmg : st.critDmg;
      if (rng() < st.superCritChance) {
        if (rng() < st.ultraCritChance) return base * st.superCritDmg * st.ultraCritDmg;
        return base * st.superCritDmg;
      }
      return base;
    }
    return 1;
  };

  let stamina = st.maxSta, speedPool = 0, crossTimer = 0, time = 0;
  let xp = 0, hits = 0, kills = 0;
  const frags = [0, 0, 0, 0, 0, 0, 0];
  const insta = st.abilityInsta;
  const sk = {
    eCd: 0, eCh: 0, fCd: 0, fT: 0, qCd: 0, qCh: 0,
  };
  const tick = (dt) => {
    let staGain = 0;
    if (sk.eCd > 0) sk.eCd -= dt;
    if (sk.fCd > 0) sk.fCd -= dt;
    if (sk.qCd > 0) sk.qCd -= dt;
    if (sk.fT > 0) sk.fT = Math.max(0, sk.fT - dt);
    const cast = (a, cdKey, fn) => {
      let chain = 0;
      while (sk[cdKey] <= 0 && chain < 100) {
        fn();
        sk[cdKey] = a.cooldown;
        if (rng() < insta) { sk[cdKey] = 0; chain++; } else break;
      }
    };
    if (st.enrage) cast(st.enrage, 'eCd', () => { sk.eCh += st.enrage.charges; });
    if (st.flurry) cast(st.flurry, 'fCd', () => { sk.fT += st.flurry.duration; staGain += st.flurry.stamina; });
    if (st.quake) cast(st.quake, 'qCd', () => { sk.qCh += st.quake.charges; });
    return staGain;
  };

  let floor = 1;
  for (; floor <= maxFloor && stamina > 0; floor++) {
    const staStart = stamina, hitsStart = hits;
    const ids = rollFloor(floor, asc, rng);
    const gleam = rng() < st.gleamChance ? st.gleamMulti : 1;
    const grid = ids.map((id) => {
      if (!id) return null;
      const b = blockAt(id, floor);
      return {
        b, hp: b.hp,
        exp: rng() < st.expModChance ? st.expModGain : 1,
        loot: rng() < st.lootModChance ? st.lootModGain : 1,
        sta: rng() < st.staModChance ? st.staModGain : 0,
        speed: rng() < st.speedModChance,
      };
    });
    const reward = (blk) => {
      xp += blk.b.xp * blk.exp * gleam;
      frags[blk.b.ft] += blk.b.frag * blk.loot * gleam;
      if (blk.sta > 0) stamina = Math.min(st.maxSta, stamina + blk.sta);
      if (blk.speed) speedPool += st.speedModGain;
      kills++;
    };
    for (let i = 0; i < 24; i++) {
      if (stamina <= 0) break;
      const t = grid[PATH_ORDER[i]];
      if (!t || t.hp <= 0) continue;
      while (t.hp > 0 && stamina > 0) {
        const enr = sk.eCh > 0;
        const fm = sk.fT > 0 ? 2 : 1;
        let spd = fm;
        if (speedPool > 0) { spd *= 2; speedPool--; }
        const dt = 1 / (spd * (st.atkSpeed || 1));
        time += dt;
        crossTimer += dt;
        while (crossTimer >= CROSSHAIR_INTERVAL) {
          crossTimer -= CROSSHAIR_INTERVAL;
          if (rng() < st.autoTap) {
            const D = enr ? st.enragedDamage : st.damage;
            const effA = Math.max(0, t.b.armor - st.armorPen);
            const dmg = rng() < st.goldChance
              ? Math.max(1, (D - effA) * st.goldMult * roll(enr))
              : Math.max(1, D - effA);
            t.hp -= dmg;
          }
        }
        if (t.hp <= 0) break;
        const sg = tick(dt);
        if (sg > 0) stamina = Math.min(st.maxSta, stamina + sg);
        const c = roll(enr);
        const D = enr ? st.enragedDamage : st.damage;
        const effA = Math.max(0, t.b.armor - st.armorPen);
        t.hp -= Math.max(1, (D - effA) * c);
        stamina -= 1;
        hits++;
        if (sk.eCh > 0) sk.eCh--;
        if (sk.qCh > 0) {
          sk.qCh--;
          const q = D * 0.2;
          for (const j of PATH_ORDER.slice(i + 1)) {
            const o = grid[j];
            if (!o || o.hp <= 0) continue;
            const oa = Math.max(0, o.b.armor - st.armorPen);
            o.hp -= Math.max(1, (q - oa) * roll(enr));
            if (o.hp <= 0) reward(o);
          }
        }
      }
      if (t.hp <= 0) reward(t);
    }
    if (stamina <= 0) break;
    if (trace) {
      const t = trace[floor] || (trace[floor] = { n: 0, cost: 0, hits: 0 });
      t.n++; t.cost += staStart - stamina; t.hits += hits - hitsStart;
    }
  }
  return { floor: Math.min(floor, maxFloor), xp, frags, hits, kills, time };
}

// Runs n simulations; returns averages and reach[f] = share of runs reaching floor f.
export function simulate(st, asc, n, seed = 1, maxFloor = 1000) {
  const rng = mulberry32(seed);
  const counts = [];
  const frags = [0, 0, 0, 0, 0, 0, 0];
  let xp = 0, floorSum = 0, time = 0, hits = 0;
  for (let r = 0; r < n; r++) {
    const res = simulateRun(st, asc, rng, maxFloor);
    counts[res.floor] = (counts[res.floor] || 0) + 1;
    xp += res.xp; floorSum += res.floor; time += res.time; hits += res.hits;
    res.frags.forEach((v, i) => { frags[i] += v; });
  }
  const top = counts.length;
  const reach = Array(top + 1).fill(0);
  let acc = 0;
  for (let f = top - 1; f >= 1; f--) { acc += counts[f] || 0; reach[f] = acc / n; }
  reach[0] = 1;
  return {
    n, reach, expFloor: floorSum / n, xp: xp / n, time: time / n, hits: hits / n,
    frags: frags.map((v) => v / n),
  };
}
