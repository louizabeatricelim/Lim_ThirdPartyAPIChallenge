// Thin client for this app's own Express API. Every call goes to /api/* on the same
// origin, never to pokeapi.co directly, so the server's cache does the heavy lifting.

const BASE = '/api';

async function request(path, params = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach the server. Check that it is still running.');
  }

  if (!response.ok) {
    // The API always answers with { error, message }; fall back if that ever fails.
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `Request failed with status ${response.status}.`);
  }

  return response.json();
}

export const api = {
  generations: () => request('/generations'),
  types: () => request('/types'),
  pokemonPage: ({ gen, offset, limit }) => request('/pokemon', { gen, offset, limit }),
  pokemon: (idOrName) => request(`/pokemon/${encodeURIComponent(idOrName)}`),
  evolution: (idOrName) => request(`/evolution/${encodeURIComponent(idOrName)}`),
  quiz: ({ gen, exclude }) => request('/quiz', { gen, exclude: exclude?.join(',') }),
  quizCheck: (id, guess) => request(`/quiz/${id}/check`, { guess }),
};
