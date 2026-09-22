import { STAT_KEYS } from './config.js';
import { idFromUrl } from './pokeapi.js';

/** Turns "special-attack" into "Sp. Atk", "mr-mime" into "Mr. Mime". */
export function prettyName(name) {
  return String(name)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function spriteSet(pokemon) {
  const sprites = pokemon.sprites ?? {};
  const official = sprites.other?.['official-artwork'] ?? {};
  const home = sprites.other?.home ?? {};

  return {
    sprite: sprites.front_default ?? home.front_default ?? official.front_default ?? null,
    spriteShiny: sprites.front_shiny ?? home.front_shiny ?? official.front_shiny ?? null,
    artwork: official.front_default ?? home.front_default ?? sprites.front_default ?? null,
    artworkShiny: official.front_shiny ?? home.front_shiny ?? sprites.front_shiny ?? null,
  };
}

/**
 * Trims a full /pokemon response down to the fields the grid actually renders.
 * A raw response is ~150 KB of JSON; this keeps roughly 0.5 KB of it, which is
 * what makes loading 60 Pokemon in one request practical.
 */
export function toListItem(pokemon) {
  const stats = {};
  for (const entry of pokemon.stats ?? []) {
    stats[entry.stat.name] = entry.base_stat;
  }

  const statTotal = STAT_KEYS.reduce((sum, key) => sum + (stats[key] ?? 0), 0);

  return {
    id: pokemon.id,
    name: pokemon.name,
    displayName: prettyName(pokemon.name),
    types: (pokemon.types ?? [])
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name),
    stats,
    statTotal,
    height: pokemon.height ?? null,
    weight: pokemon.weight ?? null,
    cry: pokemon.cries?.latest ?? pokemon.cries?.legacy ?? null,
    ...spriteSet(pokemon),
  };
}

function pickEnglish(entries, field) {
  const match = (entries ?? []).find((entry) => entry.language?.name === 'en');
  return match ? String(match[field]).replace(/[\f\n\r\u000c]+/g, ' ').trim() : null;
}

/** Adds species flavour text and ability info on top of the list payload. */
export function toDetail(pokemon, species) {
  return {
    ...toListItem(pokemon),
    baseExperience: pokemon.base_experience ?? null,
    abilities: (pokemon.abilities ?? [])
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => ({
        name: entry.ability.name,
        displayName: prettyName(entry.ability.name),
        isHidden: Boolean(entry.is_hidden),
      })),
    species: species
      ? {
          genus: pickEnglish(species.genera, 'genus'),
          flavorText: pickEnglish(species.flavor_text_entries, 'flavor_text'),
          habitat: species.habitat?.name ?? null,
          color: species.color?.name ?? null,
          shape: species.shape?.name ?? null,
          isLegendary: Boolean(species.is_legendary),
          isMythical: Boolean(species.is_mythical),
          captureRate: species.capture_rate ?? null,
          generation: species.generation?.name ?? null,
          generationId: idFromUrl(species.generation?.url ?? ''),
          evolutionChainId: idFromUrl(species.evolution_chain?.url ?? ''),
        }
      : null,
  };
}

/** Keeps only the defensive relations the client needs for team weakness math. */
export function toTypeSummary(type) {
  const relations = type.damage_relations ?? {};
  const names = (list) => (list ?? []).map((entry) => entry.name);

  return {
    name: type.name,
    displayName: prettyName(type.name),
    doubleDamageFrom: names(relations.double_damage_from),
    halfDamageFrom: names(relations.half_damage_from),
    noDamageFrom: names(relations.no_damage_from),
    doubleDamageTo: names(relations.double_damage_to),
    halfDamageTo: names(relations.half_damage_to),
    noDamageTo: names(relations.no_damage_to),
  };
}
