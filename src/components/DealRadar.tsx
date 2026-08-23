/**
 * DealRadar view: live CheapShark deals with client-side filtering.
 *
 * Fetches on mount, supports title search and max-price filtering, and
 * exposes a callback so the dashboard can add a deal to the backlog.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getDeals, CheapSharkError } from '../services/cheapshark';
import {
  fromCheapSharkDeal,
  filterByPlatform,
} from '../services/multiStore';
import type { BacklogEntry } from '../services/planner';
import { lookupGame, hasRawgApiKey } from '../services/rawg';
import {
  PLATFORM_FILTERS,
  PLATFORM_LABELS,
  PLATFORM_ICONS,
  type GamePlatform,
  type PlatformFilter,
  type UnifiedDeal,
} from '../types/deals';

interface DealRadarProps {
  /** Called when the user adds a deal to their backlog. */
  onAddToBacklog: (entry: BacklogEntry) => void;
  pageSize?: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

/** Well-known CheapShark store IDs → display labels. */
const STORE_NAMES: Record<string, string> = {
  '1': 'Steam',
  '2': 'GamersGate',
  '3': 'GreenManGaming',
  '4': 'Amazon',
  '5': 'GameStop',
  '6': 'Direct2Drive',
  '7': 'GOG',
  '8': 'Origin',
  '9': 'Get Games',
  '10': 'Shiny Loot',
  '11': 'Humble Store',
  '12': 'IndieGalaxy',
  '13': 'Uplay',
  '15': 'Fanatical',
  '16': 'Gamesplanet',
  '17': 'Epic Games',
  '18': 'WinGameStore',
  '20': 'PlayStation',
  '21': 'Xbox',
  '24': 'Nintendo',
  '25': 'itch.io',
  '26': 'Battle.net',
  '27': 'Rockstar',
  '28': 'GOG.com',
  '29': 'SilaGames',
  '30': 'GameJolt',
  '31': 'GLL',
  '32': 'GG.deals',
  '33': 'DLgamer',
  '34': '2game',
  '35': 'IndieGala',
  '36': 'Blizzard',
  '37': 'Gamesload',
  '38': 'Metro',
  '39': 'Xbox UK',
  '40': 'Steam UK',
};

/** Discount badge tier: bigger savings get stronger colors. */
function savingsBadgeClass(savingsPercent: number): string {
  if (savingsPercent >= 75) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (savingsPercent >= 40) return 'bg-teal-500/10 text-teal-600 dark:text-teal-400';
  return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
}

/** Platform badge color per platform. */
function platformBadgeClass(platform: GamePlatform): string {
  switch (platform) {
    case 'pc':
      return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
    case 'ps5':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'xbox':
      return 'bg-green-500/10 text-green-600 dark:text-green-400';
    case 'switch':
      return 'bg-red-500/10 text-red-600 dark:text-red-400';
  }
}

function PlatformBadges({ platforms }: { platforms: GamePlatform[] }) {
  return (
    <>
      {platforms.map((platform) => (
        <span
          key={platform}
          className={`rounded-full px-1.5 py-px font-medium ${platformBadgeClass(platform)}`}
        >
          {PLATFORM_ICONS[platform]} {platform.toUpperCase()}
        </span>
      ))}
    </>
  );
}

function priorityForSavings(savingsPercent: number): BacklogEntry['priority'] {
  if (savingsPercent >= 75) return 'high';
  if (savingsPercent >= 40) return 'medium';
  return 'low';
}

export default function DealRadar({ onAddToBacklog, pageSize = 60 }: DealRadarProps) {
  const [deals, setDeals] = useState<UnifiedDeal[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [pageNumber, setPageNumber] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [addingDealID, setAddingDealID] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getDeals({ pageNumber: 0, pageSize, sortBy: 'Savings' }, controller.signal)
      .then((result) => {
        setDeals(result.map((deal) => fromCheapSharkDeal(deal, STORE_NAMES[deal.storeID] ?? `Store #${deal.storeID}`)));
        setPageNumber(0);
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          status: 'error',
          message:
            error instanceof CheapSharkError
              ? error.message
              : `Failed to load deals: ${String(error)}`,
        });
      });
    return () => controller.abort();
  }, [pageSize]);

  /** Fetch the next page and append it to the current list. */
  function handleLoadMore(): void {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    const next = pageNumber + 1;
    getDeals({ pageNumber: next, pageSize, sortBy: 'Savings' })
      .then((result) => {
        const mapped = result.map((deal) =>
          fromCheapSharkDeal(deal, STORE_NAMES[deal.storeID] ?? `Store #${deal.storeID}`),
        );
        setDeals((current) => {
          const seen = new Set(current.map((deal) => deal.id));
          return [...current, ...mapped.filter((deal) => !seen.has(deal.id))];
        });
        setPageNumber(next);
        setLoadingMore(false);
      })
      .catch((error: unknown) => {
        setLoadingMore(false);
        setLoadMoreError(
          error instanceof CheapSharkError
            ? error.message
            : `Failed to load more deals: ${String(error)}`,
        );
      });
  }

  const visible = useMemo(
    () =>
      filterByPlatform(deals, platformFilter).filter((deal) => {
        const needle = query.trim().toLowerCase();
        if (needle && !deal.title.toLowerCase().includes(needle)) return false;
        const cap = Number(maxPrice);
        if (Number.isFinite(cap) && maxPrice !== '' && deal.salePrice > cap) return false;
        return true;
      }),
    [deals, query, maxPrice, platformFilter],
  );

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); // filters are applied live; prevent page reload
  }

  async function addDeal(deal: UnifiedDeal): Promise<void> {
    if (addingDealID !== null) return;
    setAddingDealID(deal.id);
    try {
      // Enrich with real RAWG playtime + cover art before the entry lands;
      // on any failure fall back to the previous heuristic defaults.
      const enrichment = hasRawgApiKey()
        ? await lookupGame(deal.title).catch(() => null)
        : null;
      onAddToBacklog({
        id: deal.id,
        title: deal.title,
        hoursToBeat: enrichment?.estimatedHours ?? 20,
        priority: priorityForSavings(deal.savingsPercent),
        ...(enrichment?.coverImage !== undefined ? { coverImage: enrichment.coverImage } : {}),
      });
    } finally {
      setAddingDealID(null);
    }
  }

  return (
    <section aria-labelledby="deals-heading" className="glass-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="deals-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          <span aria-hidden="true">📡</span>
          Deal Radar
        </h2>
        {load.status === 'ready' && (
          <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
            {visible.length} deals
          </span>
        )}
      </div>

      <form onSubmit={handleFilterSubmit} className="mb-4 flex flex-wrap gap-3" aria-label="Deal filters">
        <label className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title"
            className="mt-1 w-48 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
          Max price ($)
          <input
            type="number"
            min="0"
            step="1"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Any"
            className="mt-1 w-28 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
          Platform
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
            aria-label="Platform filter"
            className="mt-1 w-36 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
          >
            {PLATFORM_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {PLATFORM_LABELS[filter]}
              </option>
            ))}
          </select>
        </label>
      </form>

      {load.status === 'loading' && (
        <p role="status" className="animate-pulse text-sm text-slate-500 dark:text-slate-400">
          Loading deals…
        </p>
      )}
      {load.status === 'error' && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400">
          {load.message}
        </p>
      )}
      {load.status === 'ready' && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No deals match your filters.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="scrollbar-thin max-h-96 space-y-2 overflow-y-auto rounded-xl pr-1">
          {visible.map((deal) => (
            <li
              key={deal.id}
              className="group flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-slate-200 hover:bg-slate-50/80 dark:hover:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <img
                src={deal.thumb}
                alt=""
                loading="lazy"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-contain p-0.5 dark:bg-slate-800"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900 dark:text-slate-100">{deal.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="rounded-full bg-slate-100 px-1.5 py-px font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    🏪 {deal.storeName}
                  </span>
                  <PlatformBadges platforms={deal.platforms} />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">${deal.salePrice.toFixed(2)}</span>
                  <span className="line-through opacity-70">${deal.normalPrice.toFixed(2)}</span>
                  <span
                    className={`rounded-full px-1.5 py-px font-bold tabular-nums ${savingsBadgeClass(deal.savingsPercent)}`}
                  >
                    −{Math.round(deal.savingsPercent)}%
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void addDeal(deal)}
                disabled={addingDealID !== null}
                aria-label={`Add ${deal.title} to backlog`}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {addingDealID === deal.id ? 'Adding…' : '+ Backlog'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {load.status === 'ready' && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-xl border border-slate-200 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
          {loadMoreError && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{loadMoreError}</p>
          )}
        </div>
      )}
    </section>
  );
}
