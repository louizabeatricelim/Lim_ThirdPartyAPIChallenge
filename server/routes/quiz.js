import { Router } from 'express';

import { getDexIds } from '../dex.js';
import { getResource, PokeApiError } from '../pokeapi.js';
import { prettyName } from '../transform.js';

const router = Router();

/** Strips punctuation, accents, and spacing so "Mr. Mime" matches "mr-mime". */
function normaliseGuess(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Builds the set of spellings counted as correct. Beyond the canonical name this
 * covers gendered forms ("nidoran-f" answered as "nidoran") and the base word of
 * hyphenated names ("deoxys-normal" answered as "deoxys").
 */
function acceptedAnswers(pokemon, species) {
  const candidates = new Set([pokemon.name, species?.name].filter(Boolean));

  for (const name of [...candidates]) {
    if (name.includes('-')) candidates.add(name.split('-')[0]);
  }

  const englishName = (species?.names ?? []).find((entry) => entry.language?.name === 'en')?.name;
  if (englishName) candidates.add(englishName);

  return new Set([...candidates].map(normaliseGuess).filter(Boolean));
}

/**
 * GET /api/quiz?gen=all&exclude=25,133
 *
 * Returns a random Pokemon's artwork without its name, for the silhouette game.
 * The `exclude` list lets the client avoid immediately repeating recent rounds.
 */
router.get('/quiz', async (req, res, next) => {
  try {
    const dexIds = await getDexIds(req.query.gen ?? 'all');

    const excluded = new Set(
      String(req.query.exclude ?? '')
        .split(',')
        .map((value) => Number.parseInt(value, 10))
        .filter(Number.isInteger),
    );

    // Fall back to the full pool once nearly everything has been seen, so the game
    // can never run out of rounds.
    const pool = dexIds.filter((id) => !excluded.has(id));
    const candidates = pool.length ? pool : dexIds;
    const id = candidates[Math.floor(Math.random() * candidates.length)];

    const pokemon = await getResource(`pokemon/${id}`);
    const artwork =
      pokemon.sprites?.other?.['official-artwork']?.front_default ??
      pokemon.sprites?.other?.home?.front_default ??
      pokemon.sprites?.front_default;

    // Deliberately omits the name: the answer is only ever revealed by /check.
    res.set('Cache-Control', 'no-store').json({
      id: pokemon.id,
      artwork,
      cry: pokemon.cries?.latest ?? null,
      letterCount: pokemon.name.replace(/[^a-z0-9]/gi, '').length,
      firstLetter: pokemon.name.charAt(0).toUpperCase(),
      types: (pokemon.types ?? []).sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/quiz/:id/check?guess=pikachu
 *
 * Grades a guess server-side so the answer never sits in the page source, and
 * reveals the correct name once the round is over either way.
 */
router.get('/quiz/:id/check', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      throw new PokeApiError('A numeric Pokemon id is required.', 400, 'quiz');
    }

    const guess = normaliseGuess(req.query.guess);
    if (!guess) throw new PokeApiError('A guess is required.', 400, 'quiz');

    const pokemon = await getResource(`pokemon/${id}`);
    const species = await getResource(pokemon.species.url).catch(() => null);

    res.set('Cache-Control', 'no-store').json({
      correct: acceptedAnswers(pokemon, species).has(guess),
      name: pokemon.name,
      displayName: prettyName(pokemon.name),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
