(function (Bowtie) {
  const MAX_STACK = 50;

  // Resolves which page a per-page mutating method call affects, given its
  // own arguments — resolved BEFORE the call runs, since several of these
  // (deleteElement, renameElement) mutate or remove the very element being
  // looked up. Each resolver reads whichever argument names the
  // anchor/element/line this particular method is scoped to.
  // addCause/addOutcome don't need a findById lookup: PageScopedModel
  // always injects `pageId` directly into their opts before the call ever
  // reaches this proxy. Callers that predate multi-page support (every
  // existing test included) omit it instead, relying on BowtieModel's own
  // default-to-first-page fallback (`_resolvePageId`) — mirrored here so
  // this resolves to the exact same page the real call is about to use,
  // rather than skipping the snapshot for lack of an explicit pageId.
  const PAGE_RESOLVERS = {
    addCause: (rawModel, args) => (args[0] && args[0].pageId) || rawModel.pages[0].id,
    addOutcome: (rawModel, args) => (args[0] && args[0].pageId) || rawModel.pages[0].id,
    addPreventativeControl: (rawModel, args) => rawModel.findById(args[0]).pageId,
    addMitigativeControl: (rawModel, args) => rawModel.findById(args[0]).pageId,
    insertBarrier: (rawModel, args) => rawModel.findById(args[2]).pageId,
    attachExistingBarrier: (rawModel, args) => rawModel.findById(args[2]).pageId,
    attachInputToPreventativeControl: (rawModel, args) => rawModel.findById(args[0]).pageId,
    attachOutputToMitigativeControl: (rawModel, args) => rawModel.findById(args[0]).pageId,
    // Lines aren't part of findById's element system (see BowtieModel.js) —
    // look the line up directly for its own pageId instead.
    connectLineDirectlyToTle: (rawModel, args) => {
      const line = rawModel.lines.find((l) => l.id === args[0]);
      return line ? line.pageId : null;
    },
    deleteElement: (rawModel, args) => rawModel.findById(args[0]).pageId,
    renameElement: (rawModel, args) => rawModel.findById(args[0]).pageId,
    // Every current call site (AutoArrangeController, wired through
    // PageScopedModel) only ever touches one page's elements per call, so
    // the first update's own page stands in for the whole batch.
    setPositions: (rawModel, args) => {
      const first = args[0][0];
      return first ? rawModel.findById(first.id).pageId : null;
    },
  };

  // Genuinely document-wide mutations — one whole-document snapshot each,
  // the same mechanism every mutating method used before this file grew
  // page-awareness. `deletePage` in particular removes a page's entire
  // content, not just its header, so its undo has to be a full
  // whole-document restore regardless — an inherent property of a
  // document-structural operation, not a gap in the per-page design below.
  const DOCUMENT_METHODS = [
    'addPage', 'deletePage', 'renamePage',
    'reEnableId', 'disableRetiredId', 'reassignId', 'setName',
  ];

  // Wraps `model` in a Proxy that snapshots immediately before any call to
  // one of the methods above — every "add a barrier", "rename", "attach",
  // "add a page", etc. becomes one undo step automatically, with no changes
  // needed in the controllers that already call these methods on `model`.
  // Everything else (property reads, non-mutating methods) passes through
  // untouched, so existing code like `this.model.causes` or
  // `this.model.findById(id)` keeps working exactly as before.
  //
  // Undo/redo runs on two independent tiers rather than one shared stack:
  // a per-page content stack per page (`Map<pageId, {undoStack, redoStack}>`,
  // each holding that page's own `BowtieModel.getPageJSON()` snapshots) plus
  // one document-level stack (whole-document `toJSON()` snapshots) for the
  // structural mutations in DOCUMENT_METHODS. This is what keeps undo/redo
  // on one page from ever being able to affect another page's content, even
  // with interleaved editing across pages — a single shared stack, even one
  // just filtered by page tag, could restore an old whole-document snapshot
  // that silently reverts a different page's edits made since.
  //
  // A single Undo/Redo button pair still drives both tiers: every pushed
  // snapshot (either tier, either direction) gets a monotonically
  // increasing `seq`, and undo()/redo() each compare the top of the
  // *active* page's own stack against the top of the document stack,
  // acting on whichever is more recent — so "hit Undo" still means "undo my
  // last action" regardless of which tier it lived in. Switching pages is
  // itself never an undo step — nothing about a page switch pushes to
  // either stack.
  //
  // `undoController.model` (the proxy) is what every other controller and
  // the view should be constructed with; `undoController.rawModel` is the
  // real BowtieModel instance, used only by this file for snapshotting and
  // restoration.
  class UndoController {
    constructor(model, buttons) {
      this.rawModel = model;
      this.undoBtn = buttons.undoBtn;
      this.redoBtn = buttons.redoBtn;

      // Placeholder until `bindActivePage` is called (see main.js, right
      // after PageTabsController is constructed) — nothing calls
      // undo()/redo()/snapshot() before the app finishes wiring up, so this
      // is never actually exercised, but a real fallback (rather than
      // throwing) keeps this class usable on its own without that wiring.
      this.getActivePageId = () => this.rawModel.pages[0].id;

      this.pageStacks = new Map(); // pageId -> { undoStack: [], redoStack: [] }
      this.documentUndoStack = [];
      this.documentRedoStack = [];
      this.seq = 0;

      this.model = new Proxy(model, {
        get: (target, prop) => {
          const value = target[prop];
          if (typeof value !== 'function') return value;
          if (DOCUMENT_METHODS.includes(prop)) {
            return (...args) => this._runDocumentScoped(target, value, args);
          }
          if (PAGE_RESOLVERS[prop]) {
            return (...args) => this._runPageScoped(prop, target, value, args);
          }
          return value.bind(target);
        },
      });

      this.undoBtn.addEventListener('click', () => this.undo());
      this.redoBtn.addEventListener('click', () => this.redo());
      document.addEventListener('keydown', (e) => this._onKeyDown(e));

      this._refreshButtons();
    }

    // Called once from main.js, right after PageTabsController exists — see
    // the constructor's placeholder comment above for why this isn't a
    // constructor argument instead (constructing PageTabsController itself
    // requires `undo.model` to already exist, so it can't come first).
    bindActivePage(getActivePageId) {
      this.getActivePageId = getActivePageId;
    }

    _onKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // let native text-field undo work
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        this.redo();
      }
    }

    _pageStack(pageId) {
      if (!this.pageStacks.has(pageId)) this.pageStacks.set(pageId, { undoStack: [], redoStack: [] });
      return this.pageStacks.get(pageId);
    }

    _nextSeq() {
      this.seq += 1;
      return this.seq;
    }

    _runPageScoped(methodName, target, fn, args) {
      // A resolution failure (e.g. an invalid id the real method is about
      // to reject anyway) shouldn't pre-empt that method's own, friendlier
      // error — fall back to "no page, don't snapshot" and let the call
      // below throw its own domain error instead of a raw TypeError here.
      let pageId;
      try {
        pageId = PAGE_RESOLVERS[methodName](target, args);
      } catch {
        pageId = null;
      }
      const before = pageId != null ? this.rawModel.getPageJSON(pageId) : null;
      // Only reached if the call above didn't throw — several of these
      // throw on invalid input (e.g. a cycle), called via `_safeAttach`'s
      // try/catch specifically so the model stays unchanged; an undo entry
      // for a mutation that never happened would be a no-op step wasting a
      // stack slot.
      const result = fn.apply(target, args);
      if (pageId != null) this._pushPageUndo(pageId, before);
      return result;
    }

    _runDocumentScoped(target, fn, args) {
      const before = this.rawModel.toJSON();
      const result = fn.apply(target, args);
      this._pushDocumentUndo(before);
      return result;
    }

    _pushPageUndo(pageId, json) {
      const stack = this._pageStack(pageId);
      stack.undoStack.push({ seq: this._nextSeq(), json });
      if (stack.undoStack.length > MAX_STACK) stack.undoStack.shift();
      stack.redoStack = [];
      this._refreshButtons();
    }

    _pushDocumentUndo(json) {
      this.documentUndoStack.push({ seq: this._nextSeq(), json });
      if (this.documentUndoStack.length > MAX_STACK) this.documentUndoStack.shift();
      this.documentRedoStack = [];
      this._refreshButtons();
    }

    // Called explicitly by DragController once per drag gesture (on
    // pointerdown, before the first move), since `moveElement` itself is
    // excluded from the generic proxy hook above — there is nothing to
    // "fail" about starting a drag, so this pushes unconditionally. Scoped
    // to whichever page is being dragged on: main.js passes the active
    // page id at the moment the drag starts (the only page DragController,
    // wired through PageScopedModel, could possibly be touching).
    snapshot(pageId) {
      this._pushPageUndo(pageId, this.rawModel.getPageJSON(pageId));
    }

    canUndo() {
      return this._pageStack(this.getActivePageId()).undoStack.length > 0 || this.documentUndoStack.length > 0;
    }

    canRedo() {
      return this._pageStack(this.getActivePageId()).redoStack.length > 0 || this.documentRedoStack.length > 0;
    }

    undo() {
      const pageId = this.getActivePageId();
      const pageStack = this._pageStack(pageId);
      const pageTop = pageStack.undoStack[pageStack.undoStack.length - 1];
      const docTop = this.documentUndoStack[this.documentUndoStack.length - 1];
      if (!pageTop && !docTop) return;

      if (docTop && (!pageTop || docTop.seq > pageTop.seq)) {
        this.documentUndoStack.pop();
        this.documentRedoStack.push({ seq: this._nextSeq(), json: this.rawModel.toJSON() });
        if (this.documentRedoStack.length > MAX_STACK) this.documentRedoStack.shift();
        this.rawModel.loadFromJSON(docTop.json);
      } else {
        pageStack.undoStack.pop();
        pageStack.redoStack.push({ seq: this._nextSeq(), json: this.rawModel.getPageJSON(pageId) });
        if (pageStack.redoStack.length > MAX_STACK) pageStack.redoStack.shift();
        this.rawModel.loadPageFromJSON(pageId, pageTop.json);
      }
      this._refreshButtons();
    }

    redo() {
      const pageId = this.getActivePageId();
      const pageStack = this._pageStack(pageId);
      const pageTop = pageStack.redoStack[pageStack.redoStack.length - 1];
      const docTop = this.documentRedoStack[this.documentRedoStack.length - 1];
      if (!pageTop && !docTop) return;

      if (docTop && (!pageTop || docTop.seq > pageTop.seq)) {
        this.documentRedoStack.pop();
        this.documentUndoStack.push({ seq: this._nextSeq(), json: this.rawModel.toJSON() });
        if (this.documentUndoStack.length > MAX_STACK) this.documentUndoStack.shift();
        this.rawModel.loadFromJSON(docTop.json);
      } else {
        pageStack.redoStack.pop();
        pageStack.undoStack.push({ seq: this._nextSeq(), json: this.rawModel.getPageJSON(pageId) });
        if (pageStack.undoStack.length > MAX_STACK) pageStack.undoStack.shift();
        this.rawModel.loadPageFromJSON(pageId, pageTop.json);
      }
      this._refreshButtons();
    }

    // Called by ImportExportController after a successful import, and
    // implicitly true from the moment this controller is constructed for a
    // fresh "New" bowtie — clears every tier: the document stack and every
    // per-page stack. Undoing a page deletion restores that page's content
    // (via the document-level snapshot) but does not attempt to restore
    // *its own* per-page undo/redo history from before the deletion — that
    // stack starts fresh again, an accepted scope boundary.
    reset() {
      this.pageStacks = new Map();
      this.documentUndoStack = [];
      this.documentRedoStack = [];
      this._refreshButtons();
    }

    _refreshButtons() {
      this.undoBtn.disabled = !this.canUndo();
      this.redoBtn.disabled = !this.canRedo();
    }
  }

  Bowtie.UndoController = UndoController;
})(window.Bowtie = window.Bowtie || {});
