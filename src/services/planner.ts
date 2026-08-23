/**
 * Backlog calculation engine.
 *
 * Pure functions that take a player's backlog plus an availability budget and
 * produce a deterministic play plan: games ordered by priority, with weekly
 * time distribution and projected finish dates. No side effects, no I/O —
 * trivially unit-testable.
 */

/** How urgently a backlog entry should be scheduled relative to others. */
export type Priority = 'high' | 'medium' | 'low';

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** A single game in the user's backlog. */
export interface BacklogEntry {
  /** Stable unique identifier (e.g. CheapShark dealID or a local UUID). */
  id: string;
  title: string;
  /** Estimated hours required to finish (or "complete") the game. */
  hoursToBeat: number;
  priority: Priority;
  /** Official cover art URL (fetched from RAWG), when known. */
  coverImage?: string;
  /** Hours already invested; reduces remaining work. */
  hoursPlayed?: number;
}

/** A weekly slice of planned playtime for one game. */
export interface PlanSlice {
  entryId: string;
  title: string;
  /** Zero-based week index from the start of the plan. */
  week: number;
  /** Hours allocated to this game in this week (> 0). */
  hours: number;
}

/** One scheduled game with its aggregated plan data. */
export interface PlannedGame {
  entryId: string;
  title: string;
  priority: Priority;
  remainingHours: number;
  startWeek: number;
  endWeek: number;
  /** Total hours this game receives across all weeks (equals remainingHours unless truncated). */
  allocatedHours: number;
  slices: PlanSlice[];
}

/** The full result of planning a backlog against a weekly budget. */
export interface PlayPlan {
  weeks: number;
  weeklyHours: number;
  games: PlannedGame[];
  slices: PlanSlice[];
  /** Sum of all allocated hours across every game and week. */
  totalAllocatedHours: number;
  /**
   * Hours of backlog work that did not fit into the returned plan window
   * (only non-zero when `maxWeeks` truncates the plan).
   */
  unscheduledHours: number;
}

export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PlannerError(`${name} must be a positive finite number, got ${value}`);
  }
}

function priorityWeight(priority: Priority): number {
  return PRIORITY_WEIGHT[priority];
}

/**
 * Order backlog entries for scheduling: higher priority first, then less
 * remaining work first (quick wins), then stable alphabetical tie-break so
 * plans are deterministic.
 */
export function sortBacklog(entries: BacklogEntry[]): BacklogEntry[] {
  return [...entries].sort((a, b) => {
    const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (weightDiff !== 0) return weightDiff;
    const remainingA = Math.max(0, a.hoursToBeat - (a.hoursPlayed ?? 0));
    const remainingB = Math.max(0, b.hoursToBeat - (b.hoursPlayed ?? 0));
    if (remainingA !== remainingB) return remainingA - remainingB;
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}

/** Remaining hours for an entry, clamped at zero when overplayed. */
export function remainingHours(entry: BacklogEntry): number {
  return Math.max(0, entry.hoursToBeat - (entry.hoursPlayed ?? 0));
}

/**
 * Build a weekly play plan.
 *
 * Games are scheduled strictly one after another (no parallel play),
 * highest priority first. Each week receives `weeklyHours` of playtime;
 * the final week of a game only receives its remainder.
 *
 * @param entries Backlog entries to schedule.
 * @param weeklyHours Playtime available per week (must be > 0).
 * @param maxWeeks Optional cap on the plan horizon. Work beyond it is
 *   reported via `unscheduledHours` instead of being dropped silently.
 */
export function buildPlayPlan(
  entries: BacklogEntry[],
  weeklyHours: number,
  maxWeeks?: number,
): PlayPlan {
  assertPositive('weeklyHours', weeklyHours);
  if (maxWeeks !== undefined) assertPositive('maxWeeks', maxWeeks);

  const games: PlannedGame[] = [];
  const slices: PlanSlice[] = [];
  let cursorWeek = 0;
  let hoursLeftThisWeek = weeklyHours;
  let totalAllocatedHours = 0;
  let unscheduledHours = 0;

  for (const entry of sortBacklog(entries)) {
    const remaining = remainingHours(entry);
    if (remaining === 0) continue;

    if (maxWeeks !== undefined && cursorWeek >= maxWeeks) {
      unscheduledHours += remaining;
      continue;
    }

    const gameSlices: PlanSlice[] = [];
    let hoursToSchedule = remaining;
    let startWeek = cursorWeek;
    let endWeek = cursorWeek;

    while (hoursToSchedule > 0) {
      if (maxWeeks !== undefined && cursorWeek >= maxWeeks) {
        // Horizon reached mid-game: everything left counts as unscheduled.
        unscheduledHours += hoursToSchedule;
        break;
      }
      const allocation = Math.min(hoursLeftThisWeek, hoursToSchedule);
      const slice: PlanSlice = {
        entryId: entry.id,
        title: entry.title,
        week: cursorWeek,
        hours: round2(allocation),
      };
      gameSlices.push(slice);
      slices.push(slice);
      totalAllocatedHours += allocation;
      hoursToSchedule -= allocation;
      hoursLeftThisWeek -= allocation;
      endWeek = cursorWeek;

      if (hoursLeftThisWeek <= 1e-9) {
        cursorWeek += 1;
        hoursLeftThisWeek = weeklyHours;
      }
    }

    games.push({
      entryId: entry.id,
      title: entry.title,
      priority: entry.priority,
      remainingHours: remaining,
      startWeek,
      endWeek,
      allocatedHours: round2(remaining - Math.max(0, hoursToSchedule)),
      slices: gameSlices,
    });
  }

  const hasActivity = games.length > 0;
  return {
    // Total weeks the plan spans; an empty backlog spans zero weeks.
    weeks: maxWeeks ?? (hasActivity ? cursorWeek + 1 : 0),
    weeklyHours,
    games,
    slices,
    totalAllocatedHours: round2(totalAllocatedHours),
    unscheduledHours: round2(unscheduledHours),
  };
}

/**
 * Aggregate a plan into per-week totals, useful for rendering a timeline.
 * Weeks with no activity are still present with zeroed totals up to the
 * last active week.
 */
export function weeklyTotals(plan: PlayPlan): Array<{
  week: number;
  hours: number;
  gamesPlayed: number;
}> {
  const totals = new Map<number, { week: number; hours: number; gamesPlayed: number }>();
  for (const slice of plan.slices) {
    const current = totals.get(slice.week) ?? { week: slice.week, hours: 0, gamesPlayed: 0 };
    current.hours += slice.hours;
    current.gamesPlayed += 1;
    totals.set(slice.week, current);
  }
  const maxWeek = plan.slices.reduce((max, s) => Math.max(max, s.week), -1);
  const result: Array<{ week: number; hours: number; gamesPlayed: number }> = [];
  for (let week = 0; week <= maxWeek; week += 1) {
    result.push(totals.get(week) ?? { week, hours: 0, gamesPlayed: 0 });
  }
  return result.map((entry) => ({ ...entry, hours: round2(entry.hours) }));
}

/** Projected calendar finish date for each planned game, given a start date. */
export function projectFinishDates(
  plan: PlayPlan,
  startDate: Date,
): Array<{ entryId: string; title: string; finishDate: Date }> {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return plan.games.map((game) => ({
    entryId: game.entryId,
    title: game.title,
    // The game finishes sometime during its final week.
    finishDate: new Date(startDate.getTime() + (game.endWeek + 1) * msPerWeek),
  }));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
