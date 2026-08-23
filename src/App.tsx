/**
 * Hunter dashboard: wires the three views together and owns persisted state.
 *
 * State flows: BacklogManager edits the backlog, DealRadar can push deals
 * into it, and RoadmapTimeline renders the plan derived from backlog +
 * settings. Every mutation is persisted to localStorage via storage.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import BacklogManager from './components/BacklogManager';
import DealRadar from './components/DealRadar';
import RoadmapTimeline from './components/RoadmapTimeline';
import type { BacklogEntry } from './services/planner';
import { buildPlayPlan } from './services/planner';
import type { AppState } from './services/storage';
import { loadState, saveState } from './services/storage';

type Theme = 'light' | 'dark';

const THEME_KEY = 'hunter-theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable: fall through to system preference.
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

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
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Reflect the theme on <html class="dark"> and persist the choice.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Non-fatal: theme simply won't survive a reload.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

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
    <div className="theme-transition min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent dark:from-indigo-400 dark:to-violet-400">
              Hunter
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Track your game backlog, plan your playtime, and catch good deals.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="glass-card flex h-10 w-10 items-center justify-center rounded-full text-lg transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>
        </header>

        <BacklogManager entries={state.entries} onAdd={handleAdd} onRemove={handleRemove} />
        <RoadmapTimeline plan={plan} />
        <DealRadar onAddToBacklog={handleAdd} />
      </main>
    </div>
  );
}
