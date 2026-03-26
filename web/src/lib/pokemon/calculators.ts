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
  TeraType,
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
  gimmickSummary: string;
  appliedGimmicks: string[];
};

function isFinalGambitMove(moveName: string): boolean {
  const normalized = moveName.trim().toLowerCase();
  return (
    normalized === "final gambit" ||
    normalized === "final-gambit" ||
    normalized === "죽기살기"
  );
}

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

function isTeraBlast(moveName: string): boolean {
  const normalized = moveName.trim().toLowerCase();
  return normalized === "tera blast" || normalized === "tera-blast" || normalized === "테라버스트";
}

function clampPercent(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return clamp(value as number, 0, 100);
}

function getFlailStylePower(attackerHpPercent: number): number {
  if (attackerHpPercent <= 2.083) {
    return 200;
  }
  if (attackerHpPercent <= 8.333) {
    return 150;
  }
  if (attackerHpPercent <= 18.75) {
    return 100;
  }
  if (attackerHpPercent <= 33.333) {
    return 80;
  }
  if (attackerHpPercent <= 66.667) {
    return 40;
  }
  return 20;
}

function applyHpBasedMovePower(
  move: MoveEntry,
  attackerHpPercent: number,
  defenderHpPercent: number,
): MoveEntry {
  if (move.power === null || move.category === "status") {
    return move;
  }

  const normalized = move.name.trim().toLowerCase();
  let power = move.power;

  if (
    normalized === "eruption" ||
    normalized === "water spout" ||
    normalized === "dragon energy" ||
    normalized === "분화" ||
    normalized === "해수스파우팅" ||
    normalized === "드래곤에너지"
  ) {
    power = Math.max(1, Math.floor(150 * (attackerHpPercent / 100)));
  } else if (
    normalized === "flail" ||
    normalized === "reversal" ||
    normalized === "바둥바둥" ||
    normalized === "기사회생"
  ) {
    power = getFlailStylePower(attackerHpPercent);
  } else if (normalized === "brine" || normalized === "염수") {
    power = defenderHpPercent <= 50 ? move.power * 2 : move.power;
  } else if (
    normalized === "crush grip" ||
    normalized === "wring out" ||
    normalized === "hard press" ||
    normalized === "쥐어짜기" ||
    normalized === "쥐어뜯기" ||
    normalized === "하드프레스"
  ) {
    power = Math.max(1, Math.floor(120 * (defenderHpPercent / 100)) + 1);
  }

  return {
    ...move,
    power,
  };
}

function applyComboMovePower(move: MoveEntry, previousMoveName: string | undefined): MoveEntry {
  if (move.power === null || move.category === "status" || !previousMoveName) {
    return move;
  }

  const current = move.name.trim().toLowerCase();
  const previous = previousMoveName.trim().toLowerCase();

  const isCrossThunder =
    current === "cross thunder" || current === "cross-thunder" || current === "크로스썬더";
  const isCrossFlame =
    current === "cross flame" || current === "cross-flame" || current === "크로스플레임";
  const previousIsCrossThunder =
    previous === "cross thunder" || previous === "cross-thunder" || previous === "크로스썬더";
  const previousIsCrossFlame =
    previous === "cross flame" || previous === "cross-flame" || previous === "크로스플레임";

  if ((isCrossThunder && previousIsCrossFlame) || (isCrossFlame && previousIsCrossThunder)) {
    return {
      ...move,
      power: move.power * 2,
    };
  }

  return move;
}

function applyOrderBasedMovePower(
  move: MoveEntry,
  movedAfterTarget: boolean | undefined,
  wasHitEarlierThisTurn: boolean | undefined,
): { move: MoveEntry; notes: string[] } {
  if (move.power === null || move.category === "status") {
    return { move, notes: [] };
  }

  const normalized = move.name.trim().toLowerCase();
  const notes: string[] = [];
  let power = move.power;

  if ((normalized === "payback" || normalized === "보복") && movedAfterTarget) {
    power *= 2;
    notes.push("보복: 후공으로 위력 2배");
  }

  if (
    (normalized === "avalanche" || normalized === "눈사태" || normalized === "revenge" || normalized === "리벤지") &&
    wasHitEarlierThisTurn
  ) {
    power *= 2;
    notes.push("눈사태/리벤지: 선행 피격으로 위력 2배");
  }

  return {
    move: {
      ...move,
      power,
    },
    notes,
  };
}

function applyItemBasedMovePower(move: MoveEntry, heldItem: string): { move: MoveEntry; notes: string[] } {
  if (move.power === null || move.category === "status") {
    return { move, notes: [] };
  }

  const normalizedMove = move.name.trim().toLowerCase();
  const normalizedItem = heldItem.trim().toLowerCase();
  const notes: string[] = [];
  let power = move.power;

  if (
    (normalizedMove === "acrobatics" || normalizedMove === "애크러뱃") &&
    normalizedItem.length === 0
  ) {
    power *= 2;
    notes.push("애크러뱃: 도구 미소지로 위력 2배");
  }

  return {
    move: {
      ...move,
      power,
    },
    notes,
  };
}

function resolveMovePowerWithGimmicks(
  move: MoveEntry,
  input: BuildInput,
  options: DamageCalcOptions,
): { move: MoveEntry; notes: string[] } {
  const notes: string[] = [];

  const hpAdjusted = applyHpBasedMovePower(
    move,
    clampPercent(options.attackerCurrentHpPercent),
    clampPercent(options.defenderCurrentHpPercent),
  );
  if (hpAdjusted.power !== move.power) {
    notes.push("HP 비례 위력 반영");
  }

  const comboAdjusted = applyComboMovePower(hpAdjusted, options.previousMoveName);
  if (comboAdjusted.power !== hpAdjusted.power) {
    notes.push("크로스 기믹: 짝 기술 선행으로 위력 2배");
  }

  const orderAdjusted = applyOrderBasedMovePower(
    comboAdjusted,
    options.movedAfterTarget,
    options.wasHitEarlierThisTurn,
  );
  notes.push(...orderAdjusted.notes);

  const itemAdjusted = applyItemBasedMovePower(orderAdjusted.move, input.item);
  notes.push(...itemAdjusted.notes);

  return {
    move: itemAdjusted.move,
    notes,
  };
}

function resolveEffectiveMove(
  attacker: PokemonEntry,
  input: BuildInput,
  move: MoveEntry,
  options: DamageCalcOptions,
): MoveEntry {
  if (!isTeraBlast(move.name) || !options.attackerTeraType) {
    return move;
  }

  const attackStat = applyStage(
    getStatValue(attacker.baseStats, input.ivs, input.evs, input.nature, "atk"),
    input.attackerStages.atk,
  );
  const specialAttackStat = applyStage(
    getStatValue(attacker.baseStats, input.ivs, input.evs, input.nature, "spa"),
    input.attackerStages.spa,
  );

  return {
    ...move,
    type: options.attackerTeraType,
    category: attackStat > specialAttackStat ? "physical" : "special",
    power: options.attackerTeraType === "Stellar" ? 100 : move.power,
  };
}

function isStandardPokemonType(type: TeraType): type is PokemonType {
  return type !== "Stellar";
}

function getStabMultiplier(
  attacker: PokemonEntry,
  moveType: TeraType,
  attackerTeraType: DamageCalcOptions["attackerTeraType"],
  adaptabilityActive: boolean,
): number {
  const hasOriginalStab = isStandardPokemonType(moveType) && attacker.types.includes(moveType);

  if (attackerTeraType === "Stellar") {
    if (hasOriginalStab) {
      return adaptabilityActive ? 2.25 : 2;
    }
    return 1.2;
  }

  const teraMatchesMove =
    attackerTeraType !== "" &&
    isStandardPokemonType(attackerTeraType) &&
    attackerTeraType === moveType;

  if (teraMatchesMove) {
    return hasOriginalStab ? 2 : 1.5;
  }

  if (hasOriginalStab) {
    return adaptabilityActive ? 2 : 1.5;
  }

  return 1;
}

function getEffectiveDefenderTypes(
  defender: PokemonEntry,
  defenderTeraType: DamageCalcOptions["defenderTeraType"],
): PokemonType[] {
  if (defenderTeraType && defenderTeraType !== "Stellar") {
    return [defenderTeraType];
  }

  return defender.types.length >= 1 ? [...defender.types] : ["Normal"];
}

function getMoveEffectiveness(
  moveType: TeraType,
  defenderTypes: PokemonType[],
  defenderTeraType: DamageCalcOptions["defenderTeraType"],
): number {
  if (moveType === "Stellar") {
    return defenderTeraType ? 2 : 1;
  }

  return getTypeEffectiveness(moveType, defenderTypes);
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
  const teraResolvedMove = resolveEffectiveMove(attacker, input, move, options);
  const moveResult = resolveMovePowerWithGimmicks(teraResolvedMove, input, options);
  const comboAdjustedMove = moveResult.move;

  if (comboAdjustedMove.category === "status" || comboAdjustedMove.power === null) {
    return null;
  }

  const attackStatKey: StatKey = comboAdjustedMove.category === "special" ? "spa" : "atk";
  const attackStat = getStatValue(
    attacker.baseStats,
    input.ivs,
    input.evs,
    input.nature,
    attackStatKey,
  );
  const stagedAttackStat = applyStage(attackStat, input.attackerStages[attackStatKey]);

  const hasOriginalStab =
    comboAdjustedMove.type !== "Stellar" && attacker.types.includes(comboAdjustedMove.type);
  void hasOriginalStab;
  void hasOriginalStab;
  void hasOriginalStab;
  const adaptabilityActive = hasAbility(options.attackerAbility, ["적응력", "adaptability"]);
  const stab = getStabMultiplier(
    attacker,
    comboAdjustedMove.type,
    options.attackerTeraType,
    adaptabilityActive,
  );

  let weatherMultiplier = 1;
  if (options.weather === "sun") {
    if (comboAdjustedMove.type === "Fire") {
      weatherMultiplier = 1.5;
    } else if (comboAdjustedMove.type === "Water") {
      weatherMultiplier = 0.5;
    }
  }
  if (options.weather === "rain") {
    if (comboAdjustedMove.type === "Water") {
      weatherMultiplier = 1.5;
    } else if (comboAdjustedMove.type === "Fire") {
      weatherMultiplier = 0.5;
    }
  }

  const normalizedItem = input.item.trim().toLowerCase();
  let itemMultiplier = 1;
  if (normalizedItem.includes("life orb") || normalizedItem.includes("생명의구슬")) {
    itemMultiplier = 1.3;
  }
  if (
    comboAdjustedMove.category === "special" &&
    (normalizedItem.includes("choice specs") || normalizedItem.includes("구애안경"))
  ) {
    itemMultiplier = 1.5;
  }

  const attackerAbility = getAttackerAbilityMultiplier(options.attackerAbility, comboAdjustedMove);
  if (
    comboAdjustedMove.category === "physical" &&
    (normalizedItem.includes("choice band") || normalizedItem.includes("구애머리띠"))
  ) {
    itemMultiplier = 1.5;
  }

  const totalMultiplier = stab * weatherMultiplier * itemMultiplier * attackerAbility.multiplier;

  return {
    decisivePower: Math.round(stagedAttackStat * comboAdjustedMove.power * totalMultiplier),
    attackStat: stagedAttackStat,
    movePower: comboAdjustedMove.power,
    summary: `공격 실수치 ${stagedAttackStat} x 기술 위력 ${comboAdjustedMove.power} x (STAB ${stab.toFixed(2)} * 날씨 ${weatherMultiplier.toFixed(2)} * 아이템 ${itemMultiplier.toFixed(2)} * 공격특성 ${attackerAbility.multiplier.toFixed(2)})`,
  };
}

export function estimateDamagePercent(
  attacker: PokemonEntry,
  defender: PokemonEntry,
  input: BuildInput,
  move: MoveEntry,
  options: DamageCalcOptions,
): DamageEstimate | null {
  const teraResolvedMove = resolveEffectiveMove(attacker, input, move, options);
  const moveResult = resolveMovePowerWithGimmicks(teraResolvedMove, input, options);
  const comboAdjustedMove = moveResult.move;

  if (isFinalGambitMove(comboAdjustedMove.name)) {
    const defenderTypes = getEffectiveDefenderTypes(defender, options.defenderTeraType);
    const rawTypeEffectiveness = getMoveEffectiveness(
      comboAdjustedMove.type,
      defenderTypes,
      options.defenderTeraType,
    );
    const defenderAbility = getDefenderAbilityMultiplier(
      options.defenderAbility,
      comboAdjustedMove,
      rawTypeEffectiveness,
    );
    const typeEffectiveness = defenderAbility.overrideEffectiveness ?? rawTypeEffectiveness;
    const effectivenessForFixedDamage = typeEffectiveness === 0 ? 0 : 1;

    const neutralSpread: StatSpread = {
      hp: 252,
      atk: 0,
      def: 4,
      spa: 0,
      spd: 4,
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
    const attackerMaxHp = getStatValue(attacker.baseStats, input.ivs, input.evs, input.nature, "hp");
    const attackerCurrentHpPercent = clampPercent(options.attackerCurrentHpPercent);
    const fixedDamage = Math.floor(attackerMaxHp * (attackerCurrentHpPercent / 100));
    const appliedDamage = Math.max(0, Math.floor(fixedDamage * effectivenessForFixedDamage));
    const damagePercent = (appliedDamage / Math.max(1, defenderHp)) * 100;
    const koState = damagePercent >= 100 ? "확정 1타" : "1타 불가";

    return {
      minPercent: clamp(Math.round(damagePercent * 10) / 10, 0, 999),
      maxPercent: clamp(Math.round(damagePercent * 10) / 10, 0, 999),
      attackStat: attackerMaxHp,
      defenseStat: defenderHp,
      effectiveness: typeEffectiveness,
      effectivenessLabel: typeEffectiveness === 0 ? "무효" : "고정 피해",
      modifierSummary: "죽기살기 고정 피해 (사용자 현재 HP 기준, 면역만 적용)",
      decisivePower: appliedDamage,
      movePower: appliedDamage,
      koState,
      abilitySummary: `공격측 특성: 없음 / 방어측 특성: ${defenderAbility.label}`,
      gimmickSummary: `죽기살기: 현재 HP(${attackerCurrentHpPercent.toFixed(1)}%) 기반 고정 피해 ${appliedDamage}`,
      appliedGimmicks: [`죽기살기 고정 피해 ${appliedDamage}`],
    };
  }

  if (comboAdjustedMove.category === "status" || comboAdjustedMove.power === null) {
    return null;
  }

  const attackStatKey: StatKey = comboAdjustedMove.category === "special" ? "spa" : "atk";
  const defenseStatKey: StatKey = comboAdjustedMove.category === "special" ? "spd" : "def";

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

  const defenderTypes = getEffectiveDefenderTypes(defender, options.defenderTeraType);

  const rawTypeEffectiveness = getMoveEffectiveness(
    comboAdjustedMove.type,
    defenderTypes,
    options.defenderTeraType,
  );

  const hasOriginalStab =
    comboAdjustedMove.type !== "Stellar" && attacker.types.includes(comboAdjustedMove.type);
  const adaptabilityActive = hasAbility(options.attackerAbility, ["적응력", "adaptability"]);
  const stab = getStabMultiplier(
    attacker,
    comboAdjustedMove.type,
    options.attackerTeraType,
    adaptabilityActive,
  );

  const attackerAbility = getAttackerAbilityMultiplier(options.attackerAbility, comboAdjustedMove);
  const defenderAbility = getDefenderAbilityMultiplier(
    options.defenderAbility,
    comboAdjustedMove,
    rawTypeEffectiveness,
  );
  const typeEffectiveness = defenderAbility.overrideEffectiveness ?? rawTypeEffectiveness;

  let weatherMultiplier = 1;
  if (options.weather === "sun") {
    if (comboAdjustedMove.type === "Fire") {
      weatherMultiplier = 1.5;
    } else if (comboAdjustedMove.type === "Water") {
      weatherMultiplier = 0.5;
    }
  }
  if (options.weather === "rain") {
    if (comboAdjustedMove.type === "Water") {
      weatherMultiplier = 1.5;
    } else if (comboAdjustedMove.type === "Fire") {
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
    comboAdjustedMove.category === "special" &&
    (normalizedItem.includes("choice specs") || normalizedItem.includes("구애안경"))
  ) {
    itemMultiplier = 1.5;
  }
  if (
    comboAdjustedMove.category === "physical" &&
    (normalizedItem.includes("choice band") || normalizedItem.includes("구애머리띠"))
  ) {
    itemMultiplier = 1.5;
  }
  const baseDamage =
    Math.floor(
      Math.floor(
        (((2 * 50) / 5 + 2) * comboAdjustedMove.power * Math.max(1, stagedAttackStat)) /
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
    decisivePower: Math.round(stagedAttackStat * comboAdjustedMove.power * totalMultiplier),
    movePower: comboAdjustedMove.power,
    koState,
    abilitySummary: `공격측 특성: ${attackerAbility.label} / 방어측 특성: ${defenderAbility.label}`,
    gimmickSummary: moveResult.notes.length > 0 ? moveResult.notes.join(" / ") : "없음",
    appliedGimmicks: moveResult.notes,
  };
}
