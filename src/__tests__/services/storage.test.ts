import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearState,
  exportToJson,
  importFromJson,
  loadState,
  saveState,
  STORAGE_KEY,
  StorageError,
  type AppState,
} from '../../services/storage';
import type { BacklogEntry } from '../../services/planner';

const entry = (overrides: Partial<BacklogEntry> & Pick<BacklogEntry, 'id' | 'title' | 'hoursToBeat'>): BacklogEntry => ({
  priority: 'medium',
  ...overrides,
});

const validState: AppState = {
  entries: [
    entry({ id: 'a', title: 'Hollow Knight', hoursToBeat: 40, priority: 'high' }),
    entry({ id: 'b', title: 'Stardew Valley', hoursToBeat: 80, hoursPlayed: 20 }),
  ],
  settings: { weeklyHours: 12, maxWeeks: 8 },
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveState / loadState round-trip', () => {
  it('persists and restores state under the namespaced key', () => {
    saveState(validState);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(loadState()).toEqual(validState);
  });

  it('returns the default state when nothing is saved', () => {
    const state = loadState();
    expect(state.entries).toEqual([]);
    expect(state.settings.weeklyHours).toBeGreaterThan(0);
  });

  it('overwrites previous saves', () => {
    saveState(validState);
    const updated: AppState = { entries: [], settings: { weeklyHours: 5 } };
    saveState(updated);
    expect(loadState()).toEqual(updated);
  });
});

describe('corrupt data handling', () => {
  it('falls back to defaults on invalid JSON by default', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadState().entries).toEqual([]);
  });

  it('throws a descriptive StorageError on invalid JSON in strict mode', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(() => loadState({ strict: true })).toThrow(StorageError);
  });

  it('rejects schema-invalid payloads (wrong entry shape)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: [{ id: '', title: 'Broken', hoursToBeat: 1, priority: 'high' }],
        settings: { weeklyHours: 5 },
      }),
    );
    expect(() => loadState({ strict: true })).toThrow(StorageError);
    // Non-strict mode degrades gracefully to defaults.
    expect(loadState().entries).toEqual([]);
  });

  it('rejects unknown priorities and bad settings values', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: [],
        settings: { weeklyHours: -3 },
      }),
    );
    expect(loadState()).toEqual({ entries: [], settings: { weeklyHours: expect.any(Number) } });
  });
});

describe('storage availability errors', () => {
  it('surfaces an unavailable-storage failure as StorageError', () => {
    const throwing = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    expect(throwing).toBeDefined();
    expect(() => saveState(validState)).toThrow(StorageError);
    expect(() => loadState()).toThrow(/localStorage is not available/);
  });

  it('surfaces quota failures as StorageError', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    expect(() => saveState(validState)).toThrow(/Failed to persist state/);
    expect(() => saveState(validState)).toThrow(StorageError);
  });
});

describe('clearState', () => {
  it('removes persisted state', () => {
    saveState(validState);
    clearState();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadState().entries).toEqual([]);
  });
});

describe('exportToJson / importFromJson', () => {
  it('round-trips state through an exported JSON string', () => {
    const json = exportToJson(validState);
    expect(importFromJson(json)).toEqual(validState);
  });

  it('includes an exportedAt timestamp without affecting import', () => {
    const json = exportToJson(validState);
    expect(JSON.parse(json).exportedAt).toEqual(expect.any(String));
  });

  it('pretty-prints exports for human-readable backups', () => {
    const json = exportToJson(validState);
    expect(json).toContain('\n');
  });

  it('throws StorageError on malformed import input', () => {
    expect(() => importFromJson('nope{')).toThrow(StorageError);
    expect(() => importFromJson('nope{')).toThrow(/not valid JSON/);
  });

  it('throws StorageError on non-object JSON payloads', () => {
    expect(() => importFromJson('null')).toThrow(/schema/);
    expect(() => importFromJson('42')).toThrow(/schema/);
    expect(() => importFromJson('"a string"')).toThrow(/schema/);
  });

  it('feeds imported state straight into persistence', () => {
    saveState(importFromJson(exportToJson(validState)));
    expect(loadState()).toEqual(validState);
  });

  it('throws StorageError when imported data fails validation', () => {
    expect(() => importFromJson(JSON.stringify({ entries: 'all of them' }))).toThrow(/schema/);
    expect(() =>
      importFromJson(
        JSON.stringify({
          entries: [{ id: 'x', title: 'T', hoursToBeat: 'ten', priority: 'low' }],
          settings: { weeklyHours: 4 },
        }),
      ),
    ).toThrow(/schema/);
  });
});
