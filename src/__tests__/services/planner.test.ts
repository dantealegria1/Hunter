import { describe, expect, it } from 'vitest';
import {
  buildPlayPlan,
  PlannerError,
  projectFinishDates,
  remainingHours,
  sortBacklog,
  weeklyTotals,
  type BacklogEntry,
} from '../../services/planner';

const entry = (overrides: Partial<BacklogEntry> & Pick<BacklogEntry, 'id' | 'title' | 'hoursToBeat'>): BacklogEntry => ({
  priority: 'medium',
  ...overrides,
});

describe('sortBacklog', () => {
  it('orders by priority high > medium > low', () => {
    const sorted = sortBacklog([
      entry({ id: 'a', title: 'A', hoursToBeat: 10, priority: 'low' }),
      entry({ id: 'b', title: 'B', hoursToBeat: 10, priority: 'high' }),
      entry({ id: 'c', title: 'C', hoursToBeat: 10, priority: 'medium' }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks priority ties with shorter remaining playtime first', () => {
    const sorted = sortBacklog([
      entry({ id: 'long', title: 'Long', hoursToBeat: 60 }),
      entry({ id: 'short', title: 'Short', hoursToBeat: 5 }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['short', 'long']);
  });

  it('accounts for hours already played when computing remaining time', () => {
    const sorted = sortBacklog([
      entry({ id: 'fresh', title: 'Fresh', hoursToBeat: 20 }),
      entry({ id: 'started', title: 'Started', hoursToBeat: 30, hoursPlayed: 25 }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['started', 'fresh']);
  });

  it('does not mutate the input array and is deterministic on full ties', () => {
    const input = [
      entry({ id: 'b', title: 'Same', hoursToBeat: 10 }),
      entry({ id: 'a', title: 'Same', hoursToBeat: 10 }),
    ];
    const sorted = sortBacklog(input);
    expect(input).not.toBe(sorted);
    expect(sorted.map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('remainingHours', () => {
  it('subtracts played hours', () => {
    expect(remainingHours(entry({ id: 'x', title: 'X', hoursToBeat: 40, hoursPlayed: 15 }))).toBe(25);
  });

  it('clamps at zero for overplayed entries', () => {
    expect(remainingHours(entry({ id: 'x', title: 'X', hoursToBeat: 10, hoursPlayed: 50 }))).toBe(0);
  });
});

describe('buildPlayPlan', () => {
  it('rejects non-positive weekly budgets', () => {
    expect(() => buildPlayPlan([], 0)).toThrow(PlannerError);
    expect(() => buildPlayPlan([], -5)).toThrow(PlannerError);
  });

  it('returns an empty plan for an empty backlog', () => {
    const plan = buildPlayPlan([], 10);
    expect(plan.games).toEqual([]);
    expect(plan.slices).toEqual([]);
    expect(plan.weeks).toBe(0);
    expect(plan.totalAllocatedHours).toBe(0);
  });

  it('skips fully completed entries', () => {
    const plan = buildPlayPlan([entry({ id: 'done', title: 'Done', hoursToBeat: 10, hoursPlayed: 10 })], 5);
    expect(plan.games).toHaveLength(0);
    expect(plan.weeks).toBe(0);
  });

  it('allocates exactly weeklyHours per week and a remainder in the final week', () => {
    const plan = buildPlayPlan([entry({ id: 'zelda', title: 'Zelda', hoursToBeat: 35 })], 10);
    // 3 full weeks of 10h + final week of 5h.
    expect(plan.slices).toHaveLength(4);
    expect(plan.slices.slice(0, 3).map((s) => s.hours)).toEqual([10, 10, 10]);
    expect(plan.slices[3]).toMatchObject({ week: 3, hours: 5 });
    expect(plan.weeks).toBe(4);
    expect(plan.totalAllocatedHours).toBe(35);
  });

  it('schedules games sequentially by priority without overlapping weeks', () => {
    const plan = buildPlayPlan(
      [
        entry({ id: 'low', title: 'Low Game', hoursToBeat: 10, priority: 'low' }),
        entry({ id: 'high', title: 'High Game', hoursToBeat: 20, priority: 'high' }),
      ],
      10,
    );
    expect(plan.games.map((g) => g.entryId)).toEqual(['high', 'low']);
    expect(plan.games[0]).toMatchObject({ startWeek: 0, endWeek: 1, allocatedHours: 20 });
    expect(plan.games[1]).toMatchObject({ startWeek: 2, endWeek: 2, allocatedHours: 10 });
  });

  it('packs partial weeks across game boundaries', () => {
    // 7 + 8 = 15h fits into one 10h week? No — but 7h then 3h of next game share week 0.
    const plan = buildPlayPlan(
      [
        entry({ id: 'first', title: 'First', hoursToBeat: 7, priority: 'high' }),
        entry({ id: 'second', title: 'Second', hoursToBeat: 8 }),
      ],
      10,
    );
    const week0 = plan.slices.filter((s) => s.week === 0);
    expect(week0.map((s) => s.hours)).toEqual([7, 3]);
    expect(plan.games[1]).toMatchObject({ startWeek: 0, endWeek: 1 });
    expect(plan.totalAllocatedHours).toBeCloseTo(15);
  });

  it('reports unscheduled work beyond the horizon instead of dropping it', () => {
    const plan = buildPlayPlan(
      [
        entry({ id: 'big', title: 'Big', hoursToBeat: 45, priority: 'high' }),
        entry({ id: 'cut', title: 'Cut', hoursToBeat: 12 }),
      ],
      10,
      4,
    );
    // Horizon is 40h; big fills it entirely (40h scheduled, 5h unscheduled), cut gets nothing.
    expect(plan.totalAllocatedHours).toBe(40);
    expect(plan.unscheduledHours).toBe(17);
    expect(plan.games[0]!.allocatedHours).toEqual(40);
  });

  it('truncates a game mid-way at the horizon boundary', () => {
    const plan = buildPlayPlan(
      [
        entry({ id: 'a', title: 'A', hoursToBeat: 6, priority: 'high' }),
        entry({ id: 'b', title: 'B', hoursToBeat: 20, priority: 'medium' }),
      ],
      10,
      1,
    );
    // Week 0: 6h of A + 4h of B; remaining 16h of B unscheduled.
    expect(plan.slices).toHaveLength(2);
    expect(plan.unscheduledHours).toBe(16);
    expect(plan.games[1]!.allocatedHours).toBe(4);
  });
});

describe('weeklyTotals', () => {
  it('aggregates hours per week and counts games played', () => {
    const plan = buildPlayPlan(
      [
        entry({ id: 'first', title: 'First', hoursToBeat: 7, priority: 'high' }),
        entry({ id: 'second', title: 'Second', hoursToBeat: 13 }),
      ],
      10,
    );
    expect(weeklyTotals(plan)).toEqual([
      { week: 0, hours: 10, gamesPlayed: 2 },
      { week: 1, hours: 10, gamesPlayed: 1 },
    ]);
  });

  it('includes idle weeks as zeroed rows', () => {
    const plan = buildPlayPlan(
      [
        entry({ id: 'a', title: 'A', hoursToBeat: 9, priority: 'high' }),
        entry({ id: 'b', title: 'B', hoursToBeat: 11, priority: 'low' }),
      ],
      10,
    );
    // A (9h) fits inside week 0; B starts the same week with the leftover hour.
    expect(weeklyTotals(plan)).toEqual([
      { week: 0, hours: 10, gamesPlayed: 2 },
      { week: 1, hours: 10, gamesPlayed: 1 },
    ]);
  });
});

describe('projectFinishDates', () => {
  it('projects finish dates one week past each game’s endWeek', () => {
    const start = new Date('2026-01-05T00:00:00Z');
    const plan = buildPlayPlan(
      [
        entry({ id: 'short', title: 'Short', hoursToBeat: 10, priority: 'high' }),
        entry({ id: 'longer', title: 'Longer', hoursToBeat: 20 }),
      ],
      10,
    );
    const dates = projectFinishDates(plan, start);
    expect(dates[0]).toMatchObject({ entryId: 'short' });
    expect(dates[0]?.finishDate.toISOString()).toBe('2026-01-12T00:00:00.000Z');
    expect(dates[1]?.finishDate.toISOString()).toBe('2026-01-26T00:00:00.000Z');
  });
});
