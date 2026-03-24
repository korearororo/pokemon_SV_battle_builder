import { NextResponse } from "next/server";

import { loadFullDexData } from "@/lib/pokemon/full-dex-data";

type DexKind = "pokemon" | "move" | "item" | "ability";

type DexResponse = {
  kind: DexKind;
  results: string[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function filterByQuery(values: string[], query: string, limit: number): string[] {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return values.slice(0, limit);
  }

  const startsWith = values.filter((value) => normalize(value).startsWith(normalizedQuery));
  const contains = values.filter(
    (value) => !normalize(value).startsWith(normalizedQuery) && normalize(value).includes(normalizedQuery),
  );

  return [...startsWith, ...contains].slice(0, limit);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const q = url.searchParams.get("q") ?? "";
  const limitParam = Number(url.searchParams.get("limit") ?? "20");

  if (kindParam !== "pokemon" && kindParam !== "move" && kindParam !== "item" && kindParam !== "ability") {
    return NextResponse.json({ message: "kind must be pokemon|move|item|ability" }, { status: 400 });
  }

  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.trunc(limitParam))) : 20;

  try {
    const fullDex = await loadFullDexData();

    const sourceByKind: Record<DexKind, string[]> = {
      pokemon: fullDex.pokemonNamesKo,
      move: fullDex.moveNamesKo,
      item: fullDex.itemNamesKo,
      ability: fullDex.abilityNamesKo,
    };

    const payload: DexResponse = {
      kind: kindParam,
      results: filterByQuery(sourceByKind[kindParam], q, limit),
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { kind: kindParam, results: [] as string[], message: "full dex unavailable" },
      { status: 200 },
    );
  }
}
