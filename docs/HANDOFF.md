# Pokemon SV Battle Builder - Handoff

Last updated: 2026-03-24

## Project Goal

Web assistant for Pokemon Scarlet/Violet competitive-ready build planning:

- Register battle-ready individual builds
- Compare two registered builds in matchup mode
- Estimate damage, speed, KO state, and decisive power
- Restrict learnset to SV-available moves only

## Implemented Features

### 1) Data and localization

- Full dex loader (National Dex 1-1025) via PokeAPI CSV pipeline
- Korean names for Pokemon/moves/items/abilities in app flow
- Korean UI labels and Korean nature labels with stat increase/decrease notation

Key files:

- `src/lib/pokemon/full-dex-data.ts`
- `src/app/api/dex/route.ts`
- `src/app/api/battle/route.ts`
- `src/app/api/learnset/route.ts`

### 2) Build registration + matchup workflow

- Split UI into two tabs:
  - `개체 추가`: register new build
  - `매치업`: load two registered builds and compare
- Build registration includes 4 moves
- Move registration is validated against SV learnset from API
- Ability selection in builder is restricted to the selected Pokemon's abilities

Key files:

- `src/components/competitive-assistant.tsx`

### 3) Calculation engine

- Type effectiveness, weather, tera STAB, item multipliers
- Rank stage input (-6 to +6) for attacker/defender stats
- Speed comparison with stage reflection
- KO state display (`확정 1타` / `난수 1타 가능` / `1타 불가`)
- Ability modifiers applied in matchup calculation (selected core set)

Key files:

- `src/lib/pokemon/calculators.ts`
- `src/lib/pokemon/type-chart.ts`

### 4) Visual and UX

- Pokemon-themed redesign (Pokedex-like layout and geometric motif)
- Pokemon artwork display in builder and matchup
- Radar hex charts near selected Pokemon artwork:
  - Base stats
  - IV
  - EV
- Numeric stat values shown under each radar chart

Key files:

- `src/app/globals.css`
- `src/app/page.tsx`
- `src/components/competitive-assistant.tsx`

## Current Runtime Notes

- Dev mode in WSL mount paths (`/mnt/c/...`) can have watcher/HMR staleness.
- Stable check path was done via production server (`next start`) at port `3200`.

## Verified Commands

Executed and passing:

- `npm run lint`
- `npm run build`

## How to continue on another machine

```bash
git clone https://github.com/korearororo/pokemon_SV_battle_builder.git
cd pokemon_SV_battle_builder
npm install
npm run dev
```

Open `http://localhost:3000`.

## Suggested next improvements

1. Expand ability modifier coverage in calculations (currently core subset).
2. Add move category/type icons and richer matchup breakdown table.
3. Add export/import of registered builds as JSON.
