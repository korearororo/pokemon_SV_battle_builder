# SV Battle Builder

Pokemon Scarlet/Violet 실전용 빌드 등록, 매치업 계산, 팀 구성 보조를 위한 Next.js 기반 웹앱입니다.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- ESLint

## Run

### 1. Install

```bash
npm install
```

### 2. Start dev server

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 을 열면 됩니다.

### 3. Validate

```bash
npm run build
npm run lint
```

현재 `npm run build` 는 통과합니다.  
`npm run lint` 는 현재 아래 항목이 남아 있습니다.
- `src/components/competitive-assistant.tsx`: `react-hooks/set-state-in-effect` 에러 1개
- `src/lib/pokemon/calculators.ts`: 미사용 변수 경고 1개

## Main Features

- 포켓몬, 기술, 특성, 도구 자동완성
- 개체 등록: 성격, 특성, 도구, 테라 타입, EV/IV, 기술 0~4개 저장
- 브라우저 `localStorage` 기반 저장
- 학습 가능 기술 검증(입력한 기술에 한해 검증)
- 레벨 50 기준 스피드 계산
- 타입 상성, 날씨, 특성, 도구, 테라를 반영한 간이 데미지 계산
- 좌우 개체 비교 기반 매치업 계산
  - 왼쪽 기술/오른쪽 기술 동시 선택
  - 우선도 + 스피드 기준 행동 순서 계산
  - 1행동 결과를 반영한 2행동 순차 계산
  - 후공측 HP 변화에 따른 위력 변동 기술 반영
  - 테라스탈 ON/OFF 토글(개체 등록 테라값 기반)
  - 발동 기믹 배지/요약 표시
- 팀 플래너 약점/반감/무효 요약

## Recent Updates

- 매치업 UI를 단일 공격자 선택 방식에서 좌/우 동시 행동 방식으로 개편
- 매치업 결과를 순차 시뮬레이션(1행동/2행동) 중심으로 정리
- 매치업에서 테라 타입 재선택 제거, 등록된 테라 기반 ON/OFF 토글 추가
- 기술 미입력 개체도 등록 가능하도록 검증 완화(기술 0~4개 허용)
- 매치업에서 기술 없는 개체 선택 시 비활성/안내 문구 표시
- HP 비례 위력 기술 반영 강화
  - `해수스파우팅`, `분화`, `드래곤에너지`, `바둥바둥`, `기사회생`, `염수`, `쥐어짜기/쥐어뜯기/하드프레스`
- 순차 행동 기반 기믹 반영 및 표기 추가
  - `크로스썬더`/`크로스플레임`, `보복`, `눈사태`, `리벤지`, `애크러뱃`
- 노력치 총합이 `510` 을 넘지 않도록 입력 단계와 저장 단계 모두에서 제한
- 테라 타입 선택 시 타입 배지 아이콘 표시
- 코라이돈, 미라이돈, 패러독스 포켓몬을 포함한 최신 특성 한국어 표시 보강
- `스텔라` 테라 타입 추가
- `테라버스트` 가 테라 타입에 따라 타입이 바뀌도록 계산 로직 반영
- 종족값 레이더 차트 기준을 조정해서 고종족값 포켓몬이 더 두드러지게 보이도록 개선
- 매치업 결과에 선공기 우선도 반영
  - 예: `신속`, `기습`, `질풍신뢰`
  - 결과 영역에 `행동 순서` 와 `우선도 적용` 문구 표시

## Project Structure

- `src/app/page.tsx`: 메인 페이지 엔트리
- `src/components/competitive-assistant.tsx`: 빌드 등록/매치업 메인 UI
- `src/components/team-planner.tsx`: 팀 플래너 UI
- `src/app/api/dex/route.ts`: 자동완성용 도감 API
- `src/app/api/battle/route.ts`: 배틀 계산용 포켓몬/기술 조회 API
- `src/app/api/learnset/route.ts`: 학습 기술 조회 API
- `src/lib/pokemon/types.ts`: 도메인 타입 정의
- `src/lib/pokemon/constants.ts`: 상수 및 라벨
- `src/lib/pokemon/data.ts`: 기본 시드 데이터
- `src/lib/pokemon/full-dex-data.ts`: 전체 도감 CSV 로더 및 캐시
- `src/lib/pokemon/calculators.ts`: 스피드/결정력/데미지 계산
- `src/lib/pokemon/type-chart.ts`: 타입 상성표

## Notes

- 저장 데이터는 브라우저 로컬 환경에만 보관됩니다.
- 현재 데미지 계산은 실전 감각용 간이 계산기이며, 게임 내 모든 예외 케이스를 완전하게 반영하지는 않습니다.
