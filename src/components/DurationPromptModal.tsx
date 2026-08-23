/**
 * DurationPromptModal: asks for an estimated playtime before any backlog add.
 *
 * Shown before every flow that creates a backlog entry (manual entry in
 * BacklogManager, '+ Backlog' in DealRadar, 'Add to backlog' in GameCodex).
 * The numeric field is prefilled from known playtime data when available
 * and falls back to 20 hours otherwise.
 *
 * Accessibility contract (docs/spec.md): role="dialog" aria-modal="true",
 * labelled title, focus trapped inside while open, Enter confirms,
 * Escape cancels, and focus is restored to the triggering element on close.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** Default estimate used when no playtime data is known. */
export const DEFAULT_HOURS_TO_BEAT = 20;

export const MIN_HOURS = 0.5;

interface DurationPromptModalProps {
  open: boolean;
  /** Title of the game being added (shown for context). */
  gameTitle: string;
  /** Prefill value: a known estimate or DEFAULT_HOURS_TO_BEAT. */
  initialHours: number;
  /** Called with the confirmed hour value. */
  onConfirm: (hours: number) => void;
  /** Called when the user aborts (Escape, Cancel, overlay click). */
  onCancel: () => void;
}

export default function DurationPromptModal({
  open,
  gameTitle,
  initialHours,
  onConfirm,
  onCancel,
}: DurationPromptModalProps) {
  const [hoursText, setHoursText] = useState(String(initialHours));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Reset the field each time the modal opens and manage focus.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHoursText(String(initialHours));
    // Defer so the element exists after mount/open transition.
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => {
      window.clearTimeout(id);
      restoreFocusRef.current?.focus();
    };
  }, [open, initialHours]);

  function confirm(): void {
    const parsed = Number(hoursText);
    if (!Number.isFinite(parsed) || parsed < MIN_HOURS) return;
    onConfirm(parsed);
  }

  // Keep Tab focus inside the dialog while open.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, button:not([disabled])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  const parsed = Number(hoursText);
  const invalid = !Number.isFinite(parsed) || parsed < MIN_HOURS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="duration-modal-title"
        aria-describedby="duration-modal-description"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-sm p-6 shadow-xl"
      >
        <h2 id="duration-modal-title" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Estimated playtime
        </h2>
        <p id="duration-modal-description" className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          How many hours do you expect{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">{gameTitle}</span> to take?
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          className="mt-4"
        >
          <label htmlFor="duration-modal-input" className="flex flex-col text-xs font-medium text-slate-500 dark:text-slate-400">
            Hours to beat
            <input
              ref={inputRef}
              id="duration-modal-input"
              type="number"
              min={MIN_HOURS}
              step={0.5}
              value={hoursText}
              onChange={(e) => setHoursText(e.target.value)}
              required
              className={`${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-500/30' : ''} mt-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100`}
            />
          </label>
          {invalid && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              Enter at least {MIN_HOURS} hours.
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={invalid}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-indigo-500 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
