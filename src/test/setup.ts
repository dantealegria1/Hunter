import '@testing-library/jest-dom/vitest';

/**
 * Node >= 22 exposes a `localStorage` global whose backing store is disabled
 * unless launched with `--localstorage-file`, which makes jsdom's
 * `window.localStorage` resolve to `undefined` under Vitest. Install an
 * in-memory polyfill when that happens so storage-dependent code is testable.
 */
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const polyfill = (): Storage => ({
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  });
  const storage = polyfill();
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => storage });
}
