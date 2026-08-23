/**
 * DealRadar view: live CheapShark deals with client-side filtering.
 *
 * Fetches on mount, supports title search and max-price filtering, and
 * exposes a callback so the dashboard can add a deal to the backlog.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Deal } from '../services/cheapshark';
import { getDeals, CheapSharkError } from '../services/cheapshark';
import type { BacklogEntry } from '../services/planner';

interface DealRadarProps {
  /** Called when the user adds a deal to their backlog. */
  onAddToBacklog: (entry: BacklogEntry) => void;
  pageSize?: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

function priorityForSavings(savingsPercent: number): BacklogEntry['priority'] {
  if (savingsPercent >= 75) return 'high';
  if (savingsPercent >= 40) return 'medium';
  return 'low';
}

export default function DealRadar({ onAddToBacklog, pageSize = 20 }: DealRadarProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getDeals({ pageSize, sortBy: 'Savings' }, controller.signal)
      .then((result) => {
        setDeals(result);
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const cap = Number(maxPrice);
    return deals.filter((deal) => {
      if (needle && !deal.title.toLowerCase().includes(needle)) return false;
      if (Number.isFinite(cap) && maxPrice !== '' && deal.salePrice > cap) return false;
      return true;
    });
  }, [deals, query, maxPrice]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); // filters are applied live; prevent page reload
  }

  function addDeal(deal: Deal): void {
    onAddToBacklog({
      id: `deal-${deal.dealID}`,
      title: deal.title,
      hoursToBeat: 20,
      priority: priorityForSavings(deal.savingsPercent),
    });
  }

  return (
    <section aria-labelledby="deals-heading" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="deals-heading" className="mb-3 text-lg font-semibold text-slate-800">
        Deal Radar
      </h2>

      <form onSubmit={handleFilterSubmit} className="mb-3 flex flex-wrap gap-2" aria-label="Deal filters">
        <label className="flex flex-col text-xs text-slate-500">
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title"
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Max price ($)
          <input
            type="number"
            min="0"
            step="1"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Any"
            className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
          />
        </label>
      </form>

      {load.status === 'loading' && <p role="status" className="text-sm text-slate-500">Loading deals…</p>}
      {load.status === 'error' && (
        <p role="alert" className="text-sm text-red-600">{load.message}</p>
      )}
      {load.status === 'ready' && visible.length === 0 && (
        <p className="text-sm text-slate-500">No deals match your filters.</p>
      )}

      {visible.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {visible.map((deal) => (
            <li key={deal.dealID} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-800">{deal.title}</div>
                <div className="text-xs text-slate-500">
                  ${deal.salePrice.toFixed(2)}{' '}
                  <span className="line-through">${deal.normalPrice.toFixed(2)}</span>{' '}
                  <span className="font-medium text-green-600">−{Math.round(deal.savingsPercent)}%</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => addDeal(deal)}
                aria-label={`Add ${deal.title} to backlog`}
                className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                + Backlog
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
