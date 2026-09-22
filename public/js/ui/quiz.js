import { api } from '../api.js';
import { $, escapeHtml, playCry, titleCase, typeBadge } from '../dom.js';
import { recordQuizScore, state } from '../state.js';

const modal = $('#quiz-modal');
const genSelect = $('#quiz-gen');
const image = $('#quiz-image');
const loadingText = $('#quiz-loading');
const hint = $('#quiz-hint');
const form = $('#quiz-form');
const input = $('#quiz-input');
const submitButton = $('#quiz-submit');
const feedback = $('#quiz-feedback');
const hintButton = $('#quiz-hint-btn');
const skipButton = $('#quiz-skip');
const nextButton = $('#quiz-next');
const scoreEl = $('#quiz-score');
const streakEl = $('#quiz-streak');
const bestEl = $('#quiz-best');

/** How many recent answers to keep out of the draw, so rounds don't repeat. */
const RECENT_MEMORY = 30;

let round = null;
let answered = false;
let score = 0;
let streak = 0;
let hintLevel = 0;
const recent = [];

/* -------------------------------- rendering ------------------------------- */

function renderScores() {
  scoreEl.textContent = String(score);
  streakEl.textContent = String(streak);
  bestEl.textContent = String(state.quizBest);
}

function renderGenOptions() {
  genSelect.innerHTML = [
    '<option value="all">All generations</option>',
    ...state.generations.map(
      (gen) => `<option value="${gen.id}">${escapeHtml(gen.label)} - ${escapeHtml(gen.region)}</option>`,
    ),
  ].join('');
}

/** Reveals progressively more: letter count, then types, then the first letter. */
function renderHint() {
  if (!round || hintLevel === 0) {
    hint.innerHTML = '';
    return;
  }

  const parts = [`${round.letterCount} letters`];
  if (hintLevel >= 2) parts.push(round.types.map((type) => typeBadge(type)).join(' '));
  if (hintLevel >= 3) parts.push(`starts with <strong>${escapeHtml(round.firstLetter)}</strong>`);

  hint.innerHTML = parts.join(' &middot; ');
  hintButton.disabled = hintLevel >= 3;
}

function setBusy(busy) {
  input.disabled = busy;
  submitButton.disabled = busy;
  skipButton.disabled = busy;
  hintButton.disabled = busy || hintLevel >= 3;
}

/* --------------------------------- rounds --------------------------------- */

async function nextRound() {
  round = null;
  answered = false;
  hintLevel = 0;

  image.classList.add('is-hidden');
  image.classList.remove('is-revealed');
  loadingText.hidden = false;
  feedback.textContent = '';
  feedback.className = 'quiz__feedback';
  hint.innerHTML = '';
  nextButton.hidden = true;
  input.value = '';
  setBusy(true);

  try {
    round = await api.quiz({ gen: genSelect.value, exclude: recent });

    // Wait for the artwork to decode before revealing the stage, otherwise the
    // silhouette pops in mid-round.
    image.src = round.artwork;
    await image.decode?.().catch(() => null);

    image.classList.remove('is-hidden');
    image.classList.add('is-silhouette');
    loadingText.hidden = true;

    setBusy(false);
    renderHint();
    input.focus();
  } catch (error) {
    loadingText.hidden = false;
    loadingText.textContent = error.message;
  }
}

function finishRound(correct, displayName) {
  answered = true;
  image.classList.remove('is-silhouette');
  image.classList.add('is-revealed');

  if (correct) {
    // Hints make a round easier, so they cost points: 10 down to 4.
    const points = Math.max(4, 10 - hintLevel * 3);
    score += points;
    streak += 1;
    recordQuizScore(score);
    feedback.textContent = `Correct! It's ${displayName}. +${points} points`;
    feedback.className = 'quiz__feedback is-correct';
  } else {
    streak = 0;
    feedback.textContent = `It was ${displayName}.`;
    feedback.className = 'quiz__feedback is-wrong';
  }

  recent.push(round.id);
  if (recent.length > RECENT_MEMORY) recent.shift();

  playCry(round.cry, 0.35);
  renderScores();

  setBusy(true);
  nextButton.hidden = false;
  nextButton.focus();
}

async function submitGuess(guess) {
  if (!round || answered || !guess.trim()) return;

  setBusy(true);
  try {
    const result = await api.quizCheck(round.id, guess);

    if (result.correct) {
      finishRound(true, result.displayName);
      return;
    }

    // A wrong guess costs the streak but not the round, so the player can retry.
    streak = 0;
    renderScores();
    feedback.textContent = `Not ${titleCase(guess.trim())}. Try again, or skip to reveal.`;
    feedback.className = 'quiz__feedback is-wrong';
    input.select();
    setBusy(false);
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = 'quiz__feedback is-wrong';
    setBusy(false);
  }
}

async function revealAnswer() {
  if (!round || answered) return;

  setBusy(true);
  try {
    // An intentionally impossible guess is the cheapest way to ask the server for
    // the answer without adding a second endpoint that leaks it.
    const result = await api.quizCheck(round.id, '__reveal__');
    finishRound(false, result.displayName);
  } catch (error) {
    feedback.textContent = error.message;
    setBusy(false);
  }
}

/* --------------------------------- wiring --------------------------------- */

export function openQuiz() {
  renderGenOptions();
  renderScores();
  if (!modal.open) modal.showModal();
  nextRound();
}

export function initQuiz() {
  $('#open-quiz').addEventListener('click', openQuiz);
  $('#quiz-close').addEventListener('click', () => modal.close());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitGuess(input.value);
  });

  hintButton.addEventListener('click', () => {
    if (answered || hintLevel >= 3) return;
    hintLevel += 1;
    renderHint();
  });

  skipButton.addEventListener('click', revealAnswer);
  nextButton.addEventListener('click', nextRound);
  genSelect.addEventListener('change', nextRound);
}
