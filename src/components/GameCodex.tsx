/**
 * GameCodex: left-sidebar information search.
 *
 * Debounced CheapShark title search (>= 3 chars, ~300ms) listing game
 * metadata — release date, reviews, publisher/synopsis where available,
 * and the cheapest current deal. Selecting a result fetches full info
 * via the /games?id endpoint. "Add to backlog" routes through the
 * DurationPromptModal, prefilled from any known playtime data.
 */

import { useEffect, useRef, useState } from 'react';
import {
  searchGames,
  getGameInfo,
  CheapSharkError,
  type GameLookupResult,
  type GameInfo,
} from '../services/cheapshark';
import { lookupGame } from '../services/rawg';
import DurationPromptModal, { DEFAULT_HOURS_TO_BEAT } from './DurationPromptModal';
import type { BacklogEntry } from '../services/planner';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

interface GameCodexProps {
  /** Called after the user confirms a playtime in the duration modal. */
  onAddToBacklog: (entry: BacklogEntry) => void;
  /** Optional shortcut shown next to the cheapest deal price. */
  onOpenDealRadar?: () => void;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'results'; results: GameLookupResult[] };

interface CodexDetails {
  info: GameInfo;
  /** Release year parsed from the cheapest historical-price date when present. */
  releaseYear: number | null;
}

/** Publisher/synopsis are not exposed by CheapShark; show them only when a
 * RAWG enrichment (cover art/playtime) is available as supplementary data. */
export default function GameCodex({ onAddToBacklog, onOpenDealRadar }: GameCodexProps) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [selectedGameID, setSelectedGameID] = useState<string | null>(null);
  const [details, setDetails] = useState<CodexDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [pendingModal, setPendingModal] = useState<{ gameID: string; title: string; initialHours: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced search effect with request cancellation.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      searchGames(trimmed, 8, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setActiveIndex(-1);
          if (results.length === 0) {
            setState({ status: 'empty' });
          } else {
            setState({ status: 'results', results });
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: 'error',
            message:
              error instanceof CheapSharkError
                ? error.message
                : `Failed to search games: ${String(error)}`,
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  // Fetch full metadata for the selected result.
  useEffect(() => {
    if (selectedGameID === null) {
      setDetails(null);
      setDetailsError(null);
      return;
    }
    const controller = new AbortController();
    setDetailsLoading(true);
    setDetailsError(null);
    getGameInfo(selectedGameID, controller.signal)
      .then((info) => {
        if (controller.signal.aborted) return;
        const dateStr = info.info.cheapestPrice?.date ?? null;
        const year = dateStr !== null && dateStr.length >= 4 ? Number(dateStr.slice(0, 4)) : NaN;
        setDetails({ info, releaseYear: Number.isFinite(year) ? year : null });
        setDetailsLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetails(null);
        setDetailsError(
          error instanceof CheapSharkError
            ? error.message
            : `Failed to load game info: ${String(error)}`,
        );
        setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [selectedGameID]);

  function select(game: GameLookupResult): void {
    setSelectedGameID(game.gameID);
  }

  async function startAdd(game: GameLookupResult): Promise<void> {
    setSelectedGameID(game.gameID);
    // Prefill from RAWG playtime data when available; else the 20h fallback.
    let initialHours = DEFAULT_HOURS_TO_BEAT;
    try {
      const enrichment = await lookupGame(game.external);
      if (enrichment?.estimatedHours !== undefined) initialHours = enrichment.estimatedHours;
    } catch {
      // No API key or lookup failure → keep fallback.
    }
    setPendingModal({ gameID: game.gameID, title: game.external, initialHours });
  }

  function confirmAdd(hours: number): void {
    if (pendingModal === null) return;
    onAddToBacklog({
      id: `codex-${pendingModal.gameID}`,
      title: pendingModal.title,
      hoursToBeat: hours,
      priority: 'medium',
      ...(details !== null && details.info.info.thumb
        ? { coverImage: details.info.info.thumb }
        : {}),
    });
    setPendingModal(null);
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    if (state.status !== 'results') return;
    const count = state.results.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, count - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const game = state.results[activeIndex];
      if (game !== undefined) void startAdd(game);
    }
  }

  const selectedResult =
    state.status === 'results'
      ? state.results.find((game) => game.gameID === selectedGameID) ?? null
      : null;

  return (
    <section aria-labelledby="codex-heading" className="glass-card p-5">
      <h2 id="codex-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        <span aria-hidden="true">📚</span>
        Game Codex
      </h2>

      <label htmlFor="codex-search" className="mt-3 flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
        Search games
        <input
          ref={inputRef}
          id="codex-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Hollow Knight"
          className="mt-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
        />
      </label>

      <div aria-live="polite" className="mt-3">
        {state.status === 'idle' && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Type at least {MIN_QUERY_LENGTH} characters to look up game metadata.
          </p>
        )}
        {state.status === 'loading' && (
          <p role="status" className="animate-pulse text-sm text-slate-500 dark:text-slate-400">
            Searching…
          </p>
        )}
        {state.status === 'empty' && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No games match your search.
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}

        {state.status === 'results' && (
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Search results"
            onKeyDown={handleListKeyDown}
            tabIndex={0}
            className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto rounded-xl pr-1"
          >
            {state.results.map((game, index) => (
              <li key={game.gameID} role="option" aria-selected={activeIndex === index}>
                <button
                  type="button"
                  onClick={() => select(game)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full rounded-xl p-2 text-left transition-colors ${
                    activeIndex === index || selectedGameID === game.gameID
                      ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={game.thumb}
                      alt=""
                      loading="lazy"
                      width={36}
                      height={36}
                      className="h-9 w-9 shrink-0 rounded-md bg-slate-100 object-contain dark:bg-slate-800"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">
                      {game.external}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${game.cheapest.toFixed(2)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailsLoading && selectedResult !== null && (
        <p role="status" className="mt-3 animate-pulse text-sm text-slate-500 dark:text-slate-400">
          Loading details…
        </p>
      )}
      {detailsError !== null && (
        <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400">
          {detailsError}
        </p>
      )}

      {details !== null && !detailsLoading && (
        <article aria-label={`Details for ${details.info.info.title}`} className="mt-3 rounded-xl border border-slate-200 bg-white/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{details.info.info.title}</h3>
          <dl className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {details.releaseYear !== null && (
              <div className="flex justify-between gap-2">
                <dt>Release</dt>
                <dd>{details.releaseYear}</dd>
              </div>
            )}
            {details.info.steamRatingText != null && details.info.steamRatingText.length > 0 && (
              <div className="flex justify-between gap-2">
                <dt>Reviews</dt>
                <dd>
                  {details.info.steamRatingText}
                  {details.info.steamRatingPercent != null && ` (${details.info.steamRatingPercent}%)`}
                </dd>
              </div>
            )}
            {details.info.metacriticScore != null && details.info.metacriticScore !== '' && details.info.metacriticScore !== '0' && (
              <div className="flex justify-between gap-2">
                <dt>Metacritic</dt>
                <dd>{details.info.metacriticScore}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt>Cheapest deal now</dt>
              <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${(details.info.deals.reduce((min, d) => (d.price < min ? d.price : min), Infinity)).toFixed(2)}
                {onOpenDealRadar !== undefined && (
                  <button
                    type="button"
                    onClick={onOpenDealRadar}
                    className="ml-2 rounded-md px-1.5 py-px text-[11px] font-semibold text-indigo-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
                  >
                    Deal Radar →
                  </button>
                )}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() =>
              selectedResult !== null &&
              void startAdd({ ...selectedResult, external: details.info.info.title })
            }
            className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500 hover:shadow-md active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            Add to backlog
          </button>
          <p className="mt-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
            Metadata via CheapShark; publisher and synopsis are not provided by this source.
          </p>
        </article>
      )}

      <DurationPromptModal
        open={pendingModal !== null}
        gameTitle={pendingModal?.title ?? ''}
        initialHours={pendingModal?.initialHours ?? DEFAULT_HOURS_TO_BEAT}
        onConfirm={confirmAdd}
        onCancel={() => setPendingModal(null)}
      />
    </section>
  );
}
