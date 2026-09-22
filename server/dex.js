import { GENERATIONS, MAX_NATIONAL_DEX_ID } from './config.js';
import { getResource, idFromUrl, PokeApiError } from './pokeapi.js';

// Derived Pokedex id lists, keyed by generation ("1".."9") or "all". Built from the
// live /generation endpoints rather than hard-coded ranges, then memoised because
// the ordering work is pure and the upstream data never changes.
const dexIdCache = new Map();

/**
 * Reads /generation/{id} and returns its species ids in National Pokedex order.
 * PokeAPI returns pokemon_species unsorted (roughly alphabetical), so sorting here
 * is what gives the grid its expected Bulbasaur-first ordering.
 */
async function generationDexIds(generationId) {
  const generation = await getResource(`generation/${generationId}`);

  return (generation.pokemon_species ?? [])
    .map((species) => idFromUrl(species.url))
    .filter((id) => Number.isInteger(id) && id >= 1 && id <= MAX_NATIONAL_DEX_ID)
    .sort((a, b) => a - b);
}

/**
 * Resolves a generation selector into an ordered list of Pokedex ids.
 * Accepts a generation number 1-9, or "all" for the full National Pokedex.
 */
export async function getDexIds(generation) {
  const key = String(generation ?? 'all').toLowerCase();

  if (dexIdCache.has(key)) return dexIdCache.get(key);

  const task = (async () => {
    if (key === 'all') {
      const perGeneration = await Promise.all(GENERATIONS.map((gen) => generationDexIds(gen.id)));
      return perGeneration.flat().sort((a, b) => a - b);
    }

    const generationId = Number.parseInt(key, 10);
    if (!GENERATIONS.some((gen) => gen.id === generationId)) {
      throw new PokeApiError(
        `Unknown generation "${generation}". Use 1-${GENERATIONS.length} or "all".`,
        400,
        'generation',
      );
    }

    return generationDexIds(generationId);
  })();

  dexIdCache.set(key, task);
  // A failed lookup shouldn't be remembered, or a transient network blip would be
  // cached as a permanent error for the lifetime of the process.
  task.catch(() => dexIdCache.delete(key));
  return task;
}
