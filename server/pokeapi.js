import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache');

// Two cache tiers. The memory tier makes repeat requests instant within a single
// process; the disk tier survives restarts so a redeploy doesn't re-download the
// whole Pokedex. PokeAPI's fair use policy asks us to cache locally, so this is a
// requirement rather than an optimisation.
const memoryCache = new Map();

// De-duplicates concurrent requests for the same resource. Without this, loading a
// generation would fire identical /pokemon-species calls for every evolution branch.
const inFlight = new Map();

const stats = { hits: 0, diskHits: 0, misses: 0, errors: 0 };

let cacheDirReady = null;

function ensureCacheDir() {
  cacheDirReady ??= fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => null);
  return cacheDirReady;
}

function diskPathFor(resource) {
  const hash = createHash('sha1').update(resource).digest('hex').slice(0, 16);
  const slug = resource.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);
  return path.join(CACHE_DIR, `${slug || 'resource'}-${hash}.json`);
}

function isFresh(entry) {
  return entry && Date.now() - entry.storedAt < config.cacheTtlMs;
}

async function readFromDisk(resource) {
  try {
    const raw = await fs.readFile(diskPathFor(resource), 'utf8');
    const entry = JSON.parse(raw);
    return isFresh(entry) ? entry : null;
  } catch {
    return null;
  }
}

async function writeToDisk(resource, entry) {
  await ensureCacheDir();
  const target = diskPathFor(resource);
  // Write to a temp file then rename, so a crash mid-write can't leave behind a
  // truncated JSON file that would poison the cache on the next boot.
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(entry), 'utf8');
    await fs.rename(temp, target);
  } catch {
    await fs.rm(temp, { force: true }).catch(() => null);
  }
}

export class PokeApiError extends Error {
  constructor(message, status, resource) {
    super(message);
    this.name = 'PokeApiError';
    this.status = status;
    this.resource = resource;
  }
}

/**
 * Resolves a PokeAPI resource path (e.g. "pokemon/25") or an absolute pokeapi.co
 * URL into a stable cache key of the form "pokemon/25".
 */
function normaliseResource(resourceOrUrl) {
  let value = String(resourceOrUrl).trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    value = url.pathname.replace(/^\/api\/v2\//, '') + (url.search || '');
  }
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

async function fetchFresh(resource) {
  const url = `${config.pokeapiBaseUrl}/${resource}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ITCC14-Pokedex/1.0 (educational project)' },
  });

  if (!response.ok) {
    stats.errors += 1;
    throw new PokeApiError(
      `PokeAPI responded ${response.status} for ${resource}`,
      response.status === 404 ? 404 : 502,
      resource,
    );
  }

  return response.json();
}

/**
 * GETs a PokeAPI resource, serving from memory or disk cache when possible.
 * Accepts either a relative resource path or a full pokeapi.co URL, which lets
 * callers pass the `url` fields PokeAPI embeds in its responses directly.
 */
export async function getResource(resourceOrUrl) {
  const resource = normaliseResource(resourceOrUrl);

  const cached = memoryCache.get(resource);
  if (isFresh(cached)) {
    stats.hits += 1;
    return cached.data;
  }

  const pending = inFlight.get(resource);
  if (pending) return pending;

  const task = (async () => {
    const fromDisk = await readFromDisk(resource);
    if (fromDisk) {
      stats.diskHits += 1;
      memoryCache.set(resource, fromDisk);
      return fromDisk.data;
    }

    stats.misses += 1;
    const data = await fetchFresh(resource);
    const entry = { storedAt: Date.now(), data };
    memoryCache.set(resource, entry);
    // Persisting is best-effort: a read-only filesystem should degrade to
    // memory-only caching rather than failing the request.
    writeToDisk(resource, entry).catch(() => null);
    return data;
  })().finally(() => inFlight.delete(resource));

  inFlight.set(resource, task);
  return task;
}

/**
 * Fetches many resources with a bounded number of simultaneous connections,
 * preserving input order. Rejects on the first failure.
 */
export async function getResources(resources, limit = config.concurrency) {
  const results = new Array(resources.length);
  let cursor = 0;

  async function worker() {
    while (cursor < resources.length) {
      const index = cursor++;
      results[index] = await getResource(resources[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, resources.length) }, worker);
  await Promise.all(workers);
  return results;
}

export function getCacheStats() {
  return { ...stats, memoryEntries: memoryCache.size, ttlSeconds: config.cacheTtlMs / 1000 };
}

/** Pulls the trailing numeric id out of any PokeAPI resource URL. */
export function idFromUrl(url) {
  const match = String(url).match(/\/(\d+)\/?(?:\?.*)?$/);
  return match ? Number.parseInt(match[1], 10) : null;
}
