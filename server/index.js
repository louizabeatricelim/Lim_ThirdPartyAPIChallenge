import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { config } from './config.js';
import { getCacheStats, PokeApiError } from './pokeapi.js';
import metaRouter from './routes/meta.js';
import pokemonRouter from './routes/pokemon.js';
import evolutionRouter from './routes/evolution.js';
import quizRouter from './routes/quiz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export const app = express();

app.disable('x-powered-by');

// Frontend. index.html itself is served with no-cache so a redeploy is picked up
// immediately, while fingerprint-free assets get a short revalidating cache.
app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
    },
  }),
);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    upstream: config.pokeapiBaseUrl,
    cache: getCacheStats(),
  });
});

app.use('/api', metaRouter);
app.use('/api', pokemonRouter);
app.use('/api', evolutionRouter);
app.use('/api', quizRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', message: `No API route matches ${req.method} ${req.originalUrl}` });
});

// Any non-API path falls through to the single-page frontend.
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err instanceof PokeApiError ? err.status : 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);

  res.status(status).json({
    error: status === 404 ? 'Not found' : 'Upstream error',
    message: err.message || 'Something went wrong talking to PokeAPI.',
  });
});

// Skipped when the app is imported by a test or another entry point.
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(config.port, () => {
    console.log(`Pokedex running at http://localhost:${config.port}`);
    console.log(`Proxying PokeAPI at ${config.pokeapiBaseUrl}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is already in use. Set a different one, e.g. PORT=3001 npm start, ` +
          'or change PORT in your .env file.',
      );
      process.exit(1);
    }
    throw err;
  });
}
