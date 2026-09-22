import { $, debounce, escapeHtml, titleCase, typeBadge } from '../dom.js';
import {
  activeStatCount,
  hasActiveFilters,
  isStatRangeActive,
  notify,
  resetFilters,
  setFilter,
  setStatRange,
  state,
  STAT_META,
  toggleTypeFilter,
  TOTAL_META,
} from '../state.js';

const searchInput = $('#search-input');
const genTabs = $('#gen-tabs');
const typeGrid = $('#type-grid');
const matchAllCheckbox = $('#match-all-types');
const statSliders = $('#stat-sliders');
const statActiveCount = $('#stat-active-count');
const sortSelect = $('#sort-select');
const activeFilters = $('#active-filters');
const resetButton = $('#reset-filters');
const emptyReset = $('#empty-reset');

const ALL_STATS = [...STAT_META, TOTAL_META];

let onGenerationChange = () => {};

/* ------------------------------ one-time build ----------------------------- */

export function renderGenerationTabs() {
  const options = [
    ...state.generations.map((gen) => ({ value: String(gen.id), label: gen.label, sub: `${gen.count} dex` })),
    { value: 'all', label: 'All', sub: '1025 dex' },
  ];

  genTabs.innerHTML = options
    .map(
      (option) => `
        <button type="button" class="gen-tab" data-gen="${option.value}"
                aria-pressed="${state.generation === option.value}"
                title="${escapeHtml(option.label)}">
          ${escapeHtml(option.label)}<small>${escapeHtml(option.sub)}</small>
        </button>`,
    )
    .join('');
}

export function renderTypeFilters() {
  typeGrid.innerHTML = state.types
    .map((type) => typeBadge(type.name, { as: 'button', pressed: state.filters.types.has(type.name) }))
    .join('');
}

function buildStatSliders() {
  statSliders.innerHTML = ALL_STATS.map(
    (stat) => `
      <div class="statrow" data-stat="${stat.key}">
        <div class="statrow__head">
          <span class="statrow__name">${escapeHtml(stat.label)}</span>
          <span class="statrow__value" data-role="value"></span>
        </div>
        <div class="statrow__inputs">
          <input type="range" data-bound="min" min="0" max="${stat.max}" step="5" value="0"
                 aria-label="${escapeHtml(stat.label)} minimum" />
          <input type="range" data-bound="max" min="0" max="${stat.max}" step="5" value="${stat.max}"
                 aria-label="${escapeHtml(stat.label)} maximum" />
        </div>
      </div>`,
  ).join('');
}

/* -------------------------------- rendering ------------------------------- */

function syncStatSliders() {
  for (const row of statSliders.querySelectorAll('.statrow')) {
    const key = row.dataset.stat;
    const range = state.filters.statRanges[key];
    const active = isStatRangeActive(key);

    row.querySelector('[data-bound="min"]').value = range.min;
    row.querySelector('[data-bound="max"]').value = range.max;
    row.querySelector('[data-role="value"]').textContent = `${range.min} - ${range.max}`;
    row.classList.toggle('is-active', active);
  }

  const count = activeStatCount();
  statActiveCount.hidden = count === 0;
  statActiveCount.textContent = count === 1 ? '1 active' : `${count} active`;
}

/**
 * Renders removable chips for whatever is currently narrowing the list. This is
 * the only place the user can see, at a glance, why the result count dropped.
 */
function renderActiveFilterChips() {
  const chips = [];
  const { search, types, statRanges } = state.filters;

  if (search.trim()) {
    chips.push({ kind: 'search', label: `Search: "${search.trim()}"` });
  }

  for (const type of types) {
    chips.push({ kind: 'type', value: type, label: titleCase(type) });
  }

  for (const stat of ALL_STATS) {
    if (!isStatRangeActive(stat.key)) continue;
    const range = statRanges[stat.key];
    chips.push({ kind: 'stat', value: stat.key, label: `${stat.label} ${range.min}-${range.max}` });
  }

  activeFilters.hidden = chips.length === 0;
  activeFilters.innerHTML = chips
    .map(
      (chip) => `
        <button type="button" class="chip" data-kind="${chip.kind}" data-value="${escapeHtml(chip.value ?? '')}">
          ${escapeHtml(chip.label)} <span class="chip__x" aria-hidden="true">&times;</span>
          <span class="sr-only">Remove filter</span>
        </button>`,
    )
    .join('');
}

export function renderFilters() {
  // The search box is skipped deliberately: rewriting its value mid-render would
  // fight the user's cursor while they type.
  for (const tab of genTabs.querySelectorAll('.gen-tab')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.gen === state.generation));
  }

  for (const badge of typeGrid.querySelectorAll('[data-type-filter]')) {
    badge.setAttribute('aria-pressed', String(state.filters.types.has(badge.dataset.typeFilter)));
  }

  matchAllCheckbox.checked = state.filters.matchAllTypes;
  matchAllCheckbox.disabled = state.filters.types.size < 2;
  sortSelect.value = state.sort;

  syncStatSliders();
  renderActiveFilterChips();
  resetButton.disabled = !hasActiveFilters() && state.sort === 'id-asc';
}

/* --------------------------------- wiring --------------------------------- */

function clearSearchBox() {
  searchInput.value = '';
}

export function initFilters({ onGenerationChange: generationHandler }) {
  onGenerationChange = generationHandler;
  buildStatSliders();

  // Debounced so a fast typist triggers one re-render per pause, not per keystroke.
  searchInput.addEventListener(
    'input',
    debounce((event) => setFilter({ search: event.target.value }), 150),
  );

  genTabs.addEventListener('click', (event) => {
    const generation = event.target.closest('.gen-tab')?.dataset.gen;
    if (generation && generation !== state.generation) onGenerationChange(generation);
  });

  typeGrid.addEventListener('click', (event) => {
    const type = event.target.closest('[data-type-filter]')?.dataset.typeFilter;
    if (type) toggleTypeFilter(type);
  });

  matchAllCheckbox.addEventListener('change', (event) => setFilter({ matchAllTypes: event.target.checked }));

  statSliders.addEventListener('input', (event) => {
    const input = event.target;
    if (input.type !== 'range') return;

    const key = input.closest('.statrow')?.dataset.stat;
    if (key) setStatRange(key, input.dataset.bound, Number(input.value));
  });

  sortSelect.addEventListener('change', (event) => {
    state.sort = event.target.value;
    notify();
  });

  activeFilters.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    const { kind, value } = chip.dataset;

    if (kind === 'search') {
      clearSearchBox();
      setFilter({ search: '' });
    } else if (kind === 'type') {
      toggleTypeFilter(value);
    } else if (kind === 'stat') {
      const stat = ALL_STATS.find((entry) => entry.key === value);
      setStatRange(value, 'min', 0);
      setStatRange(value, 'max', stat?.max ?? 255);
    }
  });

  for (const button of [resetButton, emptyReset]) {
    button.addEventListener('click', () => {
      clearSearchBox();
      resetFilters();
    });
  }
}
