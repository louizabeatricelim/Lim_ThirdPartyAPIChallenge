import { $, escapeHtml, formatDexNo, typeBadge } from '../dom.js';
import { clearTeam, state, TEAM_LIMIT } from '../state.js';

const modal = $('#team-modal');
const slots = $('#team-slots');
const analysis = $('#team-analysis');
const coverage = $('#team-coverage');
const sizeLabel = $('#team-size');
const teamCount = $('#team-count');

let onSelect = () => {};
let onRelease = () => {};

/* ---------------------------- effectiveness math --------------------------- */

/**
 * How hard `attackType` hits a Pokemon of `defendType`, read from the defending
 * type's damage_relations: 0 for immune, 2 for weak, 0.5 for resistant, else 1.
 */
function singleTypeMultiplier(attackType, defendType) {
  const relations = state.typeIndex.get(defendType);
  if (!relations) return 1;

  if (relations.noDamageFrom.includes(attackType)) return 0;
  if (relations.doubleDamageFrom.includes(attackType)) return 2;
  if (relations.halfDamageFrom.includes(attackType)) return 0.5;
  return 1;
}

/** Dual types multiply, which is how 4x weaknesses and 0.25x resistances arise. */
function multiplierAgainst(attackType, defenderTypes) {
  return defenderTypes.reduce((product, type) => product * singleTypeMultiplier(attackType, type), 1);
}

/**
 * Buckets every attacking type by the worst-case outcome across the whole party.
 * Each bucket records how many members are affected, which is what turns raw
 * matchups into an actionable "three of your six fold to Ground" reading.
 */
function analyseTeam(team) {
  const buckets = { quadWeak: [], weak: [], resist: [], immune: [] };
  if (!team.length) return buckets;

  for (const attackType of state.typeIndex.keys()) {
    const multipliers = team.map((member) => multiplierAgainst(attackType, member.types));

    const quad = multipliers.filter((value) => value >= 4).length;
    const doubled = multipliers.filter((value) => value === 2).length;
    const resisted = multipliers.filter((value) => value > 0 && value < 1).length;
    const immune = multipliers.filter((value) => value === 0).length;

    if (quad) buckets.quadWeak.push({ type: attackType, count: quad });
    if (doubled) buckets.weak.push({ type: attackType, count: doubled });
    if (resisted) buckets.resist.push({ type: attackType, count: resisted });
    if (immune) buckets.immune.push({ type: attackType, count: immune });
  }

  for (const list of Object.values(buckets)) list.sort((a, b) => b.count - a.count);
  return buckets;
}

/* -------------------------------- rendering ------------------------------- */

function slotMarkup(member) {
  const sprite = (state.shiny ? member.spriteShiny : member.sprite) ?? member.sprite;

  return `
    <div class="slot" data-id="${member.id}">
      <button type="button" class="slot__release" data-action="release"
              aria-label="Release ${escapeHtml(member.displayName)}">&times;</button>
      <img src="${escapeHtml(sprite ?? '')}" alt="${escapeHtml(member.displayName)}" width="60" height="60"
           data-action="open" title="View details" />
      <span class="slot__name">${escapeHtml(member.displayName)}</span>
      <span class="evo__nodedex">${formatDexNo(member.id)}</span>
      <div class="type-row">${member.types.map((type) => typeBadge(type)).join('')}</div>
    </div>`;
}

function groupMarkup({ key, title, hint, tone, items }) {
  if (!items.length) return '';

  const badges = items
    .map(
      (item) => `
        <span class="covitem">${typeBadge(item.type)}<span class="covitem__count">${item.count}</span></span>`,
    )
    .join('');

  return `
    <div class="covgroup covgroup--${tone}" data-group="${key}">
      <div class="covgroup__head">
        <span class="covgroup__title">${escapeHtml(title)}</span>
        <span class="covgroup__hint">${escapeHtml(hint)}</span>
      </div>
      <div class="covgroup__items">${badges}</div>
    </div>`;
}

export function renderTeam() {
  const { team } = state;

  teamCount.textContent = String(team.length);
  sizeLabel.textContent = `(${team.length}/${TEAM_LIMIT})`;

  const empties = Array.from(
    { length: Math.max(0, TEAM_LIMIT - team.length) },
    () => '<div class="slot slot--empty">Empty slot</div>',
  );
  slots.innerHTML = team.map(slotMarkup).join('') + empties.join('');

  analysis.hidden = team.length === 0;
  if (team.length === 0) return;

  const buckets = analyseTeam(team);
  const numberWord = (count) => `${count} member${count === 1 ? '' : 's'}`;

  coverage.innerHTML =
    [
      groupMarkup({
        key: 'quad',
        title: 'Critical weaknesses (4x)',
        hint: 'numbers show how many members take quadruple damage',
        tone: 'danger',
        items: buckets.quadWeak,
      }),
      groupMarkup({
        key: 'weak',
        title: 'Weaknesses (2x)',
        hint: 'numbers show how many members take double damage',
        tone: 'danger',
        items: buckets.weak,
      }),
      groupMarkup({
        key: 'resist',
        title: 'Resistances',
        hint: 'numbers show how many members take reduced damage',
        tone: 'good',
        items: buckets.resist,
      }),
      groupMarkup({
        key: 'immune',
        title: 'Immunities',
        hint: 'numbers show how many members take no damage',
        tone: 'good',
        items: buckets.immune,
      }),
    ].join('') ||
    `<p class="muted">No notable matchups across ${numberWord(team.length)}.</p>`;
}

export function openTeam() {
  renderTeam();
  if (!modal.open) modal.showModal();
}

export function initTeam({ onSelect: selectHandler, onRelease: releaseHandler }) {
  onSelect = selectHandler;
  onRelease = releaseHandler;

  $('#open-team').addEventListener('click', openTeam);
  $('#team-close').addEventListener('click', () => modal.close());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });

  slots.addEventListener('click', (event) => {
    const id = event.target.closest('.slot')?.dataset.id;
    if (!id) return;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'release') onRelease(Number(id));
    else if (action === 'open') onSelect(Number(id));
  });

  $('#team-clear').addEventListener('click', () => {
    if (state.team.length === 0) return;
    if (window.confirm('Release every Pokemon from your team?')) clearTeam();
  });
}
