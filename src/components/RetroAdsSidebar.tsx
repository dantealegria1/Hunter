/**
 * RetroAdsSidebar: right-column monetization/flavor widgets.
 *
 * Renders playful 90s-style retro game banners (pixel borders, neon
 * gradients, CRT scanlines), static sponsor cards, and live affiliate
 * deal highlights sourced from current CheapShark deals. All outbound
 * deal links use rel="sponsored noopener" per affiliate disclosure
 * requirements. Fully themed for light and dark mode via existing
 * Tailwind dark: variants; decorative styling degrades without images.
 */

import { useEffect, useState } from 'react';
import { getDeals, CheapSharkError, type Deal } from '../services/cheapshark';

interface RetroAdsSidebarProps {
  /** How many affiliate deals to highlight. */
  pageSize?: number;
}

type AdsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; deals: Deal[] };

/** Static flavor sponsors (not real advertisers — placeholder cards). */
const SPONSORS: ReadonlyArray<{ name: string; blurb: string; icon: string }> = [
  { name: 'PixelFuel Energy', blurb: 'Respawn faster.™', icon: '⚡' },
  { name: 'CRT Glare Guard', blurb: 'Protect your retinas, champ.', icon: '🕶️' },
];

/** CheapShark affiliate redirect for a deal. */
function dealUrl(deal: Deal): string {
  return `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(deal.dealID)}`;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function RetroAdsSidebar({ pageSize = 4 }: RetroAdsSidebarProps) {
  const [state, setState] = useState<AdsState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    getDeals({ pageSize, sortBy: 'Savings', onSaleOnly: true }, controller.signal)
      .then((deals) => {
        if (!controller.signal.aborted) setState({ status: 'ready', deals });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof CheapSharkError
            ? error.message
            : 'Could not load today’s hot deals.';
        setState({ status: 'error', message });
      });
    return () => controller.abort();
  }, [pageSize]);

  return (
    <aside aria-label="Sponsored offers" className="space-y-4">
      {/* 90s arcade banner */}
      <div className="retro-banner relative overflow-hidden rounded-2xl p-4 text-center">
        <p className="retro-scanlines pointer-events-none absolute inset-0" aria-hidden="true" />
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-300">
          ★ Insert Coin ★
        </p>
        <h2 className="retro-title mt-1 text-xl font-black uppercase tracking-wider">
          Hunter Arcade
        </h2>
        <p className="mt-1 text-xs text-fuchsia-100">
          Now playing: your backlog’s greatest hits
        </p>
      </div>

      {/* Sponsor cards */}
      <section aria-label="Sponsors" className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Sponsors
        </h3>
        {SPONSORS.map((sponsor) => (
          <div key={sponsor.name} className="glass-card flex items-center gap-3 p-3">
            <span aria-hidden="true" className="text-2xl">
              {sponsor.icon}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{sponsor.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{sponsor.blurb}</p>
            </div>
            <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Ad
            </span>
          </div>
        ))}
      </section>

      {/* Affiliate deal highlights */}
      <section aria-label="Affiliate deals" className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Hot Deals
        </h3>
        {state.status === 'loading' && (
          <p role="status" className="glass-card p-3 text-sm text-slate-500 dark:text-slate-400">
            Loading deals…
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="glass-card p-3 text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}
        {state.status === 'ready' && state.deals.length === 0 && (
          <p className="glass-card p-3 text-sm text-slate-500 dark:text-slate-400">
            No deals right now — check back soon!
          </p>
        )}
        {state.status === 'ready' &&
          state.deals.map((deal) => (
            <a
              key={deal.dealID}
              href={dealUrl(deal)}
              target="_blank"
              rel="sponsored noopener"
              className="retro-deal glass-card group block p-3 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500"
            >
              <div className="flex items-center gap-3">
                {deal.thumb ? (
                  <img
                    src={deal.thumb}
                    alt=""
                    width={48}
                    height={24}
                    loading="lazy"
                    className="pixel-border h-12 w-auto shrink-0 object-contain"
                  />
                ) : (
                  <span aria-hidden="true" className="text-2xl">
                    🎮
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 group-hover:text-fuchsia-600 dark:text-slate-100 dark:group-hover:text-fuchsia-400">
                    {deal.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="line-through">{formatPrice(deal.normalPrice)}</span>{' '}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatPrice(deal.salePrice)}
                    </span>
                  </p>
                </div>
                <span className="retro-badge ml-auto shrink-0 px-1.5 py-0.5 text-[10px] font-black">
                  -{Math.round(deal.savingsPercent)}%
                </span>
              </div>
            </a>
          ))}
        <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
          Deals are affiliate links — we may earn a commission at no extra cost to you.
        </p>
      </section>
    </aside>
  );
}
