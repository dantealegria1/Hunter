/**
 * Typed client for the RAWG Video Games Database API (https://rawg.io/apidocs).
 *
 * Used to enrich backlog entries with real estimated playtime (hours to beat)
 * and official cover art. Requires an API key supplied through the
 * VITE_RAWG_API_KEY environment variable.
 */

const BASE_URL = 'https://api.rawg.io/api';

/** A game summary returned by GET /games (search). */
export interface RawgGame {
  id: number;
  slug: string;
  name: string;
  /** Average completion time in hours reported by RAWG (0 when unknown). */
  playtime: number;
  /** Official cover/hero artwork URL (null when the game has none). */
  background_image: string | null;
}

/** Normalized enrichment payload consumed by the Hunter UI. */
export interface GameEnrichment {
  /** Estimated hours to finish the game (present when RAWG reports one). */
  estimatedHours?: number;
  /** Cover image URL, undefined when RAWG has no artwork. */
  coverImage?: string;
}

export class RawgError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RawgError';
    this.status = status;
  }
}

function apiKey(): string {
  const key = import.meta.env.VITE_RAWG_API_KEY as string | undefined;
  if (!key) {
    throw new RawgError('RAWG API key missing: set VITE_RAWG_API_KEY in your environment');
  }
  return key;
}

export function hasRawgApiKey(): boolean {
  return Boolean(import.meta.env.VITE_RAWG_API_KEY);
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new RawgError(`Network error contacting RAWG API: ${String(cause)}`);
  }

  if (!response.ok) {
    throw new RawgError(`RAWG API responded with HTTP ${response.status} for ${url}`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new RawgError(`Invalid JSON from RAWG API: ${String(cause)}`, response.status);
  }
}

interface GamesResponse {
  count: number;
  results: RawgGame[];
}

/**
 * Look up a game by title and return normalized enrichment data
 * (estimated playtime in hours plus cover art).
 *
 * Resolves to `null` when no game matches the title so callers can fall
 * back to their own defaults instead of treating "not found" as an error.
 */
export async function lookupGame(title: string, signal?: AbortSignal): Promise<GameEnrichment | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const search = new URLSearchParams({
    key: apiKey(),
    search: trimmed,
    search_precise: 'true',
    page_size: '1',
  });

  const payload = await request<GamesResponse>(`${BASE_URL}/games?${search.toString()}`, signal);
  const match = payload.results?.[0];
  if (!match) return null;

  const enrichment: GameEnrichment = {};
  if (Number.isFinite(match.playtime) && match.playtime > 0) {
    enrichment.estimatedHours = Math.round(match.playtime * 100) / 100;
  }
  if (typeof match.background_image === 'string' && match.background_image.length > 0) {
    enrichment.coverImage = match.background_image;
  }
  // Nothing usable came back — treat like "not found" so callers fall back.
  if (enrichment.estimatedHours === undefined && enrichment.coverImage === undefined) {
    return null;
  }
  return enrichment;
}
