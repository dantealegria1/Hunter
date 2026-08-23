/**
 * LocalStorage-backed state manager for the Hunter app.
 *
 * Persists the user's backlog and settings under a single namespaced key,
 * with JSON import/export for backups and defensive validation so corrupt
 * or hostile data never crashes the UI. All storage access goes through
 * this module — nothing else touches `window.localStorage` directly.
 */

import type { BacklogEntry, Priority } from './planner';

/** Root key used for all Hunter persistence. */
export const STORAGE_KEY = 'hunter:app-state:v1';

/** User preferences persisted alongside the backlog. */
export interface AppSettings {
  weeklyHours: number;
  maxWeeks?: number;
}

/** The complete persisted application state. */
export interface AppState {
  entries: BacklogEntry[];
  settings: AppSettings;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePriority(value: unknown): Priority | null {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : null;
}

function parseEntry(value: unknown): BacklogEntry | null {
  if (!isRecord(value)) return null;
  const { id, title, hoursToBeat, priority } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof title !== 'string') return null;
  const parsedPriority = parsePriority(priority);
  if (parsedPriority === null) return null;
  if (typeof hoursToBeat !== 'number' || !Number.isFinite(hoursToBeat) || hoursToBeat < 0) {
    return null;
  }
  const entry: BacklogEntry = { id, title, hoursToBeat, priority: parsedPriority };
  const hoursPlayed = value.hoursPlayed;
  if (
    hoursPlayed !== undefined &&
    (typeof hoursPlayed !== 'number' || !Number.isFinite(hoursPlayed) || hoursPlayed < 0)
  ) {
    return null;
  }
  if (hoursPlayed !== undefined) entry.hoursPlayed = hoursPlayed;
  const coverImage = value.coverImage;
  if (coverImage !== undefined) {
    if (typeof coverImage !== 'string' || coverImage.length === 0) return null;
    entry.coverImage = coverImage;
  }
  return entry;
}

function parseSettings(value: unknown): AppSettings | null {
  if (!isRecord(value)) return null;
  const { weeklyHours } = value;
  if (typeof weeklyHours !== 'number' || !Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    return null;
  }
  const settings: AppSettings = { weeklyHours };
  const maxWeeks = value.maxWeeks;
  if (maxWeeks !== undefined) {
    if (typeof maxWeeks !== 'number' || !Number.isInteger(maxWeeks) || maxWeeks <= 0) {
      return null;
    }
    settings.maxWeeks = maxWeeks;
  }
  return settings;
}

function parseState(value: unknown): AppState | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.entries) || value.settings === undefined) return null;
  const entries: BacklogEntry[] = [];
  for (const raw of value.entries) {
    const entry = parseEntry(raw);
    // One invalid entry invalidates the whole payload rather than silently
    // dropping data the user expects to still be there.
    if (entry === null) return null;
    entries.push(entry);
  }
  const settings = parseSettings(value.settings);
  if (settings === null) return null;
  return { entries, settings };
}

function defaultState(): AppState {
  return { entries: [], settings: { weeklyHours: 10 } };
}

function safeStorage(): Storage {
  try {
    // Merely reading `window.localStorage` throws in browsers where storage
    // is blocked (e.g. all cookies disabled); no write-probe needed.
    const storage = window.localStorage;
    if (!storage) throw new Error('missing');
    return storage;
  } catch {
    throw new StorageError('localStorage is not available in this environment');
  }
}

function serialize(state: AppState): string {
  try {
    return JSON.stringify(state);
  } catch (error) {
    throw new StorageError(`Failed to serialize state: ${String(error)}`);
  }
}

/** Persist the given state. Throws {@link StorageError} on quota/unavailable failures. */
export function saveState(state: AppState): void {
  const storage = safeStorage();
  const json = serialize(state);
  try {
    storage.setItem(STORAGE_KEY, json);
  } catch (error) {
    throw new StorageError(`Failed to persist state: ${String(error)}`);
  }
}

/**
 * Load previously persisted state.
 *
 * Returns the default state when nothing has been saved yet. Corrupt,
 * malformed, or schema-invalid payloads are treated as absent (default
 * state returned) instead of throwing, so a bad write can never brick the
 * app; pass `{ strict: true }` to surface those as {@link StorageError}.
 */
export function loadState(options?: { strict?: boolean }): AppState {
  let raw: string | null;
  try {
    raw = safeStorage().getItem(STORAGE_KEY);
  } catch (error) {
    throw error instanceof StorageError ? error : new StorageError(String(error));
  }
  if (raw === null) return defaultState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (options?.strict) {
      throw new StorageError(`Stored state is not valid JSON: ${String(error)}`);
    }
    return defaultState();
  }

  const state = parseState(parsed);
  if (state === null) {
    if (options?.strict) throw new StorageError('Stored state failed schema validation');
    return defaultState();
  }
  return state;
}

/** Remove all persisted state (used by "reset" flows and tests). */
export function clearState(): void {
  safeStorage().removeItem(STORAGE_KEY);
}

/** Export state to a pretty-printed JSON string suitable for file download. */
export function exportToJson(state: AppState): string {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

/**
 * Import state from a JSON string (file upload or paste).
 * Throws {@link StorageError} with a descriptive message on any failure;
 * imported data is fully validated before being accepted.
 */
export function importFromJson(json: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new StorageError(`Import failed: not valid JSON (${String(error)})`);
  }
  const state = parseState(parsed);
  if (state === null) {
    throw new StorageError('Import failed: data does not match the expected schema');
  }
  return state;
}
