// Analytic run model.
//
// A run walks floors slot by slot until stamina runs out. For every block type we
// compute the exact first three moments of "hits needed to break it" from the
// crit distribution (renewal recursion over remaining HP). Per slot we mix those
// over the spawn probabilities, add stamina refunds from mods, and accumulate the
// cumulants of total stamina spent. The probability that the run is still alive
// after a given slot is P(spent <= max stamina), evaluated with an Edgeworth
// (skew-corrected normal) approximation. Expected rewards are each block's
// rewards times the probability it gets broken.
//
// Time-based effects (Enrage, Flurry, Quake, crosshair auto-taps, speed mods)
// enter as their long-run average rate per hit.

import { BLOCKS, PATH_ORDER, CROSSHAIR_INTERVAL } from './data.js';
import { blockOnFloor, floorScale } from './stats.js';
import { floorSlots } from './floors.js';

const GRID = 2000; // max table length for the hit-count recursion
const MIN_P = 1e-7;

function normCdf(z) {
  // Abramowitz-Stegun 7.1.26 via erf, accurate to ~1e-7.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
const normPdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);

// P(X <= x) for X with cumulants k1, k2, k3.
function cdf(x, k1, k2, k3) {
  if (k2 <= 1e-12) return x >= k1 ? 1 : 0;
  const s = Math.sqrt(k2);
  const z = (x - k1) / s;
  const g = k3 / (k2 * s);
  const v = normCdf(z) - normPdf(z) * (g / 6) * (z * z - 1);
  return Math.min(1, Math.max(0, v));
}

// Crit outcome table: probabilities and multipliers (normal and enraged).
function critTable(st) {
  const c = Math.min(1, Math.max(0, st.critChance));
  const s = Math.min(1, Math.max(0, st.superCritChance));
  const u = Math.min(1, Math.max(0, st.ultraCritChance));
  const p = [1 - c, c * (1 - s), c * s * (1 - u), c * s * u];
  const m = (base) => [1, base, base * st.superCritDmg, base * st.superCritDmg * st.ultraCritDmg];
  return { p, m: m(st.critDmg), mE: m(st.enragedCritDmg) };
}

// Average per-hit rates of the time-based effects, given the share of hits under speed mods.
function rates(st, speedShare) {
  const insta = Math.min(0.99, Math.max(0, st.abilityInsta));
  const perSec = (a, amount) => (a ? amount / ((1 - insta) * Math.max(1, a.cooldown)) : 0);
  const flurryTime = st.flurry ? Math.min(1, perSec(st.flurry, st.flurry.duration)) : 0;
  const hitsPerSec = (st.atkSpeed || 1) / (1 - 0.5 * speedShare) * (1 + flurryTime);
  const tau = 1 / hitsPerSec;
  return {
    tau,
    enrage: Math.min(1, perSec(st.enrage, st.enrage && st.enrage.charges) * tau),
    // Quake charges are spent on consecutive hits: a window of `quakeWindow` hits
    // opens once every `quakeCycle` hits.
    quakeWindow: st.quake ? st.quake.charges / (1 - insta) : 0,
    quakeCycle: st.quake ? Math.max(1, st.quake.cooldown) / tau : Infinity,
    flurrySta: perSec(st.flurry, st.flurry && st.flurry.stamina) * tau,
    crosshairs: tau / CROSSHAIR_INTERVAL,
  };
}

// Distribution of the number of Quake procs among the first `h` hits of a floor,
// with the Quake window starting at a uniformly random point of its cycle.
// Returns [[procs, prob], ...] with at most ~16 distinct values.
function quakeProcs(h, win, cycle) {
  if (win <= 0 || h <= 0) return [[0, 1]];
  if (win >= cycle) return [[h, 1]];
  // Every full cycle contributes exactly one window; only the remainder is random.
  const full = Math.floor(h / cycle), r = h - full * cycle;
  const n = Math.min(400, Math.ceil(cycle));
  const step = cycle / n;
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * step;
    let q = full * win;
    for (let k = -1; k <= 1; k++) {
      const a = Math.max(0, s + k * cycle), b = Math.min(r, s + k * cycle + win);
      if (b > a) q += b - a;
    }
    const key = Math.round(q * 4) / 4;
    counts.set(key, (counts.get(key) || 0) + 1 / n);
  }
  return [...counts.entries()];
}

// Damage model against one armor value: per-hit damage outcomes (melee plus a
// possible crosshair auto-tap landing during that hit) and expected Quake damage.
function damageProfile(st, ct, rt, armor) {
  const effA = Math.max(0, armor - st.armorPen);
  const fE = rt.enrage;
  const g = Math.min(1, st.goldChance);
  const tap = Math.min(1, rt.crosshairs * Math.min(1, st.autoTap));
  const steps = []; // [damage, prob]
  let quake = 0;
  for (const [D, mult, w] of [[st.damage, ct.m, 1 - fE], [st.enragedDamage, ct.mE, fE]]) {
    if (w <= 0) continue;
    let tapDmg = (1 - g) * Math.max(1, D - effA);
    for (let k = 0; k < 4; k++) tapDmg += g * ct.p[k] * Math.max(1, (D - effA) * st.goldMult * mult[k]);
    for (let k = 0; k < 4; k++) {
      const pk = ct.p[k] * w;
      if (pk <= 0) continue;
      const d = Math.max(1, (D - effA) * mult[k]);
      steps.push([d, pk * (1 - tap)]);
      if (tap > 0) steps.push([d + tapDmg, pk * tap]);
      quake += pk * Math.max(1, (D * 0.2 - effA) * mult[k]);
    }
  }
  return { steps, quake };
}

// Moments of N(h) = hits needed to deal h damage, for all h up to hpMax.
function hitTable(steps, hpMax, grid = GRID) {
  let mu = 0, m2 = 0, dmin = Infinity;
  for (const [d, p] of steps) { mu += p * d; m2 += p * d * d; dmin = Math.min(dmin, d); }
  const delta = Math.max(hpMax / grid, dmin / 16);
  if (delta > dmin) {
    // Too many hits for the table: renewal-theory asymptotics.
    let c3 = 0;
    for (const [d, p] of steps) c3 += p * (d - mu) ** 3;
    const v = m2 - mu * mu;
    return {
      at(h, out) {
        if (h <= 0) { out[0] = out[1] = out[2] = 0; return; }
        const k1 = h / mu + m2 / (2 * mu * mu) - 0.5;
        const k2 = Math.max(0, h * v / mu ** 3);
        const k3 = h * (3 * v * v / mu ** 5 - c3 / mu ** 4);
        out[0] = k1; out[1] = k2 + k1 * k1; out[2] = k3 + 3 * k1 * k2 + k1 ** 3;
      },
    };
  }
  const n = Math.ceil(hpMax / delta) + 1;
  const u1 = new Float64Array(n), u2 = new Float64Array(n), u3 = new Float64Array(n);
  const sd = steps.map(([d, p]) => [Math.max(1, Math.round(d / delta)), p]);
  for (let i = 1; i < n; i++) {
    let a = 1, b = 1, c = 1;
    for (const [s, p] of sd) {
      const j = i - s;
      if (j <= 0) continue;
      const x1 = u1[j], x2 = u2[j], x3 = u3[j];
      a += p * x1;
      b += p * (2 * x1 + x2);
      c += p * (3 * x1 + 3 * x2 + x3);
    }
    u1[i] = a; u2[i] = b; u3[i] = c;
  }
  return {
    at(h, out) {
      if (h <= 0) { out[0] = out[1] = out[2] = 0; return; }
      const i = Math.min(n - 1, Math.ceil(h / delta - 1e-9));
      out[0] = u1[i]; out[1] = u2[i]; out[2] = u3[i];
    },
  };
}

/**
 * Evaluate a stat sheet over one run.
 * Returns expected rewards plus reach[f] = P(run reaches floor f).
 */
export function evaluateRun(st, asc, opts = {}) {
  const maxFloor = opts.maxFloor || 1000;
  const ct = critTable(st);
  const speedPerKill = Math.min(1, st.speedModChance) * st.speedModGain;
  const needsSpeed = speedPerKill > 0 && (st.enrage || st.flurry || st.quake || st.autoTap > 0);
  let speedShare = 0;
  let res;
  for (let pass = 0; pass < (needsSpeed ? 2 : 1); pass++) {
    res = runOnce(st, asc, ct, rates(st, speedShare), maxFloor, opts);
    speedShare = Math.min(1, speedPerKill * res.kills / Math.max(1, res.hits));
  }
  return res;
}

// Discretizes a distribution with cumulants (k1, k2, k3) onto integer offsets,
// preserving the mean exactly. Returns { lo, w } with w[i] = P(offset = lo + i).
function kernel(k1, k2, k3, range) {
  const s = Math.sqrt(Math.max(0, k2));
  if (s < 0.05) {
    const lo = Math.floor(k1), fr = k1 - lo;
    return { lo, w: [1 - fr, fr] };
  }
  // Offsets beyond +-range all mean the same thing (dead / back at the cap),
  // so the tails are lumped into the end bins.
  const lo = Math.max(-range - 1, Math.floor(k1 - 6 * s) - 1);
  const hi = Math.min(range + 1, Math.ceil(k1 + 6 * s) + 1);
  const clipped = lo === -range - 1 || hi === range + 1;
  const w = [];
  let prev = 0, tot = 0, mean = 0;
  for (let j = lo; j <= hi; j++) {
    const c = j === hi ? 1 : Math.max(prev, cdf(j + 0.5, k1, k2, k3));
    w.push(c - prev);
    tot += c - prev;
    mean += (c - prev) * j;
    prev = c;
  }
  for (let i = 0; i < w.length; i++) w[i] /= tot;
  // Shift a fraction of the mass by one step to restore the exact mean.
  const d = k1 - mean / tot;
  if (!clipped && Math.abs(d) > 1e-12) {
    const out = new Array(w.length + 1).fill(0);
    const a = Math.min(1, Math.abs(d));
    for (let i = 0; i < w.length; i++) {
      if (d > 0) { out[i] += w[i] * (1 - a); out[i + 1] += w[i] * a; } else { out[i + 1] += w[i] * (1 - a); out[i] += w[i] * a; }
    }
    return { lo: d > 0 ? lo : lo - 1, w: out };
  }
  return { lo, w };
}

function runOnce(st, asc, ct, rt, maxFloor, opts) {
  const trace = opts.trace;
  const fast = !!opts.fast;
  const staCh = Math.min(1, st.staModChance), G = st.staModGain;
  const r1 = staCh * G, r2 = staCh * G * G, r3 = staCh * G ** 3;
  const a = 1 - rt.flurrySta;
  const expFactor = 1 + Math.min(1, st.expModChance) * (st.expModGain - 1);
  const lootFactor = 1 + Math.min(1, st.lootModChance) * (st.lootModGain - 1);
  const gleam = 1 + Math.min(1, st.gleamChance) * (st.gleamMulti - 1);

  // Stamina is tracked as a distribution over buckets of width `unit`, capped at
  // max stamina between floors (refills above the cap are lost, as in the game).
  const S = st.maxSta;
  const B = Math.min(S, fast ? 120 : 250);
  const unit = S / B;
  let pmf = new Float64Array(B + 1);
  pmf[B] = 1;
  let lowB = B; // lowest bucket holding mass

  // Per (block id, floor scale) cache of block numbers, damage profile and hit table.
  const groups = new Map();
  const group = (id, floor) => {
    const sc = floorScale(floor);
    const key = `${id}@${sc.hp}/${sc.armor}`;
    let g = groups.get(key);
    if (!g) {
      const b = blockOnFloor(st, BLOCKS[id], id, floor);
      const dp = damageProfile(st, ct, rt, b.armor);
      g = { b, quake: dp.quake, table: hitTable(dp.steps, b.hp, fast ? 500 : GRID) };
      groups.set(key, g);
    }
    return g;
  };

  // P(stamina - cost > 0) where cost has cumulants (k1, k2, k3) from floor start.
  // Only buckets within a few sd of the cost need the CDF; the rest are 0 or 1.
  let prefix = new Float64Array(B + 2); // prefix[b] = mass in buckets b..B
  const setPrefix = () => {
    prefix = new Float64Array(B + 2);
    for (let b = B; b >= 1; b--) prefix[b] = prefix[b + 1] + pmf[b];
  };
  setPrefix();
  const survive = (k1, k2, k3) => {
    const sd = Math.sqrt(Math.max(0, k2));
    const lo = Math.max(1, Math.floor((k1 - 9 * sd - 1) / unit));
    const hi = Math.min(B, Math.ceil((k1 + 9 * sd + 1) / unit));
    if (lo > B) return 0;
    let p = prefix[hi + 1];
    for (let b = lo; b <= hi; b++) {
      const m = pmf[b];
      if (m < 1e-14) continue;
      p += m * cdf(b * unit + 0.5, k1, k2, k3);
    }
    return p;
  };
  const mom = new Float64Array(3);
  const quakeCache = new Map();
  const quakeAt = (h) => {
    const q = h < 64 ? 0.25 : h / 256; // relative precision for long floors
    const key = Math.round(h / q) * q;
    let v = quakeCache.get(key);
    if (!v) { v = quakeProcs(key, rt.quakeWindow, rt.quakeCycle); quakeCache.set(key, v); }
    return v;
  };

  const reach = [1, 1]; // reach[f] = P(run reaches floor f)
  const frags = [0, 0, 0, 0, 0, 0, 0];
  let xp = 0, hits = 0, kills = 0, time = 0, blocks = 0;
  let capped = false;

  // Per-slot cost cumulants only depend on the floor's layout table and scaling,
  // so floors sharing both are computed once.
  const floorCache = new Map();
  const floorPlan = (f) => {
    const slots = floorSlots(f, asc);
    const sc = floorScale(f);
    const key = slots.key + sc.hp + '/' + sc.armor;
    let plan = floorCache.get(key);
    if (plan) return plan;
    plan = [];
    let floorHits = 0, K1 = 0, K2 = 0, K3 = 0;
    for (const idx of PATH_ORDER) {
      const slot = slots[idx];
      if (slot.empty >= 1) continue;
      let e1 = 0, e2 = 0, e3 = 0, slotHits = 0, sxp = 0;
      const sfrag = [0, 0, 0, 0, 0, 0, 0];
      const qd = quakeAt(floorHits);
      for (const { id, p } of slot.blocks) {
        const g = group(id, f);
        let m1 = 0, m2 = 0, m3 = 0;
        for (let i = 0; i < qd.length; i++) {
          const pq = qd[i][1];
          g.table.at(g.b.hp - qd[i][0] * g.quake, mom);
          m1 += pq * mom[0]; m2 += pq * mom[1]; m3 += pq * mom[2];
        }
        e1 += p * (a * m1 - r1);
        e2 += p * (a * a * m2 - 2 * a * m1 * r1 + r2);
        e3 += p * (a ** 3 * m3 - 3 * a * a * m2 * r1 + 3 * a * m1 * r2 - r3);
        slotHits += p * m1;
        sxp += p * g.b.xp;
        sfrag[g.b.ft] += p * g.b.frag;
      }
      K1 += e1;
      K2 += Math.max(0, e2 - e1 * e1);
      K3 += e3 - 3 * e1 * e2 + 2 * e1 ** 3;
      floorHits += slotHits;
      plan.push({ K1, K2, K3, slotHits, xp: sxp, frag: sfrag, filled: 1 - slot.empty });
    }
    floorCache.set(key, plan);
    return plan;
  };

  for (let f = 1; f <= maxFloor; f++) {
    const plan = floorPlan(f);
    let alive = reach[f];
    for (const sl of plan) {
      // The stamina refill from a mod arrives after the kill, so the block
      // is broken if stamina covers its cost before that refill.
      const killed = Math.min(alive, survive(sl.K1 + r1, sl.K2, sl.K3));
      const w = killed * gleam;
      xp += w * sl.xp * expFactor;
      for (let t = 0; t < 7; t++) frags[t] += w * sl.frag[t] * lootFactor;
      kills += sl.filled * killed;
      blocks += sl.filled * killed;
      hits += sl.slotHits * alive;
      time += sl.slotHits * alive * rt.tau;
      alive = killed;
    }
    const last = plan[plan.length - 1] || { K1: 0, K2: 0, K3: 0, slotHits: 0 };
    const K1 = last.K1, K2 = last.K2, K3 = last.K3;
    const floorHits = plan.reduce((x, sl) => x + sl.slotHits, 0);

    if (trace) trace[f] = { cost: K1, sd: Math.sqrt(K2), hits: floorHits };
    // Move the stamina distribution through the floor.
    const kr = kernel(K1 / unit, K2 / (unit * unit), K3 / unit ** 3, B);
    const next = new Float64Array(B + 1);
    for (let b = lowB; b <= B; b++) {
      const m = pmf[b];
      if (m < 1e-14) continue;
      for (let i = 0; i < kr.w.length; i++) {
        const nb = b - (kr.lo + i);
        if (nb <= 0) continue;
        next[nb > B ? B : nb] += m * kr.w[i];
      }
    }
    lowB = 1;
    while (lowB <= B && next[lowB] < 1e-14) lowB++;
    pmf = next;
    setPrefix();
    let mass = 0;
    for (let b = 1; b <= B; b++) mass += pmf[b];
    const done = Math.min(reach[f], mass);
    reach[f + 1] = done;
    if (done < MIN_P) break;
    if (f === maxFloor) capped = true;
  }
  return { reach, xp, frags, hits, kills, time, blocks, capped, rates: rt };
}

// Expected highest floor = sum over f >= 1 of P(reach f).
export function expectedFloor(reach) {
  let s = 0;
  for (let f = 1; f < reach.length; f++) s += reach[f];
  return s;
}

// Highest floor reached with probability >= q, with a fractional part that
// interpolates toward the next floor (keeps the optimizer's objective smooth).
export function floorAtChance(reach, q) {
  let F = 1;
  while (F + 1 < reach.length && reach[F + 1] >= q) F++;
  const pF = reach[F], pN = reach[F + 1] || 0;
  const frac = pF > pN ? Math.min(0.999, Math.max(0, (pF - q) / (pF - pN))) : 0;
  return { floor: F, score: F + frac };
}
