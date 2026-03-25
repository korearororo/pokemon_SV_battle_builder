export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type PokemonType =
  | "Normal"
  | "Fire"
  | "Water"
  | "Electric"
  | "Grass"
  | "Ice"
  | "Fighting"
  | "Poison"
  | "Ground"
  | "Flying"
  | "Psychic"
  | "Bug"
  | "Rock"
  | "Ghost"
  | "Dragon"
  | "Dark"
  | "Steel"
  | "Fairy";

export type TeraType = PokemonType | "Stellar";

export type StatSpread = Record<StatKey, number>;

export type StatStageSpread = Record<StatKey, number>;

export type PokemonRole =
  | "sweeper"
  | "bulky-sweeper"
  | "wall"
  | "support"
  | "speed-control";

export type NatureEffect = {
  name: string;
  labelKo: string;
  increase: StatKey | null;
  decrease: StatKey | null;
};

export type BuildInput = {
  pokemonName: string;
  targetPokemonName: string;
  moveName: string;
  role: PokemonRole;
  teraType: string;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  attackerStages: StatStageSpread;
  defenderStages: StatStageSpread;
};

export type BuildSuggestion = {
  checklist: string[];
  warnings: string[];
};

export type PokemonEntry = {
  name: string;
  pokemonId?: number;
  speciesId?: number;
  identifier?: string;
  types: PokemonType[];
  abilities: string[];
  baseStats: StatSpread;
  speedTierTag: string;
};

export type MoveCategory = "physical" | "special" | "status";

export type MoveEntry = {
  name: string;
  type: TeraType;
  category: MoveCategory;
  power: number | null;
  priority: number;
};

export type BattleWeather = "none" | "sun" | "rain" | "sand" | "snow";

export type DamageCalcOptions = {
  attackerTeraType: TeraType | "";
  defenderTeraType: TeraType | "";
  weather: BattleWeather;
  attackerAbility?: string;
  defenderAbility?: string;
  attackerCurrentHpPercent?: number;
  defenderCurrentHpPercent?: number;
  previousMoveName?: string;
  movedAfterTarget?: boolean;
  wasHitEarlierThisTurn?: boolean;
};

export type TeamSlot = {
  id: string;
  pokemonName: string;
  roleNote: string;
};
