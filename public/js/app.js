import { api } from './api.js';
import { $ } from './dom.js';
import { notify, state, subscribe, toggleTeamMember } from './state.js';
import { initDetail, openDetail, refreshDetail } from './ui/detail.js';
import { initFilters, renderFilters, renderGenerationTabs, renderTypeFilters } from './ui/filters.js';
import { initGrid, renderGrid } from './ui/grid.js';
import { initQuiz } from './ui/quiz.js';
import { initTeam, renderTeam } from './ui/team.js';

/** Pokemon fetched per request. Small enough that each page returns quickly. */
const PAGE_SIZE = 100;

const errorBanner = $('#error-banner');
const loadbar = $('#loadbar');
const loadbarFill = $('#loadbar-fill');
const loadbarText = $('#loadbar-text');
const shinyToggle = $('#global-shiny');

/* ------------------------------- data loading ------------------------------ */

/**
 * Incremented on every load. An in-flight loop compares its own token against this
 * and bails out if the user has since switched generations, which stops a slow
 * earlier request from appending Pokemon to the wrong list.
 */
let loadToken = 0;

async function loadGeneration(generation) {
  const token = ++loadToken;

  state.generation = generation;
  state.pokemon = [];
  state.error = null;
  state.loading = { active: true, loaded: 0, total: 0 };
  notify();

  let offset = 0;

  try {
    // Walk pages until the server says there are no more. Each completed page is
    // pushed into state immediately so cards appear as they arrive.
    for (;;) {
      const page = await api.pokemonPage({ gen: generation, offset, limit: PAGE_SIZE });
      if (token !== loadToken) return;

      state.pokemon = state.pokemon.concat(page.items);
      state.loading = { active: true, loaded: state.pokemon.length, total: page.total };
      notify();

      if (!page.hasMore) break;
      offset += page.limit;
    }
  } catch (error) {
    if (token !== loadToken) return;
    state.error = error.message;
  } finally {
    if (token === loadToken) {
      state.loading = { active: false, loaded: state.pokemon.length, total: state.pokemon.length };
      notify();
    }
  }
}

/* -------------------------------- rendering ------------------------------- */

function renderChrome() {
  const { active, loaded, total } = state.loading;

  loadbar.hidden = !active;
  if (active) {
    const percent = total ? Math.round((loaded / total) * 100) : 0;
    loadbarFill.style.width = `${percent}%`;
    loadbarText.textContent = `Fetching from PokeAPI - ${loaded}/${total} (${percent}%)`;
  }

  errorBanner.hidden = !state.error;
  if (state.error) errorBanner.textContent = state.error;

  shinyToggle.checked = state.shiny;
}

function render() {
  renderChrome();
  renderFilters();
  renderGrid();
  renderTeam();
  refreshDetail();
}

/* --------------------------------- actions -------------------------------- */

function handleToggleTeam(pokemon) {
  const result = toggleTeamMember(pokemon);

  if (result === 'full') {
    state.error = 'Your team already has 6 Pokemon. Release one before catching another.';
    notify();
    // Clear the notice on its own so it reads as a transient warning.
    setTimeout(() => {
      if (state.error?.startsWith('Your team already has')) {
        state.error = null;
        notify();
      }
    }, 3500);
  }
}

function releaseFromTeam(id) {
  const member = state.team.find((entry) => entry.id === id);
  if (member) toggleTeamMember(member);
}

/* ------------------------------- bootstrap -------------------------------- */

async function init() {
  subscribe(render);

  initGrid({ onSelect: openDetail, onToggleTeam: handleToggleTeam });
  initFilters({ onGenerationChange: loadGeneration });
  initDetail({ onToggleTeam: handleToggleTeam });
  initTeam({ onSelect: openDetail, onRelease: releaseFromTeam });
  initQuiz();

  shinyToggle.addEventListener('change', (event) => {
    state.shiny = event.target.checked;
    notify();
  });

  try {
    // Generations and types are small, cached, and needed before anything renders.
    const [generations, types] = await Promise.all([api.generations(), api.types()]);

    state.generations = generations.generations;
    state.types = types.types;
    state.typeIndex = new Map(types.types.map((type) => [type.name, type]));

    renderGenerationTabs();
    renderTypeFilters();
  } catch (error) {
    state.error = `Could not load reference data: ${error.message}`;
    notify();
    return;
  }

  await loadGeneration(state.generation);
}

init();
