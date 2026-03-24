import { NATURES } from "@/lib/pokemon/constants";
import { getTypeEffectiveness } from "@/lib/pokemon/type-chart";
import type {
  BuildInput,
  DamageCalcOptions,
  MoveEntry,
  PokemonEntry,
  PokemonType,
  StatKey,
  StatSpread,
} from "@/lib/pokemon/types";

type DamageEstimate = {
  minPercent: number;
  maxPercent: number;
  attackStat: number;
  defenseStat: number;
  effectiveness: number;
  effectivenessLabel: string;
  modifierSummary: string;
  decisivePower: number;
  movePower: number;
  koState: string;
  abilitySummary: string;
};

function hasAbility(abilityName: string | undefined, candidates: string[]): boolean {
  if (!abilityName) {
    return false;
  }
  const normalized = abilityName.trim().toLowerCase();
  return candidates.some((candidate) => normalized === candidate.trim().toLowerCase());
}

function getAttackerAbilityMultiplier(
  abilityName: string | undefined,
  move: MoveEntry,
): { multiplier: number; label: string } {
  let multiplier = 1;
  const labels: string[] = [];

  if (hasAbility(abilityName, ["적응력", "adaptability"])) {
    labels.push("적응력(STAB 강화)");
  }

  if (
    move.category === "physical" &&
    hasAbility(abilityName, ["천하장사", "순수한힘", "huge power", "pure power"])
  ) {
    multiplier *= 2;
    labels.push("천하장사/순수한힘");
  }

  if (move.power !== null && move.power <= 60 && hasAbility(abilityName, ["테크니션", "technician"])) {
    multiplier *= 1.5;
    labels.push("테크니션");
  }

  return {
    multiplier,
    label: labels.length > 0 ? labels.join(", ") : "없음",
  };
}

function getDefenderAbilityMultiplier(
  abilityName: string | undefined,
  move: MoveEntry,
  typeEffectiveness: number,
): { multiplier: number; overrideEffectiveness?: number; label: string } {
  let multiplier = 1;
  let overrideEffectiveness: number | undefined;
  const labels: string[] = [];

  if (
    move.type === "Ground" &&
    hasAbility(abilityName, ["부유", "levitate"])
  ) {
    overrideEffectiveness = 0;
    labels.push("부유(땅 무효)");
  }

  if (
    move.type === "Fire" &&
    hasAbility(abilityName, ["타오르는불꽃", "flash fire"])
  ) {
    overrideEffectiveness = 0;
    labels.push("타오르는불꽃(불꽃 무효)");
  }

  if (
    move.type === "Water" &&
    hasAbility(abilityName, ["저수", "마중물", "water absorb", "storm drain"])
  ) {
    overrideEffectiveness = 0;
    labels.push("저수/마중물(물 무효)");
  }

  if (
    move.type === "Electric" &&
    hasAbility(abilityName, ["축전", "피뢰침", "전기엔진", "volt absorb", "lightning rod", "motor drive"])
  ) {
    overrideEffectiveness = 0;
    labels.push("전기 흡수형 특성(전기 무효)");
  }

  if (
    typeEffectiveness > 1 &&
    hasAbility(abilityName, ["필터", "프리즘아머", "하드록", "filter", "prism armor", "solid rock"])
  ) {
    multiplier *= 0.75;
    labels.push("필터류(약점 완화)");
  }

  return {
    multiplier,
    overrideEffectiveness,
    label: labels.length > 0 ? labels.join(", ") : "없음",
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function natureMultiplier(natureName: string, stat: StatKey): number {
  const nature = NATURES.find((entry) => entry.name === natureName);
  if (!nature) {
    return 1;
  }
  if (nature.increase === stat) {
    return 1.1;
  }
  if (nature.decrease === stat) {
    return 0.9;
  }
  return 1;
}

function calcHPStat(base: number, iv: number, ev: number, level = 50): number {
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

function calcNonHPStat(
  base: number,
  iv: number,
  ev: number,
  nature: number,
  level = 50,
): number {
  const preNature = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(preNature * nature);
}

function getStatValue(
  baseStats: StatSpread,
  ivs: StatSpread,
  evs: StatSpread,
  natureName: string,
  stat: StatKey,
): number {
  if (stat === "hp") {
    return calcHPStat(baseStats.hp, ivs.hp, evs.hp);
  }

  return calcNonHPStat(
    baseStats[stat],
    ivs[stat],
    evs[stat],
    natureMultiplier(natureName, stat),
  );
}

function stageMultiplier(stage: number): number {
  const sanitized = Math.max(-6, Math.min(6, Math.trunc(stage)));
  return sanitized >= 0 ? (2 + sanitized) / 2 : 2 / (2 - sanitized);
}

function applyStage(statValue: number, stage: number): number {
  return Math.max(1, Math.floor(statValue * stageMultiplier(stage)));
}

export function estimateSpeed(
  pokemon: PokemonEntry,
  input: BuildInput,
): number {
  const baseSpeed = getStatValue(pokemon.baseStats, input.ivs, input.evs, input.nature, "spe");
  return applyStage(baseSpeed, input.attackerStages.spe);
}

export function classifySpeedTier(speed: number): string {
  if (speed >= 200) {
    return "최상위 스피드 구간";
  }
  if (speed >= 167) {
    return "고속 기준점 구간";
  }
  if (speed >= 134) {
    return "중속 기준점 구간";
  }
  return "저속/내구형 구간";
}

export function estimateMoveDecisivePower(
  attacker: PokemonEntry,
  input: BuildInput,
  move: MoveEntry,
  options: DamageCalcOptions,
): { decisivePower: number; attackStat: number; movePower: number; summary: string } | null {
  if (move.category === "status" || move.power === null) {
    return null;
  }

  const attackStatKey: StatKey = move.category === "special" ? "spa" : "atk";
  const attackStat = getStatValue(
    attacker.baseStats,
    input.ivs,
    input.evs,
    input.nature,
    attackStatKey,
  );
  const stagedAttackStat = applyStage(attackStat, input.attackerStages[attackStatKey]);

  const hasOriginalStab = attacker.types.includes(move.type);
  const adaptabilityActive = hasAbility(options.attackerAbility, ["적응력", "adaptability"]);
  const teraStab =
    options.attackerTeraType && options.attackerTeraType === move.type
      ? hasOriginalStab
        ? 2
        : 1.5
      : 1;
  const baseStab = hasOriginalStab ? (adaptabilityActive ? 2 : 1.5) : 1;
  const stab = teraStab > 1 ? Math.max(teraStab, baseStab) : baseStab;

  let weatherMultiplier = 1;
  if (options.weather === "sun") {
    if (move.type === "Fire") {
      weatherMultiplier = 1.5;
    } else if (move.type === "Water") {
      weatherMultiplier = 0.5;
    }
  }
  if (options.weather === "rain") {
    if (move.type === "Water") {
      weatherMultiplier = 1.5;
    } else if (move.type === "Fire") {
      weatherMultiplier = 0.5;
    }
  }

  const normalizedItem = input.item.trim().toLowerCase();
  let itemMultiplier = 1;
  if (normalizedItem.includes("life orb") || normalizedItem.includes("생명의구슬")) {
    itemMultiplier = 1.3;
  }
  if (
    move.category === "special" &&
    (normalizedItem.includes("choice specs") || normalizedItem.includes("구애안경"))
  ) {
    itemMultiplier = 1.5;
  }

  const attackerAbility = getAttackerAbilityMultiplier(options.attackerAbility, move);
  if (
    move.category === "physical" &&
    (normalizedItem.includes("choice band") || normalizedItem.includes("구애머리띠"))
  ) {
    itemMultiplier = 1.5;
  }

  const totalMultiplier = stab * weatherMultiplier * itemMultiplier * attackerAbility.multiplier;

  return {
    decisivePower: Math.round(stagedAttackStat * move.power * totalMultiplier),
    attackStat: stagedAttackStat,
    movePower: move.power,
    summary: `공격 실수치 ${stagedAttackStat} x 기술 위력 ${move.power} x (STAB ${stab.toFixed(2)} * 날씨 ${weatherMultiplier.toFixed(2)} * 아이템 ${itemMultiplier.toFixed(2)} * 공격특성 ${attackerAbility.multiplier.toFixed(2)})`,
  };
}

export function estimateDamagePercent(
  attacker: PokemonEntry,
  defender: PokemonEntry,
  input: BuildInput,
  move: MoveEntry,
  options: DamageCalcOptions,
): DamageEstimate | null {
  if (move.category === "status" || move.power === null) {
    return null;
  }

  const attackStatKey: StatKey = move.category === "special" ? "spa" : "atk";
  const defenseStatKey: StatKey = move.category === "special" ? "spd" : "def";

  const attackStat = getStatValue(
    attacker.baseStats,
    input.ivs,
    input.evs,
    input.nature,
    attackStatKey,
  );
  const stagedAttackStat = applyStage(attackStat, input.attackerStages[attackStatKey]);

  const neutralSpread: StatSpread = {
    hp: 252,
    atk: 0,
    def: defenseStatKey === "def" ? 252 : 4,
    spa: 0,
    spd: defenseStatKey === "spd" ? 252 : 4,
    spe: 0,
  };

  const neutralIvs: StatSpread = {
    hp: 31,
    atk: 31,
    def: 31,
    spa: 31,
    spd: 31,
    spe: 31,
  };

  const defenderHp = getStatValue(defender.baseStats, neutralIvs, neutralSpread, "Hardy", "hp");
  const defenderDefense = getStatValue(
    defender.baseStats,
    neutralIvs,
    neutralSpread,
    "Hardy",
    defenseStatKey,
  );
  const stagedDefenseStat = applyStage(defenderDefense, input.defenderStages[defenseStatKey]);

  const defenderTypes: PokemonType[] = options.defenderTeraType
    ? [options.defenderTeraType]
    : defender.types.length >= 1
      ? [...defender.types]
      : ["Normal"];

  const rawTypeEffectiveness = getTypeEffectiveness(move.type, defenderTypes);

  const hasOriginalStab = attacker.types.includes(move.type);
  const adaptabilityActive = hasAbility(options.attackerAbility, ["적응력", "adaptability"]);
  const teraStab =
    options.attackerTeraType && options.attackerTeraType === move.type
      ? hasOriginalStab
        ? 2
        : 1.5
      : 1;
  const baseStab = hasOriginalStab ? (adaptabilityActive ? 2 : 1.5) : 1;
  const stab = teraStab > 1 ? Math.max(teraStab, baseStab) : baseStab;

  const attackerAbility = getAttackerAbilityMultiplier(options.attackerAbility, move);
  const defenderAbility = getDefenderAbilityMultiplier(
    options.defenderAbility,
    move,
    rawTypeEffectiveness,
  );
  const typeEffectiveness = defenderAbility.overrideEffectiveness ?? rawTypeEffectiveness;

  let weatherMultiplier = 1;
  if (options.weather === "sun") {
    if (move.type === "Fire") {
      weatherMultiplier = 1.5;
    } else if (move.type === "Water") {
      weatherMultiplier = 0.5;
    }
  }
  if (options.weather === "rain") {
    if (move.type === "Water") {
      weatherMultiplier = 1.5;
    } else if (move.type === "Fire") {
      weatherMultiplier = 0.5;
    }
  }

  let effectiveDefense = stagedDefenseStat;
  if (options.weather === "sand" && defenseStatKey === "spd" && defenderTypes.includes("Rock")) {
    effectiveDefense = Math.floor(effectiveDefense * 1.5);
  }
  if (options.weather === "snow" && defenseStatKey === "def" && defenderTypes.includes("Ice")) {
    effectiveDefense = Math.floor(effectiveDefense * 1.5);
  }

  const normalizedItem = input.item.trim().toLowerCase();
  let itemMultiplier = 1;
  if (normalizedItem.includes("life orb") || normalizedItem.includes("생명의구슬")) {
    itemMultiplier = 1.3;
  }
  if (
    move.category === "special" &&
    (normalizedItem.includes("choice specs") || normalizedItem.includes("구애안경"))
  ) {
    itemMultiplier = 1.5;
  }
  if (
    move.category === "physical" &&
    (normalizedItem.includes("choice band") || normalizedItem.includes("구애머리띠"))
  ) {
    itemMultiplier = 1.5;
  }
  const baseDamage =
    Math.floor(
      Math.floor(
        (((2 * 50) / 5 + 2) * move.power * Math.max(1, stagedAttackStat)) /
          Math.max(1, effectiveDefense),
      ) / 50,
    ) + 2;

  const totalMultiplier =
    stab *
    typeEffectiveness *
    weatherMultiplier *
    itemMultiplier *
    attackerAbility.multiplier *
    defenderAbility.multiplier;
  const max = (baseDamage * totalMultiplier) / Math.max(1, defenderHp);
  const min = (baseDamage * 0.85 * totalMultiplier) / Math.max(1, defenderHp);

  const effectivenessLabel =
    typeEffectiveness === 0
      ? "무효"
      : typeEffectiveness >= 2
        ? "효과 굉장"
        : typeEffectiveness < 1
          ? "효과 별로"
          : "등배";

  const modifierSummary = `STAB x${stab.toFixed(2)} / 상성 x${typeEffectiveness.toFixed(2)} / 날씨 x${weatherMultiplier.toFixed(2)} / 아이템 x${itemMultiplier.toFixed(2)} / 공격특성 x${attackerAbility.multiplier.toFixed(2)} / 방어특성 x${defenderAbility.multiplier.toFixed(2)}`;

  const koState =
    min * 100 >= 100
      ? "확정 1타"
      : max * 100 >= 100
        ? "난수 1타 가능"
        : "1타 불가";

  return {
    minPercent: clamp(Math.round(min * 1000) / 10, 0, 999),
    maxPercent: clamp(Math.round(max * 1000) / 10, 0, 999),
    attackStat: stagedAttackStat,
    defenseStat: effectiveDefense,
    effectiveness: typeEffectiveness,
    effectivenessLabel,
    modifierSummary,
    decisivePower: Math.round(stagedAttackStat * move.power * totalMultiplier),
    movePower: move.power,
    koState,
    abilitySummary: `공격측 특성: ${attackerAbility.label} / 방어측 특성: ${defenderAbility.label}`,
  };
}
