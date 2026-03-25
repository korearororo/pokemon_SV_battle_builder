import { ABILITY_DATA, ITEM_DATA, MOVE_DATA, POKEMON_DATA, TERA_TYPES } from "@/lib/pokemon/data";
import type { MoveEntry, PokemonEntry } from "@/lib/pokemon/types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function rankByQuery<T extends string | { name: string }>(
  query: string,
  values: T[],
  limit = 8,
): T[] {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return values.slice(0, limit);
  }

  const extracted = values
    .map((entry) => {
      const name = typeof entry === "string" ? entry : entry.name;
      const normalizedName = normalize(name);
      let score = 1000;

      if (normalizedName.startsWith(normalizedQuery)) {
        score = 0;
      } else if (normalizedName.includes(normalizedQuery)) {
        score = 1;
      }

      return { entry, score, name };
    })
    .filter((candidate) => candidate.score < 1000)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));

  return extracted.slice(0, limit).map((candidate) => candidate.entry);
}

export function getPokemonSuggestions(query: string, limit = 8): PokemonEntry[] {
  return rankByQuery(query, POKEMON_DATA, limit);
}

export function getMoveSuggestions(query: string, limit = 8): MoveEntry[] {
  return rankByQuery(query, MOVE_DATA, limit);
}

export function getItemSuggestions(query: string, limit = 8): string[] {
  return rankByQuery(query, ITEM_DATA, limit);
}

export function getAbilitySuggestions(query: string, limit = 8): string[] {
  return rankByQuery(query, ABILITY_DATA, limit);
}

export function getTeraTypeSuggestions(query: string, limit = 8): string[] {
  return rankByQuery(query, TERA_TYPES, limit);
}

export function findPokemonByName(name: string): PokemonEntry | undefined {
  const normalized = normalize(name);
  return POKEMON_DATA.find((entry) => normalize(entry.name) === normalized);
}

export function findMoveByName(name: string): MoveEntry | undefined {
  const normalized = normalize(name);
  return MOVE_DATA.find((entry) => normalize(entry.name) === normalized);
}

export function filterStringSuggestions(values: string[], query: string, limit = 8): string[] {
  return rankByQuery(query, values, limit);
}
