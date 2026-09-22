import { Router } from 'express';

import { getResource, getResources, idFromUrl, PokeApiError } from '../pokeapi.js';
import { prettyName } from '../transform.js';

const router = Router();

const ONE_DAY = 'public, max-age=86400';

const GENDERS = { 1: 'female', 2: 'male' };
const PHYSICAL_STATS = { 1: 'Attack > Defense', 0: 'Attack = Defense', '-1': 'Attack < Defense' };

/**
 * Turns one evolution_details entry into a short human-readable requirement such as
 * "Lv. 16", "Thunder Stone", or "Trade holding Metal Coat". PokeAPI exposes ~15
 * independent condition fields and any combination of them may be set, so each is
 * appended as its own clause.
 */
function describeEvolution(details) {
  if (!details) return null;

  const trigger = details.trigger?.name ?? null;
  const clauses = [];

  if (details.min_level) clauses.push(`Lv. ${details.min_level}`);
  if (details.item) clauses.push(prettyName(details.item.name));
  if (details.held_item) clauses.push(`holding ${prettyName(details.held_item.name)}`);
  if (details.known_move) clauses.push(`knows ${prettyName(details.known_move.name)}`);
  if (details.known_move_type) clauses.push(`knows a ${prettyName(details.known_move_type.name)} move`);
  if (details.min_happiness) clauses.push(`${details.min_happiness}+ happiness`);
  if (details.min_affection) clauses.push(`${details.min_affection}+ affection`);
  if (details.min_beauty) clauses.push(`${details.min_beauty}+ beauty`);
  if (details.time_of_day) clauses.push(`at ${details.time_of_day}`);
  if (details.location) clauses.push(`at ${prettyName(details.location.name)}`);
  if (details.needs_overworld_rain) clauses.push('while raining');
  if (details.party_species) clauses.push(`with ${prettyName(details.party_species.name)} in party`);
  if (details.party_type) clauses.push(`with a ${prettyName(details.party_type.name)} type in party`);
  if (details.trade_species) clauses.push(`traded for ${prettyName(details.trade_species.name)}`);
  if (details.turn_upside_down) clauses.push('holding console upside down');
  if (details.gender != null) clauses.push(GENDERS[details.gender] ?? `gender ${details.gender}`);
  if (details.relative_physical_stats != null) {
    clauses.push(PHYSICAL_STATS[String(details.relative_physical_stats)] ?? '');
  }

  // "Level Up" and "Use Item" are already implied by a level or item clause, so
  // naming them as well would produce labels like "Use Item - Water Stone".
  const redundant = trigger === 'level-up' || trigger === 'use-item';
  const named = trigger && !(redundant && clauses.length) ? prettyName(trigger) : null;
  const text = [named, ...clauses].filter(Boolean).join(', ');

  return { trigger, text: text || null };
}

/** Depth-first walk of the raw chain, collecting nodes plus the species ids to enrich. */
function collectNodes(chainLink, speciesIds, depth = 0) {
  const speciesId = idFromUrl(chainLink.species?.url ?? '');
  if (speciesId) speciesIds.add(speciesId);

  return {
    speciesId,
    name: chainLink.species?.name ?? null,
    displayName: chainLink.species?.name ? prettyName(chainLink.species.name) : null,
    depth,
    // A species can branch (Eevee) and each branch can list several alternative
    // requirements, so keep the first as the headline and expose the rest.
    evolution: describeEvolution(chainLink.evolution_details?.[0]),
    alternatives: (chainLink.evolution_details ?? []).slice(1).map(describeEvolution).filter(Boolean),
    children: (chainLink.evolves_to ?? []).map((child) => collectNodes(child, speciesIds, depth + 1)),
  };
}

/** Walks the tree again to attach sprite and type data fetched in one batch. */
function attachSprites(node, byId) {
  const extra = node.speciesId ? byId.get(node.speciesId) : null;

  return {
    ...node,
    id: extra?.id ?? node.speciesId,
    sprite: extra?.sprite ?? null,
    spriteShiny: extra?.spriteShiny ?? null,
    types: extra?.types ?? [],
    children: node.children.map((child) => attachSprites(child, byId)),
  };
}

/**
 * GET /api/evolution/:idOrName
 *
 * Resolves a Pokemon to its species, follows the species' evolution_chain link, and
 * returns the chain as a nested tree the frontend can render as a flow chart.
 */
router.get('/evolution/:idOrName', async (req, res, next) => {
  try {
    const key = String(req.params.idOrName).trim().toLowerCase();
    if (!key) throw new PokeApiError('A Pokemon id or name is required.', 400, 'evolution');

    let species;
    try {
      species = await getResource(`pokemon-species/${encodeURIComponent(key)}`);
    } catch {
      // Alternate forms have no species of their own, so fall back to resolving the
      // Pokemon first and using the species link it reports.
      const pokemon = await getResource(`pokemon/${encodeURIComponent(key)}`);
      species = await getResource(pokemon.species.url);
    }

    const chainUrl = species.evolution_chain?.url;
    if (!chainUrl) {
      return res.set('Cache-Control', ONE_DAY).json({ chainId: null, root: null });
    }

    const chain = await getResource(chainUrl);
    const speciesIds = new Set();
    const root = collectNodes(chain.chain, speciesIds);

    const ids = [...speciesIds];
    const pokemonRecords = await getResources(ids.map((id) => `pokemon/${id}`));

    const byId = new Map();
    ids.forEach((speciesId, index) => {
      const record = pokemonRecords[index];
      byId.set(speciesId, {
        id: record.id,
        sprite: record.sprites?.front_default ?? null,
        spriteShiny: record.sprites?.front_shiny ?? null,
        types: (record.types ?? []).sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
      });
    });

    res.set('Cache-Control', ONE_DAY).json({
      chainId: chain.id,
      babyTriggerItem: chain.baby_trigger_item?.name ?? null,
      root: attachSprites(root, byId),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
