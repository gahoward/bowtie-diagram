(function (Bowtie) {
  const MAX_STACK = 50;

  // Public BowtieModel methods that mutate diagram data and should become
  // one undo step per call. Deliberately excludes:
  //  - moveElement: called on every pointermove during a drag, not once
  //    per gesture — DragController snapshots once itself, on pointerdown,
  //    instead of letting this generic hook fire on every intermediate
  //    position.
  //  - loadFromJSON: used both by a real import (which resets the undo/redo
  //    history rather than pushing to it — see ImportExportController) and
  //    by undo()/redo()'s own restoration below, which must not re-snapshot
  //    itself mid-operation.
  const MUTATING_METHODS = [
    'addCause', 'addOutcome', 'addPreventativeControl', 'addMitigativeControl',
    'insertBarrier', 'attachExistingBarrier',
    'attachInputToPreventativeControl', 'attachOutputToMitigativeControl',
    'connectLineDirectlyToTle', 'deleteElement', 'renameElement', 'setPositions',
    'reEnableId', 'disableRetiredId', 'reassignId', 'setName', 'swapBarrierWithNeighbor',
  ];

  // Wraps `model` in a Proxy that snapshots its current toJSON() onto the
  // undo stack immediately before any call to one of MUTATING_METHODS —
  // every "add a barrier", "rename", "attach", etc. becomes one undo step
  // automatically, with no changes needed in the controllers that already
  // call these methods on `model`. Everything else (property reads,
  // non-mutating methods) passes through untouched, so existing code like
  // `this.model.causes` or `this.model.findById(id)` keeps working exactly
  // as before.
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
      this.undoStack = [];
      this.redoStack = [];

      this.model = new Proxy(model, {
        get: (target, prop) => {
          const value = target[prop];
          if (typeof value !== 'function') return value;
          if (!MUTATING_METHODS.includes(prop)) return value.bind(target);
          return (...args) => {
            // Captured before the call, but only pushed if the call
            // actually succeeds — several of these throw on invalid input
            // (e.g. a cycle) and are called through `_safeAttach`'s
            // try/catch specifically so the model stays unchanged; an
            // undo entry for a mutation that never happened would be a
            // no-op step that just wastes a stack slot.
            const before = this.rawModel.toJSON();
            const result = value.apply(target, args);
            this._pushUndo(before);
            return result;
          };
        },
      });

      this.undoBtn.addEventListener('click', () => this.undo());
      this.redoBtn.addEventListener('click', () => this.redo());
      document.addEventListener('keydown', (e) => this._onKeyDown(e));

      this._refreshButtons();
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

    // Called explicitly by DragController once per drag gesture (on
    // pointerdown, before the first move), since `moveElement` itself is
    // excluded from the generic proxy hook above — there is nothing to
    // "fail" about starting a drag, so this pushes unconditionally.
    snapshot() {
      this._pushUndo(this.rawModel.toJSON());
    }

    _pushUndo(snapshotJson) {
      this.undoStack.push(snapshotJson);
      if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
      this.redoStack = [];
      this._refreshButtons();
    }

    canUndo() { return this.undoStack.length > 0; }

    canRedo() { return this.redoStack.length > 0; }

    undo() {
      if (!this.canUndo()) return;
      this.redoStack.push(this.rawModel.toJSON());
      if (this.redoStack.length > MAX_STACK) this.redoStack.shift();
      this.rawModel.loadFromJSON(this.undoStack.pop());
      this._refreshButtons();
    }

    redo() {
      if (!this.canRedo()) return;
      this.undoStack.push(this.rawModel.toJSON());
      if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
      this.rawModel.loadFromJSON(this.redoStack.pop());
      this._refreshButtons();
    }

    // Called by ImportExportController after a successful import, and
    // implicitly true from the moment this controller is constructed for a
    // fresh "New" bowtie — there is nothing yet to reset in that case, but
    // starting with empty stacks satisfies the same requirement.
    reset() {
      this.undoStack = [];
      this.redoStack = [];
      this._refreshButtons();
    }

    _refreshButtons() {
      this.undoBtn.disabled = !this.canUndo();
      this.redoBtn.disabled = !this.canRedo();
    }
  }

  Bowtie.UndoController = UndoController;
})(window.Bowtie = window.Bowtie || {});
