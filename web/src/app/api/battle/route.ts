import { NextResponse } from "next/server";

import { loadFullDexData } from "@/lib/pokemon/full-dex-data";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const attacker = url.searchParams.get("attacker") ?? "";
  const defender = url.searchParams.get("defender") ?? "";
  const move = url.searchParams.get("move") ?? "";

  try {
    const fullDex = await loadFullDexData();

    const attackerEntry = attacker ? fullDex.pokemonByName[normalize(attacker)] ?? null : null;
    const defenderEntry = defender ? fullDex.pokemonByName[normalize(defender)] ?? null : null;
    const moveEntry = move ? fullDex.moveByName[normalize(move)] ?? null : null;

    return NextResponse.json({
      attacker: attackerEntry,
      defender: defenderEntry,
      move: moveEntry,
    });
  } catch {
    return NextResponse.json({ attacker: null, defender: null, move: null }, { status: 200 });
  }
}
