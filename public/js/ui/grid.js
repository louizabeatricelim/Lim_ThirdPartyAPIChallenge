import { $, escapeHtml, formatDexNo, playCry, typeBadge, typeColor } from '../dom.js';
import { isOnTeam, state, visiblePokemon } from '../state.js';

const grid = $('#grid');
const emptyState = $('#empty-state');
const resultCount = $('#result-count');

let onSelect = () => {};
let onToggleTeam = () => {};

function cardMarkup(pokemon) {
  const caught = isOnTeam(pokemon.id);
  const sprite = (state.shiny ? pokemon.spriteShiny : pokemon.sprite) ?? pokemon.sprite ?? pokemon.artwork;
  const name = escapeHtml(pokemon.displayName);

  return `
    <article class="card${caught ? ' is-caught' : ''}" data-id="${pokemon.id}" tabindex="0" role="button"
             aria-label="${name}, view details" style="--card-accent:${typeColor(pokemon.types[0])}">
      <span class="card__dexno">${formatDexNo(pokemon.id)}</span>
      <div class="card__actions">
        <button type="button" class="iconbtn${caught ? ' is-on' : ''}" data-action="catch"
                aria-pressed="${caught}" title="${caught ? 'Release from team' : 'Catch - add to team'}">
          ${caught ? '&#10003;' : '+'}
        </button>
        <button type="button" class="iconbtn" data-action="cry" title="Play cry"
                ${pokemon.cry ? '' : 'disabled'}>&#9834;</button>
      </div>
      <img class="card__sprite" src="${escapeHtml(sprite ?? '')}" alt="${name}" width="104" height="104"
           loading="lazy" decoding="async" />
      <h3 class="card__name">${name}</h3>
      <div class="card__types">${pokemon.types.map((type) => typeBadge(type)).join('')}</div>
      <p class="card__total">Total ${pokemon.statTotal}</p>
    </article>`;
}

function skeletonMarkup(count) {
  return '<article class="card card--skeleton" aria-hidden="true"></article>'.repeat(count);
}

function countText(visible) {
  const { active, loaded, total } = state.loading;
  const loadedTotal = state.pokemon.length;

  if (active) return `Loading <strong>${loaded}</strong> of <strong>${total}</strong> Pokemon&hellip;`;
  if (!loadedTotal) return 'No Pokemon loaded.';

  return visible === loadedTotal
    ? `Showing all <strong>${loadedTotal}</strong> Pokemon`
    : `Showing <strong>${visible}</strong> of <strong>${loadedTotal}</strong> Pokemon`;
}

export function renderGrid() {
  const visible = visiblePokemon();

  // While a generation streams in, tail the real cards with placeholders so the
  // layout doesn't jump on every completed page.
  const pending = state.loading.active ? Math.min(state.loading.total - state.loading.loaded, 24) : 0;

  grid.innerHTML = visible.map(cardMarkup).join('') + skeletonMarkup(pending);

  resultCount.innerHTML = countText(visible.length);
  emptyState.hidden = visible.length > 0 || state.loading.active;
}

/** Resolves the Pokemon a click landed on, ignoring clicks outside any card. */
function pokemonFromEvent(event) {
  const card = event.target.closest('.card');
  if (!card || card.classList.contains('card--skeleton')) return null;
  return state.pokemon.find((pokemon) => pokemon.id === Number(card.dataset.id)) ?? null;
}

export function initGrid({ onSelect: selectHandler, onToggleTeam: teamHandler }) {
  onSelect = selectHandler;
  onToggleTeam = teamHandler;

  // One delegated listener for the whole grid, so re-rendering never needs to
  // rebind anything.
  grid.addEventListener('click', (event) => {
    const pokemon = pokemonFromEvent(event);
    if (!pokemon) return;

    const action = event.target.closest('[data-action]')?.dataset.action;

    if (action === 'catch') {
      onToggleTeam(pokemon);
      return;
    }

    if (action === 'cry') {
      playCry(pokemon.cry);
      return;
    }

    onSelect(pokemon.id);
  });

  grid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!event.target.classList?.contains('card')) return;

    event.preventDefault();
    const pokemon = pokemonFromEvent(event);
    if (pokemon) onSelect(pokemon.id);
  });
}
