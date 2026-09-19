(function (Bowtie) {
  const DB_NAME = 'bowtie-diagram';
  const DB_VERSION = 1;
  const STORE = 'recent';
  const LIMIT = 5;

  // A returning user should not have to browse for last week's file every
  // time (proposals/04). A FileSystemFileHandle is structured-cloneable,
  // so IndexedDB can keep the actual handle -- clicking an entry re-opens
  // THAT file, not a remembered name we'd have no way to resolve.
  //
  // Which is also why this is conditional: without the File System Access
  // API (Firefox, Safari, a page opened over file://) there is nothing to
  // remember but a name, and a list of names that can't be opened is
  // worse than no list. Every method is a safe no-op there, and `list()`
  // resolves `[]`, so the start screen simply renders nothing.
  class RecentFilesController {
    constructor() {
      this.supported = Boolean(window.indexedDB && window.showOpenFilePicker);
    }

    _open() {
      if (!this.supported) return Promise.resolve(null);
      return new Promise((resolve) => {
        let request;
        try {
          request = window.indexedDB.open(DB_NAME, DB_VERSION);
        } catch {
          resolve(null);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        // A blocked or failed open (private browsing, a corrupt profile)
        // is not worth surfacing -- the feature just isn't available.
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      });
    }

    _tx(mode, run) {
      return this._open().then((db) => {
        if (!db) return null;
        return new Promise((resolve) => {
          let store;
          try {
            store = db.transaction(STORE, mode).objectStore(STORE);
          } catch {
            db.close();
            resolve(null);
            return;
          }
          let request;
          try {
            request = run(store);
          } catch {
            // A value that won't structured-clone (anything but a real
            // FileSystemFileHandle) throws right here, synchronously,
            // rather than through the request's own error event.
            db.close();
            resolve(null);
            return;
          }
          request.onsuccess = () => { db.close(); resolve(request.result); };
          request.onerror = () => { db.close(); resolve(null); };
        });
      });
    }

    // Keyed by name rather than by an auto id: re-saving the same file
    // should move its entry up the list, not add a second one. (Two
    // different directories holding a same-named file collapse into one
    // entry -- the price of not being able to read a handle's path.)
    async remember(handle) {
      if (!this.supported || !handle || !handle.name) return;
      await this._tx('readwrite', (store) => store.put({
        key: handle.name, name: handle.name, handle, openedAt: new Date().toISOString(),
      }));
      await this._prune();
    }

    // The store is never read beyond the newest LIMIT entries, so the
    // rest are just a slowly growing pile of stale handles.
    async _prune() {
      const all = await this._tx('readonly', (store) => store.getAll());
      if (!all || all.length <= LIMIT) return;
      const stale = all
        .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)))
        .slice(LIMIT);
      await Promise.all(stale.map((entry) => this.forget(entry.key)));
    }

    async list() {
      if (!this.supported) return [];
      const all = await this._tx('readonly', (store) => store.getAll());
      if (!all) return [];
      return all
        .filter((entry) => entry && entry.handle)
        .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)))
        .slice(0, LIMIT);
    }

    async forget(name) {
      if (!this.supported) return;
      await this._tx('readwrite', (store) => store.delete(name));
    }

    // Reads an entry's file, re-requesting permission first: a handle
    // survives a browser restart but its permission grant does not, so
    // the user is asked once per session per file. Resolves the file's
    // text, or null when permission was refused or the file has since
    // been moved/deleted (in which case the entry is dropped, so a dead
    // row doesn't sit in the list forever).
    async read(entry) {
      if (!entry || !entry.handle) return null;
      const { handle } = entry;
      try {
        if (handle.queryPermission) {
          let state = await handle.queryPermission({ mode: 'read' });
          if (state !== 'granted' && handle.requestPermission) {
            state = await handle.requestPermission({ mode: 'read' });
          }
          if (state !== 'granted') return null;
        }
        const file = await handle.getFile();
        const text = await file.text();
        await this.remember(handle); // re-opening it makes it the most recent
        return text;
      } catch {
        await this.forget(entry.key || entry.name);
        return null;
      }
    }
  }

  RecentFilesController.DB_NAME = DB_NAME;
  RecentFilesController.STORE = STORE;
  Bowtie.RecentFilesController = RecentFilesController;
})(window.Bowtie = window.Bowtie || {});
