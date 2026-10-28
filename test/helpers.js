import fs from 'node:fs';
import path from 'node:path';
import { defaultProfile } from '../src/engine/data.js';

export const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');

export function bitsToFloat(bits) {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setBigUint64(0, BigInt(bits));
  return buf.getFloat64(0);
}

export function loadFixtures(kind) {
  const dir = path.join(FIXTURES, kind);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// Converts the reference engine's player state into our profile + allocation.
export function profileFromEngineState(es) {
  const p = defaultProfile();
  p.asc = es.asc2_unlocked ? 2 : es.asc1_unlocked ? 1 : 0;
  p.archLevel = es.arch_level;
  p.highestFloor = es.current_max_floor;
  for (const [k, v] of Object.entries(es.upgrade_levels)) p.upgrades[k] = v;
  const x = es.external_levels || {};
  const g = (r) => x[r] || 0;
  Object.assign(p.ext, {
    hestia: g(4), axolotl: g(5), geoduck: g(8), avada: g(9) === 1, blockBonker: g(12) === 1,
    archBundle: g(15) === 1, ascBundle: g(16) === 1, archCard: g(20),
    archCardInfernal: -(es.arch_ability_infernal_bonus || 0) * 100,
    hades: es.hades_idol_level || g(21), lynx: g(22), kromak: g(23) === 1, kromakGilded: g(24),
    wq22: g(25) === 1, challenge14: g(26) === 1, challenge17: g(27) === 1,
    totalInfernalCards: es.total_infernal_cards || 0,
  });
  Object.assign(p.cards, es.cards || {});
  return { profile: p, alloc: { ...es.base_stats } };
}
