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
  PokemonType,
  StatKey,
  StatSpread,
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

function toRadarPoints(spread: StatSpread, maxValue: number, radius: number, center: number): string {
  const safeMax = Math.max(1, maxValue);
  return STAT_KEYS.map((stat, index) => {
    const ratio = Math.max(0, Math.min(1, spread[stat] / safeMax));
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
};

function StatRadarChart({ title, spread, maxValue, stroke, fill }: StatRadarChartProps) {
  const size = 176;
  const center = size / 2;
  const radius = 58;
  const rings = [0.2, 0.4, 0.6, 0.8, 1];
  const labels: Record<StatKey, string> = {
    hp: "HP",
    atk: "공",
    def: "방",
    spa: "특공",
    spd: "특방",
    spe: "스핏",
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
          points={toRadarPoints(spread, maxValue, radius, center)}
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
  const [teraType, setTeraType] = useState<string>("");
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
  const [attackerTeraType, setAttackerTeraType] = useState<PokemonType | "">("");
  const [defenderTeraType, setDefenderTeraType] = useState<PokemonType | "">("");
  const [leftStages, setLeftStages] = useState<StatSpread>(DEFAULT_STAGES);
  const [rightStages, setRightStages] = useState<StatSpread>(DEFAULT_STAGES);

  const [resolvedAttacker, setResolvedAttacker] = useState<PokemonEntry | null>(null);
  const [resolvedDefender, setResolvedDefender] = useState<PokemonEntry | null>(null);
  const [resolvedMove, setResolvedMove] = useState<MoveEntry | null>(null);

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

    return {
      attackerSpeed,
      defenderSpeed,
      faster:
        attackerSpeed === defenderSpeed
          ? "동속"
          : attackerSpeed > defenderSpeed
            ? `${resolvedAttacker.name} 선공`
            : `${resolvedDefender.name} 선공`,
    };
  }, [
    attackerBuild,
    attackerStages,
    defenderBuild,
    defenderStages,
    resolvedAttacker,
    resolvedDefender,
    activeMove,
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

    if (learnsetStatus !== "ready") {
      setNotice("학습 기술 데이터를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (trimmedMoves.some((move) => !move)) {
      setNotice("배울 기술 4개를 모두 입력해 주세요.");
      return;
    }

    if (trimmedMoves.some((move) => !learnsetSet.has(normalize(move)))) {
      setNotice("입력한 기술 중 실제로 해당 포켓몬이 배우지 못하는 기술이 있습니다.");
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
                placeholder="예) 선봉 파오젠"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              포켓몬 이름
              <input
                list="builder-pokemon"
                value={pokemonName}
                onChange={(event) => setPokemonName(event.target.value)}
                className="pk-control"
                placeholder="예) 파오젠"
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
                    maxValue={255}
                    stroke="rgba(220,38,38,1)"
                    fill="rgba(220,38,38,0.25)"
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
                onChange={(event) => setTeraType(event.target.value)}
                className="pk-control"
              >
                <option value="">미설정</option>
                {TERA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS_KO[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="pk-card p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">노력치(EV)</h3>
              {STAT_KEYS.map((stat) => (
                <label key={`ev-${stat}`} className="mb-1 grid grid-cols-2 items-center gap-2 text-sm">
                  <span>{STAT_LABELS[stat]}</span>
                  <input
                    type="number"
                    value={evs[stat]}
                    min={0}
                    max={252}
                    step={1}
                    onChange={(event) =>
                      setEvs((prev) => updateSpread(prev, stat, Number(event.target.value), 0, 252))
                    }
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
            <h3 className="mb-2 text-sm font-semibold text-slate-900">배울 기술 4개</h3>
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
              공격측
              <select
                value={attackerSide}
                onChange={(event) => setAttackerSide(event.target.value as "left" | "right")}
                className="pk-control"
              >
                <option value="left">왼쪽</option>
                <option value="right">오른쪽</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              사용 기술
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
              날씨
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
                    alt={`${resolvedAttacker.name} 일러스트`}
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
                    alt={`${resolvedDefender.name} 일러스트`}
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
              {rightBuild && resolvedDefender && attackerSide === "left" ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={getPokemonArtworkUrl(resolvedDefender)}
                    alt={`${resolvedDefender.name} 일러스트`}
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
                    alt={`${resolvedAttacker.name} 일러스트`}
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              공격측 테라(계산용)
              <select
                value={attackerTeraType}
                onChange={(event) => setAttackerTeraType(event.target.value as PokemonType | "")}
                className="pk-control"
              >
                <option value="">미적용</option>
                {TERA_TYPES.map((type) => (
                  <option key={`atk-tera-${type}`} value={type}>
                    {TYPE_LABELS_KO[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              방어측 테라(계산용)
              <select
                value={defenderTeraType}
                onChange={(event) => setDefenderTeraType(event.target.value as PokemonType | "")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">미적용</option>
                {TERA_TYPES.map((type) => (
                  <option key={`def-tera-${type}`} value={type}>
                    {TYPE_LABELS_KO[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
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
            {damageEstimate && attackerBuild && defenderBuild ? (
              <div className="space-y-1 text-sm text-slate-700">
                <p>{attackerBuild.nickname || attackerBuild.pokemonName} {displayMoveName(activeMove)} → {defenderBuild.nickname || defenderBuild.pokemonName}: {damageEstimate.minPercent}% ~ {damageEstimate.maxPercent}%</p>
                <p>1타 판정: {damageEstimate.koState}</p>
                <p>상성 판정: {damageEstimate.effectivenessLabel}</p>
                <p>결정력: {damageEstimate.decisivePower}</p>
                <p className="text-xs text-slate-600">{damageEstimate.modifierSummary}</p>
                <p className="text-xs text-slate-600">{damageEstimate.abilitySummary}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-700">좌우 개체를 선택하고 공격 기술을 지정하면 계산됩니다.</p>
            )}

            {movePowerEstimate ? (
              <p className="mt-2 text-xs text-slate-600">
                기술 단일 결정력: {movePowerEstimate.decisivePower} ({movePowerEstimate.summary})
              </p>
            ) : null}

            {speedCompare ? (
              <p className="mt-2 text-sm text-slate-700">
                스피드 비교: 공격측 {speedCompare.attackerSpeed} / 방어측 {speedCompare.defenderSpeed} ({speedCompare.faster})
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
