import { typeColor } from '../dom.js';
import { STAT_META } from '../state.js';

// One Chart instance is reused for the lifetime of the page. Chart.js attaches
// listeners to the canvas, so switching Pokemon or chart type destroys the old
// instance rather than stacking new ones on the same element.
let chart = null;

const GRID = 'rgba(255, 255, 255, 0.08)';
const TICK = '#96a0b0';

/** Converts "#e62829" plus an alpha into an rgba() string Chart.js accepts. */
function withAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function radarConfig(labels, values, color) {
  return {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Base stat',
          data: values,
          borderColor: color,
          backgroundColor: withAlpha(color, 0.28),
          pointBackgroundColor: color,
          pointBorderColor: '#0e1116',
          pointRadius: 4,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          // Every radar shares one ceiling so shapes stay comparable between
          // Pokemon instead of rescaling to each one's best stat.
          suggestedMax: 160,
          angleLines: { color: GRID },
          grid: { color: GRID },
          pointLabels: { color: '#e8ecf2', font: { size: 12, weight: '600' } },
          ticks: { color: TICK, backdropColor: 'transparent', stepSize: 40, font: { size: 10 } },
        },
      },
    },
  };
}

function barConfig(labels, values) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Base stat',
          data: values,
          // Colour each bar by how strong the stat is, so weak points read at a glance.
          backgroundColor: values.map((value) =>
            value >= 120 ? '#35c47b' : value >= 80 ? '#d8a800' : value >= 50 ? '#e08b3a' : '#e35555',
          ),
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, suggestedMax: 180, grid: { color: GRID }, ticks: { color: TICK } },
        y: { grid: { display: false }, ticks: { color: '#e8ecf2', font: { weight: '600' } } },
      },
    },
  };
}

/**
 * Draws a Pokemon's six base stats as a radar or bar chart.
 * Silently no-ops if the Chart.js CDN script failed to load, so a blocked CDN
 * degrades to a missing chart rather than a broken modal.
 */
export function renderStatChart(canvas, pokemon, mode = 'radar') {
  if (typeof window.Chart === 'undefined') return false;

  const labels = STAT_META.map((stat) => stat.label);
  const values = STAT_META.map((stat) => pokemon.stats?.[stat.key] ?? 0);
  const color = typeColor(pokemon.types[0]);

  chart?.destroy();
  chart = new window.Chart(canvas, mode === 'bar' ? barConfig(labels, values) : radarConfig(labels, values, color));
  return true;
}

export function destroyStatChart() {
  chart?.destroy();
  chart = null;
}
