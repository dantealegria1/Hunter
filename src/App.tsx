/**
 * Hunter dashboard: wires the three views together and owns persisted state.
 *
 * State flows: BacklogManager edits the backlog, DealRadar can push deals
 * into it, and RoadmapTimeline renders the plan derived from backlog +
 * settings. Every mutation is persisted to localStorage via storage.ts.
 */

import { useCallback, useMemo, useState } from 'react';
import BacklogManager from './components/BacklogManager';
import DealRadar from './components/DealRadar';
import RoadmapTimeline from './components/RoadmapTimeline';
import type { BacklogEntry } from './services/planner';
import { buildPlayPlan } from './services/planner';
import type { AppState } from './services/storage';
import { loadState, saveState } from './services/storage';

function initialState(): AppState {
  try {
    return loadState();
  } catch {
    // Storage unavailable (blocked/private mode): run in-memory.
    return { entries: [], settings: { weeklyHours: 10 } };
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);

  const persist = useCallback((next: AppState) => {
    setState(next);
    try {
      saveState(next);
    } catch {
      // Persistence failure must not lose the in-memory update; the user
      // simply won't have this change after a reload.
    }
  }, []);

  const handleAdd = useCallback(
    (entry: BacklogEntry) => {
      if (state.entries.some((e) => e.id === entry.id)) return;
      persist({ ...state, entries: [...state.entries, entry] });
    },
    [state, persist],
  );

  const handleRemove = useCallback(
    (id: string) => {
      persist({ ...state, entries: state.entries.filter((e) => e.id !== id) });
    },
    [state, persist],
  );

  const plan = useMemo(() => buildPlayPlan(state.entries, state.settings.weeklyHours), [state]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Hunter</h1>
        <p className="text-sm text-slate-500">
          Track your game backlog, plan your playtime, and catch good deals.
        </p>
      </header>

      <BacklogManager entries={state.entries} onAdd={handleAdd} onRemove={handleRemove} />
      <RoadmapTimeline plan={plan} />
      <DealRadar onAddToBacklog={handleAdd} />
    </main>
  );
}
