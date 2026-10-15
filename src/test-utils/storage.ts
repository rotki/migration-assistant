/** An in-memory stand-in for the origin private file system, holding one flat folder. */
export interface FakeStorage {
  /** File contents by name. */
  files: Map<string, string>;
  /** Entries removed from the root, in order. */
  removed: string[];
  /** Makes every request for the root fail, as a private window may. */
  refuse: boolean;
  /** Files whose sync access handle cannot be opened, as when another handle holds the lock. */
  locked: Set<string>;
  /** Files whose handle fails to close, as when the last write hits the quota. */
  failClose: Set<string>;
  /** Files with a sync access handle open right now. */
  open: Set<string>;
}

function notFound(name: string): DOMException {
  return new DOMException(`${name} was not found.`, 'NotFoundError');
}

/** Installs a fake `navigator.storage` and returns its state. */
export function installFakeStorage(): FakeStorage {
  const state: FakeStorage = { files: new Map(), removed: [], refuse: false, locked: new Set(), failClose: new Set(), open: new Set() };
  const decoder = new TextDecoder();

  function syncHandle(name: string): object {
    if (state.locked.has(name))
      throw new DOMException(`${name} is locked.`, 'NoModificationAllowedError');
    state.open.add(name);
    return {
      truncate: (): void => {
        state.files.set(name, '');
      },
      write: (bytes: Uint8Array): number => {
        state.files.set(name, (state.files.get(name) ?? '') + decoder.decode(bytes));
        return bytes.length;
      },
      flush: (): void => {},
      close: (): void => {
        state.open.delete(name);
        if (state.failClose.has(name))
          throw new DOMException(`${name} is over the quota.`, 'QuotaExceededError');
      },
    };
  }

  function fileHandle(name: string): object {
    return {
      getFile: async (): Promise<File> => new File([state.files.get(name) ?? ''], name),
      createSyncAccessHandle: async (): Promise<object> => syncHandle(name),
    };
  }

  const directory = {
    getFileHandle: async (name: string, options?: { create?: boolean }): Promise<object> => {
      if (!state.files.has(name)) {
        if (!options?.create)
          throw notFound(name);
        state.files.set(name, '');
      }
      return fileHandle(name);
    },
  };

  const root = {
    getDirectoryHandle: async (): Promise<object> => directory,
    removeEntry: async (name: string): Promise<void> => {
      state.removed.push(name);
      state.files.clear();
    },
  };

  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      getDirectory: async (): Promise<object> => {
        if (state.refuse)
          throw new DOMException('The operation is insecure.', 'SecurityError');
        return root;
      },
    },
  });
  return state;
}
