(function (Bowtie) {
  const STORAGE_KEY = 'bowtie-diagram.recovery';
  const DEBOUNCE_MS = 2000;

  // The document lives only in memory until the user exports JSON, and
  // the beforeunload guard (UnsavedChangesController) only stops an
  // ACCIDENTAL close -- a crash, a browser restart, or a deliberate
  // "Leave" still loses everything since the last export. So: while the
  // document is dirty, keep the last `toJSON()` in localStorage, and let
  // the start screen offer it back (proposals/04).
  //
  // Deliberately one slot, not one per analysis: the app is
  // single-document, and a second slot only invites "which one?".
  //
  // Debounced rather than per-change -- `toJSON` on a large document is
  // cheap but not free, and a drag fires dozens of changes a second.
  class RecoveryController {
    // `isDirty` is read when the timer FIRES, not when it is scheduled:
    // UnsavedChangesController sets its own flag from the same
    // `onChange`, and nothing here should depend on which listener the
    // model happens to call first.
    constructor(rawModel, { isDirty, debounceMs, onRecovered, onDisabled } = {}) {
      this.model = rawModel;
      this.isDirty = isDirty || (() => true);
      this.onRecovered = onRecovered;
      // Called ONCE, the first time snapshotting stops working
      // (proposals/19). Crash insurance that switches itself off in
      // silence is worse than none, because the user goes on believing
      // it is there.
      this.onDisabled = onDisabled;
      this.debounceMs = debounceMs === undefined ? DEBOUNCE_MS : debounceMs;
      this.timer = null;
      // Set after a failed write: retrying on every subsequent change
      // would just throw again, once per keystroke.
      this.disabled = false;
      // Why, in the user's terms -- the status strip and the dialog both
      // show this rather than inventing their own wording.
      this.disabledReason = null;

      if (rawModel) rawModel.onChange(() => this._schedule());
    }

    _schedule() {
      if (this.disabled) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.isDirty()) this.snapshot();
      }, this.debounceMs);
    }

    // The counts ride along with the document so the start screen can
    // describe the snapshot without parsing the whole thing twice.
    snapshot() {
      if (this.disabled || !this.model) return false;
      const doc = this.model.toJSON();
      const payload = {
        savedAt: new Date().toISOString(),
        name: this.model.name,
        pages: this.model.pages.length,
        nodes: this.model.threats.length + this.model.consequences.length
          + this.model.preventativeBarriers.length + this.model.mitigativeBarriers.length,
        document: doc,
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch (err) {
        this._stop(err);
        return false;
      }
    }

    // A failed write stops the feature -- but it must NOT clear what is
    // already stored (proposals/19). The previous snapshot may be a
    // couple of seconds stale; stale coverage beats none, and the old
    // code's `clear()` threw away the user's last line of defence at the
    // exact moment it stopped being renewed. Only a SUCCESSFUL write
    // replaces a snapshot now.
    //
    // Disabling on any failure, not only QuotaExceededError: if
    // localStorage is blocked outright (a private window, file:// in
    // some browsers) every retry throws too, so retrying every two
    // seconds for the rest of the session achieves nothing. The two
    // cases differ only in what the user is told -- a blocked store is
    // the browser's setting and not something they can act on, whereas
    // a full one means "export to a file now".
    _stop(err) {
      if (this.disabled) return;
      this.disabled = true;
      clearTimeout(this.timer);
      this.disabledReason = err && err.name === 'QuotaExceededError'
        ? 'This document is too large for the browser\'s storage, so it can no longer be saved for recovery.'
        : 'This browser is not allowing local storage, so work cannot be saved for recovery.';
      if (this.onDisabled) this.onDisabled(this.disabledReason);
    }

    // Metadata only (no `document`): what the start screen's card shows.
    // A corrupt or half-written value reads as "no snapshot" rather than
    // throwing on the first paint of the app.
    peek() {
      const stored = this._read();
      if (!stored) return null;
      return {
        savedAt: stored.savedAt,
        name: stored.name,
        pages: stored.pages,
        nodes: stored.nodes,
      };
    }

    load() {
      const stored = this._read();
      return stored ? stored.document : null;
    }

    // Recovering goes through `loadDocument` like any import -- the same
    // shape and schema-version validation, so a snapshot left by an older
    // build of the editor fails the same friendly way a stale export
    // does. `onRecovered` then puts the unsaved-changes guard back: what
    // was just restored still isn't on disk anywhere.
    restore(importExport) {
      const doc = this.load();
      if (!doc) return false;
      const loaded = importExport.loadDocument(doc);
      if (!loaded) return false;
      if (this.onRecovered) this.onRecovered();
      // `loadDocument` runs the ordinary post-import cleanup, which
      // clears this very snapshot -- put it straight back, or a crash
      // between recovering and the first edit would lose the work a
      // second time.
      this.snapshot();
      return true;
    }

    clear() {
      clearTimeout(this.timer);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do -- there is no snapshot to offer either way.
      }
    }

    _read() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.document) return null;
        return parsed;
      } catch {
        return null;
      }
    }

    // "today 16:42" / "yesterday 09:07" / "12 Mar 2026 09:07" -- the card
    // is about how stale the snapshot is, so the recent cases read as
    // relative days rather than a bare date the user has to do
    // arithmetic on.
    static describeTime(iso) {
      const when = new Date(iso);
      if (Number.isNaN(when.getTime())) return '';
      const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const days = Math.round((startOfDay(new Date()) - startOfDay(when)) / 86400000);
      if (days === 0) return `today ${time}`;
      if (days === 1) return `yesterday ${time}`;
      return `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
    }
  }

  RecoveryController.STORAGE_KEY = STORAGE_KEY;
  Bowtie.RecoveryController = RecoveryController;
})(window.Bowtie = window.Bowtie || {});
