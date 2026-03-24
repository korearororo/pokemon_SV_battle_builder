import type { MoveEntry, PokemonEntry, PokemonType, StatSpread } from "@/lib/pokemon/types";

function makeStats(
  hp: number,
  atk: number,
  def: number,
  spa: number,
  spd: number,
  spe: number,
): StatSpread {
  return { hp, atk, def, spa, spd, spe };
}

export const TERA_TYPES: PokemonType[] = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
];

export const POKEMON_DATA: PokemonEntry[] = [
  {
    name: "Flutter Mane",
    types: ["Ghost", "Fairy"],
    abilities: ["Protosynthesis"],
    baseStats: makeStats(55, 55, 55, 135, 135, 135),
    speedTierTag: "Fast",
  },
  {
    name: "Chien-Pao",
    types: ["Dark", "Ice"],
    abilities: ["Sword of Ruin"],
    baseStats: makeStats(80, 120, 80, 90, 65, 135),
    speedTierTag: "Fast",
  },
  {
    name: "Dragonite",
    types: ["Dragon", "Flying"],
    abilities: ["Inner Focus", "Multiscale"],
    baseStats: makeStats(91, 134, 95, 100, 100, 80),
    speedTierTag: "Mid",
  },
  {
    name: "Gholdengo",
    types: ["Steel", "Ghost"],
    abilities: ["Good as Gold"],
    baseStats: makeStats(87, 60, 95, 133, 91, 84),
    speedTierTag: "Mid",
  },
  {
    name: "Amoonguss",
    types: ["Grass", "Poison"],
    abilities: ["Effect Spore", "Regenerator"],
    baseStats: makeStats(114, 85, 70, 85, 80, 30),
    speedTierTag: "Slow",
  },
  {
    name: "Annihilape",
    types: ["Fighting", "Ghost"],
    abilities: ["Vital Spirit", "Inner Focus", "Defiant"],
    baseStats: makeStats(110, 115, 80, 50, 90, 90),
    speedTierTag: "Mid",
  },
  {
    name: "Garchomp",
    types: ["Dragon", "Ground"],
    abilities: ["Sand Veil", "Rough Skin"],
    baseStats: makeStats(108, 130, 95, 80, 85, 102),
    speedTierTag: "Fast",
  },
  {
    name: "Iron Bundle",
    types: ["Ice", "Water"],
    abilities: ["Quark Drive"],
    baseStats: makeStats(56, 80, 114, 124, 60, 136),
    speedTierTag: "Fast",
  },
  {
    name: "Kingambit",
    types: ["Dark", "Steel"],
    abilities: ["Defiant", "Supreme Overlord", "Pressure"],
    baseStats: makeStats(100, 135, 120, 60, 85, 50),
    speedTierTag: "Slow",
  },
  {
    name: "Ting-Lu",
    types: ["Dark", "Ground"],
    abilities: ["Vessel of Ruin"],
    baseStats: makeStats(155, 110, 125, 55, 80, 45),
    speedTierTag: "Slow",
  },
  {
    name: "Urshifu-Rapid-Strike",
    types: ["Fighting", "Water"],
    abilities: ["Unseen Fist"],
    baseStats: makeStats(100, 130, 100, 63, 60, 97),
    speedTierTag: "Mid",
  },
  {
    name: "Raging Bolt",
    types: ["Electric", "Dragon"],
    abilities: ["Protosynthesis"],
    baseStats: makeStats(125, 73, 91, 137, 89, 75),
    speedTierTag: "Mid",
  },
];

export const MOVE_DATA: MoveEntry[] = [
  { name: "Moonblast", type: "Fairy", category: "special", power: 95 },
  { name: "Shadow Ball", type: "Ghost", category: "special", power: 80 },
  { name: "Ice Spinner", type: "Ice", category: "physical", power: 80 },
  { name: "Crunch", type: "Dark", category: "physical", power: 80 },
  { name: "Extreme Speed", type: "Normal", category: "physical", power: 80 },
  { name: "Earthquake", type: "Ground", category: "physical", power: 100 },
  { name: "Make It Rain", type: "Steel", category: "special", power: 120 },
  { name: "Dazzling Gleam", type: "Fairy", category: "special", power: 80 },
  { name: "Rage Fist", type: "Ghost", category: "physical", power: 50 },
  { name: "Drain Punch", type: "Fighting", category: "physical", power: 75 },
  { name: "Hydro Pump", type: "Water", category: "special", power: 110 },
  { name: "Freeze-Dry", type: "Ice", category: "special", power: 70 },
  { name: "Kowtow Cleave", type: "Dark", category: "physical", power: 85 },
  { name: "Sucker Punch", type: "Dark", category: "physical", power: 70 },
  { name: "Thunderclap", type: "Electric", category: "special", power: 70 },
  { name: "Draco Meteor", type: "Dragon", category: "special", power: 130 },
  { name: "Protect", type: "Normal", category: "status", power: null },
  { name: "Spore", type: "Grass", category: "status", power: null },
];

export const ITEM_DATA: string[] = [
  "Focus Sash",
  "Choice Scarf",
  "Choice Specs",
  "Choice Band",
  "Assault Vest",
  "Sitrus Berry",
  "Leftovers",
  "Booster Energy",
  "Life Orb",
  "Rocky Helmet",
  "Covert Cloak",
  "Safety Goggles",
];

export const ABILITY_DATA: string[] = Array.from(
  new Set(POKEMON_DATA.flatMap((entry) => entry.abilities)),
).sort((a, b) => a.localeCompare(b));
