/**
 * Shared deal-domain types used across price sources (CheapShark, PlatPrices).
 */

/** Gaming platforms surfaced by Hunter's deal radar. */
export type GamePlatform = 'pc' | 'ps5' | 'xbox' | 'switch';

/** Where a unified deal came from. */
export type DealSource = 'cheapshark' | 'platprices';

/**
 * A normalised deal: the union of everything Hunter's UI needs, regardless of
 * which upstream store API produced it.
 */
export interface UnifiedDeal {
  /** Stable unique identifier, prefixed by source (e.g. `cs-<dealID>`). */
  id: string;
  title: string;
  salePrice: number;
  normalPrice: number;
  /** Discount percentage (0–100). */
  savingsPercent: number;
  /** Thumbnail / cover art URL, when available. */
  thumb: string;
  /** Display name of the storefront (Steam, PS Store, …). */
  storeName: string;
  /** Platforms this deal applies to. */
  platforms: GamePlatform[];
  source: DealSource;
  /** Metacritic score when the source provides one. */
  metacriticScore?: number;
}

/** Platform filter values used by the DealRadar selector. */
export type PlatformFilter = 'all' | GamePlatform;

export const PLATFORM_FILTERS: readonly PlatformFilter[] = ['all', 'pc', 'ps5', 'xbox', 'switch'];

export const PLATFORM_LABELS: Record<PlatformFilter, string> = {
  all: 'All',
  pc: 'PC',
  ps5: 'PS5',
  xbox: 'Xbox',
  switch: 'Switch',
};

/** Emoji shown on each platform badge. */
export const PLATFORM_ICONS: Record<GamePlatform, string> = {
  pc: '🖥️',
  ps5: '🎮',
  xbox: '🎯',
  switch: '🕹️',
};
