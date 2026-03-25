import type { MoveCategory, MoveEntry, PokemonEntry, PokemonType, StatSpread } from "@/lib/pokemon/types";

type CsvRow = Record<string, string>;

type FullDexData = {
  pokemonNamesKo: string[];
  moveNamesKo: string[];
  itemNamesKo: string[];
  abilityNamesKo: string[];
  pokemonByName: Record<string, PokemonEntry>;
  moveByName: Record<string, MoveEntry>;
};

const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";

const DATA_FILES = {
  languages: "languages.csv",
  pokemonSpecies: "pokemon_species.csv",
  pokemonSpeciesNames: "pokemon_species_names.csv",
  pokemon: "pokemon.csv",
  pokemonStats: "pokemon_stats.csv",
  pokemonTypes: "pokemon_types.csv",
  types: "types.csv",
  pokemonAbilities: "pokemon_abilities.csv",
  abilityNames: "ability_names.csv",
  moves: "moves.csv",
  moveNames: "move_names.csv",
  itemNames: "item_names.csv",
} as const;

const MAX_NATIONAL_DEX = 1025;

const MOVE_NAME_KO_OVERRIDES: Record<string, string> = {
  "tera blast": "테라버스트",
  "tera-blast": "테라버스트",
};

const ABILITY_NAME_KO_OVERRIDES: Record<number, string> = {
  268: "가시지않는향기",
  269: "넘치는씨",
  270: "열교환",
  271: "분노의껍질",
  272: "정화의소금",
  273: "노릇노릇바디",
  274: "바람타기",
  275: "파수견",
  276: "바위나르기",
  277: "풍력발전",
  278: "마이티체인지",
  279: "사령탑",
  280: "전기로바꾸기",
  281: "고대활성",
  282: "쿼크차지",
  283: "황금몸",
  284: "재앙의그릇",
  285: "재앙의검",
  286: "재앙의목간",
  287: "재앙의구슬",
  288: "진홍빛고동",
  289: "하드론엔진",
  290: "편승",
  291: "되새김질",
  292: "예리함",
  293: "총대장",
  294: "협연",
  295: "독치장",
  296: "테일아머",
  297: "흙먹기",
  298: "균사의힘",
  299: "심안",
  300: "감미로운꿀",
  301: "대접",
  302: "독사슬",
  303: "초상투영",
  304: "테라체인지",
  305: "테라셸",
  306: "제로포밍",
  307: "독조종",
};

let cachedPromise: Promise<FullDexData> | null = null;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function applyMoveNameOverride(value: string): string {
  return MOVE_NAME_KO_OVERRIDES[normalize(value)] ?? value;
}

function parseCsv(text: string): CsvRow[] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      if (row.length > 0 || cell.length > 0) {
        row.push(cell);
        lines.push(row);
      }

      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (row.length > 0 || cell.length > 0) {
    row.push(cell);
    lines.push(row);
  }

  if (lines.length === 0) {
    return [];
  }

  const [header, ...values] = lines;
  return values
    .filter((line) => line.length > 0)
    .map((line) => {
      const mapped: CsvRow = {};
      for (let index = 0; index < header.length; index += 1) {
        mapped[header[index]] = line[index] ?? "";
      }
      return mapped;
    });
}

async function fetchCsv(fileName: string): Promise<CsvRow[]> {
  const response = await fetch(`${CSV_BASE}/${fileName}`, {
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}`);
  }

  return parseCsv(await response.text());
}

function mapTypeName(value: string): PokemonType {
  const key = value.trim().toLowerCase();
  const mapped: Record<string, PokemonType> = {
    normal: "Normal",
    fire: "Fire",
    water: "Water",
    electric: "Electric",
    grass: "Grass",
    ice: "Ice",
    fighting: "Fighting",
    poison: "Poison",
    ground: "Ground",
    flying: "Flying",
    psychic: "Psychic",
    bug: "Bug",
    rock: "Rock",
    ghost: "Ghost",
    dragon: "Dragon",
    dark: "Dark",
    steel: "Steel",
    fairy: "Fairy",
  };

  return mapped[key] ?? "Normal";
}

function moveCategoryByDamageClassId(damageClassId: number): MoveCategory {
  if (damageClassId === 2) {
    return "physical";
  }
  if (damageClassId === 3) {
    return "special";
  }
  return "status";
}

function emptySpread(): StatSpread {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

export async function loadFullDexData(): Promise<FullDexData> {
  if (cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = (async () => {
    const [
      languages,
      pokemonSpecies,
      pokemonSpeciesNames,
      pokemon,
      pokemonStats,
      pokemonTypes,
      types,
      pokemonAbilities,
      abilityNames,
      moves,
      moveNames,
      itemNames,
    ] = await Promise.all([
      fetchCsv(DATA_FILES.languages),
      fetchCsv(DATA_FILES.pokemonSpecies),
      fetchCsv(DATA_FILES.pokemonSpeciesNames),
      fetchCsv(DATA_FILES.pokemon),
      fetchCsv(DATA_FILES.pokemonStats),
      fetchCsv(DATA_FILES.pokemonTypes),
      fetchCsv(DATA_FILES.types),
      fetchCsv(DATA_FILES.pokemonAbilities),
      fetchCsv(DATA_FILES.abilityNames),
      fetchCsv(DATA_FILES.moves),
      fetchCsv(DATA_FILES.moveNames),
      fetchCsv(DATA_FILES.itemNames),
    ]);

    const koreanLanguageId = Number(
      languages.find((entry) => entry.identifier === "ko")?.id ?? "3",
    );

    const speciesIdSet = new Set(
      pokemonSpecies
        .map((entry) => Number(entry.id))
        .filter((id) => Number.isFinite(id) && id >= 1 && id <= MAX_NATIONAL_DEX),
    );

    const speciesNameKo = new Map<number, string>();
    for (const entry of pokemonSpeciesNames) {
      const speciesId = Number(entry.pokemon_species_id);
      const languageId = Number(entry.local_language_id);
      if (!speciesIdSet.has(speciesId) || languageId !== koreanLanguageId) {
        continue;
      }
      if (entry.name) {
        speciesNameKo.set(speciesId, entry.name);
      }
    }

    const defaultPokemonBySpecies = new Map<number, { pokemonId: number; identifier: string }>();
    for (const entry of pokemon) {
      const speciesId = Number(entry.species_id);
      const isDefault = Number(entry.is_default) === 1;
      const pokemonId = Number(entry.id);

      if (!speciesIdSet.has(speciesId) || !isDefault || !Number.isFinite(pokemonId)) {
        continue;
      }

      if (!defaultPokemonBySpecies.has(speciesId) || pokemonId < (defaultPokemonBySpecies.get(speciesId)?.pokemonId ?? pokemonId + 1)) {
        defaultPokemonBySpecies.set(speciesId, {
          pokemonId,
          identifier: entry.identifier,
        });
      }
    }

    const typeNameByTypeId = new Map<number, PokemonType>();
    for (const entry of types) {
      const typeId = Number(entry.id);
      if (!Number.isFinite(typeId)) {
        continue;
      }
      typeNameByTypeId.set(typeId, mapTypeName(entry.identifier));
    }

    const abilityNameById = new Map<number, string>();
    const abilityNameEnById = new Map<number, string>();
    for (const entry of abilityNames) {
      const languageId = Number(entry.local_language_id);
      const abilityId = Number(entry.ability_id);
      if (!Number.isFinite(abilityId)) {
        continue;
      }

      if (!entry.name) {
        continue;
      }

      if (languageId === koreanLanguageId) {
        abilityNameById.set(abilityId, entry.name);
        continue;
      }

      if (languageId === 9 && !abilityNameEnById.has(abilityId)) {
        abilityNameEnById.set(abilityId, entry.name);
      }
    }

    for (const [abilityId, englishName] of abilityNameEnById.entries()) {
      if (!abilityNameById.has(abilityId)) {
        abilityNameById.set(abilityId, englishName);
      }
    }

    for (const [abilityId, localizedName] of Object.entries(ABILITY_NAME_KO_OVERRIDES)) {
      abilityNameById.set(Number(abilityId), localizedName);
    }

    const pokemonStatsByPokemonId = new Map<number, StatSpread>();
    for (const entry of pokemonStats) {
      const pokemonId = Number(entry.pokemon_id);
      const statId = Number(entry.stat_id);
      const baseStat = Number(entry.base_stat);

      if (!Number.isFinite(pokemonId) || !Number.isFinite(statId) || !Number.isFinite(baseStat)) {
        continue;
      }

      const current = pokemonStatsByPokemonId.get(pokemonId) ?? emptySpread();
      if (statId === 1) {
        current.hp = baseStat;
      }
      if (statId === 2) {
        current.atk = baseStat;
      }
      if (statId === 3) {
        current.def = baseStat;
      }
      if (statId === 4) {
        current.spa = baseStat;
      }
      if (statId === 5) {
        current.spd = baseStat;
      }
      if (statId === 6) {
        current.spe = baseStat;
      }
      pokemonStatsByPokemonId.set(pokemonId, current);
    }

    const pokemonTypesByPokemonId = new Map<number, PokemonType[]>();
    for (const entry of pokemonTypes) {
      const pokemonId = Number(entry.pokemon_id);
      const typeId = Number(entry.type_id);
      const slot = Number(entry.slot);
      if (!Number.isFinite(pokemonId) || !Number.isFinite(typeId) || !Number.isFinite(slot)) {
        continue;
      }
      const typeName = typeNameByTypeId.get(typeId);
      if (!typeName) {
        continue;
      }
      const current = pokemonTypesByPokemonId.get(pokemonId) ?? [];
      current[slot - 1] = typeName;
      pokemonTypesByPokemonId.set(pokemonId, current);
    }

    const pokemonAbilitiesByPokemonId = new Map<number, string[]>();
    for (const entry of pokemonAbilities) {
      const pokemonId = Number(entry.pokemon_id);
      const abilityId = Number(entry.ability_id);
      if (!Number.isFinite(pokemonId) || !Number.isFinite(abilityId)) {
        continue;
      }
      const abilityName = abilityNameById.get(abilityId);
      if (!abilityName) {
        continue;
      }
      const current = pokemonAbilitiesByPokemonId.get(pokemonId) ?? [];
      if (!current.includes(abilityName)) {
        current.push(abilityName);
      }
      pokemonAbilitiesByPokemonId.set(pokemonId, current);
    }

    const pokemonByName: Record<string, PokemonEntry> = {};
    const pokemonNamesKo: string[] = [];

    for (const [speciesId, defaultPokemon] of defaultPokemonBySpecies.entries()) {
      if (!speciesIdSet.has(speciesId)) {
        continue;
      }
      const koName = speciesNameKo.get(speciesId) ?? titleCase(defaultPokemon.identifier);
      const stats = pokemonStatsByPokemonId.get(defaultPokemon.pokemonId);
      if (!stats) {
        continue;
      }
      const types = (pokemonTypesByPokemonId.get(defaultPokemon.pokemonId) ?? ["Normal"]).filter(
        Boolean,
      ) as PokemonType[];
      const abilities = pokemonAbilitiesByPokemonId.get(defaultPokemon.pokemonId) ?? [];

      const entry: PokemonEntry = {
        name: koName,
        pokemonId: defaultPokemon.pokemonId,
        speciesId,
        identifier: defaultPokemon.identifier,
        types,
        abilities,
        baseStats: stats,
        speedTierTag: stats.spe >= 120 ? "Fast" : stats.spe >= 80 ? "Mid" : "Slow",
      };

      pokemonNamesKo.push(koName);
      pokemonByName[normalize(koName)] = entry;
      pokemonByName[normalize(titleCase(defaultPokemon.identifier))] = entry;
      pokemonByName[normalize(defaultPokemon.identifier)] = entry;
    }

    const moveNameKoById = new Map<number, string>();
    for (const entry of moveNames) {
      const languageId = Number(entry.local_language_id);
      if (languageId !== koreanLanguageId) {
        continue;
      }
      const moveId = Number(entry.move_id);
      if (!Number.isFinite(moveId) || !entry.name) {
        continue;
      }
      moveNameKoById.set(moveId, entry.name);
    }

    const moveByName: Record<string, MoveEntry> = {};
    const moveNamesKo: string[] = [];

    for (const entry of moves) {
      const moveId = Number(entry.id);
      const typeId = Number(entry.type_id);
      const damageClassId = Number(entry.damage_class_id);
      const power = entry.power ? Number(entry.power) : null;
      const priority = Number(entry.priority ?? "0");

      if (!Number.isFinite(moveId) || !Number.isFinite(typeId) || !Number.isFinite(damageClassId)) {
        continue;
      }

      const koName = applyMoveNameOverride(
        moveNameKoById.get(moveId) ?? titleCase(entry.identifier),
      );
      const moveType = typeNameByTypeId.get(typeId) ?? "Normal";
      const moveEntry: MoveEntry = {
        name: koName,
        type: moveType,
        category: moveCategoryByDamageClassId(damageClassId),
        power: Number.isFinite(power ?? NaN) ? power : null,
        priority: Number.isFinite(priority) ? priority : 0,
      };

      moveNamesKo.push(koName);
      moveByName[normalize(koName)] = moveEntry;
      moveByName[normalize(titleCase(entry.identifier))] = moveEntry;
      moveByName[normalize(entry.identifier)] = moveEntry;
    }

    const abilityNamesKo: string[] = Array.from(abilityNameById.values()).sort((a, b) =>
      a.localeCompare(b, "ko"),
    );

    const itemNamesKo = itemNames
      .filter((entry) => Number(entry.local_language_id) === koreanLanguageId)
      .map((entry) => entry.name)
      .filter((name) => name.length > 0)
      .sort((a, b) => a.localeCompare(b, "ko"));

    return {
      pokemonNamesKo: Array.from(new Set(pokemonNamesKo)).sort((a, b) => a.localeCompare(b, "ko")),
      moveNamesKo: Array.from(new Set(moveNamesKo)).sort((a, b) => a.localeCompare(b, "ko")),
      itemNamesKo: Array.from(new Set(itemNamesKo)),
      abilityNamesKo,
      pokemonByName,
      moveByName,
    };
  })().catch((error) => {
    cachedPromise = null;
    throw error;
  });

  return cachedPromise;
}
