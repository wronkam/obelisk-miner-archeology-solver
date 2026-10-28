# Archaeology Point Planner

Finds the best skill point allocation for the Archaeology minigame in Obelisk Miner,
for a goal you pick:

- **Highest floor**: the deepest floor you still reach in at least X% of runs (X from 0.1% to 99%, default 5%).
- **Fragments** per run or per hour, with your own value for each fragment type.
- **Experience** per run or per hour.
- **Average floor** reached.

**Use it online: https://wronkam.github.io/obelisk-miner-archeology-solver/**

Or open `dist/index.html` in a browser: it is a single file with no server and no install.
Your setup is saved in the browser.

## How it works

The run is computed from probabilities rather than simulated:

1. **Stats.** Your upgrades, cards and other bonuses plus a point allocation give the same
   numbers as the in-game Stats popup (`src/engine/stats.js`). The "Check against the game"
   panel shows them so you can compare.
2. **Hits per block.** For each block type and floor, a recursion over remaining HP gives
   the exact mean, variance and skew of the hits needed, from the normal / crit / super / ultra
   crit odds, Enrage, armor and crosshair auto-taps.
3. **Floors.** Each slot spawns a block with the game's top-down rarity rolls (or a fixed
   boss layout). Quake is modelled as bursts of consecutive procs; stamina mod refills and
   Flurry refunds reduce cost.
4. **Stamina.** The stamina distribution is carried floor to floor, capped at max stamina
   (refills above the cap are lost, as in the game). This gives the chance of reaching each
   floor and the chance each block gets broken, and from those the expected XP and fragments.
5. **Search.** A coarse grid over all allocations, then a hill climb that moves points
   between skills, run in parallel web workers.

A hit-by-hit Monte Carlo simulator (`src/engine/sim.js`) is included to check the
calculation; the page can run it on the recommended and current builds.

Assumptions: abilities on auto-cast, crosshairs are auto-taps only (no manual tapping),
fairies ignored.

## Development

```
npm test        # stats vs reference fixtures and screenshots, model vs simulation, optimizer
npm run build   # writes dist/index.html (standalone) and dist/artifact.html (claude.ai page body)
```

Every push to the default branch runs the tests, builds the page and deploys it to
GitHub Pages (`.github/workflows/pages.yml`).

Sources live in `src/engine` (ES modules, usable from Node) and `src/ui`.

## Data sources

- Block stats, upgrades and skills: the [Obelisk Miner wiki](https://shminer.miraheze.org/wiki/Archaeology) (v2.2.23).
- Spawn tables, boss floors and exact formulas: [IoM-Arch-Optimizer-Web](https://github.com/lobogrande/IoM-Arch-Optimizer-Web)
  (MIT), whose reference outputs for 12 real saves are used as test fixtures. One difference:
  ability cooldowns round up, matching those fixtures.
