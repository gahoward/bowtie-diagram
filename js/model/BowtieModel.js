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
  //
  // v10 (barrier_measures_proposal.md): `riskReductionFactor` -> Node.
  // `protection`, a measure-tagged quantity (`{ measure, value, ... } |
  // { unknown: true } | null` -- see BarrierMeasures.js) rather than a
  // bare RRF. Same failure mode as v9 if silently misread -- a v9
  // document's plain `{ value: '10' }` would be read as a PFD_avg of 10,
  // not an RRF of 10 -- so this is a version bump, not an additive field,
  // and there is (as with v9) no migration path.
  const SCHEMA_VERSION = 10;

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
      // 'max' (default, original behaviour) | 'sum' -- design review
      // finding 11: how the TLE combines multiple causes' contributions.
      // See Quantitative.js's computeTleLikelihood. Purely additive, safe
      // default (an older document simply lacks it and reads as 'max'),
      // so this doesn't bump SCHEMA_VERSION -- same reasoning as the
      // barrier-metadata fields in Node.js.
      this.tleAggregation = 'max';
      // barrier_measures_proposal.md's ProjectDefaults: the fallbacks a
      // barrier's own `protection` overrides (dangerousFraction) or falls
      // back to when it doesn't set its own (proofTestIntervalH, standby
      // barriers only). Decimal STRINGS, like every other quantitative
      // value, parsed at calculation time -- see Quantitative._defaults.
      // Purely additive, safe default (an older document simply lacks
      // them and reads as these values), so this doesn't bump
      // SCHEMA_VERSION -- same reasoning as tleAggregation above.
      this.dangerousFraction = '1';
      this.proofTestIntervalH = String(Bowtie.HOURS_PER_YEAR);
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
      // Line/splice/attach/chain machinery (design review finding 06,
      // phase 5; see LineTopology.js) -- like Quantitative/Warnings, reads
      // and mutates `this.lines`/the placement arrays through the model
      // reference rather than owning them.
      this._lineTopology = new Bowtie.LineTopology(this);
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
      const w = Bowtie.Geometry.CAUSE_OUTCOME_W;
      const h = 60;
      const x = opts.x ?? 150;
      const y = opts.y ?? this._findClearY(pageId, x, w, h, TOP_MARGIN);
      const cause = new Bowtie.Placement({
        id, type: 'cause', nodeId: node.id, x, y, w, h, pageId,
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
      const w = Bowtie.Geometry.CAUSE_OUTCOME_W;
      const h = 60;
      const x = opts.x ?? (CANVAS_W - 150);
      const y = opts.y ?? this._findClearY(pageId, x, w, h, TOP_MARGIN);
      const outcome = new Bowtie.Placement({
        id, type: 'outcome', nodeId: node.id, x, y, w, h, pageId,
      });
      this.outcomes.push(outcome);
      this.idCounters.line += 1;
      this.lines.push(new Bowtie.Line({
        id: `LINE_${this.idCounters.line}`, originType: 'outcome', originId: id, pageId,
      }));
      this._emitChange();
      return outcome;
    }

    // --- Line lookup / edge grouping / splicing / attachment -------------
    // Delegates to the LineTopology collaborator (design review finding 06,
    // phase 5; see LineTopology.js) — every method here stays, unchanged
    // in name and signature, for the same reason as computeTleLikelihood
    // above. addPreventativeControl/addMitigativeControl and
    // attachInputToPreventativeControl/attachOutputToMitigativeControl are
    // each two thin wrappers over one shared LineTopology method — see the
    // SIDE table there (design review finding 07).

    _resolvePlacementId(id) {
      return this._lineTopology._resolvePlacementId(id);
    }

    _lineFor(originId) {
      return this._lineTopology._lineFor(originId);
    }

    linesThrough(barrierId) {
      return this._lineTopology.linesThrough(barrierId);
    }

    laneYsThrough(barrierId) {
      return this._lineTopology.laneYsThrough(barrierId);
    }

    addPreventativeControl(causeId, opts = {}) {
      return this._lineTopology._addBarrierChainedFrom('preventativeBarrier', causeId, opts);
    }

    addMitigativeControl(outcomeId, opts = {}) {
      return this._lineTopology._addBarrierChainedFrom('mitigativeBarrier', outcomeId, opts);
    }

    insertBarrier(kind, direction, anchorId, opts = {}, selectedLineIds = null) {
      return this._lineTopology.insertBarrier(kind, direction, anchorId, opts, selectedLineIds);
    }

    attachExistingBarrier(kind, direction, anchorId, targetId, selectedLineIds = null) {
      return this._lineTopology.attachExistingBarrier(kind, direction, anchorId, targetId, selectedLineIds);
    }

    connectLineDirectlyToTle(lineId, keepThroughId) {
      return this._lineTopology.connectLineDirectlyToTle(lineId, keepThroughId);
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
    // Merges the read-only Warnings collaborator's orphan checks (design
    // review finding 06, phase 2; see Warnings.js) with Quantitative's two
    // advisory barrier-measure checks (barrier_measures_proposal.md) — the
    // one sanctioned place outside Quantitative's own three methods below
    // that reaches into `this._quantitative` (see the comment there for
    // why nothing else may).

    getWarnings() {
      return [...this._warnings.getWarnings(), ...this._quantitative.computeBarrierWarnings()];
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

    // Design review finding 11 -- see the constructor's `tleAggregation`
    // comment and Quantitative.js's computeTleLikelihood. Document-wide
    // like setMode/setRiskMatrix just above, not page-scoped.
    setTleAggregation(policy) {
      if (!['max', 'sum'].includes(policy)) throw new Error(`Unknown TLE aggregation policy: ${policy}`);
      this.tleAggregation = policy;
      this._emitChange();
    }

    // barrier_measures_proposal.md's ProjectDefaults -- see the
    // constructor's `dangerousFraction`/`proofTestIntervalH` comment.
    // Document-wide, like setTleAggregation above; both are optional
    // (only provided keys change) so ProjectSettingsController can commit
    // one field on blur without clobbering the other.
    setQuantitativeDefaults({ dangerousFraction, proofTestIntervalH } = {}) {
      if (dangerousFraction !== undefined) this.dangerousFraction = dangerousFraction;
      if (proofTestIntervalH !== undefined) this.proofTestIntervalH = proofTestIntervalH;
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
    // a barrier where the user wants it -- swaps `barrierId` with its
    // neighbour toward (or away from) the TLE, in every line named by
    // `lineIds` at once. See LineTopology.js for the full reasoning
    // (single-batch semantics, the x-swap's one-neighbour caveat).
    swapBarrierWithNeighbor(lineIds, barrierId, towardTle) {
      return this._lineTopology.swapBarrierWithNeighbor(lineIds, barrierId, towardTle);
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
    // Delegates to LineTopology, same as the section above. These two keep
    // their existing argument order (origin first for the PB side, barrier
    // first for the MB side) even though they now share one implementation
    // internally — see the SIDE table in LineTopology.js (finding 07).

    _donorContinuation(barrierId, excludeLineId) {
      return this._lineTopology._donorContinuation(barrierId, excludeLineId);
    }

    attachInputToPreventativeControl(causeId, pcId, inheritDownstream = true) {
      return this._lineTopology._attachOriginToBarrier('preventativeBarrier', causeId, pcId, inheritDownstream);
    }

    attachOutputToMitigativeControl(mcId, outcomeId, inheritDownstream = true) {
      return this._lineTopology._attachOriginToBarrier('mitigativeBarrier', outcomeId, mcId, inheritDownstream);
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
    // directly. Never call `this._quantitative` from outside this class --
    // getWarnings() above is the one other call site, for exactly the same
    // reason (it's a BowtieModel method, gluing two of its own collaborators
    // together, not an outside caller reaching in).

    computeTleLikelihood(pageId, opts = {}) {
      return this._quantitative.computeTleLikelihood(pageId, opts);
    }

    computeConsequenceLikelihood(outcomeId, opts = {}) {
      return this._quantitative.computeConsequenceLikelihood(outcomeId, opts);
    }

    getConsequenceRiskClass(outcomeId, opts = {}) {
      return this._quantitative.getConsequenceRiskClass(outcomeId, opts);
    }

    // barrier_measures_proposal.md's demand-rate readout -- see
    // Quantitative.computeDemandRateAt. Same delegation reasoning as the
    // three methods above.
    computeDemandRateAt(barrierId) {
      return this._quantitative.computeDemandRateAt(barrierId);
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
