/**
 * Typed client for the public CheapShark API (https://apidocs.cheapshark.com).
 * Only the read-only v1 endpoints used by the Hunter app are covered.
 */

const BASE_URL = 'https://www.cheapshark.com/api/1.0';

export const STEAM_STORE_ID = '1';

/** A deal entry returned by GET /deals. */
export interface Deal {
  dealID: string;
  gameID?: string;
  steamAppID?: string;
  title: string;
  salePrice: number;
  normalPrice: number;
  savingsPercent: number;
  thumb: string;
  storeID: string;
  metacriticScore: string;
  metacriticLink?: string;
  releaseDate: number;
  lastChange: number;
  isOnSale: boolean;
  internalName: string;
  rating: string;
  steamRatingText?: string | null;
  steamRatingCount: string;
  steamRatingPercent: string;
  dealRating: string;
}

/** A game entry returned by GET /games. */
export interface GameLookupResult {
  gameID: string;
  steamAppID: string;
  cheapest: number;
  external: string;
  internalName: string;
  thumb: string;
}

/** A store entry returned by GET /stores. */
export interface Store {
  storeID: string;
  storeName: string;
  isActive: boolean;
  images: { banner: string; logo: string; icon: string };
}

export interface DealsQuery {
  storeID?: string;
  pageNumber?: number;
  pageSize?: number;
  upperPrice?: number;
  lowerPrice?: number;
  title?: string;
  onSaleOnly?: boolean;
  steamRating?: number;
  sortBy?: 'Deal Rating' | 'Title' | 'Savings' | 'Price' | 'Metacritic' | 'Reviews' | 'Release' | 'Store';
}

export class CheapSharkError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CheapSharkError';
    this.status = status;
  }
}

function buildUrl(endpoint: string, params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return `${BASE_URL}${endpoint}${query ? `?${query}` : ''}`;
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new CheapSharkError(`Network error contacting CheapShark API: ${String(cause)}`);
  }

  if (!response.ok) {
    throw new CheapSharkError(
      `CheapShark API responded with HTTP ${response.status} for ${url}`,
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new CheapSharkError(`Invalid JSON from CheapShark API: ${String(cause)}`, response.status);
  }
}

/**
 * Fetch deals, optionally filtered. Numeric price/rating fields arrive as
 * strings from the API and are coerced to numbers.
 */
export async function getDeals(query: DealsQuery = {}, signal?: AbortSignal): Promise<Deal[]> {
  const url = buildUrl('/deals', {
    storeID: query.storeID,
    pageNumber: query.pageNumber,
    pageSize: query.pageSize,
    upperPrice: query.upperPrice,
    lowerPrice: query.lowerPrice,
    title: query.title,
    onSale: query.onSaleOnly === undefined ? undefined : String(query.onSaleOnly),
    steamRating: query.steamRating,
    sortBy: query.sortBy,
  });

  const raw = await request<Record<string, unknown>[]>(url, signal);
  if (!Array.isArray(raw)) {
    throw new CheapSharkError('Unexpected CheapShark /deals payload shape');
  }
  return raw.map((entry) => ({
    ...entry,
    salePrice: Number(entry['salePrice']),
    normalPrice: Number(entry['normalPrice']),
    savingsPercent: Number(entry['savings']),
    isOnSale: Boolean(entry['isOnSale']),
    releaseDate: Number(entry['releaseDate']),
    lastChange: Number(entry['lastChange']),
  })) as Deal[];
}

/** Look up games by exact or fuzzy title match. */
export async function searchGames(title: string, limit = 5, signal?: AbortSignal): Promise<GameLookupResult[]> {
  if (!title.trim()) return [];
  const url = buildUrl('/games', { title, limit });
  const raw = await request<Record<string, unknown>[]>(url, signal);
  if (!Array.isArray(raw)) {
    throw new CheapSharkError('Unexpected CheapShark /games payload shape');
  }
  return raw.map((entry) => ({
    ...entry,
    cheapest: Number(entry['cheapest']),
  })) as GameLookupResult[];
}

/** List all stores with their active status and image assets. */
export async function getStores(signal?: AbortSignal): Promise<Store[]> {
  const url = buildUrl('/stores', {});
  return request<Store[]>(url, signal);
}
