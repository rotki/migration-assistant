/**
 * A deployment replaces every hashed asset, so a tab opened before a release asks for chunks that
 * no longer exist. Reloading once picks up the new release; this module decides when to.
 */
import type { Router } from 'vue-router';

const LAST_RELOAD_KEY = 'migration-assistant:stale-build-reload';

/** A second failure this soon after a reload is not a stale tab but a real outage, left to show. */
const RELOAD_COOLDOWN_MS = 60_000;

export interface StaleBuildEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  now: () => number;
  reload: () => void;
}

/**
 * Reloads the page unless it already reloaded for this within {@link RELOAD_COOLDOWN_MS}. Without
 * session storage it reloads once per page, since nothing can be remembered across the reload.
 * Returns whether it reloaded.
 */
export function reloadForNewBuild(environment: StaleBuildEnvironment): boolean {
  const { storage, now, reload } = environment;
  let last: number | undefined;
  try {
    const stored = storage?.getItem(LAST_RELOAD_KEY);
    last = stored ? Number(stored) : undefined;
  }
  catch {}
  if (last !== undefined && now() - last < RELOAD_COOLDOWN_MS)
    return false;
  try {
    storage?.setItem(LAST_RELOAD_KEY, String(now()));
  }
  catch {}
  reload();
  return true;
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return window.sessionStorage;
  }
  catch {
    return undefined;
  }
}

/**
 * Reloads when Vite fails to load a chunk, as Vite's guide recommends for stale deployments. A
 * page chunk fails while the router is still on its way, so the page loads the address it was
 * heading to rather than the one it is leaving. The error is kept from surfacing only when the
 * page is about to reload.
 */
export function watchForNewBuild(router: Router): void {
  let heading: string | undefined;
  router.beforeEach((to) => {
    heading = router.resolve(to).href;
  });
  router.afterEach(() => {
    heading = undefined;
  });
  window.addEventListener('vite:preloadError', (event) => {
    const target = heading;
    const reloading = reloadForNewBuild({
      storage: sessionStorageOrUndefined(),
      now: () => Date.now(),
      reload: () => (target ? window.location.assign(target) : window.location.reload()),
    });
    if (reloading)
      event.preventDefault();
  });
}
