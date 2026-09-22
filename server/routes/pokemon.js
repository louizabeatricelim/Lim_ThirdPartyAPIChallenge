import { Router } from 'express';

import { getDexIds } from '../dex.js';
import { getResource, getResources, PokeApiError } from '../pokeapi.js';
import { toDetail, toListItem } from '../transform.js';

const router = Router();

const ONE_DAY = 'public, max-age=86400';
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * GET /api/pokemon?gen=1&offset=0&limit=60
 *
 * Returns one page of trimmed Pokemon records. The frontend walks through pages
 * until hasMore is false, which keeps every individual request fast instead of
 * blocking on all 1025 Pokemon at once.
 */
router.get('/pokemon', async (req, res, next) => {
  try {
    const dexIds = await getDexIds(req.query.gen ?? 'all');
    const offset = clampInt(req.query.offset, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    const limit = clampInt(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });

    const pageIds = dexIds.slice(offset, offset + limit);
    const pokemon = await getResources(pageIds.map((id) => `pokemon/${id}`));

    res.set('Cache-Control', ONE_DAY).json({
      items: pokemon.map(toListItem),
      offset,
      limit,
      total: dexIds.length,
      hasMore: offset + pageIds.length < dexIds.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pokemon/:idOrName
 *
 * Full detail for the modal. The species request is what supplies the flavour text
 * and the evolution chain id, so both resources are fetched in parallel.
 */
router.get('/pokemon/:idOrName', async (req, res, next) => {
  try {
    const key = String(req.params.idOrName).trim().toLowerCase();
    if (!key) throw new PokeApiError('A Pokemon id or name is required.', 400, 'pokemon');

    const pokemon = await getResource(`pokemon/${encodeURIComponent(key)}`);
    // Alternate forms can point at a species whose id differs from the Pokemon id,
    // so always follow the species URL the response gives us.
    const species = await getResource(pokemon.species.url).catch(() => null);

    res.set('Cache-Control', ONE_DAY).json({ pokemon: toDetail(pokemon, species) });
  } catch (err) {
    next(err);
  }
});

export default router;
