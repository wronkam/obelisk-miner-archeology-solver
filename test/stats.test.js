import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, blockOnFloor } from '../src/engine/stats.js';
import { BLOCKS } from '../src/engine/data.js';
import { loadFixtures, bitsToFloat, profileFromEngineState } from './helpers.js';

// Reference engine property -> our stat (or a function of our stats).
const MAP = {
  max_sta: (s) => s.maxSta,
  damage: (s) => s.damage,
  enraged_damage: (s) => s.enragedDamage,
  armor_pen: (s) => s.armorPen,
  crit_chance: (s) => s.critChance,
  crit_dmg_mult: (s) => s.critDmg,
  enraged_crit_dmg_mult: (s) => s.enragedCritDmg,
  super_crit_chance: (s) => s.superCritChance,
  super_crit_dmg_mult: (s) => s.superCritDmg,
  ultra_crit_chance: (s) => s.ultraCritChance,
  ultra_crit_dmg_mult: (s) => s.ultraCritDmg,
  ability_insta_charge: (s) => s.abilityInsta,
  crosshair_auto_tap: (s) => s.autoTap,
  gold_crosshair_chance: (s) => s.goldChance,
  gold_crosshair_mult: (s) => s.goldMult,
  exp_gain_mult: (s) => s.expGain,
  frag_loot_gain_mult: (s) => s.fragGain,
  exp_mod_chance: (s) => s.expModChance,
  exp_mod_gain: (s) => s.expModGain,
  loot_mod_chance: (s) => s.lootModChance,
  loot_mod_gain: (s) => s.lootModGain,
  speed_mod_chance: (s) => s.speedModChance,
  speed_mod_gain: (s) => s.speedModGain,
  stamina_mod_chance: (s) => s.staModChance,
  stamina_mod_gain: (s) => s.staModGain,
  gleaming_floor_chance: (s) => s.gleamChance,
  gleaming_floor_multi: (s) => s.gleamMulti,
  enrage_charges: (s) => s.enrage && s.enrage.charges,
  enrage_cooldown: (s) => s.enrage && s.enrage.cooldown,
  flurry_duration: (s) => s.flurry && s.flurry.duration,
  flurry_cooldown: (s) => s.flurry && s.flurry.cooldown,
  flurry_sta_on_cast: (s) => s.flurry && s.flurry.stamina,
  quake_attacks: (s) => s.quake && s.quake.charges,
  quake_cooldown: (s) => s.quake && s.quake.cooldown,
};

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

for (const fx of loadFixtures('player_props')) {
  test(`player stats match reference: ${fx.save_name}`, () => {
    const { profile, alloc } = profileFromEngineState(fx.engine_state);
    const st = computeStats(profile, alloc);
    for (const [k, fn] of Object.entries(MAP)) {
      const ours = fn(st);
      if (ours === false) continue; // ability not unlocked in this save
      const want = bitsToFloat(fx.properties_bits[k]);
      assert.ok(close(ours, want), `${k}: got ${ours}, want ${want}`);
    }
  });
}

for (const fx of loadFixtures('block_props')) {
  test(`block stats match reference: ${fx.save_name}`, () => {
    const es = loadFixtures('player_props').find((p) => p.save_name === fx.save_name).engine_state;
    const { profile, alloc } = profileFromEngineState(es);
    const st = computeStats(profile, alloc);
    assert.ok(close(st.expGain, bitsToFloat(fx.p_exp_mult_bits)));
    assert.ok(close(st.fragGain, bitsToFloat(fx.p_frag_mult_bits)));
    for (const b of fx.blocks) {
      const ours = blockOnFloor(st, BLOCKS[b.block_id], b.block_id, b.floor);
      for (const [k, bits] of [['hp', b.hp_bits], ['armor', b.armor_bits], ['xp', b.xp_bits], ['frag', b.frag_amt_bits]]) {
        const want = bitsToFloat(bits);
        assert.ok(close(ours[k], want), `${b.block_id}@${b.floor} ${k}: got ${ours[k]}, want ${want}`);
      }
    }
  });
}
