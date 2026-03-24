import { NextResponse } from "next/server";

import { loadFullDexData } from "@/lib/pokemon/full-dex-data";

const SV_VERSION_GROUP = "scarlet-violet";
const learnsetCache = new Map<number, string[]>();

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pokemonName = url.searchParams.get("pokemon") ?? "";

  if (!pokemonName.trim()) {
    return NextResponse.json({ pokemon: "", moves: [] as string[] }, { status: 200 });
  }

  try {
    const fullDex = await loadFullDexData();
    const entry = fullDex.pokemonByName[normalize(pokemonName)];

    if (!entry?.pokemonId) {
      return NextResponse.json({ pokemon: pokemonName, moves: [] as string[] }, { status: 200 });
    }

    const cached = learnsetCache.get(entry.pokemonId);
    if (cached) {
      return NextResponse.json({ pokemon: entry.name, moves: cached }, { status: 200 });
    }

    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${entry.pokemonId}`, {
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      return NextResponse.json({ pokemon: entry.name, moves: [] as string[] }, { status: 200 });
    }

    const payload = (await response.json()) as {
      moves: Array<{
        move: { name: string };
        version_group_details: Array<{ version_group: { name: string } }>;
      }>;
    };

    const movesKo = payload.moves
      .filter((item) =>
        item.version_group_details.some(
          (detail) => detail.version_group.name === SV_VERSION_GROUP,
        ),
      )
      .map((item) => fullDex.moveByName[normalize(item.move.name)]?.name)
      .filter((name): name is string => typeof name === "string");

    const filtered = Array.from(new Set(movesKo)).sort((a, b) => a.localeCompare(b, "ko"));
    learnsetCache.set(entry.pokemonId, filtered);

    return NextResponse.json({
      pokemon: entry.name,
      moves: filtered,
    });
  } catch {
    return NextResponse.json({ pokemon: pokemonName, moves: [] as string[] }, { status: 200 });
  }
}
