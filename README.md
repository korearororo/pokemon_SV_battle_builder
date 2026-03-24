# SV Battle Builder

Starter environment for a Pokemon Scarlet/Violet competitive-build assistant website.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- ESLint

## Open And Run

### 1) Open project folder

- VS Code: `code C:\\rkftp\\SV_battle`
- Or open terminal and move to the folder:

```bash
cd /mnt/c/rkftp/SV_battle
```

### 2) Install dependencies

```bash
npm install
```

### 3) Start development server

```bash
npm run dev
```

Open `http://localhost:3000`.

### 4) Production validation

```bash
npm run lint
npm run build
```

## Current Scope

- 전국도감 1~1025 종의 종족값/타입/특성 데이터 조회 (CSV 기반 원격 캐시 로딩)
- 포켓몬/기술/도구/특성 한글명 자동완성 (`/api/dex`)
- 포켓몬/대상/기술 한글명 기반 실수치 조회 (`/api/battle`)
- EV/IV legality warning checks and role-based checklist generation
- Speed-tier helper (Lv50 estimate)
- 랭크업/랭크다운(-6~+6) 반영 스피드/결정력/데미지 계산
- 타입 상성 + 날씨 + 테라 + 아이템 보정 반영 데미지 계산
- 1타 판정(확정 1타/난수 1타/1타 불가) 표시
- Save/Load in browser local storage
- Share URL copy (`?build=` encoded payload)
- Export text copy (battle set format)
- Team planner for 6 slots with weakness/resistance/immune summary table

Note: local save uses browser `localStorage`, and share URL contains your full build payload.

## Project Structure

- `src/app/page.tsx`: main page
- `src/components/competitive-assistant.tsx`: planner UI
- `src/components/team-planner.tsx`: 6-slot team planning UI
- `src/app/api/dex/route.ts`: remote dex suggestion API
- `src/app/api/battle/route.ts`: attacker/defender/move lookup API
- `src/lib/pokemon/types.ts`: domain types
- `src/lib/pokemon/constants.ts`: static options
- `src/lib/pokemon/data.ts`: seed dataset
- `src/lib/pokemon/full-dex-data.ts`: full dex CSV loader/cache
- `src/lib/pokemon/search.ts`: autocomplete and lookup helpers
- `src/lib/pokemon/build-planner.ts`: basic planner logic
- `src/lib/pokemon/calculators.ts`: speed and damage helper calculations
- `src/lib/pokemon/type-chart.ts`: type effectiveness chart

## Next Development Targets

1. Add authoritative bilingual name mapping (KR/EN) and in-app language switch
2. Expand team planner with speed-control, hazards, and pivot metrics
3. Replace simplified damage model with move/ability/item exact rule engine
