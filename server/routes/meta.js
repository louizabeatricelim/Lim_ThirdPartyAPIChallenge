import { Router } from 'express';

import { GENERATIONS, TYPE_NAMES } from '../config.js';
import { getDexIds } from '../dex.js';
import { getResources } from '../pokeapi.js';
import { toTypeSummary } from '../transform.js';

const router = Router();

// PokeAPI data is static, so responses may be cached aggressively by the browser
// and by any CDN sitting in front of the app.
const ONE_DAY = 'public, max-age=86400';

router.get('/generations', async (req, res, next) => {
  try {
    const counts = await Promise.all(GENERATIONS.map((gen) => getDexIds(gen.id).then((ids) => ids.length)));

    res.set('Cache-Control', ONE_DAY).json({
      generations: GENERATIONS.map((gen, index) => ({ ...gen, count: counts[index] })),
      total: counts.reduce((sum, count) => sum + count, 0),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/types', async (req, res, next) => {
  try {
    const types = await getResources(TYPE_NAMES.map((name) => `type/${name}`));
    res.set('Cache-Control', ONE_DAY).json({ types: types.map(toTypeSummary) });
  } catch (err) {
    next(err);
  }
});

export default router;
