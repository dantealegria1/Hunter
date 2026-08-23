/**
 * BacklogManager view: add/remove/edit backlog entries.
 *
 * Pure presentational component — all state mutations are delegated upward
 * through callbacks so the dashboard owns persistence.
 *
 * Every add first routes through DurationPromptModal (docs/spec.md): the
 * manual entry form collects title/priority and then asks for estimated
 * playtime, prefilled from known RAWG data or the entered hours, falling
 * back to 20 hours.
 */

import { useState, type FormEvent } from 'react';
import type { BacklogEntry, Priority } from '../services/planner';
import { remainingHours } from '../services/planner';
import { hasRawgApiKey, lookupGame } from '../services/rawg';
import DurationPromptModal, {
  DEFAULT_HOURS_TO_BEAT,
} from './DurationPromptModal';

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

interface BacklogManagerProps {
  entries: BacklogEntry[];
  onAdd: (entry: BacklogEntry) => void;
  onRemove: (id: string) => void;
}

/** Pending add awaiting duration confirmation in the modal. */
interface PendingAdd {
  title: string;
  priority: Priority;
  initialHours: number;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  low: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400',
};

const INPUT_STYLES =
  'mt-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100';

export default function BacklogManager({ entries, onAdd, onRemove }: BacklogManagerProps) {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = title.trim();
    const parsedHours = Number(hours);
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    setError(null);
    setEnriching(true);
    try {
      // Known playtime (RAWG) prefills the duration prompt; otherwise fall
      // back to the hours typed here, or the 20h default.
      let initialHours = DEFAULT_HOURS_TO_BEAT;
      if (Number.isFinite(parsedHours) && parsedHours > 0) initialHours = parsedHours;
      if (hasRawgApiKey()) {
        const enrichment = await lookupGame(trimmed).catch(() => null);
        if (enrichment?.estimatedHours !== undefined) initialHours = enrichment.estimatedHours;
      }
      setPendingAdd({ title: trimmed, priority, initialHours });
    } finally {
      setEnriching(false);
    }
  }

  function handleConfirm(confirmedHours: number): void {
    if (pendingAdd === null) return;
    onAdd({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: pendingAdd.title,
      hoursToBeat: confirmedHours,
      priority: pendingAdd.priority,
    });
    setPendingAdd(null);
    setTitle('');
    setHours('');
    setPriority('medium');
  }

  return (
    <section aria-labelledby="backlog-heading" className="glass-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="backlog-heading" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Backlog ({entries.length})
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="mb-5 flex flex-wrap items-start gap-3" aria-label="Add backlog entry">
        <label className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Game title"
            className={INPUT_STYLES}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
          Hours
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="auto (RAWG)"
            className={`${INPUT_STYLES} w-28`}
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={`${INPUT_STYLES} capitalize`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-indigo-500 hover:shadow-md active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Add game
        </button>
      </form>
      {enriching && (
        <p role="status" className="mb-3 animate-pulse text-sm text-slate-500 dark:text-slate-400">
          Looking up playtime and cover art…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No games in your backlog yet. Add one above.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map((entry) => (
            <li key={entry.id} className="group flex items-center justify-between gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
              {entry.coverImage ? (
                <img
                  src={entry.coverImage}
                  alt=""
                  loading="lazy"
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover dark:bg-slate-800"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg dark:bg-slate-800"
                >
                  🎮
                </div>
              )}
              <div className="min-w-0">
                <span className="font-medium text-slate-900 dark:text-slate-100">{entry.title}</span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                  {remainingHours(entry)}h remaining of {entry.hoursToBeat}h
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${PRIORITY_STYLES[entry.priority]}`}>
                  {entry.priority}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  aria-label={`Remove ${entry.title}`}
                  className="rounded-md px-2 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DurationPromptModal
        open={pendingAdd !== null}
        gameTitle={pendingAdd?.title ?? ''}
        initialHours={pendingAdd?.initialHours ?? DEFAULT_HOURS_TO_BEAT}
        onConfirm={handleConfirm}
        onCancel={() => setPendingAdd(null)}
      />
    </section>
  );
}
