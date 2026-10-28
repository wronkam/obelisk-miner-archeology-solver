// Web worker: evaluates batches of allocations or runs Monte Carlo checks.
/* global Engine */
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'eval') {
    const scores = m.allocs.map((a) => Engine.evaluateAlloc(m.profile, a, m.goal, m.fast).score);
    self.postMessage({ id: m.id, scores });
  } else if (m.type === 'sim') {
    const st = Engine.computeStats(m.profile, m.alloc);
    const res = Engine.simulate(st, m.profile.asc, m.runs, m.seed);
    self.postMessage({ id: m.id, res });
  }
};
