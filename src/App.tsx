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
import GameCodex from './components/GameCodex';
import RetroAdsSidebar from './components/RetroAdsSidebar';
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

  // Sidebar drawer visibility. Only relevant under the xl breakpoint
  // (>1280px shows both sidebars permanently). Toggling a drawer does
  // not affect the grid columns (they are fixed tracks), so there is
  // no layout shift in the center column.
  const [codexOpen, setCodexOpen] = useState(false);
  const [adsOpen, setAdsOpen] = useState(false);

  return (
    <div className="theme-transition min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-6">
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

        {/* Mobile/tablet drawer toggles — hidden on wide screens where both
            sidebars are always visible. */}
        <div className="mt-4 flex gap-2 xl:hidden" role="group" aria-label="Sidebar toggles">
          <button
            type="button"
            onClick={() => {
              setCodexOpen((open) => !open);
              setAdsOpen(false);
            }}
            aria-expanded={codexOpen}
            aria-controls="codex-panel"
            className="glass-card flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            📖 Codex {codexOpen ? '▲' : '▼'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdsOpen((open) => !open);
              setCodexOpen(false);
            }}
            aria-expanded={adsOpen}
            aria-controls="ads-panel"
            className="glass-card flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {'📺 Deals & Ads '}{adsOpen ? '▲' : '▼'}
          </button>
        </div>

        {/* Responsive 3-column dashboard.
            >1280px (xl): Codex | center | Ads, fixed sidebars + fluid center.
            ≤1280px (lg and below): single column; sidebars render as drawers. */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)_300px] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          {/* Left column: Game Codex */}
          <div
            id="codex-panel"
            className={`${codexOpen ? '' : 'hidden '}xl:block`}
          >
            <GameCodex onAddToBacklog={handleAdd} />
          </div>

          {/* Center column: primary views */}
          <main className="min-w-0 space-y-6">
            <BacklogManager entries={state.entries} onAdd={handleAdd} onRemove={handleRemove} />
            <RoadmapTimeline plan={plan} />
            <DealRadar onAddToBacklog={handleAdd} />
          </main>

          {/* Right column: retro ads sidebar */}
          <div id="ads-panel" className={`${adsOpen ? '' : 'hidden '}xl:block`}>
            <RetroAdsSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
