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

  // Every BowtieModel method that mutates document state (directly, or by
  // delegating one level into a NodeLibrary/LineTopology collaborator --
  // see BowtieModel.js) but is deliberately absent from this facade,
  // because the controller that calls it already holds the real model
  // directly rather than being constructed with THIS facade (design review
  // finding 04). Named here explicitly, rather than left as an implicit
  // gap, so `tests/test_page_scoped_model_completeness.py` can assert
  // nothing new slips through unnoticed the way two real bugs did before
  // this list existed: `renameNode` missing from the facade entirely (every
  // risk-field save from the real UI threw), and `renameElement` silently
  // dropping its third argument (descriptions never saved on the TLE or
  // Hazard).
  const DOCUMENT_SCOPED = [
    // Page CRUD -- PageTabsController/WelcomeController hold the real
    // model directly; see the class header above.
    'addPage', 'deletePage', 'renamePage',
    // Node-library CRUD and identifier posterity -- NodeLibraryController
    // holds the real model directly, the same as page CRUD above.
    'addNode', 'deleteNode', 'reEnableId', 'disableRetiredId', 'reassignId',
    // Document-wide settings -- ProjectSettingsController/WelcomeController
    // hold the real model directly.
    'setMode', 'setRiskMatrix', 'setIdentifierDisplayMode', 'setTleAggregation',
    // Whole-document (re)load -- only ever called by ImportExportController
    // (a real import) or by UndoController itself (restoring a
    // document-level snapshot); never something a page-scoped canvas
    // controller does.
    'loadFromJSON', 'loadPageFromJSON',
  ];

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

    // --- Node library / quantitative mode passthroughs --------------------
    //
    // All document-wide (node_library_proposal.md / quantitative_mode_
    // proposal.md), same reasoning as `name`/`setName` above -- but
    // ShapeRenderer/ConnectionRenderer/ContextMenuController are
    // constructed with THIS facade, not the raw model, so rendering a
    // node's label or building the create-or-choose modal needs these
    // exposed here too.

    get mode() { return this.realModel.mode; }

    get riskMatrix() { return this.realModel.riskMatrix; }

    get identifierDisplayMode() { return this.realModel.identifierDisplayMode; }

    // Design review finding 11 -- CanvasView reads this (constructed with
    // this facade) to label which aggregation produced a computed
    // likelihood figure. Read-only here, like `mode`/`riskMatrix` above;
    // `setTleAggregation` itself is document-scoped (see DOCUMENT_SCOPED).
    get tleAggregation() { return this.realModel.tleAggregation; }

    getNode(nodeId) { return this.realModel.getNode(nodeId); }

    getNodeOfType(type, nodeId) { return this.realModel.getNodeOfType(type, nodeId); }

    displayIdentifierFor(node) { return this.realModel.displayIdentifierFor(node); }

    // ContextMenuController's rename modal (constructed with this facade)
    // resolves a Cause/Outcome/Barrier's rename to the underlying node --
    // a node's identity is document-wide, so this passes straight through
    // to the real model exactly like setName/addCause above.
    renameNode(nodeId, opts) { return this.realModel.renameNode(nodeId, opts); }

    // The "Choose existing" list for the create-or-choose modal (ask 3):
    // every library node of `type` NOT already placed on the active page
    // (node_library_proposal.md "at most one placement per node per page").
    libraryNodesAvailableToPlace(type) {
      const pageId = this.getActivePageId();
      return (this.realModel.library[type] || []).filter(
        (node) => !this.realModel.placementsForNode(node.id).some((p) => p.pageId === pageId),
      );
    }

    computeConsequenceLikelihood(outcomeId, opts) {
      return this.realModel.computeConsequenceLikelihood(outcomeId, opts);
    }

    computeTleLikelihoodForActivePage(opts) {
      return this.realModel.computeTleLikelihood(this.getActivePageId(), opts);
    }

    getConsequenceRiskClass(outcomeId, opts) {
      return this.realModel.getConsequenceRiskClass(outcomeId, opts);
    }

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

    // Tries THIS PAGE's own placements first -- by placement id (Line.
    // stops/originId entries, everything internal wiring actually uses),
    // then by NODE id (what ShapeRenderer's `data-id` actually is now --
    // node_library_proposal.md "Two id spaces" -- so DOM clicks resolve
    // here; "at most one placement per node per page", decided, makes this
    // unambiguous) -- before ever falling back to the raw model's own
    // document-wide search (TLE/Hazard, or a node id that turns out to be
    // placed on some OTHER page instead of this one). Checking this page
    // first, rather than the other way around, is what keeps a node
    // shared across pages resolving to the RIGHT page's placement here
    // even though the raw model's own findById (BowtieModel.js) also has
    // a same-shaped node-id fallback of its own, just without any page to
    // prefer.
    findById(id) {
      const pageId = this.getActivePageId();
      const onThisPage = [
        ...this.realModel.causesForPage(pageId),
        ...this.realModel.outcomesForPage(pageId),
        ...this.realModel.preventativeBarriersForPage(pageId),
        ...this.realModel.mitigativeBarriersForPage(pageId),
      ];
      return (
        onThisPage.find((p) => p.id === id) ||
        onThisPage.find((p) => p.nodeId === id) ||
        this.realModel.findById(id)
      );
    }

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

    renameElement(id, newName, description) { return this.realModel.renameElement(id, newName, description); }

    swapBarrierWithNeighbor(lineIds, barrierId, towardTle) {
      return this.realModel.swapBarrierWithNeighbor(lineIds, barrierId, towardTle);
    }

    onChange(fn) { return this.realModel.onChange(fn); }
  }

  PageScopedModel.DOCUMENT_SCOPED = DOCUMENT_SCOPED;
  Bowtie.PageScopedModel = PageScopedModel;
})(window.Bowtie = window.Bowtie || {});
