"use client";

import { useEffect, useMemo, useState } from "react";
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

type TabMode = "builder" | "matchup";

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

const BUILDS_STORAGE_KEY = "sv-battle:registered-builds";
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
    "판별",
    "킹실드",
    "니들가드",
    "블로킹",
    "화염의 수호",
    "실크트랩",
    "트릭가드",
    "와이드가드",
  ]);

  return defensiveMoves.has(normalized);
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

  const evTotal = getSpreadTotal(evs);

  useEffect(() => {
    window.localStorage.setItem(BUILDS_STORAGE_KEY, JSON.stringify(registeredBuilds));
  }, [registeredBuilds]);

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
      return "좌우 개체를 선택하면 양방향 계산이 표시됩니다.";
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
    return "좌우 개체와 각 기술을 선택하면 양방향 계산이 표시됩니다.";
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
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: 방어 태세를 갖췄습니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
      }

      if (move.category === "status" || move.power === null) {
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: 변화기라 직접 데미지는 없습니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
      }

      if (defenseReady[targetSide]) {
        return { summary: `${actorName}의 ${displayMoveName(move.name)}: ${targetName}의 방어로 막혔습니다.`, expectedDamageToTarget: 0, guaranteedKo: false, adjustedPower: null as number | null, gimmickSummary: "없음" };
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
    setNotice(`${entity.nickname || entity.pokemonName} 개체를 등록했습니다.`);

    if (!leftId) {
      setLeftId(entity.id);
    } else if (!rightId) {
      setRightId(entity.id);
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
          개체 추가
        </button>
        <button
          type="button"
          onClick={() => setTab("matchup")}
          className={`px-4 py-2 text-sm font-semibold transition ${tab === "matchup" ? "pk-tab-active" : "pk-tab-idle"}`}
        >
          매치업
        </button>
      </div>

      <div className="pk-divider" />

      {notice ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}

      {tab === "builder" ? (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">신규 개체 등록</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              별칭(선택)
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="pk-control"
                placeholder="예: 안경 파오젠"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              포켓몬 이름
              <input
                list="builder-pokemon"
                value={pokemonName}
                onChange={(event) => setPokemonName(event.target.value)}
                className="pk-control"
                placeholder="예: 파오젠"
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
                      타입: {builderPokemonEntry.types.map((type) => TYPE_LABELS_KO[type] ?? type).join(" / ")}
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
                  <option value="">포켓몬을 먼저 선택하세요</option>
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
                <option value="">미설정</option>
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
              등록 가능한 기술은 해당 포켓몬이 실제로 배울 수 있는 기술만 허용됩니다.
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

          <button
            type="button"
            onClick={addBuild}
                className="pk-primary-btn px-4 py-2 text-sm"
          >
            개체 등록
          </button>
        </div>
      ) : (
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
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">왼쪽 포켓몬</h3>
              {leftBuild && resolvedLeftPokemon ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedLeftPokemon)}
                    alt={`${resolvedLeftPokemon.name} 일러스트`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg bg-white p-1 shadow"
                  />
                  <p className="text-sm text-slate-700">{leftBuild.nickname || leftBuild.pokemonName}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">왼쪽 개체를 선택하면 일러스트가 표시됩니다.</p>
              )}
            </div>

            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">오른쪽 포켓몬</h3>
              {rightBuild && resolvedRightPokemon ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedRightPokemon)}
                    alt={`${resolvedRightPokemon.name} 일러스트`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg bg-white p-1 shadow"
                  />
                  <p className="text-sm text-slate-700">{rightBuild.nickname || rightBuild.pokemonName}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">오른쪽 개체를 선택하면 일러스트가 표시됩니다.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 md:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
              <span>
                왼쪽 테라스탈
                {" "}
                ({leftRegisteredTeraType ? TYPE_LABELS_KO[leftRegisteredTeraType] ?? leftRegisteredTeraType : "미설정"})
              </span>
              <button
                type="button"
                className={`rounded-md px-3 py-1 font-semibold ${leftTeraEnabled ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-700"} ${!leftRegisteredTeraType ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => setLeftTeraEnabled((prev) => !prev)}
                disabled={!leftRegisteredTeraType}
              >
                {leftTeraEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
              <span>
                오른쪽 테라스탈
                {" "}
                ({rightRegisteredTeraType ? TYPE_LABELS_KO[rightRegisteredTeraType] ?? rightRegisteredTeraType : "미설정"})
              </span>
              <button
                type="button"
                className={`rounded-md px-3 py-1 font-semibold ${rightTeraEnabled ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-700"} ${!rightRegisteredTeraType ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => setRightTeraEnabled((prev) => !prev)}
                disabled={!rightRegisteredTeraType}
              >
                {rightTeraEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">왼쪽 랭크 보정</h3>
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
              <h3 className="mb-2 text-sm font-semibold text-slate-900">오른쪽 랭크 보정</h3>
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
      )}
    </section>
  );
}

