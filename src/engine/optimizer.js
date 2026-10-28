// Skill point optimizer: coarse grid over the allowed allocations, then a
// pairwise-transfer hill climb from the best grid points with shrinking step size.

import { STATS } from './data.js';
import { computeStats, statCaps, statBudget } from './stats.js';
import { evaluateRun, expectedFloor, floorAtChance } from './model.js';

export const GOALS = {
  frags: 'Fragments per run',
  xp: 'Experience per run',
  floorChance: 'Highest floor reached with chance',
  expFloor: 'Expected highest floor',
};

// Scalar objective for a model result. Higher is better.
export function score(goal, res) {
  const per = goal.perHour ? 3600 / Math.max(1, res.time) : 1;
  switch (goal.type) {
    case 'frags': return res.frags.reduce((s, v, i) => s + v * (goal.weights ? goal.weights[i] : 1), 0) * per;
    case 'xp': return res.xp * per;
    case 'expFloor': return expectedFloor(res.reach);
    default: return floorAtChance(res.reach, goal.chance ?? 0.05).score;
  }
}

export function summarize(goal, res) {
  const q = goal.chance ?? 0.05;
  return {
    xp: res.xp,
    frags: res.frags,
    time: res.time,
    hits: res.hits,
    expFloor: expectedFloor(res.reach),
    floorAtChance: floorAtChance(res.reach, q).floor,
    median: floorAtChance(res.reach, 0.5).floor,
    reach: res.reach,
    capped: res.capped,
  };
}

export function evaluateAlloc(profile, alloc, goal, fast) {
  const st = computeStats(profile, alloc);
  const res = evaluateRun(st, profile.asc, { fast });
  return { score: score(goal, res), res, st };
}

// Dimensions the optimizer may move points between, with bounds.
export function searchSpace(profile, limits = {}) {
  const caps = statCaps(profile);
  const B = statBudget(profile);
  const dims = [];
  for (const s of STATS) {
    if (caps[s] <= 0) continue;
    const l = limits[s] || {};
    const lo = Math.max(0, Math.min(caps[s], l.min ?? 0));
    const hi = Math.max(lo, Math.min(caps[s], l.max ?? caps[s]));
    dims.push({ stat: s, lo, hi });
  }
  // Points may stay unspent (useful only if every stat is capped).
  dims.push({ stat: 'Unspent', lo: 0, hi: B });
  return { dims, budget: B };
}

const keyOf = (v) => v.join(',');
const toAlloc = (dims, v) => Object.fromEntries(dims.map((d, i) => [d.stat, v[i]]));

// All grid points with step s (plus bounds), spending the full budget.
// Returns null as soon as more than `limit` points would be produced.
function grid(dims, B, s, limit) {
  const out = [];
  let over = false;
  const n = dims.length - 1; // last dim is Unspent
  const v = new Array(dims.length).fill(0);
  const n0 = dims.slice(0, n);
  const rec = (i, left) => {
    if (over) return;
    if (i === n) {
      if (left > dims[n].hi) return;
      // Leaving points unspent only makes sense when nothing else can take them.
      if (left >= s && !n0.every((d, k) => v[k] === d.hi)) return;
      v[n] = left;
      out.push(v.slice());
      if (out.length > limit) over = true;
      return;
    }
    const { lo, hi } = dims[i];
    const vals = new Set([lo, Math.min(hi, left)]);
    for (let x = Math.ceil(lo / s) * s; x <= Math.min(hi, left); x += s) vals.add(x);
    for (const x of vals) {
      if (x > left) continue;
      v[i] = x;
      rec(i + 1, left - x);
    }
  };
  rec(0, B);
  return over ? null : out;
}

/**
 * evalBatch(allocs[]) -> Promise<number[]> scores (allows parallel workers).
 * onProgress({ phase, done, best }) is called as the search advances.
 */
export async function optimize({ profile, limits, start, evalBatch, onProgress = () => {}, topK = 3 }) {
  const { dims, budget: B } = searchSpace(profile, limits);
  const minSum = dims.reduce((s, d) => s + d.lo, 0);
  if (minSum > B) throw new Error(`Minimum limits need ${minSum} points but only ${B} are available.`);

  const cache = new Map();
  let evals = 0;
  const run = async (vs) => {
    const todo = vs.filter((v) => !cache.has(keyOf(v)));
    const uniq = [...new Map(todo.map((v) => [keyOf(v), v])).values()];
    if (uniq.length) {
      const scores = await evalBatch(uniq.map((v) => toAlloc(dims, v)));
      uniq.forEach((v, i) => cache.set(keyOf(v), scores[i]));
      evals += uniq.length;
    }
    return vs.map((v) => cache.get(keyOf(v)));
  };
  const best = () => [...cache.entries()].sort((a, b) => b[1] - a[1])[0];

  // Phase 1: coarse grid with a step that keeps it to a few hundred points.
  let step = 1, pts;
  while (!(pts = grid(dims, B, step, 400))) step++;
  const seeds = [];
  if (start) {
    const v = dims.map((d) => Math.min(d.hi, Math.max(d.lo, start[d.stat] || 0)));
    const used = v.slice(0, -1).reduce((a, b) => a + b, 0);
    v[v.length - 1] = 0;
    if (used <= B) {
      // Put leftover points into the first stat with room, else leave unspent.
      let left = B - used;
      for (let i = 0; i < v.length - 1 && left > 0; i++) {
        const add = Math.min(left, dims[i].hi - v[i]);
        v[i] += add; left -= add;
      }
      v[v.length - 1] = left;
      seeds.push(v);
    }
  }
  const scores = await run([...seeds, ...pts]);
  onProgress({ phase: 'grid', evals, best: best() });

  // Phase 2: hill climb from the best distinct grid points.
  const ranked = [...seeds, ...pts].map((v, i) => [v, scores[i]]).sort((a, b) => b[1] - a[1]);
  const starts = [];
  for (const [v] of ranked) {
    if (starts.length >= topK) break;
    if (starts.some((u) => u.reduce((s, x, i) => s + Math.abs(x - v[i]), 0) < 2 * step)) continue;
    starts.push(v);
  }
  const results = [];
  for (const s0 of starts) {
    let cur = s0, curScore = cache.get(keyOf(s0));
    for (let d = Math.max(1, Math.ceil(step / 2)); d >= 1; d = d === 1 ? 0 : Math.max(1, Math.floor(d / 2))) {
      for (;;) {
        const moves = [];
        for (let i = 0; i < dims.length; i++) {
          for (let j = 0; j < dims.length; j++) {
            if (i === j) continue;
            const amt = Math.min(d, cur[i] - dims[i].lo, dims[j].hi - cur[j]);
            if (amt <= 0) continue;
            const v = cur.slice();
            v[i] -= amt; v[j] += amt;
            moves.push(v);
          }
        }
        const ms = await run(moves);
        let bi = -1;
        ms.forEach((sc, k) => { if (sc > curScore + 1e-9 && (bi < 0 || sc > ms[bi])) bi = k; });
        onProgress({ phase: 'climb', evals, best: best() });
        if (bi < 0) break;
        cur = moves[bi]; curScore = ms[bi];
      }
    }
    results.push([cur, curScore]);
  }

  const seen = new Set();
  const top = [...cache.entries()].sort((a, b) => b[1] - a[1])
    .filter(([k]) => (seen.has(k) ? false : seen.add(k)))
    .slice(0, 8)
    .map(([k, sc]) => ({ alloc: toAlloc(dims, k.split(',').map(Number)), score: sc }));
  return { top, evals, dims: dims.map((d) => d.stat) };
}
