"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";

import { NATURES, ROLE_LABELS, STAT_KEYS, STAT_LABELS, TYPE_LABELS_KO } from "@/lib/pokemon/constants";
import { TERA_TYPES } from "@/lib/pokemon/data";
import {
  estimateDamagePercent,
  estimateSpeed,
} from "@/lib/pokemon/calculators";
import type {
  BattleWeather,
  BuildInput,
  DamageCalcOptions,
  MoveEntry,
  PokemonEntry,
  PokemonRole,
  StatKey,
  StatSpread,
  TeraType,
} from "@/lib/pokemon/types";

type TabMode = "builder" | "matchup" | "ai" | "dev";

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  suggestedBuilds?: AiSuggestedBuild[];
};

type RegisteredEntity = {
  id: string;
  nickname: string;
  pokemonName: string;
  role: PokemonRole;
  teraType: string;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  moves: string[];
};

type AiSuggestedBuild = {
  nickname: string;
  pokemonName: string;
  role: PokemonRole;
  teraType: string;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  moves: string[];
  reason: string;
};

type AiCoachReplyPayload = {
  reply: string;
  suggestedBuilds: AiSuggestedBuild[];
};

type AiCoachDebugPayload = AiCoachReplyPayload & {
  debug?: {
    registeredContext?: string;
    ragContext?: string;
  };
};

type AiRequestBuild = {
  nickname: string;
  pokemonName: string;
  role: PokemonRole;
  teraType: string;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  moves: string[];
};

type DevAiDebugResult = {
  reply: string;
  registeredContext: string;
  ragContext: string;
  rawJson: string;
};

type AiProgressStage = "prepare" | "context" | "request" | "analyze" | "compose";

const BUILDS_STORAGE_KEY = "sv-battle:registered-builds";
const NEW_BUILD_OPTION = "__new__";
const MAX_TOTAL_EVS = 510;
const BASE_STAT_RADAR_MAX_VALUE = 140;
const BASE_STAT_RADAR_OVERFLOW_CAP = 1.24;

const EMPTY_SPREAD: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const DEFAULT_IVS: StatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const DEFAULT_STAGES: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const ROLE_OPTIONS: PokemonRole[] = [
  "sweeper",
  "bulky-sweeper",
  "wall",
  "support",
  "speed-control",
];

type BattleEffect =
  | "none"
  | "sun"
  | "rain"
  | "sand"
  | "snow"
  | "electric-terrain"
  | "grassy-terrain"
  | "misty-terrain"
  | "psychic-terrain";

const BATTLE_EFFECT_OPTIONS: Array<{ value: BattleEffect; label: string; weather: BattleWeather }> = [
  { value: "none", label: "없음", weather: "none" },
  { value: "sun", label: "쾌청", weather: "sun" },
  { value: "rain", label: "비", weather: "rain" },
  { value: "sand", label: "모래바람", weather: "sand" },
  { value: "snow", label: "눈", weather: "snow" },
  { value: "electric-terrain", label: "일렉트릭필드", weather: "none" },
  { value: "grassy-terrain", label: "그래스필드", weather: "none" },
  { value: "misty-terrain", label: "미스트필드", weather: "none" },
  { value: "psychic-terrain", label: "사이코필드", weather: "none" },
];

const MOVE_SLOT_IDS = ["m1", "m2", "m3", "m4"] as const;

const MOVE_NAME_KO_OVERRIDES: Record<string, string> = {
  "tera blast": "테라버스트",
  "tera-blast": "테라버스트",
};

const TYPE_ICON_META: Record<
  TeraType,
  { background: string; border: string; text: string; icon: string; iconText: string }
> = {
  Normal: { background: "#f3f4f6", border: "#d1d5db", text: "#374151", icon: "N", iconText: "#1f2937" },
  Fire: { background: "#fff1ec", border: "#fdba74", text: "#9a3412", icon: "F", iconText: "#9a3412" },
  Water: { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", icon: "W", iconText: "#1d4ed8" },
  Electric: { background: "#fefce8", border: "#fde047", text: "#a16207", icon: "E", iconText: "#854d0e" },
  Grass: { background: "#ecfdf5", border: "#86efac", text: "#166534", icon: "G", iconText: "#166534" },
  Ice: { background: "#ecfeff", border: "#67e8f9", text: "#0f766e", icon: "I", iconText: "#0f766e" },
  Fighting: { background: "#fff1f2", border: "#fda4af", text: "#9f1239", icon: "Ft", iconText: "#9f1239" },
  Poison: { background: "#faf5ff", border: "#d8b4fe", text: "#7e22ce", icon: "P", iconText: "#7e22ce" },
  Ground: { background: "#fffbeb", border: "#fcd34d", text: "#92400e", icon: "Gr", iconText: "#92400e" },
  Flying: { background: "#eef2ff", border: "#a5b4fc", text: "#4338ca", icon: "Fl", iconText: "#4338ca" },
  Psychic: { background: "#fdf2f8", border: "#f9a8d4", text: "#be185d", icon: "Ps", iconText: "#be185d" },
  Bug: { background: "#f7fee7", border: "#bef264", text: "#4d7c0f", icon: "B", iconText: "#4d7c0f" },
  Rock: { background: "#fafaf9", border: "#d6d3d1", text: "#57534e", icon: "R", iconText: "#44403c" },
  Ghost: { background: "#f5f3ff", border: "#c4b5fd", text: "#6d28d9", icon: "Gh", iconText: "#5b21b6" },
  Dragon: { background: "#eef2ff", border: "#818cf8", text: "#3730a3", icon: "D", iconText: "#3730a3" },
  Dark: { background: "#f4f4f5", border: "#a1a1aa", text: "#27272a", icon: "Dk", iconText: "#18181b" },
  Steel: { background: "#f8fafc", border: "#94a3b8", text: "#334155", icon: "St", iconText: "#334155" },
  Fairy: { background: "#fdf2f8", border: "#f9a8d4", text: "#be185d", icon: "Fa", iconText: "#be185d" },
  Stellar: { background: "#f5f3ff", border: "#c084fc", text: "#6b21a8", icon: "St*", iconText: "#6b21a8" },
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function updateSpread(
  spread: StatSpread,
  stat: StatKey,
  value: number,
  min: number,
  max: number,
): StatSpread {
  const sanitized = Number.isFinite(value) ? Math.trunc(value) : 0;
  return {
    ...spread,
    [stat]: Math.max(min, Math.min(max, sanitized)),
  };
}

function getSpreadTotal(spread: StatSpread): number {
  return STAT_KEYS.reduce((sum, stat) => sum + spread[stat], 0);
}

function updateEvSpread(
  spread: StatSpread,
  stat: StatKey,
  value: number,
): StatSpread {
  const sanitized = Math.max(0, Math.min(252, Number.isFinite(value) ? Math.trunc(value) : 0));
  const remaining = Math.max(0, MAX_TOTAL_EVS - (getSpreadTotal(spread) - spread[stat]));

  return {
    ...spread,
    [stat]: Math.min(sanitized, remaining),
  };
}

function parseRegisteredBuilds(raw: string | null): RegisteredEntity[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as RegisteredEntity[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
      (entry) =>
        typeof entry.id === "string" &&
        Array.isArray(entry.moves) &&
        typeof entry.pokemonName === "string",
      )
      .map((entry) => ({
        ...entry,
        moves: entry.moves
          .filter((move) => typeof move === "string")
          .map((move) => {
          const mapped = MOVE_NAME_KO_OVERRIDES[normalize(move)] ?? move;
          return mapped;
        }),
      }));
  } catch {
    return [];
  }
}

function displayMoveName(moveName: string): string {
  return MOVE_NAME_KO_OVERRIDES[normalize(moveName)] ?? moveName;
}

function buildSnapshotText(builds: RegisteredEntity[]): string {
  if (builds.length === 0) {
    return "등록된 개체가 아직 없습니다. 먼저 개체를 1개 이상 등록해 주세요.";
  }

  return builds
    .slice(0, 6)
    .map((entry, index) => {
      const moveText = entry.moves.length > 0 ? entry.moves.join(", ") : "기술 미등록";
      const teraText = entry.teraType || "미지정";
      const evText = `${entry.evs.hp}/${entry.evs.atk}/${entry.evs.def}/${entry.evs.spa}/${entry.evs.spd}/${entry.evs.spe}`;
      return `${index + 1}. ${entry.nickname || entry.pokemonName} | 역할 ${ROLE_LABELS[entry.role]} | 테라 ${teraText} | 성격 ${entry.nature || "미지정"} | 특성 ${entry.ability || "미지정"} | 도구 ${entry.item || "미지정"} | EV ${evText} | 기술 ${moveText}`;
    })
    .join("\n");
}

function generateLocalAiReply(input: string, builds: RegisteredEntity[]): string {
  const prompt = input.trim();
  if (!prompt) {
    return "질문을 입력해 주세요.";
  }

  const normalizedPrompt = normalize(prompt);
  if (normalizedPrompt.includes("개체") || normalizedPrompt.includes("등록")) {
    return `현재 등록 개체 요약:\n${buildSnapshotText(builds)}`;
  }

  if (normalizedPrompt.includes("추천") || normalizedPrompt.includes("빌드")) {
    return [
      "로컬 코치 기본 추천 순서:",
      "1) 역할(스위퍼/서포터 등) 먼저 고정",
      "2) 테라는 주력기 강화 또는 약점 보완 중 선택",
      "3) EV는 핵심 스탯 252 + 스피드 조정",
      "4) 매치업 탭에서 양쪽 기술을 지정해 선/후행 결과 확인",
      "",
      `현재 등록 개체 참고:\n${buildSnapshotText(builds)}`,
    ].join("\n");
  }

  if (normalizedPrompt.includes("속도") || normalizedPrompt.includes("선공")) {
    return "매치업 탭에서 양쪽 기술을 지정하면 우선도+스피드 기준으로 선행 순서를 계산합니다.";
  }

  if (normalizedPrompt.includes("테라")) {
    return "매치업 탭에서 테라 ON/OFF를 바꿔 결과를 비교할 수 있습니다.";
  }

  return [
    "현재 AI 코치 탭입니다.",
    "예시 질문:",
    "- 내 개체 요약해줘",
    "- 코라이돈 샘플 추천해줘",
    "- 선공/후공 계산 방식 알려줘",
    "- 테라 ON/OFF 비교해줘",
  ].join("\n");
}

function sanitizeSpreadValue(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const integer = Math.trunc(value);
  return Math.max(min, Math.min(max, integer));
}

function sanitizeAiSuggestedBuilds(payload: unknown): AiSuggestedBuild[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const allowedRoles = new Set<PokemonRole>([
    "sweeper",
    "bulky-sweeper",
    "wall",
    "support",
    "speed-control",
  ]);

  return payload
    .slice(0, 6)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => {
      const moves = Array.isArray(entry.moves)
        ? entry.moves.filter((move): move is string => typeof move === "string").slice(0, 4)
        : [];
      const role = typeof entry.role === "string" && allowedRoles.has(entry.role as PokemonRole)
        ? (entry.role as PokemonRole)
        : "sweeper";
      const evs = (entry.evs && typeof entry.evs === "object" ? entry.evs : {}) as Record<string, unknown>;
      const ivs = (entry.ivs && typeof entry.ivs === "object" ? entry.ivs : {}) as Record<string, unknown>;

      return {
        nickname: typeof entry.nickname === "string" ? entry.nickname.trim() : "",
        pokemonName: typeof entry.pokemonName === "string" ? entry.pokemonName.trim() : "",
        role,
        teraType: typeof entry.teraType === "string" ? entry.teraType.trim() : "",
        nature: typeof entry.nature === "string" ? entry.nature.trim() : "Jolly",
        ability: typeof entry.ability === "string" ? entry.ability.trim() : "",
        item: typeof entry.item === "string" ? entry.item.trim() : "",
        evs: {
          hp: sanitizeSpreadValue(evs.hp, 0, 252, 0),
          atk: sanitizeSpreadValue(evs.atk, 0, 252, 0),
          def: sanitizeSpreadValue(evs.def, 0, 252, 0),
          spa: sanitizeSpreadValue(evs.spa, 0, 252, 0),
          spd: sanitizeSpreadValue(evs.spd, 0, 252, 0),
          spe: sanitizeSpreadValue(evs.spe, 0, 252, 0),
        },
        ivs: {
          hp: sanitizeSpreadValue(ivs.hp, 0, 31, 31),
          atk: sanitizeSpreadValue(ivs.atk, 0, 31, 31),
          def: sanitizeSpreadValue(ivs.def, 0, 31, 31),
          spa: sanitizeSpreadValue(ivs.spa, 0, 31, 31),
          spd: sanitizeSpreadValue(ivs.spd, 0, 31, 31),
          spe: sanitizeSpreadValue(ivs.spe, 0, 31, 31),
        },
        moves: moves.map((move) => displayMoveName(move.trim())).filter((move) => move.length > 0),
        reason: typeof entry.reason === "string" ? entry.reason.trim() : "",
      };
    })
    .filter((entry) => entry.pokemonName.length > 0);
}

function toAiRequestBuilds(builds: RegisteredEntity[]): AiRequestBuild[] {
  return builds.map((entry) => ({
    nickname: entry.nickname,
    pokemonName: entry.pokemonName,
    role: entry.role,
    teraType: entry.teraType,
    nature: entry.nature,
    ability: entry.ability,
    item: entry.item,
    evs: entry.evs,
    ivs: entry.ivs,
    moves: entry.moves,
  }));
}

async function fetchAiCoachReply(input: string, builds: RegisteredEntity[]): Promise<AiCoachReplyPayload | null> {
  try {
    const response = await fetch("/api/ai-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input,
        builds: toAiRequestBuilds(builds),
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { reply?: unknown; suggestedBuilds?: unknown };
    if (typeof payload.reply !== "string" || !payload.reply.trim()) {
      return null;
    }

    return {
      reply: payload.reply.trim(),
      suggestedBuilds: sanitizeAiSuggestedBuilds(payload.suggestedBuilds),
    };
  } catch {
    return null;
  }
}

async function fetchAiCoachDebug(input: string, builds: RegisteredEntity[]): Promise<DevAiDebugResult | null> {
  try {
    const response = await fetch("/api/ai-coach?debugRag=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input,
        builds: toAiRequestBuilds(builds),
      }),
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AiCoachDebugPayload;
    if (typeof payload.reply !== "string" || !payload.reply.trim()) {
      return null;
    }

    return {
      reply: payload.reply.trim(),
      registeredContext: typeof payload.debug?.registeredContext === "string" ? payload.debug.registeredContext : "",
      ragContext: typeof payload.debug?.ragContext === "string" ? payload.debug.ragContext : "",
      rawJson: JSON.stringify(payload, null, 2),
    };
  } catch {
    return null;
  }
}

function isDefensiveMove(move: MoveEntry | null): boolean {
  if (!move) {
    return false;
  }

  const normalized = normalize(move.name);
  const defensiveMoves = new Set([
    "protect",
    "detect",
    "king's shield",
    "kings shield",
    "spiky shield",
    "baneful bunker",
    "obstruct",
    "burning bulwark",
    "silk trap",
    "quick guard",
    "wide guard",
    "mat block",
    "방어",
    "간파",
    "킹실드",
    "니들가드",
    "브로킹",
    "독침방어",
    "트랩셸",
    "선제방어",
    "와이드가드",
  ]);

  return defensiveMoves.has(normalized);
}

function isFinalGambitMove(move: MoveEntry | null): boolean {
  if (!move) {
    return false;
  }
  const normalized = normalize(move.name);
  return normalized === "final gambit" || normalized === "final-gambit" || normalized === "죽기살기";
}

function getTeraCardStyle(teraType: TeraType | "", enabled: boolean): CSSProperties | undefined {
  if (!enabled || !teraType) {
    return undefined;
  }
  const meta = TYPE_ICON_META[teraType];
  return {
    "--tera-bg": meta.background,
    "--tera-border": meta.border,
  } as CSSProperties;
}

function gimmickTags(summary: string): string[] {
  if (!summary || summary === "없음") {
    return [];
  }
  return summary
    .split(" / ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function TypeBadge({ type }: { type: TeraType }) {
  const meta = TYPE_ICON_META[type];

  return (
    <span
      className="pk-type-badge"
      style={{
        backgroundColor: meta.background,
        borderColor: meta.border,
        color: meta.text,
      }}
    >
      <span
        className="pk-type-badge__icon"
        style={{
          backgroundColor: meta.border,
          color: meta.iconText,
        }}
        aria-hidden="true"
      >
        {meta.icon}
      </span>
      <span>{TYPE_LABELS_KO[type] ?? type}</span>
    </span>
  );
}

function natureStatLabel(stat: StatKey | null): string {
  if (!stat) {
    return "-";
  }
  return STAT_LABELS[stat];
}

function formatNatureOptionLabel(natureName: string): string {
  const nature = NATURES.find((entry) => entry.name === natureName);
  if (!nature) {
    return natureName;
  }

  if (!nature.increase && !nature.decrease) {
    return `${nature.labelKo} (무보정)`;
  }

  return `${nature.labelKo} (+${natureStatLabel(nature.increase)} / -${natureStatLabel(nature.decrease)})`;
}

function getPokemonArtworkUrl(entry: PokemonEntry | null): string {
  if (!entry?.pokemonId) {
    return "";
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${entry.pokemonId}.png`;
}

function toRadarPoints(
  spread: StatSpread,
  maxValue: number,
  radius: number,
  center: number,
  overflowCap = 1,
): string {
  const safeMax = Math.max(1, maxValue);
  return STAT_KEYS.map((stat, index) => {
    const ratio = Math.max(0, Math.min(overflowCap, spread[stat] / safeMax));
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / STAT_KEYS.length;
    const x = center + Math.cos(angle) * radius * ratio;
    const y = center + Math.sin(angle) * radius * ratio;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function toHexRingPoints(scale: number, radius: number, center: number): string {
  return STAT_KEYS.map((_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / STAT_KEYS.length;
    const x = center + Math.cos(angle) * radius * scale;
    const y = center + Math.sin(angle) * radius * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

type StatRadarChartProps = {
  title: string;
  spread: StatSpread;
  maxValue: number;
  stroke: string;
  fill: string;
  overflowCap?: number;
};

function StatRadarChart({ title, spread, maxValue, stroke, fill, overflowCap = 1 }: StatRadarChartProps) {
  const size = 176;
  const center = size / 2;
  const radius = 58;
  const rings = [0.2, 0.4, 0.6, 0.8, 1];
  const labels: Record<StatKey, string> = {
    hp: "HP",
    atk: "공격",
    def: "방어",
    spa: "특공",
    spd: "특방",
    spe: "스피드",
  };

  return (
    <div className="pk-card flex flex-col items-center p-2">
      <p className="mb-1 text-xs font-bold text-slate-700">{title}</p>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44" role="img" aria-label={`${title} 6각형 파라미터`}>
        <title>{`${title} 6각형 파라미터`}</title>
        {rings.map((ring) => (
          <polygon
            key={`${title}-ring-${ring}`}
            points={toHexRingPoints(ring, radius, center)}
            fill="none"
            stroke="rgba(100,116,139,0.22)"
            strokeWidth={1}
          />
        ))}

        {STAT_KEYS.map((stat, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / STAT_KEYS.length;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const lx = center + Math.cos(angle) * (radius + 16);
          const ly = center + Math.sin(angle) * (radius + 16);
          return (
            <g key={`${title}-axis-${stat}`}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(100,116,139,0.28)" strokeWidth={1} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-600 text-[9px] font-bold">
                {labels[stat]}
              </text>
            </g>
          );
        })}

        <polygon
          points={toRadarPoints(spread, maxValue, radius, center, overflowCap)}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      </svg>

      <div className="mt-2 grid w-full grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-700">
        {STAT_KEYS.map((stat) => (
          <p key={`${title}-value-${stat}`} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="font-semibold text-slate-600">{STAT_LABELS[stat]}</span>
            <span className="font-bold text-slate-900">{spread[stat]}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

async function fetchDexSuggestions(kind: "pokemon" | "item" | "ability", query: string): Promise<string[]> {
  if (!query.trim()) {
    return [];
  }

  const params = new URLSearchParams({ kind, q: query, limit: "20" });
  const response = await fetch(`/api/dex?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { results?: unknown };
  if (!Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.filter((value): value is string => typeof value === "string");
}

async function fetchLearnset(pokemonName: string): Promise<string[]> {
  if (!pokemonName.trim()) {
    return [];
  }

  const params = new URLSearchParams({ pokemon: pokemonName });
  const response = await fetch(`/api/learnset?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { moves?: unknown };
  if (!Array.isArray(payload.moves)) {
    return [];
  }

  return payload.moves.filter((value): value is string => typeof value === "string");
}

export function CompetitiveAssistant() {
  const [tab, setTab] = useState<TabMode>("builder");
  const [notice, setNotice] = useState<string>("");
  const [aiInput, setAiInput] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<"idle" | "connecting" | "generating">("idle");
  const [devAiInput, setDevAiInput] = useState<string>("");
  const [devAiLoading, setDevAiLoading] = useState<boolean>(false);
  const [devAiResult, setDevAiResult] = useState<DevAiDebugResult | null>(null);
  const [aiProgressStage, setAiProgressStage] = useState<AiProgressStage>("prepare");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: "ai-welcome",
      role: "assistant",
      text: "AI 코치 탭입니다. API 없이 로컬 규칙 기반으로 응답합니다. 예: '내 개체 요약해줘'",
    },
  ]);

  const [registeredBuilds, setRegisteredBuilds] = useState<RegisteredEntity[]>(() =>
    typeof window === "undefined"
      ? []
      : parseRegisteredBuilds(window.localStorage.getItem(BUILDS_STORAGE_KEY)),
  );

  const [nickname, setNickname] = useState<string>("");
  const [pokemonName, setPokemonName] = useState<string>("");
  const [role, setRole] = useState<PokemonRole>("sweeper");
  const [nature, setNature] = useState<string>("Jolly");
  const [ability, setAbility] = useState<string>("");
  const [item, setItem] = useState<string>("");
  const [teraType, setTeraType] = useState<TeraType | "">("");
  const [evs, setEvs] = useState<StatSpread>(EMPTY_SPREAD);
  const [ivs, setIvs] = useState<StatSpread>(DEFAULT_IVS);
  const [moves, setMoves] = useState<[string, string, string, string]>(["", "", "", ""]);

  const [pokemonSuggestions, setPokemonSuggestions] = useState<string[]>([]);
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([]);
  const [learnsetMoves, setLearnsetMoves] = useState<string[]>([]);
  const [learnsetStatus, setLearnsetStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [builderPokemonEntry, setBuilderPokemonEntry] = useState<PokemonEntry | null>(null);

  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [leftSelectedMove, setLeftSelectedMove] = useState<string>("");
  const [rightSelectedMove, setRightSelectedMove] = useState<string>("");
  const [battleEffect, setBattleEffect] = useState<BattleEffect>("none");
  const [leftTeraEnabled, setLeftTeraEnabled] = useState<boolean>(true);
  const [rightTeraEnabled, setRightTeraEnabled] = useState<boolean>(true);
  const [leftStages, setLeftStages] = useState<StatSpread>(DEFAULT_STAGES);
  const [rightStages, setRightStages] = useState<StatSpread>(DEFAULT_STAGES);

  const [resolvedLeftPokemon, setResolvedLeftPokemon] = useState<PokemonEntry | null>(null);
  const [resolvedRightPokemon, setResolvedRightPokemon] = useState<PokemonEntry | null>(null);
  const [resolvedLeftMove, setResolvedLeftMove] = useState<MoveEntry | null>(null);
  const [resolvedRightMove, setResolvedRightMove] = useState<MoveEntry | null>(null);
  const aiMessagesContainerRef = useRef<HTMLDivElement | null>(null);

  const evTotal = getSpreadTotal(evs);

  useEffect(() => {
    window.localStorage.setItem(BUILDS_STORAGE_KEY, JSON.stringify(registeredBuilds));
  }, [registeredBuilds]);

  useEffect(() => {
    if (!aiMessagesContainerRef.current) {
      return;
    }
    aiMessagesContainerRef.current.scrollTop = aiMessagesContainerRef.current.scrollHeight;
  }, [aiMessages, aiStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDexSuggestions("pokemon", pokemonName)
        .then(setPokemonSuggestions)
        .catch(() => setPokemonSuggestions([]));
    }, 120);
    return () => clearTimeout(timer);
  }, [pokemonName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDexSuggestions("item", item)
        .then(setItemSuggestions)
        .catch(() => setItemSuggestions([]));
    }, 120);
    return () => clearTimeout(timer);
  }, [item]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLearnsetStatus("loading");
      fetchLearnset(pokemonName)
        .then((movesFromApi) => {
          setLearnsetMoves(movesFromApi);
          setLearnsetStatus("ready");
        })
        .catch(() => {
          setLearnsetMoves([]);
          setLearnsetStatus("error");
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [pokemonName]);

  useEffect(() => {
    if (!pokemonName.trim()) {
      return;
    }

    const params = new URLSearchParams({ attacker: pokemonName });
    fetch(`/api/battle?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as { attacker: PokemonEntry | null };
      })
      .then((payload) => {
        const entry = payload?.attacker ?? null;
        setBuilderPokemonEntry(entry);
        if (!entry) {
          setAbility("");
          return;
        }
        if (!entry.abilities.includes(ability)) {
          setAbility(entry.abilities[0] ?? "");
        }
      })
      .catch(() => {
        setBuilderPokemonEntry(null);
        setAbility("");
      });
  }, [pokemonName, ability]);

  const leftBuild = useMemo(
    () => registeredBuilds.find((entry) => entry.id === leftId) ?? null,
    [leftId, registeredBuilds],
  );
  const rightBuild = useMemo(
    () => registeredBuilds.find((entry) => entry.id === rightId) ?? null,
    [rightId, registeredBuilds],
  );

  const leftMoveOptions = useMemo<string[]>(
    () => (leftBuild ? leftBuild.moves.filter((move) => move.trim().length > 0) : []),
    [leftBuild],
  );
  const [builderSelectedId, setBuilderSelectedId] = useState<string>(NEW_BUILD_OPTION);
  const rightMoveOptions = useMemo<string[]>(
    () => (rightBuild ? rightBuild.moves.filter((move) => move.trim().length > 0) : []),
    [rightBuild],
  );

  const activeLeftMove = useMemo(
    () =>
      leftMoveOptions.some((moveName) => moveName === leftSelectedMove)
        ? leftSelectedMove
        : (leftMoveOptions[0] ?? ""),
    [leftMoveOptions, leftSelectedMove],
  );
  const activeRightMove = useMemo(
    () =>
      rightMoveOptions.some((moveName) => moveName === rightSelectedMove)
        ? rightSelectedMove
        : (rightMoveOptions[0] ?? ""),
    [rightMoveOptions, rightSelectedMove],
  );
  const leftHasMoves = leftMoveOptions.length > 0;
  const rightHasMoves = rightMoveOptions.length > 0;
  const leftRegisteredTeraType = useMemo<TeraType | "">(
    () => (leftBuild && TERA_TYPES.includes(leftBuild.teraType as TeraType) ? (leftBuild.teraType as TeraType) : ""),
    [leftBuild],
  );
  const rightRegisteredTeraType = useMemo<TeraType | "">(
    () => (rightBuild && TERA_TYPES.includes(rightBuild.teraType as TeraType) ? (rightBuild.teraType as TeraType) : ""),
    [rightBuild],
  );
  const appliedLeftTeraType: TeraType | "" = leftTeraEnabled ? leftRegisteredTeraType : "";
  const appliedRightTeraType: TeraType | "" = rightTeraEnabled ? rightRegisteredTeraType : "";

  const selectedEffectOption =
    BATTLE_EFFECT_OPTIONS.find((entry) => entry.value === battleEffect) ?? BATTLE_EFFECT_OPTIONS[0];
  const appliedWeather = selectedEffectOption.weather;

  useEffect(() => {
    if (!leftBuild || !rightBuild || !activeLeftMove || !activeRightMove) {
      setResolvedLeftPokemon(null);
      setResolvedRightPokemon(null);
      setResolvedLeftMove(null);
      setResolvedRightMove(null);
      return;
    }

    const leftParams = new URLSearchParams({
      attacker: leftBuild.pokemonName,
      defender: rightBuild.pokemonName,
      move: activeLeftMove,
    });
    const rightParams = new URLSearchParams({
      attacker: rightBuild.pokemonName,
      defender: leftBuild.pokemonName,
      move: activeRightMove,
    });

    Promise.all([
      fetch(`/api/battle?${leftParams.toString()}`),
      fetch(`/api/battle?${rightParams.toString()}`),
    ])
      .then(async ([leftResponse, rightResponse]) => {
        const leftPayload = leftResponse.ok
          ? ((await leftResponse.json()) as {
              attacker: PokemonEntry | null;
              defender: PokemonEntry | null;
              move: MoveEntry | null;
            })
          : null;
        const rightPayload = rightResponse.ok
          ? ((await rightResponse.json()) as {
              attacker: PokemonEntry | null;
              defender: PokemonEntry | null;
              move: MoveEntry | null;
            })
          : null;
        return { leftPayload, rightPayload };
      })
      .then(({ leftPayload, rightPayload }) => {
        if (!leftPayload || !rightPayload) {
          setResolvedLeftPokemon(null);
          setResolvedRightPokemon(null);
          setResolvedLeftMove(null);
          setResolvedRightMove(null);
          return;
        }

        setResolvedLeftPokemon(leftPayload.attacker);
        setResolvedRightPokemon(leftPayload.defender ?? rightPayload.attacker);
        setResolvedLeftMove(leftPayload.move);
        setResolvedRightMove(rightPayload.move);
      })
      .catch(() => {
        setResolvedLeftPokemon(null);
        setResolvedRightPokemon(null);
        setResolvedLeftMove(null);
        setResolvedRightMove(null);
      });
  }, [activeLeftMove, activeRightMove, leftBuild, rightBuild]);

  const matchupBlockingMessage = useMemo(() => {
    if (!leftBuild || !rightBuild) {
      return "좌우 개체를 선택하면 매치업 계산을 표시합니다.";
    }
    if (!leftHasMoves && !rightHasMoves) {
      return "왼쪽/오른쪽 개체 모두 등록된 기술이 없습니다. 개체 등록에서 기술을 1개 이상 추가해 주세요.";
    }
    if (!leftHasMoves) {
      return "왼쪽 개체에 등록된 기술이 없습니다. 개체 등록에서 기술을 추가해 주세요.";
    }
    if (!rightHasMoves) {
      return "오른쪽 개체에 등록된 기술이 없습니다. 개체 등록에서 기술을 추가해 주세요.";
    }
    return "좌우 개체와 각 기술을 선택하면 매치업 계산을 표시합니다.";
  }, [leftBuild, leftHasMoves, rightBuild, rightHasMoves]);

  const leftAttackInput = useMemo<BuildInput | null>(() => {
    if (!leftBuild || !rightBuild) {
      return null;
    }

    return {
      pokemonName: leftBuild.pokemonName,
      targetPokemonName: rightBuild.pokemonName,
      moveName: activeLeftMove,
      role: leftBuild.role,
      teraType: leftBuild.teraType,
      nature: leftBuild.nature,
      ability: leftBuild.ability,
      item: leftBuild.item,
      evs: leftBuild.evs,
      ivs: leftBuild.ivs,
      attackerStages: leftStages,
      defenderStages: rightStages,
    };
  }, [activeLeftMove, leftBuild, leftStages, rightBuild, rightStages]);

  const rightAttackInput = useMemo<BuildInput | null>(() => {
    if (!leftBuild || !rightBuild) {
      return null;
    }

    return {
      pokemonName: rightBuild.pokemonName,
      targetPokemonName: leftBuild.pokemonName,
      moveName: activeRightMove,
      role: rightBuild.role,
      teraType: rightBuild.teraType,
      nature: rightBuild.nature,
      ability: rightBuild.ability,
      item: rightBuild.item,
      evs: rightBuild.evs,
      ivs: rightBuild.ivs,
      attackerStages: rightStages,
      defenderStages: leftStages,
    };
  }, [activeRightMove, leftBuild, leftStages, rightBuild, rightStages]);

  const leftDamageOptions = useMemo<DamageCalcOptions>(
    () => ({
      attackerTeraType: appliedLeftTeraType,
      defenderTeraType: appliedRightTeraType,
      weather: appliedWeather,
      attackerAbility: leftBuild?.ability ?? "",
      defenderAbility: rightBuild?.ability ?? "",
    }),
    [appliedLeftTeraType, appliedRightTeraType, appliedWeather, leftBuild?.ability, rightBuild?.ability],
  );
  const rightDamageOptions = useMemo<DamageCalcOptions>(
    () => ({
      attackerTeraType: appliedRightTeraType,
      defenderTeraType: appliedLeftTeraType,
      weather: appliedWeather,
      attackerAbility: rightBuild?.ability ?? "",
      defenderAbility: leftBuild?.ability ?? "",
    }),
    [appliedLeftTeraType, appliedRightTeraType, appliedWeather, leftBuild?.ability, rightBuild?.ability],
  );

  const leftToRightDamage = useMemo(() => {
    if (!resolvedLeftPokemon || !resolvedRightPokemon || !resolvedLeftMove || !leftAttackInput) {
      return null;
    }

    return estimateDamagePercent(
      resolvedLeftPokemon,
      resolvedRightPokemon,
      leftAttackInput,
      resolvedLeftMove,
      leftDamageOptions,
    );
  }, [leftAttackInput, leftDamageOptions, resolvedLeftMove, resolvedLeftPokemon, resolvedRightPokemon]);

  const rightToLeftDamage = useMemo(() => {
    if (!resolvedLeftPokemon || !resolvedRightPokemon || !resolvedRightMove || !rightAttackInput) {
      return null;
    }

    return estimateDamagePercent(
      resolvedRightPokemon,
      resolvedLeftPokemon,
      rightAttackInput,
      resolvedRightMove,
      rightDamageOptions,
    );
  }, [resolvedLeftPokemon, resolvedRightMove, resolvedRightPokemon, rightAttackInput, rightDamageOptions]);

  const speedCompare = useMemo(() => {
    if (!resolvedLeftPokemon || !resolvedRightPokemon || !leftAttackInput || !rightAttackInput) {
      return null;
    }

    const leftSpeed = estimateSpeed(resolvedLeftPokemon, leftAttackInput);
    const rightSpeed = estimateSpeed(resolvedRightPokemon, rightAttackInput);
    const leftPriority = resolvedLeftMove?.priority ?? 0;
    const rightPriority = resolvedRightMove?.priority ?? 0;

    return {
      leftSpeed,
      rightSpeed,
      leftPriority,
      rightPriority,
      faster:
        leftSpeed === rightSpeed
          ? "동속"
          : leftSpeed > rightSpeed
            ? `${resolvedLeftPokemon.name} 선공`
            : `${resolvedRightPokemon.name} 선공`,
    };
  }, [leftAttackInput, resolvedLeftMove, resolvedLeftPokemon, resolvedRightMove, resolvedRightPokemon, rightAttackInput]);

  const speedOrderSummary = useMemo(() => {
    if (!speedCompare || !resolvedLeftPokemon || !resolvedRightPokemon) {
      return null;
    }

    const leftPriority = resolvedLeftMove?.priority ?? 0;
    const rightPriority = resolvedRightMove?.priority ?? 0;

    if (leftPriority !== rightPriority) {
      return {
        firstSide: leftPriority > rightPriority ? "left" as const : "right" as const,
        faster:
          leftPriority > rightPriority
            ? `${resolvedLeftPokemon.name} 선공`
            : `${resolvedRightPokemon.name} 선공`,
        reason: `우선도 비교 (왼쪽 ${leftPriority > 0 ? `+${leftPriority}` : leftPriority} / 오른쪽 ${rightPriority > 0 ? `+${rightPriority}` : rightPriority})`,
      };
    }

    return {
      firstSide:
        speedCompare.faster === "동속"
          ? ("left" as const)
          : speedCompare.faster.includes(resolvedLeftPokemon.name)
            ? ("left" as const)
            : ("right" as const),
      faster: speedCompare.faster,
      reason: "스피드 기준",
    };
  }, [resolvedLeftMove, resolvedLeftPokemon, resolvedRightMove, resolvedRightPokemon, speedCompare]);

  const turnSimulation = useMemo(() => {
    if (!leftBuild || !rightBuild || !speedOrderSummary || !resolvedLeftMove || !resolvedRightMove) {
      return null;
    }

    const leftName = leftBuild.nickname || leftBuild.pokemonName;
    const rightName = rightBuild.nickname || rightBuild.pokemonName;

    const firstSide: "left" | "right" = speedOrderSummary.firstSide;
    const secondSide: "left" | "right" = firstSide === "left" ? "right" : "left";

    const defenseReady = { left: false, right: false };
    let firstKoGuaranteed = false;

    const estimateAction = (
      side: "left" | "right",
      attackerHpPercent: number,
      previousMoveName?: string,
      movedAfterTarget?: boolean,
      wasHitEarlierThisTurn?: boolean,
    ) => {
      if (!resolvedLeftPokemon || !resolvedRightPokemon || !leftAttackInput || !rightAttackInput) {
        return null;
      }
      if (side === "left") {
        return estimateDamagePercent(
          resolvedLeftPokemon,
          resolvedRightPokemon,
          leftAttackInput,
          resolvedLeftMove,
          {
            ...leftDamageOptions,
            attackerCurrentHpPercent: attackerHpPercent,
            defenderCurrentHpPercent: 100,
            previousMoveName,
            movedAfterTarget,
            wasHitEarlierThisTurn,
          },
        );
      }
      return estimateDamagePercent(
        resolvedRightPokemon,
        resolvedLeftPokemon,
        rightAttackInput,
        resolvedRightMove,
        {
          ...rightDamageOptions,
          attackerCurrentHpPercent: attackerHpPercent,
          defenderCurrentHpPercent: 100,
          previousMoveName,
          movedAfterTarget,
          wasHitEarlierThisTurn,
        },
      );
    };

    const runAction = (
      side: "left" | "right",
      attackerHpPercent: number,
      previousMoveName?: string,
      movedAfterTarget?: boolean,
      wasHitEarlierThisTurn?: boolean,
    ) => {
      const actorName = side === "left" ? leftName : rightName;
      const targetName = side === "left" ? rightName : leftName;
      const move = side === "left" ? resolvedLeftMove : resolvedRightMove;
      const targetSide = side === "left" ? "right" : "left";

      if (isDefensiveMove(move)) {
        defenseReady[side] = true;
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: 방어 자세를 취합니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
      }

      if ((move.category === "status" || move.power === null) && !isFinalGambitMove(move)) {
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: 변화기라 직접 데미지를 주지 않습니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
      }

      if (defenseReady[targetSide]) {
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: ${targetName}의 방어로 막힙니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
      }

      const estimate = estimateAction(
        side,
        attackerHpPercent,
        previousMoveName,
        movedAfterTarget,
        wasHitEarlierThisTurn,
      );
      if (!estimate) {
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: 계산 데이터를 불러오지 못했습니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
      }

      return {
        summary: `${actorName}의 ${displayMoveName(move.name)} → ${targetName}: ${estimate.minPercent}% ~ ${estimate.maxPercent}% (${estimate.koState})`,
        expectedDamageToTarget: (estimate.minPercent + estimate.maxPercent) / 2,
        guaranteedKo: estimate.minPercent >= 100,
        adjustedPower: estimate.movePower,
        gimmickSummary: estimate.gimmickSummary,
      };
    };

    const firstAction = runAction(firstSide, 100);
    firstKoGuaranteed = firstAction.guaranteedKo;
    const secondActorHpAfterFirstHit = Math.max(0, 100 - firstAction.expectedDamageToTarget);
    const secondAction = firstKoGuaranteed
      ? {
          summary: `${secondSide === "left" ? leftName : rightName}은(는) 확정 1타 가정으로 행동하지 못합니다.`,
          adjustedPower: null as number | null,
          gimmickSummary: "없음",
        }
      : (() => {
          const firstMoveName = firstSide === "left" ? resolvedLeftMove.name : resolvedRightMove.name;
          const result = runAction(
            secondSide,
            secondActorHpAfterFirstHit,
            firstMoveName,
            true,
            firstAction.expectedDamageToTarget > 0,
          );
          return { summary: result.summary, adjustedPower: result.adjustedPower, gimmickSummary: result.gimmickSummary };
        })();

    return {
      firstActionSummary: firstAction.summary,
      firstActionGimmicks: firstAction.gimmickSummary,
      secondActionSummary: secondAction.summary,
      secondActionGimmicks: secondAction.gimmickSummary,
      secondActorHpAfterFirstHit: Math.round(secondActorHpAfterFirstHit * 10) / 10,
      secondActionPower: secondAction.adjustedPower,
    };
  }, [
    leftBuild,
    leftAttackInput,
    leftDamageOptions,
    resolvedLeftMove,
    resolvedLeftPokemon,
    resolvedRightMove,
    resolvedRightPokemon,
    rightAttackInput,
    rightBuild,
    rightDamageOptions,
    speedOrderSummary,
  ]);

  const resetBuilderForm = () => {
    setNickname("");
    setPokemonName("");
    setRole("sweeper");
    setNature("Jolly");
    setAbility("");
    setItem("");
    setTeraType("");
    setEvs(EMPTY_SPREAD);
    setIvs(DEFAULT_IVS);
    setMoves(["", "", "", ""]);
  };

  const addBuild = () => {
    const learnsetSet = new Set(learnsetMoves.map((move) => normalize(displayMoveName(move))));
    const trimmedMoves: [string, string, string, string] = [
      displayMoveName(moves[0].trim()),
      displayMoveName(moves[1].trim()),
      displayMoveName(moves[2].trim()),
      displayMoveName(moves[3].trim()),
    ];

    if (!pokemonName.trim()) {
      setNotice("포켓몬 이름을 입력해 주세요.");
      return;
    }

    const enteredMoves = trimmedMoves.filter((move) => move.trim().length > 0);

    if (enteredMoves.length > 0 && learnsetStatus !== "ready") {
      setNotice("학습 기술 데이터를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (enteredMoves.some((move) => !learnsetSet.has(normalize(move)))) {
      setNotice("입력한 기술 중 실제로 해당 포켓몬이 배우지 못하는 기술이 있습니다.");
      return;
    }

    if (getSpreadTotal(evs) > MAX_TOTAL_EVS) {
      setNotice(`노력치 총합은 ${MAX_TOTAL_EVS}를 넘길 수 없습니다.`);
      return;
    }

    const entity: RegisteredEntity = {
      id: crypto.randomUUID(),
      nickname: nickname.trim(),
      pokemonName: pokemonName.trim(),
      role,
      teraType: teraType.trim(),
      nature,
      ability: ability.trim(),
      item: item.trim(),
      evs,
      ivs,
      moves: enteredMoves,
    };

    setRegisteredBuilds((prev) => [...prev, entity]);
    setBuilderSelectedId(entity.id);
    setNotice(`${entity.nickname || entity.pokemonName} 개체를 등록했습니다.`);

    if (!leftId) {
      setLeftId(entity.id);
    } else if (!rightId) {
      setRightId(entity.id);
    }
  };

  const addAiSuggestedBuild = (suggestedBuild: AiSuggestedBuild) => {
    const sanitizedMoves = suggestedBuild.moves
      .map((move) => displayMoveName(move.trim()))
      .filter((move, index, source) => move.length > 0 && source.indexOf(move) === index)
      .slice(0, 4);

    const entity: RegisteredEntity = {
      id: crypto.randomUUID(),
      nickname: suggestedBuild.nickname.trim(),
      pokemonName: suggestedBuild.pokemonName.trim(),
      role: suggestedBuild.role,
      teraType: suggestedBuild.teraType.trim(),
      nature: suggestedBuild.nature.trim() || "Jolly",
      ability: suggestedBuild.ability.trim(),
      item: suggestedBuild.item.trim(),
      evs: suggestedBuild.evs,
      ivs: suggestedBuild.ivs,
      moves: sanitizedMoves,
    };

    setRegisteredBuilds((prev) => [...prev, entity]);
    setBuilderSelectedId(entity.id);
    loadBuildToForm(entity);
    setNotice(`${entity.nickname || entity.pokemonName} 개체를 AI 추천에서 추가했습니다.`);

    if (!leftId) {
      setLeftId(entity.id);
    } else if (!rightId) {
      setRightId(entity.id);
    }
  };

  const loadBuildToForm = (entry: RegisteredEntity) => {
    setNickname(entry.nickname);
    setPokemonName(entry.pokemonName);
    setRole(entry.role);
    setNature(entry.nature || "Jolly");
    setAbility(entry.ability);
    setItem(entry.item);
    setTeraType((entry.teraType as TeraType | "") || "");
    setEvs(entry.evs);
    setIvs(entry.ivs);
    setMoves([
      entry.moves[0] ?? "",
      entry.moves[1] ?? "",
      entry.moves[2] ?? "",
      entry.moves[3] ?? "",
    ]);
    setNotice(`${entry.nickname || entry.pokemonName} 정보를 등록 폼으로 불러왔습니다.`);
  };

  const removeBuild = (id: string) => {
    const target = registeredBuilds.find((entry) => entry.id === id);
    setRegisteredBuilds((prev) => prev.filter((entry) => entry.id !== id));

    if (leftId === id) {
      setLeftId("");
    }
    if (rightId === id) {
      setRightId("");
    }

    if (target) {
      setNotice(`${target.nickname || target.pokemonName} 개체를 삭제했습니다.`);
    }
  };

  const saveBuild = () => {
    const selectedBuild =
      builderSelectedId === NEW_BUILD_OPTION
        ? null
        : (registeredBuilds.find((entry) => entry.id === builderSelectedId) ?? null);

    if (!selectedBuild) {
      addBuild();
      return;
    }

    const learnsetSet = new Set(learnsetMoves.map((move) => normalize(displayMoveName(move))));
    const trimmedMoves: [string, string, string, string] = [
      displayMoveName(moves[0].trim()),
      displayMoveName(moves[1].trim()),
      displayMoveName(moves[2].trim()),
      displayMoveName(moves[3].trim()),
    ];

    if (!pokemonName.trim()) {
      setNotice("포켓몬 이름을 입력해 주세요.");
      return;
    }

    const enteredMoves = trimmedMoves.filter((move) => move.trim().length > 0);
    if (enteredMoves.length > 0 && learnsetStatus !== "ready") {
      setNotice("학습 기술 데이터를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (enteredMoves.some((move) => !learnsetSet.has(normalize(move)))) {
      setNotice("입력한 기술 중 해당 포켓몬이 배울 수 없는 기술이 있습니다.");
      return;
    }
    if (getSpreadTotal(evs) > MAX_TOTAL_EVS) {
      setNotice(`노력치 총합은 ${MAX_TOTAL_EVS}를 넘길 수 없습니다.`);
      return;
    }

    const candidate: RegisteredEntity = {
      id: selectedBuild.id,
      nickname: nickname.trim(),
      pokemonName: pokemonName.trim(),
      role,
      teraType: teraType.trim(),
      nature,
      ability: ability.trim(),
      item: item.trim(),
      evs,
      ivs,
      moves: enteredMoves,
    };

    const oldName = selectedBuild.nickname.trim() || selectedBuild.pokemonName.trim();
    const newName = candidate.nickname.trim() || candidate.pokemonName.trim();
    if (oldName === newName) {
      setRegisteredBuilds((prev) => prev.map((entry) => (entry.id === selectedBuild.id ? candidate : entry)));
      setNotice(`${newName} 개체를 수정/저장했습니다.`);
      return;
    }

    const newEntity: RegisteredEntity = {
      ...candidate,
      id: crypto.randomUUID(),
    };
    setRegisteredBuilds((prev) => [...prev, newEntity]);
    setBuilderSelectedId(newEntity.id);
    setNotice(`${newName} 개체를 신규 저장했습니다.`);
  };

  const deleteOrClearBuilder = () => {
    const selectedBuild =
      builderSelectedId === NEW_BUILD_OPTION
        ? null
        : (registeredBuilds.find((entry) => entry.id === builderSelectedId) ?? null);

    if (selectedBuild) {
      removeBuild(selectedBuild.id);
      setBuilderSelectedId(NEW_BUILD_OPTION);
    }

    resetBuilderForm();
    if (!selectedBuild) {
      setNotice("작성 중인 폼을 비웠습니다.");
    }
  };

  const applyBuilderSelection = (nextId: string) => {
    setBuilderSelectedId(nextId);
    if (nextId === NEW_BUILD_OPTION) {
      resetBuilderForm();
      setNotice("신규 개체 등록 모드로 전환했습니다.");
      return;
    }

    const selected = registeredBuilds.find((entry) => entry.id === nextId);
    if (!selected) {
      setBuilderSelectedId(NEW_BUILD_OPTION);
      resetBuilderForm();
      return;
    }
    loadBuildToForm(selected);
  };

  useEffect(() => {
    if (builderSelectedId === NEW_BUILD_OPTION) {
      return;
    }
    if (!registeredBuilds.some((entry) => entry.id === builderSelectedId)) {
      setBuilderSelectedId(NEW_BUILD_OPTION);
    }
  }, [builderSelectedId, registeredBuilds]);

  const aiProgressSteps = useMemo(() => {
    const steps = [
      { key: "prepare", label: "질문 정리" },
      { key: "context", label: "등록 개체/도감 컨텍스트 구성" },
      { key: "request", label: "AI 서버 요청" },
      { key: "analyze", label: "응답 검증/분석" },
      { key: "compose", label: "최종 답변 정리" },
    ] as const;

    if (aiStatus === "idle") {
      return [] as Array<{ key: string; label: string; state: "done" | "active" | "pending" }>;
    }

    const stageIndexByKey: Record<AiProgressStage, number> = {
      prepare: 0,
      context: 1,
      request: 2,
      analyze: 3,
      compose: 4,
    };
    let activeIndex = stageIndexByKey[aiProgressStage];
    if (aiStatus === "connecting") {
      activeIndex = Math.min(activeIndex, 2);
    } else if (aiStatus === "generating") {
      activeIndex = Math.max(activeIndex, 3);
    }

    return steps.map((step, index) => ({
      key: step.key,
      label: step.label,
      state: index < activeIndex ? ("done" as const) : index === activeIndex ? ("active" as const) : ("pending" as const),
    }));
  }, [aiProgressStage, aiStatus]);

  const aiStatusLabel = useMemo(() => {
    if (aiStatus === "idle") {
      return "";
    }
    if (aiProgressStage === "prepare") {
      return "요청 준비 중...";
    }
    if (aiProgressStage === "context") {
      return "등록 개체/도감 정보 정리 중...";
    }
    if (aiProgressStage === "request") {
      return "AI 서버 연결 및 요청 전송 중...";
    }
    if (aiProgressStage === "analyze") {
      return "AI 응답 분석 중...";
    }
    return "답변 정리 중...";
  }, [aiProgressStage, aiStatus]);

  const sendAiMessage = async () => {
    if (aiStatus !== "idle") {
      return;
    }

    const trimmed = aiInput.trim();
    if (!trimmed) {
      return;
    }

    const userMessage: AiMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setAiMessages((prev) => [...prev, userMessage]);
    setAiInput("");
    setAiStatus("connecting");
    setAiProgressStage("prepare");
    let disposed = false;
    const progressTimers: number[] = [];
    const setStagedTimer = (delay: number, stage: AiProgressStage) => {
      const timer = window.setTimeout(() => {
        if (!disposed) {
          setAiProgressStage(stage);
        }
      }, delay);
      progressTimers.push(timer);
    };
    setStagedTimer(180, "context");
    setStagedTimer(650, "request");

    const stageTimer = setTimeout(() => {
      setAiStatus((prev) => {
        if (prev !== "connecting") {
          return prev;
        }
        setAiProgressStage("analyze");
        return "generating";
      });
    }, 1200);
    setStagedTimer(1800, "compose");

    try {
      const aiReply = await fetchAiCoachReply(trimmed, registeredBuilds);
      const assistantMessage: AiMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: aiReply?.reply ?? generateLocalAiReply(trimmed, registeredBuilds),
        suggestedBuilds: aiReply?.suggestedBuilds ?? [],
      };
      setAiMessages((prev) => [...prev, assistantMessage]);
    } finally {
      disposed = true;
      clearTimeout(stageTimer);
      progressTimers.forEach((timer) => clearTimeout(timer));
      setAiStatus("idle");
      setAiProgressStage("prepare");
    }
  };

  const sendDebugAiMessage = async () => {
    if (devAiLoading) {
      return;
    }

    const trimmed = devAiInput.trim();
    if (!trimmed) {
      setNotice("개발자 탭 질문을 입력해 주세요.");
      return;
    }

    setDevAiLoading(true);
    try {
      const debugResult = await fetchAiCoachDebug(trimmed, registeredBuilds);
      if (!debugResult) {
        setNotice("RAG 디버그 응답을 가져오지 못했습니다.");
        return;
      }
      setDevAiResult(debugResult);
      setNotice("RAG 디버그 컨텍스트를 불러왔습니다.");
    } finally {
      setDevAiLoading(false);
    }
  };

  return (
    <section className="pk-shell mx-auto w-full max-w-6xl overflow-hidden rounded-[28px] p-5 md:p-8">
      <div className="pk-hud mb-6 flex items-center justify-between gap-3 p-3 md:p-4">
        <div>
          <p className="pk-pill">SV BATTLE BUILDER</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 md:text-2xl">포켓몬 실전 개체 도감</h1>
        </div>
        <div className="hidden h-14 w-14 items-center justify-center rounded-full border-4 border-slate-900 bg-gradient-to-b from-red-500 to-red-600 md:flex">
          <div className="h-4 w-4 rounded-full border-2 border-slate-900 bg-white" />
        </div>
      </div>

      <div className="pk-tabs mb-2 flex items-center gap-2 rounded-xl p-2">
        <button
          type="button"
          onClick={() => setTab("builder")}
          className={`px-4 py-2 text-sm font-semibold transition ${tab === "builder" ? "pk-tab-active" : "pk-tab-idle"}`}
        >
          개체 추가/관리        </button>
        <button
          type="button"
          onClick={() => setTab("matchup")}
          className={`px-4 py-2 text-sm font-semibold transition ${tab === "matchup" ? "pk-tab-active" : "pk-tab-idle"}`}
        >
          매치업        </button>
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={`px-4 py-2 text-sm font-semibold transition ${tab === "ai" ? "pk-tab-active" : "pk-tab-idle"}`}
        >
          AI 코치
        </button>
        <button
          type="button"
          onClick={() => setTab("dev")}
          className={`px-4 py-2 text-sm font-semibold transition ${tab === "dev" ? "pk-tab-active" : "pk-tab-idle"}`}
        >
          개발자
        </button>
      </div>

      <div className="pk-divider" />

      {notice ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}

      {tab === "builder" ? (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">개체 추가/관리</h2>

          <label className="grid gap-1 text-sm text-slate-700">
            개체 선택
            <select
              value={builderSelectedId}
              onChange={(event) => applyBuilderSelection(event.target.value)}
              className="pk-control"
            >
              <option value={NEW_BUILD_OPTION}>새로 추가</option>
              {registeredBuilds.map((entry) => (
                <option key={`builder-select-${entry.id}`} value={entry.id}>
                  {entry.nickname || entry.pokemonName}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              별명(선택)
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="pk-control"
                placeholder="예: 역전 카이오가"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              포켓몬 이름
              <input
                list="builder-pokemon"
                value={pokemonName}
                onChange={(event) => setPokemonName(event.target.value)}
                className="pk-control"
                placeholder="예: 코라이돈"
              />
              <datalist id="builder-pokemon">
                {pokemonSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              역할
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as PokemonRole)}
                className="pk-control"
              >
                {ROLE_OPTIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {ROLE_LABELS[entry]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {builderPokemonEntry ? (
            <div className="pk-card pk-card-soft p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">선택 포켓몬 일러스트</h3>
              <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className="flex items-center gap-4">
                  <Image
                    src={getPokemonArtworkUrl(builderPokemonEntry)}
                    alt={`${builderPokemonEntry.name} 일러스트`}
                    width={112}
                    height={112}
                    className="h-28 w-28 rounded-lg bg-white p-1 shadow"
                  />
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{builderPokemonEntry.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {builderPokemonEntry.types.map((type) => (
                        <TypeBadge key={`builder-type-${type}`} type={type} />
                      ))}
                    </div>
                    <p>
                      타입 {builderPokemonEntry.types.map((type) => TYPE_LABELS_KO[type] ?? type).join(" / ")}
                    </p>
                    <p>특성: {builderPokemonEntry.abilities.join(", ")}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <StatRadarChart
                    title="종족값"
                    spread={builderPokemonEntry.baseStats}
                    maxValue={BASE_STAT_RADAR_MAX_VALUE}
                    stroke="rgba(220,38,38,1)"
                    fill="rgba(220,38,38,0.25)"
                    overflowCap={BASE_STAT_RADAR_OVERFLOW_CAP}
                  />
                  <StatRadarChart
                    title="개체값(IV)"
                    spread={ivs}
                    maxValue={31}
                    stroke="rgba(37,99,235,1)"
                    fill="rgba(37,99,235,0.22)"
                  />
                  <StatRadarChart
                    title="노력치(EV)"
                    spread={evs}
                    maxValue={252}
                    stroke="rgba(16,185,129,1)"
                    fill="rgba(16,185,129,0.2)"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <label className="grid gap-1 text-sm text-slate-700">
              성격
              <select
                value={nature}
                onChange={(event) => setNature(event.target.value)}
                className="pk-control"
              >
                {NATURES.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {formatNatureOptionLabel(entry.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              특성
              <select
                value={ability}
                onChange={(event) => setAbility(event.target.value)}
                className="pk-control"
              >
                {builderPokemonEntry?.abilities?.length ? (
                  builderPokemonEntry.abilities.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))
                ) : (
                  <option value="">포켓몬을 먼저 선택해 주세요</option>
                )}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              도구
              <input
                list="builder-item"
                value={item}
                onChange={(event) => setItem(event.target.value)}
                className="pk-control"
              />
              <datalist id="builder-item">
                {itemSuggestions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              테라 타입
              <select
                value={teraType}
                onChange={(event) => setTeraType(event.target.value as TeraType | "")}
                className="pk-control"
              >
                <option value="">미지정</option>
                {TERA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS_KO[type] ?? type}
                  </option>
                ))}
              </select>
              {teraType ? <TypeBadge type={teraType as TeraType} /> : null}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">노력치(EV)</h3>
              <p className="mb-2 text-xs font-semibold text-slate-600">
                총합 {evTotal}/{MAX_TOTAL_EVS}
              </p>
              {STAT_KEYS.map((stat) => (
                <label key={`ev-${stat}`} className="mb-1 grid grid-cols-2 items-center gap-2 text-sm">
                  <span>{STAT_LABELS[stat]}</span>
                  <input
                    type="number"
                    value={evs[stat]}
                    min={0}
                    max={Math.min(252, MAX_TOTAL_EVS - (evTotal - evs[stat]))}
                    step={1}
                    onChange={(event) => setEvs((prev) => updateEvSpread(prev, stat, Number(event.target.value)))}
                    className="pk-control"
                  />
                </label>
              ))}
            </div>
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">개체값(IV)</h3>
              {STAT_KEYS.map((stat) => (
                <label key={`iv-${stat}`} className="mb-1 grid grid-cols-2 items-center gap-2 text-sm">
                  <span>{STAT_LABELS[stat]}</span>
                  <input
                    type="number"
                    value={ivs[stat]}
                    min={0}
                    max={31}
                    step={1}
                    onChange={(event) =>
                      setIvs((prev) => updateSpread(prev, stat, Number(event.target.value), 0, 31))
                    }
                    className="pk-control"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="pk-card border-amber-200 bg-amber-50/70 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">배운 기술 4개</h3>
            <p className="mb-2 text-xs text-slate-600">
              등록 가능한 기술은 해당 포켓몬이 실제로 배울 수 있는 기술만 허용합니다.
            </p>
            {learnsetStatus === "loading" ? (
              <p className="mb-2 text-xs text-slate-600">학습 기술 목록을 불러오는 중...</p>
            ) : null}
            {learnsetStatus === "error" ? (
              <p className="mb-2 text-xs text-rose-700">학습 기술 목록 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {MOVE_SLOT_IDS.map((slotId, index) => {
                const move = moves[index];
                return (
                <label key={slotId} className="grid gap-1 text-sm text-slate-700">
                  기술 {index + 1}
                  <input
                    list="builder-learnset"
                    value={move}
                    onChange={(event) =>
                      setMoves((prev) => {
                        const next = [...prev] as [string, string, string, string];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                    className="pk-control"
                  />
                </label>
                );
              })}
            </div>
            <datalist id="builder-learnset">
              {learnsetMoves.map((move) => (
                <option key={move} value={displayMoveName(move)} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveBuild}
              className="pk-primary-btn px-4 py-2 text-sm"
            >
              수정/저장            </button>
            <button
              type="button"
              onClick={deleteOrClearBuilder}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
            >
              삭제/비우기            </button>
          </div>
        </div>
      ) : tab === "matchup" ? (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">등록 개체 매치업 비교</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              왼쪽 개체
              <select
                value={leftId}
                onChange={(event) => setLeftId(event.target.value)}
                className="pk-control"
              >
                <option value="">선택</option>
                {registeredBuilds.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.nickname || entry.pokemonName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              오른쪽 개체
              <select
                value={rightId}
                onChange={(event) => setRightId(event.target.value)}
                className="pk-control"
              >
                <option value="">선택</option>
                {registeredBuilds.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.nickname || entry.pokemonName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              왼쪽 기술
              <select
                value={activeLeftMove}
                onChange={(event) => setLeftSelectedMove(event.target.value)}
                className="pk-control"
                disabled={!leftHasMoves}
              >
                {!leftHasMoves ? (
                  <option value="">등록된 기술 없음</option>
                ) : (
                  leftMoveOptions.map((move) => (
                    <option key={`left-move-${move}`} value={move}>
                      {displayMoveName(move)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              오른쪽 기술
              <select
                value={activeRightMove}
                onChange={(event) => setRightSelectedMove(event.target.value)}
                className="pk-control"
                disabled={!rightHasMoves}
              >
                {!rightHasMoves ? (
                  <option value="">등록된 기술 없음</option>
                ) : (
                  rightMoveOptions.map((move) => (
                    <option key={`right-move-${move}`} value={move}>
                      {displayMoveName(move)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              환경 효과
              <select
                value={battleEffect}
                onChange={(event) => setBattleEffect(event.target.value as BattleEffect)}
                className="pk-control"
              >
                {BATTLE_EFFECT_OPTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div
              className={`pk-card p-3 ${leftTeraEnabled && leftRegisteredTeraType ? "pk-card-tera" : ""}`}
              style={getTeraCardStyle(leftRegisteredTeraType, leftTeraEnabled)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">왼쪽 포켓몬</h3>
                <button
                  type="button"
                  className={`pk-tera-icon-btn ${leftTeraEnabled ? "is-on" : "is-off"} ${!leftRegisteredTeraType ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => setLeftTeraEnabled((prev) => !prev)}
                  disabled={!leftRegisteredTeraType}
                  title={leftRegisteredTeraType ? `왼쪽 테라스탈 ${leftTeraEnabled ? "ON" : "OFF"}` : "왼쪽 테라 타입 미지정"}
                >
                  <span className="pk-tera-gem" aria-hidden="true">T</span>
                  <span className="text-[11px] font-semibold">
                    {leftRegisteredTeraType ? (TYPE_LABELS_KO[leftRegisteredTeraType] ?? leftRegisteredTeraType) : "미지정"}
                  </span>
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-black text-slate-700">
                    {leftTeraEnabled ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
              {leftTeraEnabled && leftRegisteredTeraType ? <div className="pk-tera-prism" aria-hidden="true" /> : null}
              {leftBuild && resolvedLeftPokemon ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedLeftPokemon)}
                    alt={`${resolvedLeftPokemon.name} 일러스트`}
                    width={96}
                    height={96}
                    className={`h-24 w-24 rounded-lg bg-white p-1 shadow ${leftTeraEnabled && leftRegisteredTeraType ? "pk-tera-subject" : ""}`}
                  />
                  <p className="text-sm text-slate-700">{leftBuild.nickname || leftBuild.pokemonName}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">왼쪽 개체를 선택하면 일러스트가 표시됩니다.</p>
              )}
            </div>

            <div
              className={`pk-card p-3 ${rightTeraEnabled && rightRegisteredTeraType ? "pk-card-tera" : ""}`}
              style={getTeraCardStyle(rightRegisteredTeraType, rightTeraEnabled)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">오른쪽 포켓몬</h3>
                <button
                  type="button"
                  className={`pk-tera-icon-btn ${rightTeraEnabled ? "is-on" : "is-off"} ${!rightRegisteredTeraType ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => setRightTeraEnabled((prev) => !prev)}
                  disabled={!rightRegisteredTeraType}
                  title={rightRegisteredTeraType ? `오른쪽 테라스탈 ${rightTeraEnabled ? "ON" : "OFF"}` : "오른쪽 테라 타입 미지정"}
                >
                  <span className="pk-tera-gem" aria-hidden="true">T</span>
                  <span className="text-[11px] font-semibold">
                    {rightRegisteredTeraType ? (TYPE_LABELS_KO[rightRegisteredTeraType] ?? rightRegisteredTeraType) : "미지정"}
                  </span>
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-black text-slate-700">
                    {rightTeraEnabled ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
              {rightTeraEnabled && rightRegisteredTeraType ? <div className="pk-tera-prism" aria-hidden="true" /> : null}
              {rightBuild && resolvedRightPokemon ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedRightPokemon)}
                    alt={`${resolvedRightPokemon.name} 일러스트`}
                    width={96}
                    height={96}
                    className={`h-24 w-24 rounded-lg bg-white p-1 shadow ${rightTeraEnabled && rightRegisteredTeraType ? "pk-tera-subject" : ""}`}
                  />
                  <p className="text-sm text-slate-700">{rightBuild.nickname || rightBuild.pokemonName}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">오른쪽 개체를 선택하면 일러스트가 표시됩니다.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">왼쪽 스탯 보정</h3>
              {STAT_KEYS.filter((stat) => stat !== "hp").map((stat) => (
                <label key={`left-${stat}`} className="mb-1 grid grid-cols-2 items-center gap-2 text-sm">
                  <span>{STAT_LABELS[stat]}</span>
                  <input
                    type="number"
                    min={-6}
                    max={6}
                    value={leftStages[stat]}
                    onChange={(event) =>
                      setLeftStages((prev) => updateSpread(prev, stat, Number(event.target.value), -6, 6))
                    }
                    className="pk-control"
                  />
                </label>
              ))}
            </div>
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">오른쪽 스탯 보정</h3>
              {STAT_KEYS.filter((stat) => stat !== "hp").map((stat) => (
                <label key={`right-${stat}`} className="mb-1 grid grid-cols-2 items-center gap-2 text-sm">
                  <span>{STAT_LABELS[stat]}</span>
                  <input
                    type="number"
                    min={-6}
                    max={6}
                    value={rightStages[stat]}
                    onChange={(event) =>
                      setRightStages((prev) => updateSpread(prev, stat, Number(event.target.value), -6, 6))
                    }
                    className="pk-control"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="pk-card border-emerald-200 bg-emerald-50/75 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">매치업 계산 결과</h3>
            {leftToRightDamage && rightToLeftDamage && leftBuild && rightBuild ? (
              <div className="space-y-1 text-sm text-slate-700">
                <p className="text-xs text-slate-600">환경 효과: {selectedEffectOption.label}</p>
                {selectedEffectOption.weather === "none" && selectedEffectOption.value !== "none" ? (
                  <p className="text-xs text-slate-500">필드 효과는 현재 데미지 보정에 아직 반영되지 않고 표시용으로만 사용됩니다.</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-700">{matchupBlockingMessage}</p>
            )}

            {speedCompare && speedOrderSummary && turnSimulation ? (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  스피드 비교: 왼쪽 {speedCompare.leftSpeed} / 오른쪽 {speedCompare.rightSpeed} ({speedCompare.faster})
                </p>
                <p className="text-xs text-slate-600">
                  행동 순서: {speedOrderSummary.faster} ({speedOrderSummary.reason})
                </p>
                <p className="text-xs text-slate-700">1행동: {turnSimulation.firstActionSummary}</p>
                <p className="text-xs text-slate-600">1행동 기믹: {turnSimulation.firstActionGimmicks}</p>
                {gimmickTags(turnSimulation.firstActionGimmicks).length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {gimmickTags(turnSimulation.firstActionGimmicks).map((tag) => (
                      <span key={`first-gimmick-${tag}`} className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-slate-700">2행동: {turnSimulation.secondActionSummary}</p>
                <p className="text-xs text-slate-600">2행동 기믹: {turnSimulation.secondActionGimmicks}</p>
                {gimmickTags(turnSimulation.secondActionGimmicks).length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {gimmickTags(turnSimulation.secondActionGimmicks).map((tag) => (
                      <span key={`second-gimmick-${tag}`} className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-slate-600">첫 타 후 후공측 예상 잔여 HP: {turnSimulation.secondActorHpAfterFirstHit}%</p>
                {typeof turnSimulation.secondActionPower === "number" ? (
                  <p className="text-xs text-slate-600">후공 기술 적용 위력(HP 반영): {turnSimulation.secondActionPower}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : tab === "ai" ? (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">AI 코치 (로컬 모드)</h2>
          <p className="text-xs text-slate-600">
            현재는 API 없이 동작하는 로컬 코치입니다. 등록된 개체 정보를 바탕으로 요약/추천 가이드를 제공합니다.
          </p>

          <div ref={aiMessagesContainerRef} className="pk-card max-h-[420px] space-y-3 overflow-y-auto p-3">
            {aiMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${message.role === "assistant" ? "bg-slate-100 text-slate-800" : "bg-blue-600 text-white"}`}
              >
                <p className="mb-1 text-[11px] font-semibold opacity-80">{message.role === "assistant" ? "AI 코치" : "나"}</p>
                <p>{message.text}</p>
                {message.role === "assistant" && message.suggestedBuilds && message.suggestedBuilds.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-md border border-slate-300 bg-white/80 p-2 text-slate-800">
                    <p className="text-[11px] font-semibold text-slate-700">AI 추천 개체 추가</p>
                    {message.suggestedBuilds.map((build, index) => (
                      <div
                        key={`${message.id}-build-${build.pokemonName}-${index}`}
                        className="rounded-md border border-slate-200 bg-slate-50 p-2"
                      >
                        <p className="text-xs font-semibold text-slate-800">
                          {build.nickname ? `${build.nickname} (${build.pokemonName})` : build.pokemonName}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          역할 {ROLE_LABELS[build.role]} | 테라 {build.teraType || "미지정"} | 기술{" "}
                          {build.moves.length > 0 ? build.moves.join(" / ") : "없음"}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          성격 {build.nature || "미지정"} | EV {build.evs.hp}/{build.evs.atk}/{build.evs.def}/{build.evs.spa}/{build.evs.spd}/{build.evs.spe}
                        </p>
                        <button
                          type="button"
                          className="mt-2 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                          onClick={() => addAiSuggestedBuild(build)}
                        >
                          개체로 추가
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {aiStatus !== "idle" ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="mb-1 text-[11px] font-semibold opacity-80">AI 코치</p>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" aria-hidden="true" />
                  <p className="font-semibold">
                    {aiStatusLabel}
                  </p>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-amber-900/90">
                  {aiProgressSteps.map((step) => (
                    <div key={step.key} className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          step.state === "done"
                            ? "bg-emerald-500"
                            : step.state === "active"
                              ? "bg-amber-500"
                              : "bg-slate-300"
                        }`}
                        aria-hidden="true"
                      />
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <input
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  sendAiMessage();
                }
              }}
              className="pk-control flex-1"
              placeholder="예: 내 개체 요약해줘 / 역할별 추천해줘"
              disabled={aiStatus !== "idle"}
            />
            <button
              type="button"
              onClick={sendAiMessage}
              className="pk-primary-btn inline-flex items-center gap-2 px-4 py-2 text-sm"
              disabled={aiStatus !== "idle"}
            >
              {aiStatus === "idle" ? "전송" : "처리 중..."}
              {aiStatus !== "idle" ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent" aria-hidden="true" />
              ) : null}
            </button>
          </div>
        </div>
      ) : (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">개발자 탭 (RAG 디버그)</h2>
          <p className="text-xs text-slate-600">
            AI 요청 시 실제로 전달되는 등록 개체 컨텍스트와 RAG 컨텍스트를 확인합니다.
          </p>

          <div className="flex gap-2">
            <input
              value={devAiInput}
              onChange={(event) => setDevAiInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  sendDebugAiMessage();
                }
              }}
              className="pk-control flex-1"
              placeholder="예: 코라이돈 샘플 추천해줘"
              disabled={devAiLoading}
            />
            <button
              type="button"
              onClick={sendDebugAiMessage}
              className="pk-primary-btn inline-flex items-center gap-2 px-4 py-2 text-sm"
              disabled={devAiLoading}
            >
              {devAiLoading ? "조회 중..." : "RAG 보기"}
              {devAiLoading ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent" aria-hidden="true" />
              ) : null}
            </button>
          </div>

          <div className="grid gap-3">
            <div className="pk-card p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">AI 답변</p>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-800">
                {devAiResult?.reply || "아직 조회하지 않았습니다."}
              </pre>
            </div>
            <div className="pk-card p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">등록 개체 컨텍스트</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-800">
                {devAiResult?.registeredContext || "debug.registeredContext 없음"}
              </pre>
            </div>
            <div className="pk-card p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">RAG 컨텍스트</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-800">
                {devAiResult?.ragContext || "debug.ragContext 없음"}
              </pre>
            </div>
            <div className="pk-card p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">원본 응답 JSON</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-800">
                {devAiResult?.rawJson || "아직 조회하지 않았습니다."}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


