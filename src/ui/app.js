// Page logic. Engine (global) is the bundled src/engine modules.
/* global Engine */
(() => {
  const E = Engine;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'archaeology-point-planner-v1';
  const FRAG_VARS = ['', '--frag-1', '--frag-2', '--frag-3', '--frag-4', '--frag-5', '--frag-6'];
  const CARD_LEVELS = ['None', 'Card', 'Gilded', 'Polychrome', 'Infernal'];
  const RARITY_LABEL = { dirt: 'Dirt', com: 'Common', rare: 'Rare', epic: 'Epic', leg: 'Legendary', myth: 'Mythic', div: 'Divine' };

  // ---------- state ----------
  const example = () => {
    const { profile, alloc } = E.screenshotPreset();
    return { profile, alloc, goal: { type: 'floorChance', chance: 5, weights: [0, 1, 1, 1, 1, 1, 1], perHour: false }, limits: {} };
  };
  const blank = () => ({
    profile: { ...E.defaultProfile(), atkSpeed: 1 },
    alloc: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    goal: { type: 'floorChance', chance: 5, weights: [0, 1, 1, 1, 1, 1, 1], perHour: false },
    limits: {},
  });
  const merge = (base, s) => ({
    profile: { ...base.profile, ...s.profile, upgrades: { ...base.profile.upgrades, ...(s.profile || {}).upgrades }, ext: { ...base.profile.ext, ...(s.profile || {}).ext }, cards: { ...base.profile.cards, ...(s.profile || {}).cards } },
    alloc: { ...base.alloc, ...s.alloc },
    goal: { ...base.goal, ...s.goal },
    limits: { ...s.limits },
  });
  let state;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    state = raw ? merge(blank(), JSON.parse(raw)) : example();
  } catch (_) { state = example(); }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* storage unavailable */ } };
  let last = null; // last optimization result

  const goalFor = () => ({ ...state.goal, chance: Math.min(0.99, Math.max(0.001, (state.goal.chance || 5) / 100)) });

  // ---------- formatting ----------
  const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
  const big = (v) => (v >= 1e6 ? fmt(v / 1e6, 2) + 'M' : v >= 1e4 ? fmt(v / 1e3, 1) + 'k' : fmt(v, v < 10 ? 2 : 0));
  const pct = (v) => fmt(v * 100, 2) + '%';
  const dur = (s) => (s >= 3600 ? `${fmt(s / 3600, 1)} h` : `${fmt(s / 60, 0)} min`);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && n.append(c));
    return n;
  };
  const numInput = (id, value, onChange, attrs = {}) => {
    const i = el('input', { id, type: 'number', step: '1', ...attrs });
    i.value = value ?? '';
    i.addEventListener('input', () => onChange(i.value === '' ? null : Number(i.value)));
    return i;
  };

  // ---------- setup form ----------
  function buildGoal() {
    $('goal-seg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.goal.type = b.dataset.goal; changed(); }));
    $('chance').addEventListener('input', () => { state.goal.chance = Number($('chance').value) || 5; changed(); });
    $('perhour').addEventListener('change', () => { state.goal.perHour = $('perhour').checked; changed(); });
    const w = $('weights');
    for (let t = 1; t <= 6; t++) {
      const lab = el('label', { for: `w${t}` }, el('span', {}, el('span', { class: 'frag-dot', style: `background:var(${FRAG_VARS[t]})` }), E.FRAG_NAMES[t]));
      lab.append(numInput(`w${t}`, state.goal.weights[t], (v) => { state.goal.weights[t] = v ?? 0; changed(); }, { min: '0', step: '0.1' }));
      w.append(lab);
    }
  }

  function buildBasics() {
    $('asc').addEventListener('change', () => { state.profile.asc = Number($('asc').value); changed(true); });
    for (const k of ['archLevel', 'highestFloor', 'atkSpeed']) {
      $(k).addEventListener('input', () => { state.profile[k] = Number($(k).value) || (k === 'atkSpeed' ? 1 : 1); changed(true); });
    }
    const a = $('alloc');
    for (const s of E.STATS) {
      const lab = el('label', { for: `a-${s}`, id: `al-${s}` }, E.STAT_NAMES[s]);
      lab.append(numInput(`a-${s}`, state.alloc[s], (v) => { state.alloc[s] = v ?? 0; changed(); }, { min: '0' }));
      a.append(lab);
    }
  }

  function buildUpgrades() {
    const box = $('upgrades');
    const groups = [
      ['Gem upgrades', (u) => u.gem],
      ['Fragment upgrades', (u) => !u.gem && u.asc === 0],
      ['Ascension 1 upgrades', (u) => u.asc === 1],
      ['Ascension 2 upgrades', (u) => u.asc === 2],
    ];
    for (const [title, test] of groups) {
      const list = E.UPGRADES.filter(test);
      const head = el('div', { class: 'group-head' }, el('h3', { text: title }),
        el('button', { type: 'button', class: 'btn link', text: 'Max all', onclick: () => { list.forEach((u) => { state.profile.upgrades[u.id] = u.cap; }); changed(true); } }));
      const body = el('div');
      for (const u of list) {
        const row = el('div', { class: 'upg', id: `upg-row-${u.id}` },
          el('div', {}, el('div', { class: 'name', text: u.name }), el('div', { class: 'meta', text: `max ${u.cap}${u.stage ? ` · unlocks at stage ${u.stage}` : ''}${u.asc ? ` · Ascension ${u.asc}+` : ''}` })));
        row.append(numInput(`upg-${u.id}`, state.profile.upgrades[u.id], (v) => { state.profile.upgrades[u.id] = Math.max(0, Math.min(u.cap, v ?? 0)); changed(); }, { min: '0', max: String(u.cap), 'aria-label': u.name }));
        body.append(row);
      }
      box.append(el('div', {}, head, body));
    }
  }

  const EXT = [
    ['avada', 'check', 'Avada Keda- skill (ability duration, cooldown, instacharge)'],
    ['blockBonker', 'check', 'Block Bonker skill (damage, stamina, speed mods)'],
    ['archBundle', 'check', 'Archaeology bundle (fragments x1.25)'],
    ['ascBundle', 'check', 'Ascension bundle (exp, auto-tap, loot mods, gold crosshair)'],
    ['challenge14', 'check', 'Divine Challenge 14 (fragments x1.1)'],
    ['archCard', 'num', 'Arch Ability card level (0–4)', { min: '0', max: '4' }],
    ['archCardInfernal', 'num', 'Ability card infernal cooldown reduction (%)', { min: '0', step: '0.01' }],
    ['hestia', 'num', 'Hestia idol level', { min: '0' }],
    ['axolotl', 'num', 'Axolotl pet quest rank (−1 if not unlocked)', { min: '-1', max: '11' }],
    ['geoduck', 'num', 'Geoduck tribute: mythic chests owned', { min: '0' }],
    ['hades', 'num', 'Hades idol level', { min: '0' }],
    ['lynx', 'num', 'Lynx star level', { min: '0', max: '50' }],
    ['kromak', 'check', 'Kromak statue upgraded'],
    ['kromakGilded', 'num', 'W4 statues gilded', { min: '0', max: '9' }],
    ['wq22', 'check', 'World Quest 22 done'],
    ['challenge17', 'check', 'Divine Challenge 17 done'],
    ['totalInfernalCards', 'num', 'Infernal cards outside archaeology', { min: '0' }],
  ];
  function buildExternals() {
    const checks = el('div', { class: 'stack' });
    const nums = el('div', { class: 'grid2' });
    for (const [k, kind, label, attrs] of EXT) {
      if (kind === 'check') {
        const i = el('input', { type: 'checkbox', id: `x-${k}` });
        i.addEventListener('change', () => { state.profile.ext[k] = i.checked; changed(); });
        checks.append(el('label', { class: 'check', for: `x-${k}` }, i, label));
      } else {
        const lab = el('label', { for: `x-${k}` }, label);
        lab.append(numInput(`x-${k}`, state.profile.ext[k], (v) => { state.profile.ext[k] = v ?? 0; changed(); }, attrs));
        nums.append(lab);
      }
    }
    $('externals').append(checks, nums);
  }

  function buildCards() {
    const c = $('cards');
    c.append(el('span'), ...[1, 2, 3, 4].map((t) => el('span', { class: 'h', text: `Tier ${t}` })));
    for (const r of E.RARITIES) {
      c.append(el('span', { text: RARITY_LABEL[r] }));
      for (let t = 1; t <= 4; t++) {
        const id = `${r}${t}`;
        const s = el('select', { id: `c-${id}`, 'aria-label': `${RARITY_LABEL[r]} tier ${t} card` }, CARD_LEVELS.map((n, i) => el('option', { value: String(i), text: n })));
        s.addEventListener('change', () => { state.profile.cards[id] = Number(s.value); changed(); });
        c.append(s);
      }
    }
    document.querySelectorAll('[data-cards]').forEach((b) => b.addEventListener('click', () => {
      for (const id of E.BLOCK_IDS) if (!id.endsWith('4')) state.profile.cards[id] = Number(b.dataset.cards);
      changed(true);
    }));
  }

  function buildLimits() {
    const box = $('limits');
    for (const s of E.STATS) {
      const row = el('div', { class: 'grid3', id: `lim-${s}` }, el('span', { class: 'small', text: E.STAT_NAMES[s], style: 'align-self:center' }));
      for (const side of ['min', 'max']) {
        const lab = el('label', { for: `l-${s}-${side}` }, side);
        lab.append(numInput(`l-${s}-${side}`, (state.limits[s] || {})[side], (v) => {
          state.limits[s] = { ...(state.limits[s] || {}) };
          if (v == null) delete state.limits[s][side]; else state.limits[s][side] = v;
          changed();
        }, { min: '0' }));
        row.append(lab);
      }
      box.append(row);
    }
  }

  // Write state into every control (after load/reset/bulk edits).
  function syncForm() {
    const p = state.profile;
    $('asc').value = String(p.asc);
    $('archLevel').value = p.archLevel;
    $('highestFloor').value = p.highestFloor;
    $('atkSpeed').value = p.atkSpeed || 1;
    $('chance').value = state.goal.chance;
    $('perhour').checked = !!state.goal.perHour;
    for (let t = 1; t <= 6; t++) $(`w${t}`).value = state.goal.weights[t];
    for (const s of E.STATS) $(`a-${s}`).value = state.alloc[s] || 0;
    for (const u of E.UPGRADES) $(`upg-${u.id}`).value = p.upgrades[u.id] || 0;
    for (const [k, kind] of EXT) {
      if (kind === 'check') $(`x-${k}`).checked = !!p.ext[k]; else $(`x-${k}`).value = p.ext[k] ?? 0;
    }
    for (const id of E.BLOCK_IDS) $(`c-${id}`).value = String(p.cards[id] || 0);
    for (const s of E.STATS) for (const side of ['min', 'max']) $(`l-${s}-${side}`).value = (state.limits[s] || {})[side] ?? '';
  }

  // Refresh everything derived from state that does not need the optimizer.
  function refresh() {
    const p = state.profile;
    const g = state.goal.type;
    $('goal-seg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.goal === g)));
    $('goal-floor').hidden = g !== 'floorChance';
    $('goal-frags').hidden = g !== 'frags';
    $('perhour-wrap').hidden = !(g === 'frags' || g === 'xp');

    const caps = E.statCaps(p);
    const budget = E.statBudget(p);
    const used = E.STATS.reduce((s, k) => s + (caps[k] > 0 ? state.alloc[k] || 0 : 0), 0);
    for (const s of E.STATS) {
      $(`al-${s}`).hidden = caps[s] <= 0;
      $(`a-${s}`).max = String(caps[s]);
      $(`lim-${s}`).hidden = caps[s] <= 0;
    }
    $('budget-line').textContent = `${budget} skill points to spend (level ${p.archLevel}${p.asc >= 1 ? ` + ${E.upgradeLevel(p, 12)} from upgrades` : ''}). Current points use ${used}.`;
    $('budget-line').style.color = used > budget ? 'var(--bad)' : '';

    let owned = 0;
    for (const u of E.UPGRADES) {
      const locked = p.asc < u.asc;
      $(`upg-row-${u.id}`).classList.toggle('locked', locked);
      $(`upg-${u.id}`).disabled = locked;
      if (!locked && (p.upgrades[u.id] || 0) > 0) owned++;
    }
    $('upg-count').textContent = `${owned} owned`;
    $('card-count').textContent = `${Object.values(p.cards).filter((v) => v > 0).length} of 28 owned`;

    const st = E.computeStats(p, state.alloc);
    const rows = [
      ['Max Stamina', fmt(st.maxSta)], ['Damage', fmt(st.damage)], ['Armor Penetration', fmt(st.armorPen)],
      ['Atk Speed', `${fmt(st.atkSpeed, 1)}/sec`], ['Crit Chance', pct(st.critChance)], ['Crit Damage', `${fmt(st.critDmg, 2)}x`],
      ['Super Crit Chance', pct(st.superCritChance)], ['Super Crit Damage', `${fmt(st.superCritDmg, 2)}x`],
      ['Ultra Crit Chance', pct(st.ultraCritChance)], ['Ultra Crit Damage', `${fmt(st.ultraCritDmg, 2)}x`],
      ['Ability Instacharge', pct(st.abilityInsta)], ['Crosshair Auto-Tap', pct(st.autoTap)],
      ['Gold Crosshair Chance', pct(st.goldChance)], ['Gold Crosshair Multi', `${fmt(st.goldMult, 2)}x`],
      ['Exp Gain', `${fmt(st.expGain, 2)}x`], ['Fragment Gain', `${fmt(st.fragGain, 2)}x`],
      ['Exp Mod Chance', pct(st.expModChance)], ['Exp Mod Gain', `${fmt(st.expModGain, 2)}x`],
      ['Loot Mod Chance', pct(st.lootModChance)], ['Loot Mod Gain', `${fmt(st.lootModGain, 2)}x`],
      ['Speed Mod Chance', pct(st.speedModChance)], ['Speed Mod Gain', `+${fmt(st.speedModGain)}`],
      ['Stamina Mod Chance', pct(st.staModChance)], ['Stamina Mod Gain', `+${fmt(st.staModGain)}`],
    ];
    $('statsheet').replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span', { text: k }), el('span', { text: v }))));
  }

  let dirty = false;
  function changed(resync) {
    save();
    if (resync) syncForm();
    refresh();
    if (last && !dirty) {
      dirty = true;
      $('status').textContent = 'Setup changed since the last search. Run it again to update.';
    }
  }

  // ---------- workers ----------
  let pool = [];
  let reqId = 0;
  const pending = new Map();
  function startPool() {
    try {
      const src = $('engine-src').textContent + '\n' + $('worker-src').textContent;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
      pool = Array.from({ length: n }, () => {
        const w = new Worker(url);
        w.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); cb && cb(e.data); };
        w.onerror = () => { pool = []; };
        return w;
      });
    } catch (_) { pool = []; }
  }
  const call = (w, msg) => new Promise((resolve) => { const id = ++reqId; pending.set(id, resolve); w.postMessage({ ...msg, id }); });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function evalBatch(allocs, goal) {
    if (!pool.length) {
      const out = [];
      for (let i = 0; i < allocs.length; i++) {
        out.push(E.evaluateAlloc(state.profile, allocs[i], goal, true).score);
        if (i % 4 === 3) await tick();
      }
      return out;
    }
    const size = Math.ceil(allocs.length / pool.length);
    const parts = await Promise.all(pool.map((w, i) => {
      const chunk = allocs.slice(i * size, (i + 1) * size);
      return chunk.length ? call(w, { type: 'eval', profile: state.profile, goal, allocs: chunk, fast: true }).then((r) => r.scores) : [];
    }));
    return parts.flat();
  }

  // ---------- optimize ----------
  async function run() {
    const btn = $('run');
    btn.disabled = true;
    dirty = false;
    const goal = goalFor();
    const profile = JSON.parse(JSON.stringify(state.profile));
    const t0 = performance.now();
    try {
      const r = await E.optimize({
        profile, limits: state.limits, start: state.alloc,
        evalBatch: (a) => evalBatch(a, goal),
        onProgress: ({ phase, evals }) => {
          $('bar').style.width = `${Math.min(95, phase === 'grid' ? 30 : 30 + evals / 25)}%`;
          $('status').textContent = `${phase === 'grid' ? 'Scanning the range of builds' : 'Fine-tuning'}… ${evals} builds checked`;
        },
      });
      // Re-score the finalists with the precise model.
      const finals = r.top.map((t) => ({ alloc: t.alloc, ...E.evaluateAlloc(profile, t.alloc, goal, false) }))
        .sort((a, b) => b.score - a.score);
      const cur = { alloc: state.alloc, ...E.evaluateAlloc(profile, state.alloc, goal, false) };
      last = { goal, profile, finals, cur, evals: r.evals, secs: (performance.now() - t0) / 1000, sim: null };
      $('bar').style.width = '100%';
      $('status').textContent = `Checked ${r.evals} builds in ${fmt(last.secs, 1)} s.`;
      renderResults();
    } catch (err) {
      $('status').textContent = err.message;
      $('bar').style.width = '0';
    }
    btn.disabled = false;
  }

  function mainMetric(goal, s) {
    switch (goal.type) {
      case 'frags': return { label: goal.perHour ? 'Weighted fragments / hour' : 'Weighted fragments / run', value: big(E.score(goal, s.res)) };
      case 'xp': return { label: goal.perHour ? 'Experience / hour' : 'Experience / run', value: big(E.score(goal, s.res)) };
      case 'expFloor': return { label: 'Average highest floor', value: fmt(E.expectedFloor(s.res.reach), 1) };
      default: return { label: `Floor reached in ${fmt(goal.chance * 100, 1)}% of runs`, value: fmt(E.floorAtChance(s.res.reach, goal.chance).floor) };
    }
  }

  function renderResults() {
    const { goal, profile, finals, cur } = last;
    const best = finals[0];
    const caps = E.statCaps(profile);
    const stats = E.STATS.filter((s) => caps[s] > 0);
    const sb = E.summarize(goal, best.res), sc = E.summarize(goal, cur.res);
    const main = mainMetric(goal, best), mainCur = mainMetric(goal, cur);
    const out = [];

    // Verdict: recommended points.
    const bars = stats.map((s) => {
      const v = best.alloc[s] || 0, c = cur.alloc[s] || 0;
      const d = v - c;
      return el('div', { class: 'bar' }, el('span', { text: E.STAT_NAMES[s] }),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${(100 * v) / caps[s]}%` }), el('div', { class: 'cur', style: `left:calc(${(100 * c) / caps[s]}% - 1px)`, title: `current ${c}` })),
        el('span', { class: 'val num' }, `${v}`, el('span', { class: `small delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`, text: d ? ` ${d > 0 ? '+' : ''}${d}` : '' })));
    });
    const unspent = best.alloc.Unspent || 0;
    out.push(el('div', { class: 'panel verdict' },
      el('h2', { text: 'Best points' }),
      el('div', { class: 'bars' }, bars),
      el('p', { class: 'small muted', text: `Bar = recommended, tick = your current points (${Object.entries(cur.alloc).filter(([k, v]) => v && caps[k]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}).${unspent ? ` ${unspent} points stay unspent because every allowed skill is capped.` : ''}` })));

    // KPIs.
    const kpi = (l, v, c, cls = '') => el('div', { class: `kpi ${cls}` }, el('span', { class: 'l', text: l }), el('span', { class: 'v', text: v }), el('span', { class: 'small muted', text: c != null ? `now ${c}` : '' }));
    out.push(el('div', { class: 'panel' },
      el('div', { class: 'kpis' },
        kpi(main.label, main.value, mainCur.value, 'main'),
        goal.type !== 'floorChance' ? kpi('Floor reached in 5% of runs', fmt(E.floorAtChance(best.res.reach, 0.05).floor), fmt(E.floorAtChance(cur.res.reach, 0.05).floor)) : null,
        kpi('Median highest floor', fmt(sb.median), fmt(sc.median)),
        kpi('Experience / run', big(sb.xp), big(sc.xp)),
        kpi('Run length', dur(sb.time), dur(sc.time)))));

    // Reach curve.
    out.push(el('div', { class: 'panel' }, el('h3', { text: 'Chance to reach each floor' }), reachChart(best.res.reach, cur.res.reach, goal.type === 'floorChance' ? goal.chance : null),
      el('p', { class: 'small muted', text: 'Solid: recommended points. Dashed: your current points. Each run starts at floor 1 with full stamina.' })));

    // Fragments table.
    const fr = el('tbody', {}, [1, 2, 3, 4, 5, 6].filter((t) => profile.asc >= 1 || t < 6).map((t) => el('tr', {},
      el('td', {}, el('span', { class: 'frag-dot', style: `background:var(${FRAG_VARS[t]})` }), E.FRAG_NAMES[t]),
      el('td', { class: 'num', text: fmt(sb.frags[t], 2) }), el('td', { class: 'num', text: fmt(sc.frags[t], 2) }),
      el('td', { class: 'num', text: fmt(sb.frags[t] * 3600 / Math.max(1, sb.time), 1) }))));
    out.push(el('div', { class: 'panel' }, el('h3', { text: 'Fragments per run' }),
      el('div', { class: 'tablewrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Type', 'Best', 'Now', 'Best / hour'].map((h) => el('th', { text: h })))), fr))));

    // Alternatives.
    const alt = finals.slice(0, 6).map((f) => el('tr', {}, el('td', { class: 'num', text: stats.map((s) => f.alloc[s] || 0).join(' / ') }), el('td', { class: 'num', text: mainMetric(goal, f).value })));
    out.push(el('div', { class: 'panel' }, el('h3', { text: 'Close runners-up' }),
      el('p', { class: 'small muted', text: `Points as ${stats.map((s) => E.STAT_NAMES[s]).join(' / ')}. Builds this close are a matter of taste.` }),
      el('div', { class: 'tablewrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Points' }), el('th', { text: main.label }))), el('tbody', {}, alt)))));

    // Simulation check.
    const simBox = el('div', { class: 'stack', id: 'sim-box' });
    out.push(el('div', { class: 'panel' }, el('h3', { text: 'Double-check with simulated runs' }),
      el('p', { class: 'small muted', text: 'Plays 2,000 runs hit by hit for both builds, with every random roll, and compares them with the calculation above.' }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'sim-btn', text: 'Simulate 2,000 runs', onclick: runSim })), simBox));

    out.push(el('p', { class: 'note', text: 'Abilities are assumed on auto-cast, crosshairs are auto-taps only (no manual tapping), and fairies are ignored. Rewards are expected values per run.' }));
    $('results').replaceChildren(...out);
    if (last.sim) renderSim();
  }

  function reachChart(a, b, q) {
    const W = 560, H = 220, L = 34, R = 10, T = 10, Bm = 26;
    const range = (r) => {
      let lo = 1, hi = r.length - 1;
      while (lo < hi && r[lo + 1] > 0.995) lo++;
      while (hi > lo && r[hi] < 0.002) hi--;
      return [lo, hi];
    };
    const [a0, a1] = range(a), [b0, b1] = range(b);
    const x0 = Math.max(1, Math.min(a0, b0) - 1), x1 = Math.max(a1, b1) + 1;
    const X = (f) => L + ((f - x0) / Math.max(1, x1 - x0)) * (W - L - R);
    const Y = (p) => T + (1 - p) * (H - T - Bm);
    const path = (r) => {
      let d = '';
      for (let f = x0; f <= x1; f++) d += `${d ? 'L' : 'M'}${X(f).toFixed(1)},${Y(r[f] ?? 0).toFixed(1)}`;
      return d;
    };
    const ns = 'http://www.w3.org/2000/svg';
    const s = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Chance to reach each floor' });
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(s('line', { x1: L, x2: W - R, y1: Y(p), y2: Y(p), stroke: 'var(--line)', 'stroke-width': 1 }));
      svg.append(s('text', { x: L - 6, y: Y(p) + 3, 'text-anchor': 'end' }, `${p * 100}%`));
    }
    const stepX = Math.max(1, Math.ceil((x1 - x0) / 8 / 5) * 5);
    for (let f = Math.ceil(x0 / stepX) * stepX; f <= x1; f += stepX) svg.append(s('text', { x: X(f), y: H - 8, 'text-anchor': 'middle' }, String(f)));
    if (q) {
      svg.append(s('line', { x1: L, x2: W - R, y1: Y(q), y2: Y(q), stroke: 'var(--accent)', 'stroke-dasharray': '2 3', 'stroke-width': 1 }));
    }
    svg.append(s('path', { d: path(b), fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    svg.append(s('path', { d: path(a), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.2 }));
    return el('div', { class: 'tablewrap' }, svg);
  }

  async function runSim() {
    const btn = $('sim-btn');
    btn.disabled = true;
    btn.textContent = 'Simulating…';
    const { profile, finals, cur } = last;
    const runs = 2000;
    const job = (alloc, seed) => (pool.length >= 1
      ? call(pool[seed % pool.length], { type: 'sim', profile, alloc, runs, seed }).then((r) => r.res)
      : tick().then(() => E.simulate(E.computeStats(profile, alloc), profile.asc, runs, seed)));
    const [b, c] = await Promise.all([job(finals[0].alloc, 1), job(cur.alloc, 2)]);
    last.sim = { b, c };
    renderSim();
    btn.disabled = false;
    btn.textContent = 'Simulate 2,000 runs';
  }

  function renderSim() {
    const { goal, finals, cur, sim } = last;
    const q = goal.type === 'floorChance' ? goal.chance : 0.05;
    const tot = (fr) => fr.slice(1).reduce((s, v, i) => s + v * (goal.type === 'frags' ? goal.weights[i + 1] : 1), 0);
    const row = (label, calcB, simB, calcC, simC) => el('tr', {}, el('td', { text: label }), ...[calcB, simB, calcC, simC].map((v) => el('td', { class: 'num', text: v })));
    const sb = E.summarize(goal, finals[0].res), sc = E.summarize(goal, cur.res);
    const fq = (r) => fmt(E.floorAtChance(r, q).floor);
    $('sim-box').replaceChildren(el('div', { class: 'tablewrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ['', 'Best calc', 'Best sim', 'Now calc', 'Now sim'].map((h) => el('th', { text: h })))),
      el('tbody', {},
        row(`Floor in ${fmt(q * 100, 1)}% of runs`, fq(sb.reach), fq(sim.b.reach), fq(sc.reach), fq(sim.c.reach)),
        row('Average floor', fmt(sb.expFloor, 1), fmt(sim.b.expFloor, 1), fmt(sc.expFloor, 1), fmt(sim.c.expFloor, 1)),
        row('Experience / run', big(sb.xp), big(sim.b.xp), big(sc.xp), big(sim.c.xp)),
        row(goal.type === 'frags' ? 'Weighted fragments' : 'Fragments / run', fmt(tot(sb.frags), 1), fmt(tot(sim.b.frags), 1), fmt(tot(sc.frags), 1), fmt(tot(sim.c.frags), 1)),
      ))));
  }

  // ---------- import / export ----------
  function buildIO() {
    $('copy').addEventListener('click', () => {
      const text = JSON.stringify({ profile: state.profile, alloc: state.alloc, goal: state.goal, limits: state.limits });
      $('io').value = text;
      const done = () => { $('io-msg').textContent = 'Copied.'; };
      try {
        navigator.clipboard.writeText(text).then(done, () => { $('io').select(); $('io-msg').textContent = 'Selected. Copy it with your keyboard or menu.'; });
      } catch (_) { $('io').select(); }
    });
    $('apply').addEventListener('click', () => {
      try {
        state = merge(blank(), JSON.parse($('io').value));
        $('io-msg').textContent = 'Loaded.';
        changed(true);
      } catch (_) { $('io-msg').textContent = 'That text is not a saved setup. Copy it again from "Copy setup".'; }
    });
    $('load-example').addEventListener('click', () => { const g = state.goal; state = example(); state.goal = g; changed(true); });
    $('reset').addEventListener('click', () => { const g = state.goal; state = blank(); state.goal = g; changed(true); });
  }

  buildGoal(); buildBasics(); buildUpgrades(); buildExternals(); buildCards(); buildLimits(); buildIO();
  syncForm();
  refresh();
  $('run').addEventListener('click', run);
  startPool();
})();
