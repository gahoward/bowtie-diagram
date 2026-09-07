(function (Bowtie) {
  // Gives the canvas-manipulation controllers (CanvasView/ConnectionRenderer,
  // DragController, AutoArrangeController, FocusController,
  // ContextMenuController, ToolbarController's add-cause/add-outcome) a
  // single page's drawable content, shaped exactly like the old single-page
  // model, so none of their internals need to change -- only what `main.js`
  // constructs them with does.
  //
  // Deliberately out of scope: page metadata (name/description) and page
  // CRUD (add/rename/delete). Those stay on the real, undo-tracked `model`
  // -- `PageTabsController` calls them directly, the same way
  // `WelcomeController`/`ImportExportController` already operate on the
  // real model rather than a facade.
  class PageScopedModel {
    constructor(realModel, getActivePageId) {
      this.realModel = realModel;
      this.getActivePageId = getActivePageId;
    }

    get causes() { return this.realModel.causesForPage(this.getActivePageId()); }

    get outcomes() { return this.realModel.outcomesForPage(this.getActivePageId()); }

    get preventativeBarriers() { return this.realModel.preventativeBarriersForPage(this.getActivePageId()); }

    get mitigativeBarriers() { return this.realModel.mitigativeBarriersForPage(this.getActivePageId()); }

    get lines() { return this.realModel.linesForPage(this.getActivePageId()); }

    get topLevelEvent() { return this.realModel.getPage(this.getActivePageId()).topLevelEvent; }

    get hazard() { return this.realModel.getPage(this.getActivePageId()).hazard; }

    // Document-wide, NOT page-scoped -- the whole-document name.
    // ToolbarController reads both this and the page-scoped addCause/
    // addOutcome from the same reference, so it's constructed with this
    // facade rather than the raw model, and needs both surfaces satisfied.
    get name() { return this.realModel.name; }

    setName(name) { return this.realModel.setName(name); }

    addCause(opts = {}) {
      return this.realModel.addCause({ ...opts, pageId: this.getActivePageId() });
    }

    addOutcome(opts = {}) {
      return this.realModel.addOutcome({ ...opts, pageId: this.getActivePageId() });
    }

    // --- Passthrough -----------------------------------------------------
    //
    // Every one of these is already id-scoped (a globally-unique element
    // id, or an id-bearing anchor) or otherwise safe to hand straight to
    // the real model unfiltered -- including addPreventativeControl/
    // addMitigativeControl, which resolve their own pageId from their
    // anchor (see BowtieModel), and attachExistingBarrier/
    // attachInputToPreventativeControl, whose candidate lists this facade
    // implicitly keeps page-scoped by construction (their callers -- e.g.
    // ContextMenuController -- only ever build those candidate lists from
    // this.model.preventativeBarriers/.mitigativeBarriers, which are
    // already filtered to the active page above).

    findById(id) { return this.realModel.findById(id); }

    _lineFor(originId) { return this.realModel._lineFor(originId); }

    linesThrough(barrierId) { return this.realModel.linesThrough(barrierId); }

    _donorContinuation(barrierId, excludeLineId) {
      return this.realModel._donorContinuation(barrierId, excludeLineId);
    }

    laneYsThrough(barrierId) { return this.realModel.laneYsThrough(barrierId); }

    addPreventativeControl(causeId, opts = {}) { return this.realModel.addPreventativeControl(causeId, opts); }

    addMitigativeControl(outcomeId, opts = {}) { return this.realModel.addMitigativeControl(outcomeId, opts); }

    insertBarrier(kind, direction, anchorId, opts = {}, selectedLineIds = null) {
      return this.realModel.insertBarrier(kind, direction, anchorId, opts, selectedLineIds);
    }

    attachExistingBarrier(kind, direction, anchorId, targetId, selectedLineIds = null) {
      return this.realModel.attachExistingBarrier(kind, direction, anchorId, targetId, selectedLineIds);
    }

    attachInputToPreventativeControl(causeId, pcId, inheritDownstream = true) {
      return this.realModel.attachInputToPreventativeControl(causeId, pcId, inheritDownstream);
    }

    attachOutputToMitigativeControl(mcId, outcomeId, inheritDownstream = true) {
      return this.realModel.attachOutputToMitigativeControl(mcId, outcomeId, inheritDownstream);
    }

    connectLineDirectlyToTle(lineId, keepThroughId) {
      return this.realModel.connectLineDirectlyToTle(lineId, keepThroughId);
    }

    moveElement(id, x, y) { return this.realModel.moveElement(id, x, y); }

    setPositions(updates) { return this.realModel.setPositions(updates); }

    deleteElement(id) { return this.realModel.deleteElement(id); }

    renameElement(id, newName) { return this.realModel.renameElement(id, newName); }

    swapBarrierWithNeighbor(lineIds, barrierId, towardTle) {
      return this.realModel.swapBarrierWithNeighbor(lineIds, barrierId, towardTle);
    }

    onChange(fn) { return this.realModel.onChange(fn); }
  }

  Bowtie.PageScopedModel = PageScopedModel;
})(window.Bowtie = window.Bowtie || {});
