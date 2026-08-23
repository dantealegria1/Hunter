/**
 * BacklogManager view: add/remove/edit backlog entries.
 *
 * Pure presentational component — all state mutations are delegated upward
 * through callbacks so the dashboard owns persistence.
 */

import { useState, type FormEvent } from 'react';
import type { BacklogEntry, Priority } from '../services/planner';
import { remainingHours } from '../services/planner';

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

interface BacklogManagerProps {
  entries: BacklogEntry[];
  onAdd: (entry: BacklogEntry) => void;
  onRemove: (id: string) => void;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-sky-100 text-sky-700 border-sky-200',
};

export default function BacklogManager({ entries, onAdd, onRemove }: BacklogManagerProps) {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = title.trim();
    const parsedHours = Number(hours);
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError('Estimated hours must be a positive number.');
      return;
    }
    setError(null);
    onAdd({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      hoursToBeat: parsedHours,
      priority,
    });
    setTitle('');
    setHours('');
    setPriority('medium');
  }

  return (
    <section aria-labelledby="backlog-heading" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="backlog-heading" className="mb-3 text-lg font-semibold text-slate-800">
        Backlog ({entries.length})
      </h2>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-start gap-2" aria-label="Add backlog entry">
        <label className="flex flex-col text-xs text-slate-500">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Game title"
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Hours
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="e.g. 20"
            className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
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
          className="self-end rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add game
        </button>
      </form>

      {error !== null && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No games in your backlog yet. Add one above.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-slate-800">{entry.title}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {remainingHours(entry)}h remaining of {entry.hoursToBeat}h
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs capitalize ${PRIORITY_STYLES[entry.priority]}`}>
                  {entry.priority}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  aria-label={`Remove ${entry.title}`}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
