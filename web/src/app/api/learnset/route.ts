import { NextResponse } from "next/server";
import { Dex, toID } from "@pkmn/dex";

import { loadFullDexData } from "@/lib/pokemon/full-dex-data";

const GEN9_DEX = Dex.forGen(9);
const learnsetCache = new Map<string, string[]>();

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSpeciesId(identifierCandidates: string[]): string {
  for (const candidate of identifierCandidates) {
    const id = toID(candidate);
    if (!id) {
      continue;
    }
    const species = GEN9_DEX.species.get(id);
    if (species.exists) {
      return species.id;
    }
  }
  return "";
}

async function getGen9LatestMoveNames(speciesId: string): Promise<string[]> {
  const learnset = await GEN9_DEX.learnsets.get(speciesId);
  const moveTable = learnset.learnset ?? {};
  const entries = Object.entries(moveTable);

  const gen9Only = entries
    .filter(([, sources]) => Array.isArray(sources) && sources.some((source) => String(source).startsWith("9")))
    .map(([moveId]) => moveId);

  const moveIds = gen9Only.length > 0 ? gen9Only : entries.map(([moveId]) => moveId);
  return moveIds
    .map((moveId) => GEN9_DEX.moves.get(moveId).name)
    .filter((moveName) => typeof moveName === "string" && moveName.length > 0);
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

    const speciesId = resolveSpeciesId([
      entry.identifier ?? "",
      entry.name ?? "",
      pokemonName,
    ]);

    if (!speciesId) {
      return NextResponse.json({ pokemon: entry.name, moves: [] as string[] }, { status: 200 });
    }

    const cached = learnsetCache.get(speciesId);
    if (cached) {
      return NextResponse.json({ pokemon: entry.name, moves: cached }, { status: 200 });
    }

    const moveNames = await getGen9LatestMoveNames(speciesId);
    const movesKo = moveNames
      .map((moveName) => fullDex.moveByName[normalize(moveName)]?.name ?? moveName);

    const filtered = Array.from(new Set(movesKo))
      .filter((name) => name.trim().length > 0)
      .sort((a, b) => a.localeCompare(b, "ko"));
    learnsetCache.set(speciesId, filtered);

    return NextResponse.json({
      pokemon: entry.name,
      moves: filtered,
      source: "pokemon-showdown-gen9-national",
    });
  } catch {
    return NextResponse.json({ pokemon: pokemonName, moves: [] as string[] }, { status: 200 });
  }
}
