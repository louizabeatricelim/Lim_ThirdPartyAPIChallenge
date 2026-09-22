// Small shared helpers: the type palette, HTML building blocks, and cry playback.

/** Single source of truth for type colours, consumed by badges and the stat chart. */
export const TYPE_COLORS = {
  normal: '#9fa19f',
  fire: '#e62829',
  water: '#2980ef',
  electric: '#d8a800',
  grass: '#3fa129',
  ice: '#33b7d4',
  fighting: '#d95c00',
  poison: '#9141cb',
  ground: '#a3702a',
  flying: '#6a9fe0',
  psychic: '#ef4179',
  bug: '#7d8c17',
  rock: '#9a9469',
  ghost: '#7b4b93',
  dragon: '#5060e1',
  dark: '#6b5757',
  steel: '#5f9aad',
  fairy: '#d76bc8',
};

export function typeColor(typeName) {
  return TYPE_COLORS[typeName] ?? '#6b7686';
}

export const $ = (selector, root = document) => root.querySelector(selector);

/** Escapes text before it goes into an innerHTML template. */
export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

export function titleCase(value) {
  return String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatDexNo(id) {
  return `#${String(id).padStart(4, '0')}`;
}

/** Static badge markup. `as` switches between a label and a toggle button. */
export function typeBadge(typeName, { as = 'span', pressed = false } = {}) {
  const label = escapeHtml(titleCase(typeName));
  const shared = `class="type-badge" data-type="${escapeHtml(typeName)}" style="--type:${typeColor(typeName)}"`;

  return as === 'button'
    ? `<button type="button" ${shared} data-type-filter="${escapeHtml(typeName)}" aria-pressed="${pressed}">${label}</button>`
    : `<span ${shared}>${label}</span>`;
}

/** PokeAPI reports height in decimetres and weight in hectograms. */
export const formatHeight = (height) => (height == null ? '?' : `${(height / 10).toFixed(1)} m`);
export const formatWeight = (weight) => (weight == null ? '?' : `${(weight / 10).toFixed(1)} kg`);

export function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* --------------------------------- audio ---------------------------------- */

// One shared element, so starting a new cry always cuts off the previous one
// instead of layering several on top of each other.
let cryAudio = null;

/**
 * Plays a Pokemon cry. PokeAPI serves .ogg files, which Safari cannot decode, so
 * failures resolve to false rather than throwing and the caller shows a note.
 */
export async function playCry(url, volume = 0.45) {
  if (!url) return false;

  cryAudio?.pause();
  cryAudio = new Audio(url);
  cryAudio.volume = volume;

  try {
    await cryAudio.play();
    return true;
  } catch {
    return false;
  }
}
