/**
 * RoadmapTimeline view: visualises the weekly play plan produced by the
 * planner — a bar chart of weekly hours plus a per-game schedule table with
 * projected finish dates.
 */

import { useMemo } from 'react';
import type { PlayPlan } from '../services/planner';
import { projectFinishDates, weeklyTotals } from '../services/planner';

interface RoadmapTimelineProps {
  plan: PlayPlan;
  /** Monday-ish anchor date the plan starts from; defaults to today. */
  startDate?: Date;
}

const BAR_COLOR = 'bg-indigo-500';

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function RoadmapTimeline({ plan, startDate = new Date() }: RoadmapTimelineProps) {
  const totals = useMemo(() => weeklyTotals(plan), [plan]);
  const finishes = useMemo(() => projectFinishDates(plan, startDate), [plan, startDate]);
  const finishById = useMemo(() => new Map(finishes.map((f) => [f.entryId, f.finishDate])), [finishes]);

  const maxHours = totals.reduce((max, t) => Math.max(max, t.hours), 0);

  if (plan.games.length === 0) {
    return (
      <section aria-labelledby="roadmap-heading" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="roadmap-heading" className="mb-2 text-lg font-semibold text-slate-800">
          Roadmap
        </h2>
        <p className="text-sm text-slate-500">Add games to your backlog to see a play roadmap.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="roadmap-heading" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="roadmap-heading" className="mb-1 text-lg font-semibold text-slate-800">
        Roadmap
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        {plan.weeks} weeks · {plan.weeklyHours}h/week · {plan.totalAllocatedHours}h scheduled
        {plan.unscheduledHours > 0 && ` · ${plan.unscheduledHours}h beyond horizon`}
      </p>

      <div role="img" aria-label={`Weekly planned hours across ${totals.length} weeks`} className="mb-6">
        <div className="flex h-28 items-end gap-1">
          {totals.map((t) => (
            <div key={t.week} className="flex flex-1 flex-col items-center justify-end" title={`Week ${t.week + 1}: ${t.hours}h, ${t.gamesPlayed} game(s)`}>
              <div
                data-testid={`week-bar-${t.week}`}
                className={`${BAR_COLOR} w-full rounded-t`}
                style={{ height: `${maxHours > 0 ? (t.hours / maxHours) * 100 : 0}%` }}
              />
              <span className="mt-1 text-[10px] text-slate-400">{t.week + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <caption className="sr-only">Planned games with schedule and projected finish dates</caption>
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-1 pr-2">Game</th>
            <th scope="col" className="py-1 pr-2">Priority</th>
            <th scope="col" className="py-1 pr-2">Remaining</th>
            <th scope="col" className="py-1 pr-2">Weeks</th>
            <th scope="col" className="py-1">Finish by</th>
          </tr>
        </thead>
        <tbody>
          {plan.games.map((game) => {
            const finish = finishById.get(game.entryId);
            return (
              <tr key={game.entryId} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 font-medium text-slate-800">{game.title}</td>
                <td className="py-1.5 pr-2 capitalize text-slate-600">{game.priority}</td>
                <td className="py-1.5 pr-2 text-slate-600">{game.remainingHours}h</td>
                <td className="py-1.5 pr-2 text-slate-600">
                  {game.startWeek + 1}
                  {game.endWeek !== game.startWeek && `–${game.endWeek + 1}`}
                </td>
                <td className="py-1.5 text-slate-600">{finish ? formatDate(finish) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
