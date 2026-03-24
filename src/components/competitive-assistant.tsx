"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { NATURES, ROLE_LABELS, STAT_KEYS, STAT_LABELS, TYPE_LABELS_KO } from "@/lib/pokemon/constants";
import { TERA_TYPES } from "@/lib/pokemon/data";
import {
  estimateDamagePercent,
  estimateMoveDecisivePower,
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
  moves: [string, string, string, string];
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

const WEATHER_OPTIONS: Array<{ value: BattleWeather; label: string }> = [
  { value: "none", label: "없음" },
  { value: "sun", label: "쾌청" },
  { value: "rain", label: "비" },
  { value: "sand", label: "모래바람" },
  { value: "snow", label: "눈" },
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
        entry.moves.length === 4 &&
        typeof entry.pokemonName === "string",
      )
      .map((entry) => ({
        ...entry,
        moves: entry.moves.map((move) => {
          const mapped = MOVE_NAME_KO_OVERRIDES[normalize(move)] ?? move;
          return mapped;
        }) as [string, string, string, string],
      }));
  } catch {
    return [];
  }
}

function displayMoveName(moveName: string): string {
  return MOVE_NAME_KO_OVERRIDES[normalize(moveName)] ?? moveName;
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
    return `${nature.labelKo} (臾대낫??`;
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
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44" role="img" aria-label={`${title} 6媛곹삎 ?뚮씪誘명꽣`}>
        <title>{`${title} 6媛곹삎 ?뚮씪誘명꽣`}</title>
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
  const [attackerSide, setAttackerSide] = useState<"left" | "right">("left");
  const [selectedMove, setSelectedMove] = useState<string>("");
  const [weather, setWeather] = useState<BattleWeather>("none");
  const [attackerTeraType, setAttackerTeraType] = useState<TeraType | "">("");
  const [defenderTeraType, setDefenderTeraType] = useState<TeraType | "">("");
  const [leftStages, setLeftStages] = useState<StatSpread>(DEFAULT_STAGES);
  const [rightStages, setRightStages] = useState<StatSpread>(DEFAULT_STAGES);

  const [resolvedAttacker, setResolvedAttacker] = useState<PokemonEntry | null>(null);
  const [resolvedDefender, setResolvedDefender] = useState<PokemonEntry | null>(null);
  const [resolvedMove, setResolvedMove] = useState<MoveEntry | null>(null);

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

  const attackerBuild = attackerSide === "left" ? leftBuild : rightBuild;
  const defenderBuild = attackerSide === "left" ? rightBuild : leftBuild;

  const attackerStages = attackerSide === "left" ? leftStages : rightStages;
  const defenderStages = attackerSide === "left" ? rightStages : leftStages;

  const attackerMoveOptions = useMemo<string[]>(
    () => (attackerBuild ? [...attackerBuild.moves] : []),
    [attackerBuild],
  );

  const activeMove = useMemo(
    () =>
      attackerMoveOptions.some((moveName) => moveName === selectedMove)
        ? selectedMove
        : (attackerMoveOptions[0] ?? ""),
    [attackerMoveOptions, selectedMove],
  );

  useEffect(() => {
    if (!attackerBuild || !defenderBuild || !activeMove) {
      return;
    }

    const params = new URLSearchParams({
      attacker: attackerBuild.pokemonName,
      defender: defenderBuild.pokemonName,
      move: activeMove,
    });

    fetch(`/api/battle?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as {
          attacker: PokemonEntry | null;
          defender: PokemonEntry | null;
          move: MoveEntry | null;
        };
      })
      .then((payload) => {
        if (!payload) {
          setResolvedAttacker(null);
          setResolvedDefender(null);
          setResolvedMove(null);
          return;
        }

        setResolvedAttacker(payload.attacker);
        setResolvedDefender(payload.defender);
        setResolvedMove(payload.move);
      })
      .catch(() => {
        setResolvedAttacker(null);
        setResolvedDefender(null);
        setResolvedMove(null);
      });
  }, [activeMove, attackerBuild, defenderBuild]);

  const matchupInput = useMemo<BuildInput | null>(() => {
    if (!attackerBuild || !defenderBuild) {
      return null;
    }

    return {
      pokemonName: attackerBuild.pokemonName,
      targetPokemonName: defenderBuild.pokemonName,
      moveName: activeMove,
      role: attackerBuild.role,
      teraType: attackerBuild.teraType,
      nature: attackerBuild.nature,
      ability: attackerBuild.ability,
      item: attackerBuild.item,
      evs: attackerBuild.evs,
      ivs: attackerBuild.ivs,
      attackerStages,
      defenderStages,
    };
  }, [activeMove, attackerBuild, attackerStages, defenderBuild, defenderStages]);

  const damageOptions = useMemo<DamageCalcOptions>(
    () => ({
      attackerTeraType,
      defenderTeraType,
      weather,
      attackerAbility: attackerBuild?.ability ?? "",
      defenderAbility: defenderBuild?.ability ?? "",
    }),
    [attackerBuild?.ability, attackerTeraType, defenderBuild?.ability, defenderTeraType, weather],
  );

  const damageEstimate = useMemo(() => {
    if (!resolvedAttacker || !resolvedDefender || !resolvedMove || !matchupInput) {
      return null;
    }

    return estimateDamagePercent(
      resolvedAttacker,
      resolvedDefender,
      matchupInput,
      resolvedMove,
      damageOptions,
    );
  }, [damageOptions, matchupInput, resolvedAttacker, resolvedDefender, resolvedMove]);

  const movePowerEstimate = useMemo(() => {
    if (!resolvedAttacker || !resolvedMove || !matchupInput) {
      return null;
    }

    return estimateMoveDecisivePower(resolvedAttacker, matchupInput, resolvedMove, damageOptions);
  }, [damageOptions, matchupInput, resolvedAttacker, resolvedMove]);

  const speedCompare = useMemo(() => {
    if (!resolvedAttacker || !resolvedDefender || !attackerBuild || !defenderBuild) {
      return null;
    }

    const attackerInput: BuildInput = {
      pokemonName: attackerBuild.pokemonName,
      targetPokemonName: defenderBuild.pokemonName,
      moveName: activeMove,
      role: attackerBuild.role,
      teraType: attackerBuild.teraType,
      nature: attackerBuild.nature,
      ability: attackerBuild.ability,
      item: attackerBuild.item,
      evs: attackerBuild.evs,
      ivs: attackerBuild.ivs,
      attackerStages,
      defenderStages,
    };

    const defenderInput: BuildInput = {
      pokemonName: defenderBuild.pokemonName,
      targetPokemonName: attackerBuild.pokemonName,
      moveName: activeMove,
      role: defenderBuild.role,
      teraType: defenderBuild.teraType,
      nature: defenderBuild.nature,
      ability: defenderBuild.ability,
      item: defenderBuild.item,
      evs: defenderBuild.evs,
      ivs: defenderBuild.ivs,
      attackerStages: defenderStages,
      defenderStages: attackerStages,
    };

    const attackerSpeed = estimateSpeed(resolvedAttacker, attackerInput);
    const defenderSpeed = estimateSpeed(resolvedDefender, defenderInput);
    const attackerPriority = resolvedMove?.priority ?? 0;
    const defenderPriority = 0;

    return {
      attackerSpeed,
      defenderSpeed,
      attackerPriority,
      defenderPriority,
      faster:
        attackerSpeed === defenderSpeed
          ? "?숈냽"
          : attackerSpeed > defenderSpeed
            ? `${resolvedAttacker.name} ?좉났`
            : `${resolvedDefender.name} ?좉났`,
    };
  }, [
    attackerBuild,
    attackerStages,
    defenderBuild,
    defenderStages,
    resolvedAttacker,
    resolvedDefender,
    resolvedMove,
    activeMove,
  ]);

  const speedOrderSummary = useMemo(() => {
    if (!speedCompare || !resolvedAttacker || !resolvedDefender) {
      return null;
    }

    const attackerPriority = resolvedMove?.priority ?? 0;
    const defenderPriority = 0;

    if (attackerPriority !== defenderPriority) {
      return {
        faster:
          attackerPriority > defenderPriority
            ? `${resolvedAttacker.name} 선공`
            : `${resolvedDefender.name} 선공`,
        reason: `우선도 ${attackerPriority > 0 ? `+${attackerPriority}` : attackerPriority} 적용`,
      };
    }

    return {
      faster: speedCompare.faster,
      reason: "스피드 기준",
    };
  }, [resolvedAttacker, resolvedDefender, resolvedMove, speedCompare]);

  const addBuild = () => {
    const learnsetSet = new Set(learnsetMoves.map((move) => normalize(displayMoveName(move))));
    const trimmedMoves: [string, string, string, string] = [
      displayMoveName(moves[0].trim()),
      displayMoveName(moves[1].trim()),
      displayMoveName(moves[2].trim()),
      displayMoveName(moves[3].trim()),
    ];

    if (!pokemonName.trim()) {
      setNotice("?ъ폆紐??대쫫???낅젰??二쇱꽭??");
      return;
    }

    if (learnsetStatus !== "ready") {
      setNotice("?숈뒿 湲곗닠 ?곗씠?곕? ?꾩쭅 遺덈윭?ㅼ? 紐삵뻽?듬땲?? ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??");
      return;
    }

    if (trimmedMoves.some((move) => !move)) {
      setNotice("諛곗슱 湲곗닠 4媛쒕? 紐⑤몢 ?낅젰??二쇱꽭??");
      return;
    }

    if (trimmedMoves.some((move) => !learnsetSet.has(normalize(move)))) {
      setNotice("?낅젰??湲곗닠 以??ㅼ젣濡??대떦 ?ъ폆紐ъ씠 諛곗슦吏 紐삵븯??湲곗닠???덉뒿?덈떎.");
      return;
    }

    if (getSpreadTotal(evs) > MAX_TOTAL_EVS) {
      setNotice(`?몃젰移?珥앺빀? ${MAX_TOTAL_EVS}瑜??섍만 ???놁뒿?덈떎.`);
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
      moves: trimmedMoves,
    };

    setRegisteredBuilds((prev) => [...prev, entity]);
    setNotice(`${entity.nickname || entity.pokemonName} 媛쒖껜瑜??깅줉?덉뒿?덈떎.`);

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
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 md:text-2xl">?ъ폆紐??ㅼ쟾 媛쒖껜 ?꾧컧</h1>
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
          媛쒖껜 異붽?
        </button>
        <button
          type="button"
          onClick={() => setTab("matchup")}
          className={`px-4 py-2 text-sm font-semibold transition ${tab === "matchup" ? "pk-tab-active" : "pk-tab-idle"}`}
        >
          留ㅼ튂??
        </button>
      </div>

      <div className="pk-divider" />

      {notice ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}

      {tab === "builder" ? (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">?좉퇋 媛쒖껜 ?깅줉</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              蹂꾩묶(?좏깮)
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="pk-control"
                placeholder="예: 안경 파오젠"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              ?ъ폆紐??대쫫
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
              ??븷
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
              <h3 className="mb-2 text-sm font-semibold text-slate-900">?좏깮 ?ъ폆紐??쇰윭?ㅽ듃</h3>
              <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className="flex items-center gap-4">
                  <Image
                    src={getPokemonArtworkUrl(builderPokemonEntry)}
                    alt={`${builderPokemonEntry.name} ?쇰윭?ㅽ듃`}
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
                      ??? {builderPokemonEntry.types.map((type) => TYPE_LABELS_KO[type] ?? type).join(" / ")}
                    </p>
                    <p>?뱀꽦: {builderPokemonEntry.abilities.join(", ")}</p>
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
                    title="媛쒖껜媛?IV)"
                    spread={ivs}
                    maxValue={31}
                    stroke="rgba(37,99,235,1)"
                    fill="rgba(37,99,235,0.22)"
                  />
                  <StatRadarChart
                    title="?몃젰移?EV)"
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
              ?깃꺽
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
              ?뱀꽦
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
              ?꾧뎄
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
              ?뚮씪 ???
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
              <h3 className="mb-2 text-sm font-semibold text-slate-900">?몃젰移?EV)</h3>
              <p className="mb-2 text-xs font-semibold text-slate-600">
                珥앺빀 {evTotal}/{MAX_TOTAL_EVS}
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
              <h3 className="mb-2 text-sm font-semibold text-slate-900">媛쒖껜媛?IV)</h3>
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
              ?깅줉 媛?ν븳 湲곗닠? ?대떦 ?ъ폆紐ъ씠 ?ㅼ젣濡?諛곗슱 ???덈뒗 湲곗닠留??덉슜?⑸땲??
            </p>
            {learnsetStatus === "loading" ? (
              <p className="mb-2 text-xs text-slate-600">?숈뒿 湲곗닠 紐⑸줉??遺덈윭?ㅻ뒗 以?..</p>
            ) : null}
            {learnsetStatus === "error" ? (
              <p className="mb-2 text-xs text-rose-700">?숈뒿 湲곗닠 紐⑸줉 議고쉶???ㅽ뙣?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??</p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {MOVE_SLOT_IDS.map((slotId, index) => {
                const move = moves[index];
                return (
                <label key={slotId} className="grid gap-1 text-sm text-slate-700">
                  湲곗닠 {index + 1}
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
            媛쒖껜 ?깅줉
          </button>
        </div>
      ) : (
        <div className="pk-grid-bg space-y-4 rounded-2xl p-2 md:p-3">
          <h2 className="pk-section-title text-lg text-slate-900">?깅줉 媛쒖껜 留ㅼ튂??鍮꾧탳</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              ?쇱そ 媛쒖껜
              <select
                value={leftId}
                onChange={(event) => setLeftId(event.target.value)}
                className="pk-control"
              >
                <option value="">?좏깮</option>
                {registeredBuilds.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.nickname || entry.pokemonName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              ?ㅻⅨ履?媛쒖껜
              <select
                value={rightId}
                onChange={(event) => setRightId(event.target.value)}
                className="pk-control"
              >
                <option value="">?좏깮</option>
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
              怨듦꺽痢?
              <select
                value={attackerSide}
                onChange={(event) => setAttackerSide(event.target.value as "left" | "right")}
                className="pk-control"
              >
                <option value="left">?쇱そ</option>
                <option value="right">오른쪽</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              ?ъ슜 湲곗닠
              <select
                value={activeMove}
                onChange={(event) => setSelectedMove(event.target.value)}
                className="pk-control"
              >
                {attackerMoveOptions.map((move) => (
                  <option key={move} value={move}>
                    {displayMoveName(move)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              ?좎뵪
              <select
                value={weather}
                onChange={(event) => setWeather(event.target.value as BattleWeather)}
                className="pk-control"
              >
                {WEATHER_OPTIONS.map((entry) => (
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
              {leftBuild && resolvedAttacker && attackerSide === "left" ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedAttacker)}
                    alt={`${resolvedAttacker.name} ?쇰윭?ㅽ듃`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg bg-white p-1 shadow"
                  />
                  <p className="text-sm text-slate-700">{leftBuild.nickname || leftBuild.pokemonName}</p>
                </div>
              ) : leftBuild && resolvedDefender && attackerSide === "right" ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedDefender)}
                    alt={`${resolvedDefender.name} ?쇰윭?ㅽ듃`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg bg-white p-1 shadow"
                  />
                  <p className="text-sm text-slate-700">{leftBuild.nickname || leftBuild.pokemonName}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">?쇱そ 媛쒖껜瑜??좏깮?섎㈃ ?쇰윭?ㅽ듃媛 ?쒖떆?⑸땲??</p>
              )}
            </div>

            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">오른쪽 포켓몬</h3>
              {rightBuild && resolvedDefender && attackerSide === "left" ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedDefender)}
                    alt={`${resolvedDefender.name} ?쇰윭?ㅽ듃`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg bg-white p-1 shadow"
                  />
                  <p className="text-sm text-slate-700">{rightBuild.nickname || rightBuild.pokemonName}</p>
                </div>
              ) : rightBuild && resolvedAttacker && attackerSide === "right" ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedAttacker)}
                    alt={`${resolvedAttacker.name} ?쇰윭?ㅽ듃`}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg bg-white p-1 shadow"
                  />
                  <p className="text-sm text-slate-700">{rightBuild.nickname || rightBuild.pokemonName}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-600">?ㅻⅨ履?媛쒖껜瑜??좏깮?섎㈃ ?쇰윭?ㅽ듃媛 ?쒖떆?⑸땲??</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              怨듦꺽痢??뚮씪(怨꾩궛??
              <select
                value={attackerTeraType}
                onChange={(event) => setAttackerTeraType(event.target.value as TeraType | "")}
                className="pk-control"
              >
                <option value="">미적용</option>
                {TERA_TYPES.map((type) => (
                  <option key={`atk-tera-${type}`} value={type}>
                    {TYPE_LABELS_KO[type] ?? type}
                  </option>
                ))}
              </select>
              {attackerTeraType ? <TypeBadge type={attackerTeraType} /> : null}
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              諛⑹뼱痢??뚮씪(怨꾩궛??
              <select
                value={defenderTeraType}
                onChange={(event) => setDefenderTeraType(event.target.value as TeraType | "")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">미적용</option>
                {TERA_TYPES.map((type) => (
                  <option key={`def-tera-${type}`} value={type}>
                    {TYPE_LABELS_KO[type] ?? type}
                  </option>
                ))}
              </select>
              {defenderTeraType ? <TypeBadge type={defenderTeraType} /> : null}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">?쇱そ ??겕 蹂댁젙</h3>
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
              <h3 className="mb-2 text-sm font-semibold text-slate-900">?ㅻⅨ履???겕 蹂댁젙</h3>
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
            <h3 className="mb-2 text-sm font-semibold text-slate-900">留ㅼ튂??怨꾩궛 寃곌낵</h3>
            {damageEstimate && attackerBuild && defenderBuild ? (
              <div className="space-y-1 text-sm text-slate-700">
                <p>{attackerBuild.nickname || attackerBuild.pokemonName} {displayMoveName(activeMove)} ??{defenderBuild.nickname || defenderBuild.pokemonName}: {damageEstimate.minPercent}% ~ {damageEstimate.maxPercent}%</p>
                <p>1? ?먯젙: {damageEstimate.koState}</p>
                <p>?곸꽦 ?먯젙: {damageEstimate.effectivenessLabel}</p>
                <p>寃곗젙?? {damageEstimate.decisivePower}</p>
                <p className="text-xs text-slate-600">{damageEstimate.modifierSummary}</p>
                <p className="text-xs text-slate-600">{damageEstimate.abilitySummary}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-700">醫뚯슦 媛쒖껜瑜??좏깮?섍퀬 怨듦꺽 湲곗닠??吏?뺥븯硫?怨꾩궛?⑸땲??</p>
            )}

            {movePowerEstimate ? (
              <p className="mt-2 text-xs text-slate-600">
                기술 단일 결정력: {movePowerEstimate.decisivePower} ({movePowerEstimate.summary})
              </p>
            ) : null}

            {speedCompare && speedOrderSummary ? (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  스피드 비교: 공격측 {speedCompare.attackerSpeed} / 방어측 {speedCompare.defenderSpeed} ({speedCompare.faster})
                </p>
                <p className="text-xs text-slate-600">
                  행동 순서: {speedOrderSummary.faster} ({speedOrderSummary.reason}, 상대 우선도 0 가정)
                </p>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

