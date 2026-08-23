/**
 * RoadmapTimeline view: visualises the weekly play plan produced by the
 * planner — a bar chart of weekly hours plus a per-game schedule table with
 * projected finish dates. Includes an interactive hours-per-week slider that
 * re-plans the schedule live via `onWeeklyHoursChange`.
 */

import { useMemo } from 'react';
import type { PlayPlan } from '../services/planner';
import { projectFinishDates, weeklyTotals } from '../services/planner';

interface RoadmapTimelineProps {
  plan: PlayPlan;
  /** Monday-ish anchor date the plan starts from; defaults to today. */
  startDate?: Date;
  /** Called when the user moves the hours-per-week slider (optional). */
  onWeeklyHoursChange?: (hours: number) => void;
}

const SLIDER_MIN = 1;
const SLIDER_MAX = 40;

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function RoadmapTimeline({
  plan,
  startDate = new Date(),
  onWeeklyHoursChange,
}: RoadmapTimelineProps) {
  const totals = useMemo(() => weeklyTotals(plan), [plan]);
  const finishes = useMemo(() => projectFinishDates(plan, startDate), [plan, startDate]);
  const finishById = useMemo(() => new Map(finishes.map((f) => [f.entryId, f.finishDate])), [finishes]);

  const maxHours = totals.reduce((max, t) => Math.max(max, t.hours), 0);

  function handleSliderChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onWeeklyHoursChange?.(Number(event.target.value));
  }

  if (plan.games.length === 0) {
    return (
      <section aria-labelledby="roadmap-heading" className="glass-card p-6">
        <h2 id="roadmap-heading" className="mb-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Roadmap
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Add games to your backlog to see a play roadmap.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="roadmap-heading" className="glass-card p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id="roadmap-heading" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Roadmap
        </h2>
        <div className="flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          <span aria-hidden="true">⏱</span>
          <label htmlFor="weekly-hours-slider" className="cursor-pointer select-none">
            {plan.weeklyHours}h / week
          </label>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {plan.weeks} weeks · {plan.totalAllocatedHours}h scheduled
        {plan.unscheduledHours > 0 && ` · ${plan.unscheduledHours}h beyond horizon`}
      </p>

      {/* Interactive hours-per-week control */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <label htmlFor="weekly-hours-slider" className="mb-3 flex items-baseline justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
          <span>Playtime per week</span>
          <span className="tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">{plan.weeklyHours} hours</span>
        </label>
        <input
          id="weekly-hours-slider"
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          value={plan.weeklyHours}
          onChange={handleSliderChange}
          className="slider"
        />
        <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <span>{SLIDER_MIN}h</span>
          <span>{SLIDER_MAX}h</span>
        </div>
      </div>

      <div role="img" aria-label={`Weekly planned hours across ${totals.length} weeks`} className="mb-6">
        <div className="flex h-28 items-end gap-1.5">
          {totals.map((t) => {
            const pct = maxHours > 0 ? (t.hours / maxHours) * 100 : 0;
            return (
              <div key={t.week} className="group flex flex-1 flex-col items-center justify-end" title={`Week ${t.week + 1}: ${t.hours}h, ${t.gamesPlayed} game(s)`}>
                <span className="mb-1 text-[10px] font-semibold tabular-nums text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500">
                  {t.hours}h
                </span>
                <div
                  data-testid={`week-bar-${t.week}`}
                  className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-violet-500 shadow-sm transition-all duration-200 group-hover:from-indigo-500 group-hover:to-violet-400"
                  style={{ height: `${pct}%`, minHeight: t.hours > 0 ? '4px' : '2px' }}
                />
                <span className="mt-1.5 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{t.week + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <caption className="sr-only">Planned games with schedule and projected finish dates</caption>
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th scope="col" className="py-2 pr-2">Game</th>
            <th scope="col" className="py-2 pr-2">Progress</th>
            <th scope="col" className="py-2 pr-2">Weeks</th>
            <th scope="col" className="py-2">Finish by</th>
          </tr>
        </thead>
        <tbody>
          {plan.games.map((game) => {
            const finish = finishById.get(game.entryId);
            // Share of this game's remaining hours already scheduled.
            const progressPct =
              game.remainingHours > 0 ? Math.min(100, (game.allocatedHours / game.remainingHours) * 100) : 100;
            return (
              <tr key={game.entryId} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-2.5 pr-2 font-medium text-slate-900 dark:text-slate-100">{game.title}</td>
                <td className="py-2.5 pr-2">
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(progressPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${game.title} progress`}
                    className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </td>
                <td className="py-2.5 pr-2 tabular-nums text-slate-600 dark:text-slate-300">
                  {game.startWeek + 1}
                  {game.endWeek !== game.startWeek && `–${game.endWeek + 1}`}
                </td>
                <td className="py-2.5 text-slate-600 dark:text-slate-300">{finish ? formatDate(finish) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
