import { api } from '../api.js';
import {
  $,
  escapeHtml,
  formatDexNo,
  formatHeight,
  formatWeight,
  playCry,
  titleCase,
  typeBadge,
} from '../dom.js';
import { isOnTeam, state } from '../state.js';
import { destroyStatChart, renderStatChart } from './chart.js';

const modal = $('#detail-modal');
const loading = $('#detail-loading');
const body = $('#detail-body');

const image = $('#detail-image');
const shinyButton = $('#detail-shiny');
const cryButton = $('#detail-cry');
const cryNote = $('#detail-crynote');
const dexNo = $('#detail-dexno');
const nameEl = $('#detail-name');
const genus = $('#detail-genus');
const typesEl = $('#detail-types');
const flavor = $('#detail-flavor');
const facts = $('#detail-facts');
const catchButton = $('#detail-catch');
const chartCanvas = $('#detail-chart');
const chartButtons = [...modal.querySelectorAll('[data-chart]')];
const evolutionEl = $('#detail-evolution');

/** The Pokemon currently on screen, plus this modal's own view options. */
let current = null;
let showShiny = false;
let chartMode = 'radar';
/** Guards against a slow request for an earlier Pokemon overwriting a newer one. */
let requestToken = 0;

let onToggleTeam = () => {};

/* -------------------------------- rendering ------------------------------- */

function renderArtwork() {
  const source = showShiny ? current.artworkShiny ?? current.artwork : current.artwork;
  image.src = source ?? '';
  image.alt = `${current.displayName}${showShiny ? ' (shiny)' : ''}`;
  shinyButton.setAttribute('aria-pressed', String(showShiny));
  shinyButton.disabled = !current.artworkShiny;
  shinyButton.title = current.artworkShiny ? 'Toggle shiny form' : 'No shiny artwork available';
}

function renderFacts() {
  const species = current.species ?? {};
  const rarity = species.isMythical ? 'Mythical' : species.isLegendary ? 'Legendary' : null;

  const entries = [
    ['Height', formatHeight(current.height)],
    ['Weight', formatWeight(current.weight)],
    ['Stat total', current.statTotal],
    ['Base exp', current.baseExperience ?? '?'],
    ['Abilities', current.abilities.map((a) => `${a.displayName}${a.isHidden ? ' (hidden)' : ''}`).join(', ') || '?'],
    ['Generation', species.generationId ? `Gen ${species.generationId}` : '?'],
    ['Habitat', species.habitat ? titleCase(species.habitat) : 'Unknown'],
    ['Catch rate', species.captureRate ?? '?'],
    ...(rarity ? [['Rarity', rarity]] : []),
  ];

  facts.innerHTML = entries
    .map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
}

function renderCatchButton() {
  const caught = isOnTeam(current.id);
  const full = state.team.length >= 6 && !caught;

  catchButton.textContent = caught ? 'Release from team' : full ? 'Team is full (6/6)' : 'Catch';
  catchButton.disabled = full;
  catchButton.classList.toggle('btn--primary', !caught);
  catchButton.classList.toggle('btn--ghost', caught);
}

function renderChart() {
  for (const button of chartButtons) {
    button.classList.toggle('is-active', button.dataset.chart === chartMode);
  }
  renderStatChart(chartCanvas, current, chartMode);
}

/* ------------------------------ evolution tree ----------------------------- */

function evolutionNode(node) {
  const isCurrent = node.id === current?.id;
  const sprite = (showShiny ? node.spriteShiny : node.sprite) ?? node.sprite;

  return `
    <button type="button" class="evo__node${isCurrent ? ' is-current' : ''}" data-evo-id="${node.id ?? ''}"
            ${isCurrent ? 'aria-current="true"' : ''} title="View ${escapeHtml(node.displayName ?? '')}">
      <img src="${escapeHtml(sprite ?? '')}" alt="" width="60" height="60" loading="lazy"
           data-sprite="${escapeHtml(node.sprite ?? '')}" data-sprite-shiny="${escapeHtml(node.spriteShiny ?? '')}" />
      <span class="evo__nodename">${escapeHtml(node.displayName ?? '?')}</span>
      <span class="evo__nodedex">${node.id ? formatDexNo(node.id) : ''}</span>
    </button>`;
}

function evolutionArrow(node) {
  const alternatives = node.alternatives?.length
    ? `<span class="evo__alt">or ${escapeHtml(node.alternatives.map((alt) => alt.text).filter(Boolean).join(' / '))}</span>`
    : '';

  return `
    <div class="evo__arrow">
      <span class="evo__arrowline" aria-hidden="true">&#9654;</span>
      <span class="evo__cond">${escapeHtml(node.evolution?.text ?? 'Evolves')}</span>
      ${alternatives}
    </div>`;
}

/**
 * Lays the chain out left to right. A single evolution continues the same row,
 * while a branching species (Eevee, Wurmple) starts one stacked row per branch.
 */
function evolutionBranch(node) {
  if (!node.children?.length) return evolutionNode(node);

  if (node.children.length === 1) {
    const child = node.children[0];
    return evolutionNode(node) + evolutionArrow(child) + evolutionBranch(child);
  }

  const branches = node.children
    .map((child) => `<div class="evo__row">${evolutionArrow(child)}${evolutionBranch(child)}</div>`)
    .join('');

  return `${evolutionNode(node)}<div class="evo__branches">${branches}</div>`;
}

function renderEvolution(chain) {
  const root = chain?.root;

  if (!root) {
    evolutionEl.innerHTML = '<p class="evo__single">Evolution data is unavailable for this Pokemon.</p>';
    return;
  }

  if (!root.children?.length) {
    evolutionEl.innerHTML = `
      <div class="evo__row">${evolutionNode(root)}</div>
      <p class="evo__single">${escapeHtml(root.displayName ?? 'This Pokemon')} does not evolve.</p>`;
    return;
  }

  evolutionEl.innerHTML = `<div class="evo__row">${evolutionBranch(root)}</div>`;
}

/* --------------------------------- opening -------------------------------- */

export async function openDetail(idOrName) {
  const token = ++requestToken;

  if (!modal.open) modal.showModal();
  body.hidden = true;
  loading.hidden = false;
  loading.textContent = 'Loading\u2026';

  // New Pokemon, so start from the global shiny preference and the radar view.
  showShiny = state.shiny;
  chartMode = 'radar';
  cryNote.hidden = true;

  try {
    // The chain request is independent of the detail request, so they run together.
    const [detail, chain] = await Promise.all([
      api.pokemon(idOrName),
      api.evolution(idOrName).catch(() => null),
    ]);

    if (token !== requestToken) return;

    current = detail.pokemon;

    dexNo.textContent = formatDexNo(current.id);
    nameEl.textContent = current.displayName;
    genus.textContent = current.species?.genus ?? '';
    typesEl.innerHTML = current.types.map((type) => typeBadge(type)).join('');
    flavor.textContent = current.species?.flavorText ?? '';
    flavor.hidden = !current.species?.flavorText;
    cryButton.disabled = !current.cry;

    renderArtwork();
    renderFacts();
    renderCatchButton();
    renderEvolution(chain);

    loading.hidden = true;
    body.hidden = false;

    // Chart.js needs the canvas laid out before it can size itself, so draw after
    // the modal body becomes visible.
    renderChart();
  } catch (error) {
    if (token !== requestToken) return;
    loading.textContent = error.message;
  }
}

/** Keeps the open modal in sync when the team changes from elsewhere. */
export function refreshDetail() {
  if (modal.open && current) renderCatchButton();
}

export function initDetail({ onToggleTeam: teamHandler }) {
  onToggleTeam = teamHandler;

  const close = () => modal.close();
  $('#detail-close').addEventListener('click', close);

  // Clicking the backdrop closes the dialog; clicks inside the card should not.
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  modal.addEventListener('close', () => {
    destroyStatChart();
    current = null;
  });

  shinyButton.addEventListener('click', () => {
    showShiny = !showShiny;
    renderArtwork();
    // Evolution sprites follow the same toggle so the whole modal stays consistent.
    for (const img of evolutionEl.querySelectorAll('.evo__node img')) {
      const { sprite, spriteShiny } = img.dataset;
      const next = showShiny ? spriteShiny || sprite : sprite;
      if (next) img.src = next;
    }
  });

  cryButton.addEventListener('click', async () => {
    const played = await playCry(current?.cry);
    cryNote.hidden = played;
    if (!played) cryNote.textContent = 'This browser cannot play the .ogg cry file.';
  });

  catchButton.addEventListener('click', () => {
    if (current) onToggleTeam(current);
  });

  for (const button of chartButtons) {
    button.addEventListener('click', () => {
      chartMode = button.dataset.chart;
      renderChart();
    });
  }

  // Clicking any node in the evolution chain navigates the modal to that Pokemon.
  evolutionEl.addEventListener('click', (event) => {
    const id = event.target.closest('[data-evo-id]')?.dataset.evoId;
    if (id && Number(id) !== current?.id) openDetail(id);
  });
}
