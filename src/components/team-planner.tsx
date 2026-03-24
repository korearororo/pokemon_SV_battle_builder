"use client";

import { useMemo, useState } from "react";

import { TERA_TYPES } from "@/lib/pokemon/data";
import { getTypeEffectiveness } from "@/lib/pokemon/type-chart";
import type { PokemonType, TeamSlot } from "@/lib/pokemon/types";

type TeamPlannerProps = {
  pokemonOptions: string[];
  resolveTypes: (pokemonName: string) => PokemonType[];
};

const DEFAULT_TEAM: TeamSlot[] = Array.from({ length: 6 }, (_, index) => ({
  id: `slot-${index + 1}`,
  pokemonName: "",
  roleNote: "",
}));

export function TeamPlanner({ pokemonOptions, resolveTypes }: TeamPlannerProps) {
  const [team, setTeam] = useState<TeamSlot[]>(DEFAULT_TEAM);

  const teamSummary = useMemo(() => {
    const typedSlots = team
      .map((slot) => ({
        ...slot,
        types: resolveTypes(slot.pokemonName),
      }))
      .filter((slot) => slot.pokemonName.trim().length > 0);

    const rows = TERA_TYPES.map((attackType) => {
      let weakCount = 0;
      let resistCount = 0;
      let immuneCount = 0;

      for (const slot of typedSlots) {
        if (slot.types.length === 0) {
          continue;
        }
        const multiplier = getTypeEffectiveness(attackType, slot.types);
        if (multiplier === 0) {
          immuneCount += 1;
        } else if (multiplier > 1) {
          weakCount += 1;
        } else if (multiplier < 1) {
          resistCount += 1;
        }
      }

      return { attackType, weakCount, resistCount, immuneCount };
    });

    return {
      filledCount: typedSlots.length,
      unknownCount: typedSlots.filter((slot) => slot.types.length === 0).length,
      rows,
    };
  }, [resolveTypes, team]);

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">6마리 팀 플래너</h2>
        <p className="text-xs text-slate-600">
          입력 {teamSummary.filledCount}/6, 타입 미확인 {teamSummary.unknownCount}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {team.map((slot) => (
          <div key={slot.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="grid gap-1 text-sm text-slate-700">
              {slot.id.replace("slot-", "슬롯 ")}
              <input
                list="team-pokemon-suggestions"
                value={slot.pokemonName}
                onChange={(event) =>
                  setTeam((prev) =>
                    prev.map((entry) =>
                      entry.id === slot.id ? { ...entry, pokemonName: event.target.value } : entry,
                    ),
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                placeholder="예) 망나뇽"
              />
            </label>
            <label className="mt-2 grid gap-1 text-sm text-slate-700">
              역할 메모
              <input
                value={slot.roleNote}
                onChange={(event) =>
                  setTeam((prev) =>
                    prev.map((entry) =>
                      entry.id === slot.id ? { ...entry, roleNote: event.target.value } : entry,
                    ),
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                placeholder="예) 선봉 스피드 압박"
              />
            </label>
          </div>
        ))}
      </div>

      <datalist id="team-pokemon-suggestions">
        {pokemonOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">공격 타입</th>
              <th className="px-3 py-2 text-right">약점 수</th>
              <th className="px-3 py-2 text-right">반감 수</th>
              <th className="px-3 py-2 text-right">무효 수</th>
            </tr>
          </thead>
          <tbody>
            {teamSummary.rows.map((row) => (
              <tr key={row.attackType} className="border-t border-slate-200">
                <td className="px-3 py-2">{row.attackType}</td>
                <td className="px-3 py-2 text-right text-rose-700">{row.weakCount}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{row.resistCount}</td>
                <td className="px-3 py-2 text-right text-sky-700">{row.immuneCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
