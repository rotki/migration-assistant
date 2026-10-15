import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { reloadForNewBuild, type StaleBuildEnvironment, watchForNewBuild } from './stale-build';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key): string | null => items.get(key) ?? null,
    setItem: (key, value): void => {
      items.set(key, value);
    },
  };
}

function environment(time: { now: number }, storage: StaleBuildEnvironment['storage'] = memoryStorage()): StaleBuildEnvironment & { reloads: number } {
  const env = {
    storage,
    now: (): number => time.now,
    reloads: 0,
    reload: (): void => {
      env.reloads++;
    },
  };
  return env;
}

describe('reloadForNewBuild', () => {
  it('reloads once, and not again while a reload just happened', () => {
    const time = { now: 1_000_000 };
    const env = environment(time);
    expect(reloadForNewBuild(env)).toBe(true);
    time.now += 5_000;
    expect(reloadForNewBuild(env)).toBe(false);
    expect(env.reloads).toBe(1);
  });

  it('reloads again for a later release', () => {
    const time = { now: 1_000_000 };
    const env = environment(time);
    reloadForNewBuild(env);
    time.now += 61_000;
    expect(reloadForNewBuild(env)).toBe(true);
    expect(env.reloads).toBe(2);
  });

  it('still reloads when session storage is missing or refuses', () => {
    const refusing: StaleBuildEnvironment['storage'] = {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    };
    expect(reloadForNewBuild(environment({ now: 0 }, undefined))).toBe(true);
    expect(reloadForNewBuild(environment({ now: 0 }, refusing))).toBe(true);
  });
});

describe('watchForNewBuild', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  function router(): Router {
    return createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] });
  }

  it('reloads on a chunk that fails to load and keeps the error from surfacing', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    watchForNewBuild(router());
    const first = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    // Failing again right after the reload is an outage: the error is left to show.
    const second = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(second);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });
});
