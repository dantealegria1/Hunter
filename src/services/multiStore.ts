/**
 * Multi-store deal aggregation.
 *
 * Merges PC deals from the CheapShark API with PlayStation Store deals from
 * the PlatPrices API into a single, normalised `UnifiedDeal` list. PlatPrices
 * requires an API key (VITE_PLATPRICES_API_KEY); when it is absent or its
 * request fails, PC-only CheapShark results are still served so the radar
 * degrades gracefully instead of breaking.
 */

import * as cheapshark from './cheapshark';
import type {
  GamePlatform,
  PlatformFilter,
  UnifiedDeal,
} from '../types/deals';
import { PLATFORM_FILTERS } from '../types/deals';

const PLATPRICES_BASE_URL = 'https://platprices.com/api/v2';

/** Well-known CheapShark store IDs → platform availability. */
const CHEAPSHARK_STORE_PLATFORMS: Record<string, GamePlatform[]> = {
  // Console storefronts present in CheapShark's store list.
  '20': ['ps5'], // PlayStation
  '21': ['xbox'], // Xbox
  '24': ['switch'], // Nintendo
};

export class MultiStoreError extends Error {
  readonly source: 'cheapshark' | 'platprices';

  constructor(message: string, source: 'cheapshark' | 'platprices') {
    super(message);
    this.name = 'MultiStoreError';
    this.source = source;
  }
}

function cheapSharkKey(deal: cheapshark.Deal): string {
  return `cs-${deal.dealID}`;
}

function mapCheapSharkStore(storeID: string): GamePlatform[] {
  return CHEAPSHARK_STORE_PLATFORMS[storeID] ?? ['pc'];
}

/** Convert a raw CheapShark deal into Hunter's normalised shape. */
export function fromCheapSharkDeal(
  deal: cheapshark.Deal,
  storeName: string,
): UnifiedDeal {
  const score = Number(deal.metacriticScore);
  return {
    id: cheapSharkKey(deal),
    title: deal.title,
    salePrice: deal.salePrice,
    normalPrice: deal.normalPrice,
    savingsPercent: deal.savingsPercent,
    thumb: deal.thumb,
    storeName,
    platforms: mapCheapSharkStore(deal.storeID),
    source: 'cheapshark',
    ...(Number.isFinite(score) && score > 0 ? { metacriticScore: score } : {}),
  };
}

interface PlatPricesGameCard {
  PPID?: string | number;
  ProductName?: string;
  BasePrice?: number;
  SalePrice?: number;
  DiscPerc?: number;
  CoverImage?: string;
}

/**
 * Convert a PlatPrices game card into Hunter's normalised shape. Prices are
 * integers in minor units (cents) and are converted to dollars here.
 */
export function fromPlatPricesGame(card: PlatPricesGameCard): UnifiedDeal {
  const sale = (card.SalePrice ?? card.BasePrice ?? 0) / 100;
  const base = (card.BasePrice ?? sale * 100) / 100;
  return {
    id: `pp-${String(card.PPID ?? '')}`,
    title: card.ProductName ?? 'Unknown PlayStation title',
    salePrice: sale,
    normalPrice: base,
    savingsPercent:
      typeof card.DiscPerc === 'number'
        ? Math.max(0, Math.round(100 - card.DiscPerc))
        : base > 0
          ? Math.round(((base - sale) / base) * 100)
          : 0,
    thumb: card.CoverImage ?? '',
    storeName: 'PlayStation',
    platforms: ['ps5'],
    source: 'platprices',
  };
}

/** True when a PlatPrices API key is configured for this build. */
export function hasPlatPricesApiKey(): boolean {
  return Boolean(import.meta.env.VITE_PLATPRICES_API_KEY);
}

async function fetchPlatPricesDeals(signal?: AbortSignal): Promise<UnifiedDeal[]> {
  const key = import.meta.env.VITE_PLATPRICES_API_KEY as string | undefined;
  if (!key) throw new MultiStoreError('PlatPrices API key missing', 'platprices');

  let response: Response;
  try {
    response = await fetch(`${PLATPRICES_BASE_URL}/deals?region=us&limit=25`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new MultiStoreError(`Network error contacting PlatPrices API: ${String(cause)}`, 'platprices');
  }

  if (!response.ok) {
    throw new MultiStoreError(`PlatPrices API responded with HTTP ${response.status}`, 'platprices');
  }

  let payload: { success?: boolean; data?: unknown };
  try {
    payload = (await response.json()) as { success?: boolean; data?: unknown };
  } catch (cause) {
    throw new MultiStoreError(`Invalid JSON from PlatPrices API: ${String(cause)}`, 'platprices');
  }

  if (!payload.success || !Array.isArray(payload.data)) {
    throw new MultiStoreError('Unexpected PlatPrices /deals payload shape', 'platprices');
  }
  return payload.data.filter((card): card is PlatPricesGameCard => Boolean(card)).map(fromPlatPricesGame);
}

/** Fetch the current CheapShark page size worth of deals, normalised. */
async function fetchCheapSharkDeals(pageSize: number, signal?: AbortSignal): Promise<UnifiedDeal[]> {
  const deals = await cheapshark.getDeals({ pageNumber: 0, pageSize, sortBy: 'Savings' }, signal);
  return deals.map((deal) => fromCheapSharkDeal(deal, STORE_NAMES[deal.storeID] ?? `Store #${deal.storeID}`));
}

const STORE_NAMES: Record<string, string> = {
  '1': 'Steam',
  '7': 'GOG',
  '11': 'Humble Store',
  '13': 'Uplay',
  '15': 'Fanatical',
  '17': 'Epic Games',
  '20': 'PlayStation',
  '21': 'Xbox',
  '24': 'Nintendo',
};

/**
 * Aggregate deals across every configured store.
 *
 * CheapShark failures reject the whole call; PlatPrices failures only shrink
 * the result to PC sources (its data is additive console coverage).
 */
export async function getUnifiedDeals(
  options: { pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<UnifiedDeal[]> {
  const pageSize = options.pageSize ?? 60;

  const [cheapSharkResult, platPricesResult] = await Promise.allSettled([
    fetchCheapSharkDeals(pageSize, signal),
    hasPlatPricesApiKey() ? fetchPlatPricesDeals(signal) : Promise.resolve([]),
  ]);

  if (cheapSharkResult.status === 'rejected') {
    throw cheapSharkResult.reason instanceof Error
      ? cheapSharkResult.reason
      : new MultiStoreError(String(cheapSharkResult.reason), 'cheapshark');
  }

  const merged = [...cheapSharkResult.value];
  if (platPricesResult.status === 'fulfilled') {
    merged.push(...platPricesResult.value);
  } else if (hasPlatPricesApiKey()) {
    // Key is set but the request failed — log-and-continue with PC deals.
    console.warn('Skipping PlatPrices deals:', platPricesResult.reason);
  }

  return merged.sort((a, b) => b.savingsPercent - a.savingsPercent);
}

/**
 * Client-side platform filter. A deal matches when it covers the selected
 * platform; 'all' keeps everything.
 */
export function filterByPlatform(
  deals: UnifiedDeal[],
  filter: PlatformFilter,
): UnifiedDeal[] {
  if (filter === 'all') return [...deals];
  assertValidFilter(filter);
  return deals.filter((deal) => deal.platforms.includes(filter));
}

function assertValidFilter(filter: PlatformFilter): asserts filter is Exclude<PlatformFilter, 'all'> {
  if (!PLATFORM_FILTERS.includes(filter)) {
    throw new Error(`Unknown platform filter: ${filter}`);
  }
}
