(function (Bowtie) {
  // Default canvas dimensions the model uses for initial placement of new
  // elements. The view may render at any size; these are just sensible
  // starting coordinates before the user drags things or hits auto-arrange.
  const CANVAS_W = 1400;
  const CANVAS_H = 800;
  const ROW_SPACING = 110;
  const TOP_MARGIN = 90;
  // v9: `riskReductionFactor` changed MEANING without changing shape --
  // it was a PFD-like fraction that multiplied the frequency, and is now
  // an RRF in the IEC 61511 sense (>= 1, equal to 1/PFD) that divides it.
  // A v8 document would still parse cleanly and silently invert every
  // barrier's effect, so the version bump is what turns a silent misread
  // into the outright rejection ImportExportController already does.
  const SCHEMA_VERSION = 9;
  // Both barrier types splice the same way underneath (toward the TLE or
  // toward the origin), but "after"/"before" — the UI's own vocabulary,
  // relative to whichever barrier was right-clicked — maps to OPPOSITE
  // splice directions for each type: a PreventativeBarrier's "after" is a
  // MitigativeBarrier's "before", and vice versa. This table is the one
  // place that mirror needs to be written down; everything else (see
  // insertBarrier/attachExistingBarrier) just reads it.
  const SPLICE_DIRECTION = {
    preventativeBarrier: { after: 'towardTle', before: 'towardOrigin' },
    mitigativeBarrier: { after: 'towardOrigin', before: 'towardTle' },
  };

  class BowtieModel {
    constructor() {
      this._listeners = [];
      this.name = 'Untitled Bowtie';
      // Each page owns its own TopLevelEvent+Hazard pair; see addPage().
      // Causes/outcomes/barriers/lines stay flat, document-wide arrays
      // (below), each tagged with a pageId, rather than nested under a
      // page — this keeps every splice/attach/delete/findById primitive
      // below working unchanged across a multi-page document.
      this.pages = [];
      // Placements -- one per node's appearance on one page (position +,
      // for causes/outcomes, its own Line). See node_library_proposal.md
      // "Two id spaces": these arrays' own `.id` fields are the INTERNAL,
      // never-rendered placement ids (findById/Line.stops/Line.originId/
      // undo's page-attribution key on them, unchanged from before this
      // proposal) -- the VISIBLE id a user sees is each placement's
      // `nodeId`, resolved through `this.library` below.
      this.causes = [];
      this.outcomes = [];
      this.preventativeBarriers = [];
      this.mitigativeBarriers = [];
      // One Line per Cause and per Outcome — the first-order representation
      // of that element's continuous path to/from the TLE. Created/destroyed
      // alongside their origin, mutated directly by every chaining operation
      // below. See js/model/Line.js.
      this.lines = [];
      // 'simple' (default, today's behaviour, no risk fields anywhere) |
      // 'qualitative' | 'quantitative' — quantitative_mode_proposal.md
      // "Modes". The active RiskMatrixDefinition (embedded, self-contained
      // — see setRiskMatrix) is null in 'simple' mode and whenever no
      // matrix has been chosen yet in the other two modes.
      this.mode = 'simple';
      this.riskMatrix = null;
      this.idCounters = {
        page: 0,
        cause: 0,
        outcome: 0,
        preventativeBarrier: 0,
        mitigativeBarrier: 0,
        line: 0,
        // Node ids are drawn from the four counters above (repurposed to
        // count NODES, not placements, by this proposal — same counters,
        // same prefixes, unchanged from the user's point of view). This
        // one is for placements' own internal, never-rendered ids.
        placement: 0,
      };
      // Bridging default: no controller is page-aware yet (that lands in a
      // later phase, via a PageScopedModel facade and WelcomeController's
      // "New" flow calling addPage() itself) — every existing call site
      // still reads model.topLevelEvent/model.hazard as a single
      // document-wide pair (see the getters below) and calls
      // addCause/addOutcome without a pageId. Auto-creating one page here
      // keeps all of that working unchanged until that wiring lands.
      this.addPage();
      // Read-only collaborators (design review finding 06) -- see
      // Quantitative.js / Warnings.js. BowtieModel's own public methods
      // below are unchanged in name and signature; they just delegate here.
      this._quantitative = new Bowtie.Quantitative(this);
      this._warnings = new Bowtie.Warnings(this);
      // Stateful collaborator (design review finding 06, phase 4; see
      // NodeLibrary.js) -- owns `library`/`retiredIds`/`identifierDisplayMode`
      // outright; the get/set accessors just below re-expose them under
      // their original names so every existing reader/writer keeps working.
      this._nodeLibrary = new Bowtie.NodeLibrary(this);
    }

    // See the constructor note above and NodeLibrary.js: these three fields
    // live on `_nodeLibrary` now, not on this instance directly.
    get library() { return this._nodeLibrary.library; }

    set library(value) { this._nodeLibrary.library = value; }

    get retiredIds() { return this._nodeLibrary.retiredIds; }

    set retiredIds(value) { this._nodeLibrary.retiredIds = value; }

    get identifierDisplayMode() { return this._nodeLibrary.identifierDisplayMode; }

    set identifierDisplayMode(value) { this._nodeLibrary.identifierDisplayMode = value; }

    onChange(fn) {
      this._listeners.push(fn);
    }

    _emitChange() {
      this._listeners.forEach((fn) => fn(this));
    }

    // --- Backward-compatible single-page accessors -----------------------
    //
    // Every controller/view still reads model.topLevelEvent / model.hazard
    // as a single document-wide pair — none of them are page-aware yet.
    // These read-only getters expose the first page's TLE/Hazard so that
    // code keeps working unmodified; they go away once every caller is
    // migrated to page-scoped access.
    get topLevelEvent() {
      return this.pages[0] ? this.pages[0].topLevelEvent : undefined;
    }

    get hazard() {
      return this.pages[0] ? this.pages[0].hazard : undefined;
    }

    // --- Pages ----------------------------------------------------------

    addPage(opts = {}) {
      this.idCounters.page += 1;
      const n = this.idCounters.page;
      const pageId = `PAGE_${n}`;
      const topLevelEvent = new Bowtie.TopLevelEvent({
        id: `TLE_${n}`, x: CANVAS_W / 2, y: CANVAS_H / 2, pageId,
      });
      const hazard = new Bowtie.Hazard({ id: `HAZARD_${n}`, pageId });
      // Page name/description are their own user-set fields, independent
      // of the TLE's name — a page is not just "the TLE's name relabelled."
      // Name is required at the UI layer (the wizard/tab-creation flow
      // validates it before ever calling this); the fallback below is a
      // defensive floor, not the primary mechanism. Description may be
      // blank throughout.
      const page = {
        id: pageId,
        name: opts.name || 'Untitled Page',
        description: opts.description || '',
        topLevelEvent,
        hazard,
      };
      this.pages.push(page);
      this._emitChange();
      return page;
    }

    renamePage(pageId, opts = {}) {
      const page = this.getPage(pageId);
      if (!page) return;
      if (opts.name !== undefined) page.name = opts.name;
      if (opts.description !== undefined) page.description = opts.description;
      this._emitChange();
    }

    // Removes the page entry and cascades: every cause/outcome/barrier/line
    // tagged with this pageId goes with it. Throws if it's the last
    // remaining page (defensive; the UI also won't offer delete on the
    // last tab). Node library records are untouched — a node surviving
    // with no placements anywhere is the normal "library" state (ask 2),
    // not something a page deletion needs to clean up.
    deletePage(pageId) {
      if (this.pages.length <= 1) throw new Error('Cannot delete the last remaining page');
      const idx = this.pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return;
      this.pages.splice(idx, 1);
      this.causes = this.causes.filter((c) => c.pageId !== pageId);
      this.outcomes = this.outcomes.filter((o) => o.pageId !== pageId);
      this.preventativeBarriers = this.preventativeBarriers.filter((p) => p.pageId !== pageId);
      this.mitigativeBarriers = this.mitigativeBarriers.filter((m) => m.pageId !== pageId);
      this.lines = this.lines.filter((l) => l.pageId !== pageId);
      this._emitChange();
    }

    getPage(pageId) {
      return this.pages.find((p) => p.id === pageId) || null;
    }

    causesForPage(pageId) {
      return this.causes.filter((c) => c.pageId === pageId);
    }

    outcomesForPage(pageId) {
      return this.outcomes.filter((o) => o.pageId === pageId);
    }

    preventativeBarriersForPage(pageId) {
      return this.preventativeBarriers.filter((p) => p.pageId === pageId);
    }

    mitigativeBarriersForPage(pageId) {
      return this.mitigativeBarriers.filter((m) => m.pageId === pageId);
    }

    linesForPage(pageId) {
      return this.lines.filter((l) => l.pageId === pageId);
    }

    _placementsForPage(kind, pageId) {
      switch (kind) {
        case 'cause': return this.causesForPage(pageId);
        case 'outcome': return this.outcomesForPage(pageId);
        case 'preventativeBarrier': return this.preventativeBarriersForPage(pageId);
        case 'mitigativeBarrier': return this.mitigativeBarriersForPage(pageId);
        default: return [];
      }
    }

    // Resolves the pageId a new cause/outcome should be tagged with: the
    // caller's explicit choice, validated against this.pages, or — for
    // call sites that predate multi-page support (and every existing test)
    // — a default-to-first-page fallback, so omitting pageId keeps working
    // exactly as a single-page document always has.
    _resolvePageId(pageId) {
      if (pageId !== undefined && pageId !== null) {
        if (!this.getPage(pageId)) throw new Error(`Unknown page id: ${pageId}`);
        return pageId;
      }
      if (this.pages.length === 0) throw new Error('Cannot create an element: the document has no pages');
      return this.pages[0].id;
    }

    // --- Node library (node_library_proposal.md) -------------------------
    // Delegates to the stateful NodeLibrary collaborator (design review
    // finding 06, phase 4; see NodeLibrary.js) — every method here stays,
    // unchanged in name and signature, for the same reason as
    // computeTleLikelihood above.

    _createNode(type, opts = {}) {
      return this._nodeLibrary._createNode(type, opts);
    }

    addNode(type, opts = {}) {
      return this._nodeLibrary.addNode(type, opts);
    }

    // Resolves `opts.nodeId` against an EXISTING library node of `kind`
    // (placing it — asserting it has no placement on `pageId` yet, per
    // the decided "at most one placement per node per page, never
    // duplicated"), or creates a brand-new node from `opts` — the one
    // shared implementation of the two-shape `{ name, ... }` vs
    // `{ nodeId, ... }` opts bag every creation call site below accepts.
    // Stays here rather than moving into NodeLibrary: it reasons about
    // BOTH the library (does this node exist?) and this page's placements
    // (is it already placed here?), neither of which NodeLibrary owns
    // alone.
    _resolveOrCreateNode(kind, opts, pageId) {
      if (opts.nodeId) {
        const node = this.getNodeOfType(kind, opts.nodeId);
        if (!node) throw new Error(`Unknown ${kind} node id: ${opts.nodeId}`);
        if (this._placementsForPage(kind, pageId).some((p) => p.nodeId === opts.nodeId)) {
          throw new Error('That node is already placed on this page');
        }
        return node;
      }
      return this._createNode(kind, opts);
    }

    getNode(nodeId) {
      return this._nodeLibrary.getNode(nodeId);
    }

    getNodeOfType(type, nodeId) {
      return this._nodeLibrary.getNodeOfType(type, nodeId);
    }

    getNodeByIdentifier(identifier) {
      return this._nodeLibrary.getNodeByIdentifier(identifier);
    }

    renameNode(nodeId, opts = {}) {
      return this._nodeLibrary.renameNode(nodeId, opts);
    }

    placementsForNode(nodeId) {
      return this._nodeLibrary.placementsForNode(nodeId);
    }

    deleteNode(nodeId) {
      return this._nodeLibrary.deleteNode(nodeId);
    }

    // --- Placement ----------------------------------------------------

    // Nudges `y` downward in ROW_SPACING steps at a fixed `x` until the
    // approximate bounding box (using each node's own stored w/h) no longer
    // overlaps any existing element on the SAME page — new nodes must never
    // land on top of existing ones, and two pages are independent
    // coordinate spaces, so a page's placement search only ever looks at
    // its own elements and its own TLE.
    _findClearY(pageId, x, w, h, startY) {
      const page = this.getPage(pageId);
      const boxes = [
        ...this.causesForPage(pageId), ...this.outcomesForPage(pageId),
        ...this.preventativeBarriersForPage(pageId), ...this.mitigativeBarriersForPage(pageId),
      ].map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
      if (page) {
        boxes.push({
          x: page.topLevelEvent.x, y: page.topLevelEvent.y,
          w: page.topLevelEvent.r * 2, h: page.topLevelEvent.r * 2,
        });
      }

      const overlapsAt = (y) => boxes.some((b) => (
        Math.abs(x - b.x) < (w + b.w) / 2 && Math.abs(y - b.y) < (h + b.h) / 2
      ));

      let y = startY;
      let guard = 0;
      while (overlapsAt(y) && guard < 500) {
        y += ROW_SPACING;
        guard += 1;
      }
      return y;
    }

    // --- Creation -----------------------------------------------------

    // Accepts either `{ name, description, identifier, x, y, pageId }`
    // (create a brand-new node + a new placement in one call) or
    // `{ nodeId, x, y, pageId }` (place an already-existing cause node —
    // node_library_proposal.md ask 1).
    addCause(opts = {}) {
      const pageId = this._resolvePageId(opts.pageId);
      const node = this._resolveOrCreateNode('cause', opts, pageId);
      this.idCounters.placement += 1;
      const id = `PLACEMENT_${this.idCounters.placement}`;
      const w = 140;
      const h = 60;
      const x = opts.x ?? 150;
      const y = opts.y ?? this._findClearY(pageId, x, w, h, TOP_MARGIN);
      const cause = new Bowtie.Cause({
        id, nodeId: node.id, x, y, w, h, pageId,
      });
      this.causes.push(cause);
      this.idCounters.line += 1;
      this.lines.push(new Bowtie.Line({
        id: `LINE_${this.idCounters.line}`, originType: 'cause', originId: id, pageId,
      }));
      this._emitChange();
      return cause;
    }

    // Mirrors addCause for the outcome/output side.
    addOutcome(opts = {}) {
      const pageId = this._resolvePageId(opts.pageId);
      const node = this._resolveOrCreateNode('outcome', opts, pageId);
      this.idCounters.placement += 1;
      const id = `PLACEMENT_${this.idCounters.placement}`;
      const w = 140;
      const h = 60;
      const x = opts.x ?? (CANVAS_W - 150);
      const y = opts.y ?? this._findClearY(pageId, x, w, h, TOP_MARGIN);
      const outcome = new Bowtie.Outcome({
        id, nodeId: node.id, x, y, w, h, pageId,
      });
      this.outcomes.push(outcome);
      this.idCounters.line += 1;
      this.lines.push(new Bowtie.Line({
        id: `LINE_${this.idCounters.line}`, originType: 'outcome', originId: id, pageId,
      }));
      this._emitChange();
      return outcome;
    }

    // --- Line lookup / edge grouping ------------------------------------
    //
    // Every Line passes through its stops continuously by construction —
    // there is no per-line "mode". Two Lines only ever appear as one visual
    // edge because they currently happen to share the same adjacent stop;
    // that's a grouping computed here, not a stored flag. These two
    // functions are the single source of truth for: box line-counts
    // (Layout.controlBounds), the actual line-drawing (ConnectionRenderer),
    // and the "which line(s) should the new barrier apply to" disambiguation
    // (ContextMenuController's insert-after flow).

    // Resolves `id` to the real PLACEMENT id every internal structure
    // (Line.stops/originId) actually keys on: unchanged if `id` already IS
    // one, or -- since a NODE's id is what's actually visible to a user
    // (node_library_proposal.md "Two id spaces") and what every caller of
    // this model's public API naturally reaches for, including every
    // model-level test written before the node library existed -- the id
    // of whichever placement (any page) currently references `id` as its
    // `nodeId`. Idempotent, so every method below can call this
    // unconditionally on each element-id argument it accepts without
    // worrying about double-resolving an id that was already a placement
    // id. Mirrors findById's own fallback, just returning the bare id
    // instead of the resolved element.
    _resolvePlacementId(id) {
      const isPlacementId = (
        this.causes.some((c) => c.id === id) ||
        this.outcomes.some((o) => o.id === id) ||
        this.preventativeBarriers.some((p) => p.id === id) ||
        this.mitigativeBarriers.some((m) => m.id === id)
      );
      if (isPlacementId) return id;
      const placement = (
        this.causes.find((c) => c.nodeId === id) ||
        this.outcomes.find((o) => o.nodeId === id) ||
        this.preventativeBarriers.find((p) => p.nodeId === id) ||
        this.mitigativeBarriers.find((m) => m.nodeId === id)
      );
      return placement ? placement.id : id;
    }

    _lineFor(originId) {
      return this.lines.find((l) => l.originId === this._resolvePlacementId(originId));
    }

    // Every Line currently passing through `barrierId`, individually — there
    // is no bundling/grouping concept any more. Lines are always drawn as
    // their own distinct, continuously-straight run at their own origin's y;
    // two lines sharing a barrier still exit it at different points (their
    // own y), never funneled together. Used both for the "which line(s)
    // should the new barrier apply to" disambiguation UI and for computing
    // how tall a barrier's box needs to be.
    linesThrough(barrierId) {
      const resolved = this._resolvePlacementId(barrierId);
      return this.lines.filter((l) => l.stops.includes(resolved));
    }

    // The y-coordinate each Line passing through `barrierId` travels at
    // (its origin Cause/Outcome's own y, constant for the Line's whole run)
    // — Layout.controlBounds uses this to grow the box tall enough to cover
    // every lane passing through, each still exiting at its own height.
    laneYsThrough(barrierId) {
      return this.linesThrough(barrierId).map((l) => this.findById(l.originId).y);
    }

    // --- Creation of barriers, chained from a Cause/Outcome --------------

    // Creates a new PreventativeBarrier placement. If causeId already has a
    // chain, the new barrier is appended at the chain's TLE-facing end (the
    // tail of its Line) — always unambiguous, since it only ever touches
    // this one Line. Accepts either creation shape — see _resolveOrCreateNode.
    addPreventativeControl(causeId, opts = {}) {
      causeId = this._resolvePlacementId(causeId);
      const cause = this.causes.find((c) => c.id === causeId);
      if (!cause) throw new Error(`Unknown cause id: ${causeId}`);
      const line = this._lineFor(causeId);

      const tailId = line.stops.length > 0 ? line.stops[line.stops.length - 1] : causeId;
      const anchor = line.stops.length > 0
        ? this.preventativeBarriers.find((p) => p.id === tailId)
        : cause;

      const node = this._resolveOrCreateNode('preventativeBarrier', opts, cause.pageId);
      this.idCounters.placement += 1;
      const id = `PLACEMENT_${this.idCounters.placement}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x + anchor.w + 60);
      const y = this._findClearY(cause.pageId, x, w, h, opts.y ?? anchor.y);
      const pb = new Bowtie.PreventativeBarrier({
        id, nodeId: node.id, x, y, w, h, pageId: cause.pageId,
      });
      this.preventativeBarriers.push(pb);
      line.stops.push(id);
      this._emitChange();
      return pb;
    }

    // Mirrors addPreventativeControl: appends at the chain's TLE-facing end.
    addMitigativeControl(outcomeId, opts = {}) {
      outcomeId = this._resolvePlacementId(outcomeId);
      const outcome = this.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) throw new Error(`Unknown outcome id: ${outcomeId}`);
      const line = this._lineFor(outcomeId);

      const tailId = line.stops.length > 0 ? line.stops[line.stops.length - 1] : outcomeId;
      const anchor = line.stops.length > 0
        ? this.mitigativeBarriers.find((m) => m.id === tailId)
        : outcome;

      const node = this._resolveOrCreateNode('mitigativeBarrier', opts, outcome.pageId);
      this.idCounters.placement += 1;
      const id = `PLACEMENT_${this.idCounters.placement}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x - anchor.w - 60);
      const y = this._findClearY(outcome.pageId, x, w, h, opts.y ?? anchor.y);
      const mb = new Bowtie.MitigativeBarrier({
        id, nodeId: node.id, x, y, w, h, pageId: outcome.pageId,
      });
      this.mitigativeBarriers.push(mb);
      line.stops.push(id);
      this._emitChange();
      return mb;
    }

    // --- Splicing a new barrier into an existing chain -------------------

    // Inserts `factory()`'s new barrier immediately after `anchorId`, toward
    // the TLE (larger stop index) — PreventativeBarrier's "after" direction,
    // MitigativeBarrier's "before" direction. Only the given `selectedLineIds`
    // (or every line through anchorId, if none given) are spliced; the rest
    // continue exactly as before, still passing through anchorId unaffected.
    _insertBarrierTowardTle(anchorId, selectedLineIds, factory) {
      const affected = this.linesThrough(anchorId);
      const targets = (selectedLineIds && selectedLineIds.length > 0)
        ? new Set(selectedLineIds) : new Set(affected.map((l) => l.id));

      const newBarrier = factory();
      affected.forEach((line) => {
        if (!targets.has(line.id)) return;
        const idx = line.stops.indexOf(anchorId);
        line.stops.splice(idx + 1, 0, newBarrier.id);
      });
      this._emitChange();
      return newBarrier;
    }

    // Mirrors _insertBarrierTowardTle: splices immediately before `anchorId`,
    // toward the origin (smaller stop index) — PreventativeBarrier's
    // "before" direction, MitigativeBarrier's "after" direction.
    _insertBarrierTowardOrigin(anchorId, selectedLineIds, factory) {
      const affected = this.linesThrough(anchorId);
      const targets = (selectedLineIds && selectedLineIds.length > 0)
        ? new Set(selectedLineIds) : new Set(affected.map((l) => l.id));

      const newBarrier = factory();
      affected.forEach((line) => {
        if (!targets.has(line.id)) return;
        const idx = line.stops.indexOf(anchorId);
        line.stops.splice(idx, 0, newBarrier.id);
      });
      this._emitChange();
      return newBarrier;
    }

    // `dir` is +1 when the new barrier belongs on the larger-x side of
    // `anchor` and -1 when it belongs on the smaller-x side — callers pass
    // the direction that matches whichever way this particular splice is
    // headed (toward the TLE or toward the origin), so a barrier inserted
    // "before" an anchor never lands past it on the wrong side. `opts.y`
    // (when given, e.g. from a line-click's cursor position) only seeds the
    // clear-space search rather than overriding it, so collision avoidance
    // still runs. Accepts either creation shape — see _resolveOrCreateNode.
    _makeBarrierNear(kind, anchor, opts, dir) {
      const node = this._resolveOrCreateNode(kind, opts, anchor.pageId);
      this.idCounters.placement += 1;
      const id = `PLACEMENT_${this.idCounters.placement}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x + dir * 60);
      const y = this._findClearY(anchor.pageId, x, w, h, opts.y ?? anchor.y);
      const Ctor = kind === 'preventativeBarrier' ? Bowtie.PreventativeBarrier : Bowtie.MitigativeBarrier;
      const barrier = new Ctor({
        id, nodeId: node.id, x, y, w, h, pageId: anchor.pageId,
      });
      this._barrierCollection(kind).push(barrier);
      return barrier;
    }

    _barrierCollection(kind) {
      return kind === 'preventativeBarrier' ? this.preventativeBarriers : this.mitigativeBarriers;
    }

    _splice(direction, anchorId, selectedLineIds, factory) {
      return direction === 'towardTle'
        ? this._insertBarrierTowardTle(anchorId, selectedLineIds, factory)
        : this._insertBarrierTowardOrigin(anchorId, selectedLineIds, factory);
    }

    // Inserts a brand-new barrier of `kind` adjacent to `anchorId` — used by
    // both "Add ... Barrier" (from a node's own menu, direction 'after')
    // and the line-segment gap-insert menu (either direction, depending on
    // which gap was clicked). `selectedLineIds`: which specific line(s)
    // through anchorId the new barrier applies to (null/empty = all of them).
    // Accepts either creation shape in `opts` — see _resolveOrCreateNode.
    insertBarrier(kind, direction, anchorId, opts = {}, selectedLineIds = null) {
      anchorId = this._resolvePlacementId(anchorId);
      const anchor = this._barrierCollection(kind).find((b) => b.id === anchorId);
      if (!anchor) throw new Error(`Unknown ${kind} id: ${anchorId}`);
      const spliceDir = SPLICE_DIRECTION[kind][direction];
      const dir = direction === 'after' ? 1 : -1;
      return this._splice(spliceDir, anchorId, selectedLineIds, () => this._makeBarrierNear(kind, anchor, opts, dir));
    }

    // `targetId` must not already sit anywhere in a targeted line's stops,
    // or the line would pass through the same barrier twice.
    _checkNoCycleThroughAnchor(anchorId, targetId, selectedLineIds) {
      const affected = this.linesThrough(anchorId);
      const targets = (selectedLineIds && selectedLineIds.length > 0)
        ? new Set(selectedLineIds) : new Set(affected.map((l) => l.id));
      affected.filter((l) => targets.has(l.id)).forEach((l) => {
        if (l.stops.includes(targetId)) throw new Error('That attachment would create a cycle');
      });
    }

    // Mirrors insertBarrier, but splices in an EXISTING barrier PLACEMENT
    // (`targetId`) instead of creating one — any point along a Line should
    // be attachable to a different existing barrier, not just its two open
    // ends. Unrelated to the node library: this never creates a node or a
    // placement, it only re-wires which Line(s) pass through an
    // already-placed barrier (node_library_proposal.md "This is unrelated
    // to Attach to Existing Barrier").
    attachExistingBarrier(kind, direction, anchorId, targetId, selectedLineIds = null) {
      anchorId = this._resolvePlacementId(anchorId);
      targetId = this._resolvePlacementId(targetId);
      const target = this._barrierCollection(kind).find((b) => b.id === targetId);
      if (!target) throw new Error(`Unknown ${kind} id: ${targetId}`);
      this._checkNoCycleThroughAnchor(anchorId, targetId, selectedLineIds);
      const spliceDir = SPLICE_DIRECTION[kind][direction];
      return this._splice(spliceDir, anchorId, selectedLineIds, () => target);
    }

    // "Connect directly to the TLE": truncates `lineId`'s stops so
    // `keepThroughId` becomes its new tail (nearest the TLE), dropping
    // everything that used to continue further toward the TLE from there —
    // those barriers aren't deleted, just no longer part of THIS line. Pass
    // null for `keepThroughId` to drop every stop (the line becomes direct
    // Cause/Outcome-to-TLE). Always acts on exactly one Line — there is no
    // barrier-level variant of this, matching how reattachment generally
    // must be scoped to a specific Line, not every Line a barrier carries.
    connectLineDirectlyToTle(lineId, keepThroughId) {
      const line = this.lines.find((l) => l.id === lineId);
      if (!line) throw new Error(`Unknown line id: ${lineId}`);
      if (keepThroughId === null) {
        line.stops = [];
      } else {
        const resolvedKeepThroughId = this._resolvePlacementId(keepThroughId);
        const idx = line.stops.indexOf(resolvedKeepThroughId);
        if (idx === -1) throw new Error(`${keepThroughId} is not on line ${lineId}`);
        line.stops = line.stops.slice(0, idx + 1);
      }
      this._emitChange();
    }

    // --- Lines: the model's first-order representation of each path ------

    // Retained as a thin accessor so existing call sites (and any future
    // code) have one obvious place to ask "what are the lines right now" —
    // no computation happens here any more, `this.lines` already IS the
    // representation.
    computeLines() {
      return this.lines;
    }

    // --- Warnings / orphan detection -----------------------------------
    // Delegates to the read-only Warnings collaborator (design review
    // finding 06, phase 2; see Warnings.js) — kept here, unchanged in name
    // and signature, for the same reason as computeTleLikelihood above.

    getWarnings() {
      return this._warnings.getWarnings();
    }

    // --- Lookup ---------------------------------------------------------

    // Tries every placement's own internal id first (Line.stops/originId
    // entries, undo's page-attribution key), then TLE/Hazard ids, then
    // falls back to resolving `id` as a NODE id against whichever
    // placement (any page) currently references it -- convenient for
    // direct-model callers (tests included) that reasonably expect "the
    // thing labeled C_1" to just resolve, document-wide. When a node is
    // placed on more than one page, this returns whichever placement is
    // found first -- PageScopedModel's own findById (used by the real
    // app's rendering/drag/context-menu) narrows this to one specific
    // page instead, where "at most one placement per node per page"
    // (decided) makes the resolution unambiguous.
    findById(id) {
      const tleOrHazard = this.pages
        .flatMap((p) => [p.topLevelEvent, p.hazard])
        .find((el) => el.id === id);
      if (tleOrHazard) return tleOrHazard;
      const direct = (
        this.causes.find((c) => c.id === id) ||
        this.outcomes.find((o) => o.id === id) ||
        this.preventativeBarriers.find((p) => p.id === id) ||
        this.mitigativeBarriers.find((m) => m.id === id) ||
        null
      );
      if (direct) return direct;
      return (
        this.causes.find((c) => c.nodeId === id) ||
        this.outcomes.find((o) => o.nodeId === id) ||
        this.preventativeBarriers.find((p) => p.nodeId === id) ||
        this.mitigativeBarriers.find((m) => m.nodeId === id) ||
        null
      );
    }

    // --- Mutation ---------------------------------------------------------

    setName(name) {
      this.name = name;
      this._emitChange();
    }

    setIdentifierDisplayMode(mode) {
      return this._nodeLibrary.setIdentifierDisplayMode(mode);
    }

    displayIdentifierFor(node) {
      return this._nodeLibrary.displayIdentifierFor(node);
    }

    // 'simple' | 'qualitative' | 'quantitative' — quantitative_mode_proposal.md
    // "Modes". Document-level, not per-page (a shared document may be
    // reopened by someone else, so this can't be a personal preference).
    setMode(mode) {
      if (!['simple', 'qualitative', 'quantitative'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
      this.mode = mode;
      this._emitChange();
    }

    // The active RiskMatrixDefinition, embedded (a full, self-contained
    // copy — not just a reference by id — so exported documents stay
    // portable even if a bundled preset is later edited). Pass null to
    // clear it (e.g. switching back to Simple mode).
    setRiskMatrix(matrix) {
      this.riskMatrix = matrix;
      this._emitChange();
    }

    // For TLE/Hazard only, going forward (node_library_proposal.md: a
    // Cause/Outcome/Barrier's name now lives on its node — see renameNode
    // — this stays page-scoped and unaffected for the two singletons that
    // were never nodes). `description` is optional and left untouched when
    // omitted, so existing 2-arg callers (WelcomeController's wizard,
    // pre-Properties-modal tests) keep working unchanged.
    renameElement(id, newName, description) {
      const el = this.findById(id);
      if (!el) return;
      el.name = newName;
      if (description !== undefined) el.description = description;
      this._emitChange();
    }

    moveElement(id, x, y) {
      const el = this.findById(id);
      if (!el || el.type === 'hazard') return; // Hazard has no independent position
      el.x = x;
      el.y = y;
      this._emitChange();
    }

    // Manual escape hatch for the rare case auto-arrange still doesn't put
    // a barrier where the user wants it: swaps `barrierId` with whichever
    // stop currently sits immediately toward (or away from) the TLE of it
    // in ONE line's own stops array -- an actual topology change, not a
    // cosmetic position nudge, so it's permanent: the next Auto-arrange
    // derives its columns from this new order, same as it does for
    // whatever order the barriers were chained in to begin with (an
    // earlier version of this method only moved the barrier's on-screen x,
    // which the very next Auto-arrange click would immediately undo, since
    // it recomputes every position from topology alone and had no idea
    // anything had changed).
    //
    // `Line.stops` is nearest-origin-first for BOTH Cause and Outcome
    // lines -- increasing index always means "closer to the TLE", for
    // either barrier kind (see addPreventativeControl/addMitigativeControl:
    // each newly-appended barrier lands one index further toward the TLE
    // than the one before it, for both). So "toward the TLE" always means
    // swapping with the NEXT index and "away from the TLE" always means
    // swapping with the PREVIOUS one -- no kind-specific mirroring needed
    // here, unlike the x-pixel arithmetic the old version of this method
    // needed.
    //
    // Each swap is meaningful only per-line -- a barrier shared by several
    // lines can have a different neighbour (or none at all) in each one,
    // so "swap with your neighbour" only has one unambiguous meaning per
    // line -- exactly the same reasoning `attachExistingBarrier` already
    // documents for why reattachment is always line-scoped. Swapping two
    // stops within one line's own array can never affect any OTHER line,
    // even one that also passes through both of the swapped barriers,
    // since every Line owns its stops independently.
    //
    // `lineIds` takes every line to reorder `barrierId` within, applied as
    // ONE call (one undo step) -- this matters beyond convenience: an
    // earlier version took a single lineId and was called once per
    // selected line from a multi-line picker, and *also* tried to swap the
    // barrier's on-screen `x` with its neighbour's on EVERY call. For a
    // barrier reordered against two DIFFERENT neighbours across two lines
    // in the same action, the second call's "neighbour" swap used the
    // barrier's already-mutated x from the first call, not its original
    // position -- corrupting it onto the wrong spot entirely (observed:
    // the barrier landed exactly on top of a completely unrelated third
    // barrier). Seeing the whole batch at once here means the x-adjustment
    // below can tell, structurally, whether "swap with your neighbour" is
    // even well-defined for this action, rather than guessing per-call and
    // getting it wrong.
    //
    // A given line is silently skipped (no-op) if `barrierId` is already
    // at that end of it -- e.g. asking to shift further toward the TLE
    // when it's already that line's TLE-adjacent stop. Callers should
    // check for this ahead of time (ContextMenuController only offers a
    // line when the shift would do something) rather than rely on the
    // no-op, since an empty result still counts as a call for
    // undo-snapshotting purposes.
    //
    // Also swaps the two barriers' own `x` (never `y`, which reflects each
    // barrier's own lane midpoint, unrelated to how many hops it is from
    // the TLE) as an immediate best-effort visual approximation -- but
    // ONLY when every line in this call agrees on the same single
    // neighbour, which is the only case "swap with your neighbour" has one
    // unambiguous new x for. When lines disagree (a shared barrier
    // reordered against two different neighbours at once), no position is
    // guessed at all; a full Auto-arrange remains the authority that
    // reconciles everything from the (now-updated) topology.
    swapBarrierWithNeighbor(lineIds, barrierId, towardTle) {
      barrierId = this._resolvePlacementId(barrierId);
      const ids = Array.isArray(lineIds) ? lineIds : [lineIds];
      const neighborIds = new Set();
      ids.forEach((lineId) => {
        const line = this.lines.find((l) => l.id === lineId);
        if (!line) throw new Error(`Unknown line id: ${lineId}`);
        const idx = line.stops.indexOf(barrierId);
        if (idx === -1) throw new Error(`${barrierId} is not on line ${lineId}`);
        const neighborIdx = towardTle ? idx + 1 : idx - 1;
        if (neighborIdx < 0 || neighborIdx >= line.stops.length) return; // already at that end of this line

        const neighborId = line.stops[neighborIdx];
        line.stops[idx] = neighborId;
        line.stops[neighborIdx] = barrierId;
        neighborIds.add(neighborId);
      });

      if (neighborIds.size === 1) {
        const barrier = this.findById(barrierId);
        const neighbor = this.findById([...neighborIds][0]);
        const barrierX = barrier.x;
        barrier.x = neighbor.x;
        neighbor.x = barrierX;
      }

      this._emitChange();
    }

    // Bulk position update (e.g. auto-arrange) that only triggers one
    // re-render instead of one per element.
    setPositions(updates) {
      updates.forEach(({ id, x, y }) => {
        const el = this.findById(id);
        if (el && el.type !== 'hazard') {
          el.x = x;
          el.y = y;
        }
      });
      this._emitChange();
    }

    // Removes exactly one placement (never the node it references) —
    // shared by deleteElement (below, page-scoped, never retires anything
    // any more) and deleteNode's cross-page cascade (above, which retires
    // the NODE's id once for the whole batch).
    _removePlacementOnly(id) {
      const el = this.findById(id);
      if (!el) return;
      switch (el.type) {
        case 'cause':
          this.causes = this.causes.filter((c) => c.id !== id);
          this.lines = this.lines.filter((l) => l.originId !== id);
          break;
        case 'outcome':
          this.outcomes = this.outcomes.filter((o) => o.id !== id);
          this.lines = this.lines.filter((l) => l.originId !== id);
          break;
        case 'preventativeBarrier':
          this.preventativeBarriers = this.preventativeBarriers.filter((p) => p.id !== id);
          this.lines.forEach((line) => {
            const idx = line.stops.indexOf(id);
            if (idx !== -1) line.stops.splice(idx, 1);
          });
          break;
        case 'mitigativeBarrier':
          this.mitigativeBarriers = this.mitigativeBarriers.filter((m) => m.id !== id);
          this.lines.forEach((line) => {
            const idx = line.stops.indexOf(id);
            if (idx !== -1) line.stops.splice(idx, 1);
          });
          break;
        default:
          break;
      }
    }

    // Removes exactly one placement — the node it references (and any
    // other page's placement of it) is left completely untouched, per
    // ask 3: this is "Remove from Page" in the UI now, not "Delete". Never
    // retires anything (reversed from before this proposal — see
    // retiredIds above): a placement's own id was never visible, so
    // there's nothing about it worth remembering once it's gone.
    deleteElement(id) {
      const el = this.findById(id);
      if (!el || el.type === 'topLevelEvent' || el.type === 'hazard') return;
      this._removePlacementOnly(id);
      this._emitChange();
    }

    // --- Attachment of existing nodes (fan-in / chaining) ------------------

    // The stops (if any) that continue on past `barrierId`, toward the TLE
    // (for a PB) or the Outcome (for an MB), on some OTHER line already
    // passing through it (not `excludeLineId`, so a line about to be
    // replaced never answers its own question) — the first such line
    // found, an accepted scope boundary for the rare case where
    // `barrierId`'s existing lines have already diverged onto different
    // continuations. Shared by attachInputToPreventativeControl/
    // attachOutputToMitigativeControl's "inherit downstream" branch below,
    // and by ContextMenuController to decide up front whether asking the
    // user to choose would even matter (an empty result means there's
    // nothing to inherit either way).
    _donorContinuation(barrierId, excludeLineId) {
      const resolved = this._resolvePlacementId(barrierId);
      const donor = this.lines.find((l) => l.id !== excludeLineId && l.stops.includes(resolved));
      if (!donor) return [];
      const idx = donor.stops.indexOf(resolved);
      return donor.stops.slice(idx + 1);
    }

    // Attaches an existing Cause to the input side of `pcId`. The cause's
    // own Line is replaced wholesale — it now enters directly at pcId —
    // but what happens AFTER pcId depends on `inheritDownstream`:
    //   - true (default): follow whatever continuation toward the TLE
    //     already exists on `pcId` for some other line (_donorContinuation
    //     above) — the original, only-ever behavior before this option
    //     existed, e.g. attaching a bare Cause to a barrier that already
    //     continues on to a further shared barrier before the TLE.
    //   - false: stop caring what pcId's OTHER lines do, and instead keep
    //     whatever THIS cause's own line already had beyond pcId (if it
    //     had any barriers of its own before this call) — or, if it had
    //     none (the common bare-Cause case), the line simply ends at pcId
    //     and connects directly to the TLE from there, exactly as if pcId
    //     were freshly added rather than an existing, possibly-further-
    //     chained barrier.
    // ContextMenuController only surfaces this as a user choice when
    // _donorContinuation is non-empty (only then does the choice actually
    // change anything); it's silently irrelevant otherwise, and model-level
    // callers (tests included) that don't pass it at all keep today's
    // always-inherit behavior. Always single-line by construction (a Cause
    // has exactly one Line), unlike reattaching an existing barrier's own
    // output — which must be done from the specific Line segment instead
    // (see attachExistingBarrier), since a barrier can carry more than one
    // Line and there is no "which one" to ask here.
    attachInputToPreventativeControl(causeId, pcId, inheritDownstream = true) {
      causeId = this._resolvePlacementId(causeId);
      pcId = this._resolvePlacementId(pcId);
      const target = this.preventativeBarriers.find((p) => p.id === pcId);
      const cause = this.causes.find((c) => c.id === causeId);
      if (!target || !cause) throw new Error('Unknown element id');

      const causeLine = this._lineFor(causeId);
      const continuation = inheritDownstream
        ? this._donorContinuation(pcId, causeLine.id)
        : causeLine.stops.filter((id) => id !== pcId);
      causeLine.stops = [pcId, ...continuation];
      this._emitChange();
    }

    // Mirrors attachInputToPreventativeControl for the outcome/output side.
    attachOutputToMitigativeControl(mcId, outcomeId, inheritDownstream = true) {
      mcId = this._resolvePlacementId(mcId);
      outcomeId = this._resolvePlacementId(outcomeId);
      const source = this.mitigativeBarriers.find((m) => m.id === mcId);
      const outcome = this.outcomes.find((o) => o.id === outcomeId);
      if (!source || !outcome) throw new Error('Unknown element id');

      const outcomeLine = this._lineFor(outcomeId);
      const continuation = inheritDownstream
        ? this._donorContinuation(mcId, outcomeLine.id)
        : outcomeLine.stops.filter((id) => id !== mcId);
      outcomeLine.stops = [mcId, ...continuation];
      this._emitChange();
    }

    // --- Posterity of identifiers -------------------------------------
    // Delegates to NodeLibrary, same as the rest of this section.

    reEnableId(type, id) {
      return this._nodeLibrary.reEnableId(type, id);
    }

    disableRetiredId(type, id) {
      return this._nodeLibrary.disableRetiredId(type, id);
    }

    reassignId(nodeId, newId) {
      return this._nodeLibrary.reassignId(nodeId, newId);
    }

    // --- Quantitative-mode calculation pipeline --------------------------
    // Delegates to the read-only Quantitative collaborator (design review
    // finding 06, phase 1; see Quantitative.js) -- these three methods stay
    // here, unchanged in name and signature, because UndoController's Proxy
    // resolves undo behaviour by intercepting method names on THIS object,
    // PageScopedModel mirrors THIS surface, and ~300 tests call THESE names
    // directly. Never call `this._quantitative` from outside this class.

    computeTleLikelihood(pageId, opts = {}) {
      return this._quantitative.computeTleLikelihood(pageId, opts);
    }

    computeConsequenceLikelihood(outcomeId, opts = {}) {
      return this._quantitative.computeConsequenceLikelihood(outcomeId, opts);
    }

    getConsequenceRiskClass(outcomeId, opts = {}) {
      return this._quantitative.getConsequenceRiskClass(outcomeId, opts);
    }

    // --- Serialization ----------------------------------------------------
    // Delegates to DocumentSerializer (design review finding 06, phase 3;
    // see DocumentSerializer.js) — every method here stays, unchanged in
    // name and signature, for the same reason as computeTleLikelihood
    // above. DocumentSerializer also owns the referential-integrity check
    // (design review finding 03): loadFromJSON below throws, changing
    // nothing on this model, if `data` doesn't validate — see
    // ImportExportController.loadDocument for where that's caught and
    // turned into a message.

    _pageHeaderJSON(page) {
      return Bowtie.DocumentSerializer.pageHeaderToJSON(page);
    }

    _pageHeaderFromJSON(data) {
      return Bowtie.DocumentSerializer.pageHeaderFromJSON(data);
    }

    getPageJSON(pageId) {
      return Bowtie.DocumentSerializer.getPageJSON(this, pageId);
    }

    // Replaces exactly one page's header and content subset in place.
    loadPageFromJSON(pageId, data) {
      Bowtie.DocumentSerializer.loadPageFromJSON(this, pageId, data);
      this._emitChange();
    }

    toJSON() {
      return Bowtie.DocumentSerializer.toJSON(this);
    }

    // Loads a schema-v9 export. There is no migration path for older
    // schema versions — ImportExportController rejects a version mismatch
    // before this is ever called, so this only ever needs to read the
    // current shape. Passes the closure-local `BowtieModel` (this class),
    // not `Bowtie.BowtieModel`, as the constructor DocumentSerializer
    // builds its throwaway parse target from — see the comment on
    // DocumentSerializer.fromJSON for why that distinction matters.
    static fromJSON(data) {
      return Bowtie.DocumentSerializer.fromJSON(data, BowtieModel);
    }

    // Replaces this instance's contents with data parsed from an imported
    // JSON export. Mutates in place (rather than swapping the model
    // reference) so controllers holding a reference to this model keep
    // working. Throws without changing anything on this model if `data`
    // fails DocumentSerializer's referential-integrity check.
    loadFromJSON(data) {
      Bowtie.DocumentSerializer.loadFromJSON(this, data, BowtieModel);
      this._emitChange();
    }
  }

  BowtieModel.CANVAS_W = CANVAS_W;
  BowtieModel.CANVAS_H = CANVAS_H;
  BowtieModel.SCHEMA_VERSION = SCHEMA_VERSION;

  Bowtie.BowtieModel = BowtieModel;
})(window.Bowtie = window.Bowtie || {});
