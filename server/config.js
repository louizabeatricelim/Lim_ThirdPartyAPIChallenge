import 'dotenv/config';

function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', 3000),
  pokeapiBaseUrl: (process.env.POKEAPI_BASE_URL || 'https://pokeapi.co/api/v2').replace(/\/+$/, ''),
  cacheTtlMs: intFromEnv('CACHE_TTL_SECONDS', 604800) * 1000,
  concurrency: intFromEnv('POKEAPI_CONCURRENCY', 10),
};

// Highest Pokedex number covered by generations 1-9. Ids above this belong to
// alternate forms (10001+) which have no generation of their own.
export const MAX_NATIONAL_DEX_ID = 1025;

export const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const GENERATIONS = [
  { id: 1, label: 'Gen I', region: 'Kanto' },
  { id: 2, label: 'Gen II', region: 'Johto' },
  { id: 3, label: 'Gen III', region: 'Hoenn' },
  { id: 4, label: 'Gen IV', region: 'Sinnoh' },
  { id: 5, label: 'Gen V', region: 'Unova' },
  { id: 6, label: 'Gen VI', region: 'Kalos' },
  { id: 7, label: 'Gen VII', region: 'Alola' },
  { id: 8, label: 'Gen VIII', region: 'Galar' },
  { id: 9, label: 'Gen IX', region: 'Paldea' },
];
