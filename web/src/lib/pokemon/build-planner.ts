import { NATURES, ROLE_HINTS, ROLE_LABELS, STAT_KEYS } from "@/lib/pokemon/constants";
import type { BuildInput, BuildSuggestion, StatSpread } from "@/lib/pokemon/types";

function sumSpread(spread: StatSpread): number {
  return STAT_KEYS.reduce((sum, stat) => {
    const value = spread[stat];
    if (!Number.isFinite(value)) {
      return sum;
    }
    return sum + value;
  }, 0);
}

function validateEVs(evs: StatSpread): string[] {
  const warnings: string[] = [];
  const total = sumSpread(evs);

  if (total > 510) {
    warnings.push("EV 총합이 510을 초과했습니다.");
  }

  for (const stat of STAT_KEYS) {
    if (!Number.isFinite(evs[stat]) || !Number.isInteger(evs[stat])) {
      warnings.push(`${stat.toUpperCase()} EV는 유한한 정수여야 합니다.`);
      continue;
    }
    if (evs[stat] < 0 || evs[stat] > 252) {
      warnings.push(`${stat.toUpperCase()} EV는 0~252 범위여야 합니다.`);
    }
  }

  return warnings;
}

function validateIVs(ivs: StatSpread): string[] {
  const warnings: string[] = [];

  for (const stat of STAT_KEYS) {
    if (!Number.isFinite(ivs[stat]) || !Number.isInteger(ivs[stat])) {
      warnings.push(`${stat.toUpperCase()} IV는 유한한 정수여야 합니다.`);
      continue;
    }
    if (ivs[stat] < 0 || ivs[stat] > 31) {
      warnings.push(`${stat.toUpperCase()} IV는 0~31 범위여야 합니다.`);
    }
  }

  return warnings;
}

export function buildSuggestion(input: BuildInput): BuildSuggestion {
  const warnings = [...validateEVs(input.evs), ...validateIVs(input.ivs)];
  const nature = NATURES.find((entry) => entry.name === input.nature);
  const roleHints = ROLE_HINTS[input.role] ?? [];

  const checklist: string[] = [
    `${input.pokemonName || "포켓몬"} - 역할: ${ROLE_LABELS[input.role] ?? input.role}`,
    `대상 체크: ${input.targetPokemonName || "미설정"}`,
    `기술 체크: ${input.moveName || "미설정"}`,
    `성격: ${input.nature}`,
    `테라 타입: ${input.teraType || "미설정"}`,
    `아이템: ${input.item || "미설정"}`,
    `특성: ${input.ability || "미설정"}`,
    `EV 총합: ${sumSpread(input.evs)} / 510`,
  ];

  if (nature?.increase && nature.decrease) {
    checklist.push(
      `성격 보정: +${nature.increase.toUpperCase()} / -${nature.decrease.toUpperCase()}`,
    );
  }

  checklist.push(...roleHints.map((hint) => `역할 체크포인트: ${hint}`));

  return { checklist, warnings };
}
