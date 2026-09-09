(function (Bowtie) {
  // Extracted from BowtieModel (design review finding 06, phase 5): the
  // line/splice/attach/chain machinery -- Line lookup, inserting a new
  // barrier into a chain, attaching an existing one, truncating back to
  // the TLE, and reordering a barrier against its neighbour. The biggest
  // and hairiest of the five phases, so it lands last, once the delegation
  // pattern was already proven by the other four.
  //
  // Like Quantitative/Warnings, this doesn't own `lines` (or the placement
  // arrays) itself -- `lines` stays a plain array on BowtieModel, alongside
  // causes/outcomes/preventativeBarriers/mitigativeBarriers, since
  // `_removePlacementOnly`/`linesForPage`/`deletePage`/DocumentSerializer
  // all read and mutate it as part of page/placement bookkeeping that's
  // core to BowtieModel, not line topology specifically. This collaborator
  // holds a `model` reference and mutates `model.lines` through it, the
  // same shape Quantitative/Warnings use for reading.
  //
  // Design review finding 07: `addPreventativeControl`/`addMitigativeControl`
  // and `attachInputToPreventativeControl`/`attachOutputToMitigativeControl`
  // were each two near-identical methods differing only by barrier kind,
  // which collection to search, and which direction from an anchor a fresh
  // barrier lands in. SPLICE_DIRECTION already wrote down the other such
  // asymmetry (which way "after"/"before" splices for each kind) as a
  // table everything else reads, rather than as parallel code; SIDE below
  // generalises that idea to cover these two pairs as well, so each
  // collapses to one implementation reading the difference out of data.
  // BowtieModel keeps both public method NAMES per kind, unchanged --
  // UndoController's Proxy and PageScopedModel both dispatch by name --
  // but each pair is now two thin wrappers over one shared method here.
  const SPLICE_DIRECTION = {
    preventativeBarrier: { after: 'towardTle', before: 'towardOrigin' },
    mitigativeBarrier: { after: 'towardOrigin', before: 'towardTle' },
  };
  const SIDE = {
    preventativeBarrier: {
      originCollection: 'causes',
      originType: 'cause',
      barrierCollection: 'preventativeBarriers',
      // The x-direction a freshly-chained barrier lands in, relative to
      // its anchor (the chain's current TLE-facing end) -- a PB chain
      // grows toward larger x (toward the TLE, which sits right of the
      // causes); an MB chain grows toward smaller x (toward the TLE,
      // which sits left of the outcomes).
      xSign: 1,
    },
    mitigativeBarrier: {
      originCollection: 'outcomes',
      originType: 'outcome',
      barrierCollection: 'mitigativeBarriers',
      xSign: -1,
    },
  };

  class LineTopology {
    constructor(model) {
      this.model = model;
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
      const model = this.model;
      const isPlacementId = (
        model.causes.some((c) => c.id === id) ||
        model.outcomes.some((o) => o.id === id) ||
        model.preventativeBarriers.some((p) => p.id === id) ||
        model.mitigativeBarriers.some((m) => m.id === id)
      );
      if (isPlacementId) return id;
      const placement = (
        model.causes.find((c) => c.nodeId === id) ||
        model.outcomes.find((o) => o.nodeId === id) ||
        model.preventativeBarriers.find((p) => p.nodeId === id) ||
        model.mitigativeBarriers.find((m) => m.nodeId === id)
      );
      return placement ? placement.id : id;
    }

    _lineFor(originId) {
      return this.model.lines.find((l) => l.originId === this._resolvePlacementId(originId));
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
      return this.model.lines.filter((l) => l.stops.includes(resolved));
    }

    // The y-coordinate each Line passing through `barrierId` travels at
    // (its origin Cause/Outcome's own y, constant for the Line's whole run)
    // — Layout.controlBounds uses this to grow the box tall enough to cover
    // every lane passing through, each still exiting at its own height.
    laneYsThrough(barrierId) {
      return this.linesThrough(barrierId).map((l) => this.model.findById(l.originId).y);
    }

    // --- Creation of barriers, chained from a Cause/Outcome --------------
    //
    // Creates a new barrier placement of `kind`, chained from `originId`
    // (a Cause for a PB, an Outcome for an MB). If `originId` already has
    // a chain, the new barrier is appended at the chain's TLE-facing end
    // (the tail of its Line) — always unambiguous, since it only ever
    // touches this one Line. Accepts either creation shape in `opts` — see
    // BowtieModel._resolveOrCreateNode. The one shared implementation
    // behind addPreventativeControl/addMitigativeControl — see the SIDE
    // table above (design review finding 07).
    _addBarrierChainedFrom(kind, originId, opts = {}) {
      const model = this.model;
      const side = SIDE[kind];
      originId = this._resolvePlacementId(originId);
      const origin = model[side.originCollection].find((o) => o.id === originId);
      if (!origin) throw new Error(`Unknown ${side.originType} id: ${originId}`);
      const line = this._lineFor(originId);

      const tailId = line.stops.length > 0 ? line.stops[line.stops.length - 1] : originId;
      const anchor = line.stops.length > 0
        ? model[side.barrierCollection].find((b) => b.id === tailId)
        : origin;

      const node = model._resolveOrCreateNode(kind, opts, origin.pageId);
      model.idCounters.placement += 1;
      const id = `PLACEMENT_${model.idCounters.placement}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x + side.xSign * (anchor.w + 60));
      const y = model._findClearY(origin.pageId, x, w, h, opts.y ?? anchor.y);
      const Ctor = kind === 'preventativeBarrier' ? Bowtie.PreventativeBarrier : Bowtie.MitigativeBarrier;
      const barrier = new Ctor({
        id, nodeId: node.id, x, y, w, h, pageId: origin.pageId,
      });
      model[side.barrierCollection].push(barrier);
      line.stops.push(id);
      model._emitChange();
      return barrier;
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
      this.model._emitChange();
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
      this.model._emitChange();
      return newBarrier;
    }

    // `dir` is +1 when the new barrier belongs on the larger-x side of
    // `anchor` and -1 when it belongs on the smaller-x side — callers pass
    // the direction that matches whichever way this particular splice is
    // headed (toward the TLE or toward the origin), so a barrier inserted
    // "before" an anchor never lands past it on the wrong side. `opts.y`
    // (when given, e.g. from a line-click's cursor position) only seeds the
    // clear-space search rather than overriding it, so collision avoidance
    // still runs. Accepts either creation shape — see
    // BowtieModel._resolveOrCreateNode.
    _makeBarrierNear(kind, anchor, opts, dir) {
      const model = this.model;
      const node = model._resolveOrCreateNode(kind, opts, anchor.pageId);
      model.idCounters.placement += 1;
      const id = `PLACEMENT_${model.idCounters.placement}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x + dir * 60);
      const y = model._findClearY(anchor.pageId, x, w, h, opts.y ?? anchor.y);
      const Ctor = kind === 'preventativeBarrier' ? Bowtie.PreventativeBarrier : Bowtie.MitigativeBarrier;
      const barrier = new Ctor({
        id, nodeId: node.id, x, y, w, h, pageId: anchor.pageId,
      });
      this._barrierCollection(kind).push(barrier);
      return barrier;
    }

    _barrierCollection(kind) {
      return kind === 'preventativeBarrier' ? this.model.preventativeBarriers : this.model.mitigativeBarriers;
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
    // Accepts either creation shape in `opts` — see
    // BowtieModel._resolveOrCreateNode.
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
      const line = this.model.lines.find((l) => l.id === lineId);
      if (!line) throw new Error(`Unknown line id: ${lineId}`);
      if (keepThroughId === null) {
        line.stops = [];
      } else {
        const resolvedKeepThroughId = this._resolvePlacementId(keepThroughId);
        const idx = line.stops.indexOf(resolvedKeepThroughId);
        if (idx === -1) throw new Error(`${keepThroughId} is not on line ${lineId}`);
        line.stops = line.stops.slice(0, idx + 1);
      }
      this.model._emitChange();
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
    // either barrier kind (see _addBarrierChainedFrom: each newly-appended
    // barrier lands one index further toward the TLE than the one before
    // it, for both). So "toward the TLE" always means swapping with the
    // NEXT index and "away from the TLE" always means swapping with the
    // PREVIOUS one -- no kind-specific mirroring needed here, unlike the
    // x-pixel arithmetic the old version of this method needed.
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
      const model = this.model;
      barrierId = this._resolvePlacementId(barrierId);
      const ids = Array.isArray(lineIds) ? lineIds : [lineIds];
      const neighborIds = new Set();
      ids.forEach((lineId) => {
        const line = model.lines.find((l) => l.id === lineId);
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
        const barrier = model.findById(barrierId);
        const neighbor = model.findById([...neighborIds][0]);
        const barrierX = barrier.x;
        barrier.x = neighbor.x;
        neighbor.x = barrierX;
      }

      model._emitChange();
    }

    // --- Attachment of existing nodes (fan-in / chaining) ------------------

    // The stops (if any) that continue on past `barrierId`, toward the TLE
    // (for a PB) or the Outcome (for an MB), on some OTHER line already
    // passing through it (not `excludeLineId`, so a line about to be
    // replaced never answers its own question) — the first such line
    // found, an accepted scope boundary for the rare case where
    // `barrierId`'s existing lines have already diverged onto different
    // continuations. Shared by _attachOriginToBarrier's "inherit
    // downstream" branch below, and by ContextMenuController to decide up
    // front whether asking the user to choose would even matter (an empty
    // result means there's nothing to inherit either way).
    _donorContinuation(barrierId, excludeLineId) {
      const resolved = this._resolvePlacementId(barrierId);
      const donor = this.model.lines.find((l) => l.id !== excludeLineId && l.stops.includes(resolved));
      if (!donor) return [];
      const idx = donor.stops.indexOf(resolved);
      return donor.stops.slice(idx + 1);
    }

    // Attaches an existing Cause/Outcome (`originId`) to `barrierId`'s
    // origin-facing side. The origin's own Line is replaced wholesale — it
    // now enters directly at barrierId — but what happens AFTER barrierId
    // depends on `inheritDownstream`:
    //   - true (default): follow whatever continuation toward the TLE
    //     already exists on barrierId for some other line
    //     (_donorContinuation above) — the original, only-ever behavior
    //     before this option existed, e.g. attaching a bare Cause to a
    //     barrier that already continues on to a further shared barrier
    //     before the TLE.
    //   - false: stop caring what barrierId's OTHER lines do, and instead
    //     keep whatever THIS origin's own line already had beyond
    //     barrierId (if it had any barriers of its own before this call)
    //     — or, if it had none (the common bare-Cause/-Outcome case), the
    //     line simply ends at barrierId and connects directly to the TLE
    //     from there, exactly as if barrierId were freshly added rather
    //     than an existing, possibly-further-chained barrier.
    // ContextMenuController only surfaces this as a user choice when
    // _donorContinuation is non-empty (only then does the choice actually
    // change anything); it's silently irrelevant otherwise, and model-level
    // callers (tests included) that don't pass it at all keep today's
    // always-inherit behavior. Always single-line by construction (a Cause
    // or Outcome has exactly one Line), unlike reattaching an existing
    // barrier's own output — which must be done from the specific Line
    // segment instead (see attachExistingBarrier), since a barrier can
    // carry more than one Line and there is no "which one" to ask here.
    //
    // The one shared implementation behind attachInputToPreventativeControl/
    // attachOutputToMitigativeControl — see the SIDE table above (design
    // review finding 07). Those two keep their own argument order (origin
    // first for the PB side, barrier first for the MB side, matching their
    // existing "input"/"output" framing and every existing caller); this
    // takes the normalized (originId, barrierId) order internally.
    _attachOriginToBarrier(kind, originId, barrierId, inheritDownstream) {
      const model = this.model;
      const side = SIDE[kind];
      originId = this._resolvePlacementId(originId);
      barrierId = this._resolvePlacementId(barrierId);
      const target = model[side.barrierCollection].find((b) => b.id === barrierId);
      const origin = model[side.originCollection].find((o) => o.id === originId);
      if (!target || !origin) throw new Error('Unknown element id');

      const originLine = this._lineFor(originId);
      const continuation = inheritDownstream
        ? this._donorContinuation(barrierId, originLine.id)
        : originLine.stops.filter((id) => id !== barrierId);
      originLine.stops = [barrierId, ...continuation];
      model._emitChange();
    }
  }

  Bowtie.LineTopology = LineTopology;
})(window.Bowtie = window.Bowtie || {});
