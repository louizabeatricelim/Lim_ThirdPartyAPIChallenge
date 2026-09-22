// Single source of truth for the UI. Modules read from `state`, mutate it through
// the exported helpers, and re-render in response to `subscribe` notifications.

export const STAT_META = [
  { key: 'hp', label: 'HP', max: 255 },
  { key: 'attack', label: 'Attack', max: 255 },
  { key: 'defense', label: 'Defense', max: 255 },
  { key: 'special-attack', label: 'Sp. Atk', max: 255 },
  { key: 'special-defense', label: 'Sp. Def', max: 255 },
  { key: 'speed', label: 'Speed', max: 255 },
];

export const TOTAL_META = { key: 'statTotal', label: 'Stat total', max: 800 };

export const TEAM_LIMIT = 6;

const TEAM_STORAGE_KEY = 'pokedex.team.v1';
const BEST_SCORE_KEY = 'pokedex.quiz.best.v1';

function emptyStatRange() {
  const range = {};
  for (const stat of STAT_META) range[stat.key] = { min: 0, max: stat.max };
  range[TOTAL_META.key] = { min: 0, max: TOTAL_META.max };
  return range;
}

export function defaultFilters() {
  return {
    search: '',
    types: new Set(),
    matchAllTypes: false,
    statRanges: emptyStatRange(),
  };
}

export const state = {
  generations: [],
  types: [],
  /** type name -> type summary, for the team coverage maths. */
  typeIndex: new Map(),

  generation: '1',
  pokemon: [],
  /** Tracks chunked loading so the progress bar and result count stay honest. */
  loading: { active: false, loaded: 0, total: 0 },

  filters: defaultFilters(),
  sort: 'id-asc',
  shiny: false,

  team: loadTeam(),
  quizBest: loadBestScore(),

  error: null,
};

/* ------------------------------ subscriptions ----------------------------- */

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  for (const listener of listeners) listener(state);
}

/* --------------------------------- filters -------------------------------- */

export function setFilter(patch) {
  Object.assign(state.filters, patch);
  notify();
}

export function toggleTypeFilter(typeName) {
  const { types } = state.filters;
  if (types.has(typeName)) types.delete(typeName);
  else types.add(typeName);
  notify();
}

export function setStatRange(statKey, bound, value) {
  const range = state.filters.statRanges[statKey];
  if (!range) return;

  range[bound] = value;
  // Keep the pair ordered so dragging one handle past the other can't produce an
  // impossible window that silently matches nothing.
  if (bound === 'min' && range.min > range.max) range.max = range.min;
  if (bound === 'max' && range.max < range.min) range.min = range.max;

  notify();
}

export function resetFilters() {
  state.filters = defaultFilters();
  state.sort = 'id-asc';
  notify();
}

/** True when a stat window is narrower than its full range. */
export function isStatRangeActive(statKey) {
  const range = state.filters.statRanges[statKey];
  const max = statKey === TOTAL_META.key ? TOTAL_META.max : STAT_META.find((s) => s.key === statKey)?.max ?? 255;
  return Boolean(range) && (range.min > 0 || range.max < max);
}

export function activeStatCount() {
  return [...STAT_META.map((s) => s.key), TOTAL_META.key].filter(isStatRangeActive).length;
}

export function hasActiveFilters() {
  const { search, types } = state.filters;
  return Boolean(search.trim()) || types.size > 0 || activeStatCount() > 0;
}

/* -------------------------------- selectors ------------------------------- */

/**
 * Matches the search box against a Pokemon. Accepts a name fragment, a bare
 * Pokedex number, or a padded/hashed number such as "#025".
 */
function matchesSearch(pokemon, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  if (pokemon.name.includes(query)) return true;

  const numeric = query.replace(/^#/, '');
  if (/^\d+$/.test(numeric)) {
    const asNumber = Number.parseInt(numeric, 10);
    // Exact match on the padded form lets "025" find Pikachu, while a prefix match
    // makes "12" usefully surface 12, 120, 121 and friends.
    return pokemon.id === asNumber || String(pokemon.id).padStart(3, '0').startsWith(numeric.padStart(1, '0'));
  }

  return false;
}

function matchesTypes(pokemon, types, matchAll) {
  if (types.size === 0) return true;
  const selected = [...types];
  return matchAll
    ? selected.every((type) => pokemon.types.includes(type))
    : selected.some((type) => pokemon.types.includes(type));
}

function matchesStats(pokemon, statRanges) {
  for (const stat of STAT_META) {
    const range = statRanges[stat.key];
    const value = pokemon.stats?.[stat.key] ?? 0;
    if (value < range.min || value > range.max) return false;
  }

  const total = statRanges[TOTAL_META.key];
  return pokemon.statTotal >= total.min && pokemon.statTotal <= total.max;
}

const SORTERS = {
  'id-asc': (a, b) => a.id - b.id,
  'id-desc': (a, b) => b.id - a.id,
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
  'total-desc': (a, b) => b.statTotal - a.statTotal || a.id - b.id,
  'total-asc': (a, b) => a.statTotal - b.statTotal || a.id - b.id,
};

function sorterFor(key) {
  if (SORTERS[key]) return SORTERS[key];

  // Any remaining option is "<statKey>-desc", e.g. "special-attack-desc".
  const statKey = key.replace(/-desc$/, '');
  return (a, b) => (b.stats?.[statKey] ?? 0) - (a.stats?.[statKey] ?? 0) || a.id - b.id;
}

/** The filtered, sorted list the grid renders. */
export function visiblePokemon() {
  const { search, types, matchAllTypes, statRanges } = state.filters;

  return state.pokemon
    .filter(
      (pokemon) =>
        matchesSearch(pokemon, search) &&
        matchesTypes(pokemon, types, matchAllTypes) &&
        matchesStats(pokemon, statRanges),
    )
    .sort(sorterFor(state.sort));
}

export function findLoaded(id) {
  return state.pokemon.find((pokemon) => pokemon.id === Number(id)) ?? null;
}

/* ---------------------------------- team ---------------------------------- */

function loadTeam() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, TEAM_LIMIT) : [];
  } catch {
    return [];
  }
}

function persistTeam() {
  try {
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(state.team));
  } catch {
    // Private browsing or a full quota: the team just won't survive a reload.
  }
}

export function isOnTeam(id) {
  return state.team.some((member) => member.id === Number(id));
}

/**
 * Adds or removes a Pokemon from the team. Returns a short status the caller can
 * surface, since a silent no-op on a full team would be confusing.
 */
export function toggleTeamMember(pokemon) {
  if (isOnTeam(pokemon.id)) {
    state.team = state.team.filter((member) => member.id !== pokemon.id);
    persistTeam();
    notify();
    return 'removed';
  }

  if (state.team.length >= TEAM_LIMIT) return 'full';

  // Store only what the team panel needs, so a stored team stays valid even if the
  // list payload changes shape later.
  state.team = [
    ...state.team,
    {
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      types: pokemon.types,
      sprite: pokemon.sprite,
      spriteShiny: pokemon.spriteShiny,
    },
  ];
  persistTeam();
  notify();
  return 'added';
}

export function clearTeam() {
  state.team = [];
  persistTeam();
  notify();
}

/* -------------------------------- quiz score ------------------------------ */

function loadBestScore() {
  const parsed = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) ?? '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function recordQuizScore(score) {
  if (score <= state.quizBest) return;

  state.quizBest = score;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Non-fatal: the best score simply won't persist.
  }
}
