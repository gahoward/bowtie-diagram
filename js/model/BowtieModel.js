(function (Bowtie) {
  // Default canvas dimensions the model uses for initial placement of new
  // elements. The view may render at any size; these are just sensible
  // starting coordinates before the user drags things or hits auto-arrange.
  const CANVAS_W = 1400;
  const CANVAS_H = 800;
  const ROW_SPACING = 110;
  const TOP_MARGIN = 90;
  const SCHEMA_VERSION = 6;
  const CONTROL_TYPES = ['cause', 'outcome', 'preventativeBarrier', 'mitigativeBarrier'];
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
      this.topLevelEvent = new Bowtie.TopLevelEvent({ x: CANVAS_W / 2, y: CANVAS_H / 2 });
      this.hazard = new Bowtie.Hazard();
      this.causes = [];
      this.outcomes = [];
      this.preventativeBarriers = [];
      this.mitigativeBarriers = [];
      // One Line per Cause and per Outcome — the first-order representation
      // of that element's continuous path to/from the TLE. Created/destroyed
      // alongside their origin, mutated directly by every chaining operation
      // below. See js/model/Line.js.
      this.lines = [];
      this.idCounters = {
        cause: 0,
        outcome: 0,
        preventativeBarrier: 0,
        mitigativeBarrier: 0,
        line: 0,
      };
      // Posterity of identifiers: every id, once used, is remembered here
      // forever after its element is deleted. { id, reEnabled } — reEnabled
      // ids are eligible for manual (never automatic) reassignment. Lines
      // are not part of this system — they are not user-facing identifiers,
      // they die with their Cause/Outcome, and baseline posterity wording
      // only ever enumerates Causes/Outcomes/Barriers.
      this.retiredIds = {
        cause: [], outcome: [], preventativeBarrier: [], mitigativeBarrier: [],
      };
    }

    onChange(fn) {
      this._listeners.push(fn);
    }

    _emitChange() {
      this._listeners.forEach((fn) => fn(this));
    }

    // --- Placement ----------------------------------------------------

    // Nudges `y` downward in ROW_SPACING steps at a fixed `x` until the
    // approximate bounding box (using each node's own stored w/h) no longer
    // overlaps any existing element — new nodes must never land on top of
    // existing ones.
    _findClearY(x, w, h, startY) {
      const boxes = [
        ...this.causes, ...this.outcomes, ...this.preventativeBarriers, ...this.mitigativeBarriers,
      ].map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
      boxes.push({
        x: this.topLevelEvent.x, y: this.topLevelEvent.y,
        w: this.topLevelEvent.r * 2, h: this.topLevelEvent.r * 2,
      });

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

    addCause(opts = {}) {
      this.idCounters.cause += 1;
      const id = `C_${this.idCounters.cause}`;
      const w = 140;
      const h = 60;
      const x = opts.x ?? 150;
      const y = opts.y ?? this._findClearY(x, w, h, TOP_MARGIN);
      const cause = new Bowtie.Cause({ id, name: opts.name || `Cause ${this.idCounters.cause}`, x, y, w, h });
      this.causes.push(cause);
      this.idCounters.line += 1;
      this.lines.push(new Bowtie.Line({
        id: `LINE_${this.idCounters.line}`, originType: 'cause', originId: id,
      }));
      this._emitChange();
      return cause;
    }

    addOutcome(opts = {}) {
      this.idCounters.outcome += 1;
      const id = `O_${this.idCounters.outcome}`;
      const w = 140;
      const h = 60;
      const x = opts.x ?? (CANVAS_W - 150);
      const y = opts.y ?? this._findClearY(x, w, h, TOP_MARGIN);
      const outcome = new Bowtie.Outcome({ id, name: opts.name || `Outcome ${this.idCounters.outcome}`, x, y, w, h });
      this.outcomes.push(outcome);
      this.idCounters.line += 1;
      this.lines.push(new Bowtie.Line({
        id: `LINE_${this.idCounters.line}`, originType: 'outcome', originId: id,
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

    _lineFor(originId) {
      return this.lines.find((l) => l.originId === originId);
    }

    // Every Line currently passing through `barrierId`, individually — there
    // is no bundling/grouping concept any more. Lines are always drawn as
    // their own distinct, continuously-straight run at their own origin's y;
    // two lines sharing a barrier still exit it at different points (their
    // own y), never funneled together. Used both for the "which line(s)
    // should the new barrier apply to" disambiguation UI and for computing
    // how tall a barrier's box needs to be.
    linesThrough(barrierId) {
      return this.lines.filter((l) => l.stops.includes(barrierId));
    }

    // The y-coordinate each Line passing through `barrierId` travels at
    // (its origin Cause/Outcome's own y, constant for the Line's whole run)
    // — Layout.controlBounds uses this to grow the box tall enough to cover
    // every lane passing through, each still exiting at its own height.
    laneYsThrough(barrierId) {
      return this.linesThrough(barrierId).map((l) => this.findById(l.originId).y);
    }

    // --- Creation of barriers, chained from a Cause/Outcome --------------

    // Creates a new PreventativeBarrier. If causeId already has a chain, the
    // new barrier is appended at the chain's TLE-facing end (the tail of its
    // Line) — always unambiguous, since it only ever touches this one Line.
    addPreventativeControl(causeId, opts = {}) {
      const cause = this.causes.find((c) => c.id === causeId);
      if (!cause) throw new Error(`Unknown cause id: ${causeId}`);
      const line = this._lineFor(causeId);

      const tailId = line.stops.length > 0 ? line.stops[line.stops.length - 1] : causeId;
      const anchor = line.stops.length > 0
        ? this.preventativeBarriers.find((p) => p.id === tailId)
        : cause;

      this.idCounters.preventativeBarrier += 1;
      const id = `PB_${this.idCounters.preventativeBarrier}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x + anchor.w + 60);
      const y = this._findClearY(x, w, h, opts.y ?? anchor.y);
      const pb = new Bowtie.PreventativeBarrier({
        id, name: opts.name || `Preventative Barrier ${this.idCounters.preventativeBarrier}`, x, y, w, h,
      });
      this.preventativeBarriers.push(pb);
      line.stops.push(id);
      this._emitChange();
      return pb;
    }

    // Mirrors addPreventativeControl: appends at the chain's TLE-facing end.
    addMitigativeControl(outcomeId, opts = {}) {
      const outcome = this.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) throw new Error(`Unknown outcome id: ${outcomeId}`);
      const line = this._lineFor(outcomeId);

      const tailId = line.stops.length > 0 ? line.stops[line.stops.length - 1] : outcomeId;
      const anchor = line.stops.length > 0
        ? this.mitigativeBarriers.find((m) => m.id === tailId)
        : outcome;

      this.idCounters.mitigativeBarrier += 1;
      const id = `MB_${this.idCounters.mitigativeBarrier}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x - anchor.w - 60);
      const y = this._findClearY(x, w, h, opts.y ?? anchor.y);
      const mb = new Bowtie.MitigativeBarrier({
        id, name: opts.name || `Mitigative Barrier ${this.idCounters.mitigativeBarrier}`, x, y, w, h,
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
    // still runs.
    _makeBarrierNear(kind, anchor, opts, dir) {
      const counterKey = kind;
      const idPrefix = kind === 'preventativeBarrier' ? 'PB' : 'MB';
      const label = kind === 'preventativeBarrier' ? 'Preventative Barrier' : 'Mitigative Barrier';
      this.idCounters[counterKey] += 1;
      const id = `${idPrefix}_${this.idCounters[counterKey]}`;
      const w = 36;
      const h = 110;
      const x = opts.x ?? (anchor.x + dir * 60);
      const y = this._findClearY(x, w, h, opts.y ?? anchor.y);
      const Ctor = kind === 'preventativeBarrier' ? Bowtie.PreventativeBarrier : Bowtie.MitigativeBarrier;
      const barrier = new Ctor({ id, name: opts.name || `${label} ${this.idCounters[counterKey]}`, x, y, w, h });
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
    insertBarrier(kind, direction, anchorId, opts = {}, selectedLineIds = null) {
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

    // Mirrors insertBarrier, but splices in an EXISTING barrier (`targetId`)
    // instead of creating one — any point along a Line should be attachable
    // to a different existing barrier, not just its two open ends.
    attachExistingBarrier(kind, direction, anchorId, targetId, selectedLineIds = null) {
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
        const idx = line.stops.indexOf(keepThroughId);
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

    // A barrier not appearing in any Line's stops is an orphan — nothing
    // actually flows through it. Export is blocked while any warning exists.
    getWarnings() {
      const warnings = [];
      const usedPb = new Set(this.lines.filter((l) => l.originType === 'cause').flatMap((l) => l.stops));
      this.preventativeBarriers.forEach((pb) => {
        if (!usedPb.has(pb.id)) {
          warnings.push({
            id: pb.id, type: 'orphaned-preventative-control',
            message: `${pb.id} (${pb.name}) is not connected to any Cause.`,
          });
        }
      });
      const usedMb = new Set(this.lines.filter((l) => l.originType === 'outcome').flatMap((l) => l.stops));
      this.mitigativeBarriers.forEach((mb) => {
        if (!usedMb.has(mb.id)) {
          warnings.push({
            id: mb.id, type: 'orphaned-mitigative-control',
            message: `${mb.id} (${mb.name}) is not connected to any Outcome.`,
          });
        }
      });
      return warnings;
    }

    // --- Lookup ---------------------------------------------------------

    findById(id) {
      if (this.topLevelEvent.id === id) return this.topLevelEvent;
      if (this.hazard.id === id) return this.hazard;
      return (
        this.causes.find((c) => c.id === id) ||
        this.outcomes.find((o) => o.id === id) ||
        this.preventativeBarriers.find((p) => p.id === id) ||
        this.mitigativeBarriers.find((m) => m.id === id) ||
        null
      );
    }

    // --- Mutation ---------------------------------------------------------

    setName(name) {
      this.name = name;
      this._emitChange();
    }

    renameElement(id, newName) {
      const el = this.findById(id);
      if (!el) return;
      el.name = newName;
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
    // Scoped to a single line on purpose: a barrier shared by several
    // lines can have a different neighbour (or none at all) in each one,
    // so "swap with your neighbour" only has one unambiguous meaning per
    // line -- exactly the same reasoning `attachExistingBarrier` already
    // documents for why reattachment is always line-scoped. Swapping two
    // stops within one line's own array can never affect any OTHER line,
    // even one that also passes through both of the swapped barriers,
    // since every Line owns its stops independently.
    //
    // A no-op (returns without changing anything) if `barrierId` is
    // already at that end of THIS line -- e.g. asking to shift it further
    // toward the TLE when it's already that line's TLE-adjacent stop.
    // Callers should check for this ahead of time (ContextMenuController
    // only offers the action for lines where it would do something) rather
    // than rely on the no-op, since this still counts as a call for
    // undo-snapshotting purposes even when nothing actually moves.
    //
    // Also swaps the two barriers' own `x` (never `y`, which reflects each
    // barrier's own lane midpoint, unrelated to how many hops it is from
    // the TLE) as an immediate best-effort visual approximation for the
    // common case of a barrier that's only ever on this one line -- so the
    // diagram doesn't look stale until the user thinks to re-run
    // Auto-arrange. When either barrier is ALSO shared by other lines
    // whose own ordering disagrees, this is only an approximation; a full
    // Auto-arrange remains the authority that reconciles everything from
    // the (now-updated) topology.
    swapBarrierWithNeighbor(lineId, barrierId, towardTle) {
      const line = this.lines.find((l) => l.id === lineId);
      if (!line) throw new Error(`Unknown line id: ${lineId}`);
      const idx = line.stops.indexOf(barrierId);
      if (idx === -1) throw new Error(`${barrierId} is not on line ${lineId}`);
      const neighborIdx = towardTle ? idx + 1 : idx - 1;
      if (neighborIdx < 0 || neighborIdx >= line.stops.length) return; // already at that end of this line

      const neighborId = line.stops[neighborIdx];
      line.stops[idx] = neighborId;
      line.stops[neighborIdx] = barrierId;

      const barrier = this.findById(barrierId);
      const neighbor = this.findById(neighborId);
      const barrierX = barrier.x;
      barrier.x = neighbor.x;
      neighbor.x = barrierX;

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

    deleteElement(id) {
      const el = this.findById(id);
      if (!el || el.type === 'topLevelEvent' || el.type === 'hazard') return;

      switch (el.type) {
        case 'cause':
          this.causes = this.causes.filter((c) => c.id !== id);
          this.lines = this.lines.filter((l) => l.originId !== id);
          this.retiredIds.cause.push({ id, reEnabled: false });
          break;
        case 'outcome':
          this.outcomes = this.outcomes.filter((o) => o.id !== id);
          this.lines = this.lines.filter((l) => l.originId !== id);
          this.retiredIds.outcome.push({ id, reEnabled: false });
          break;
        case 'preventativeBarrier':
          this.preventativeBarriers = this.preventativeBarriers.filter((p) => p.id !== id);
          this.lines.forEach((line) => {
            const idx = line.stops.indexOf(id);
            if (idx !== -1) line.stops.splice(idx, 1);
          });
          this.retiredIds.preventativeBarrier.push({ id, reEnabled: false });
          break;
        case 'mitigativeBarrier':
          this.mitigativeBarriers = this.mitigativeBarriers.filter((m) => m.id !== id);
          this.lines.forEach((line) => {
            const idx = line.stops.indexOf(id);
            if (idx !== -1) line.stops.splice(idx, 1);
          });
          this.retiredIds.mitigativeBarrier.push({ id, reEnabled: false });
          break;
        default:
          break;
      }
      this._emitChange();
    }

    // --- Attachment of existing nodes (fan-in / chaining) ------------------

    // Attaches an existing Cause to the input side of `pcId`. The cause's
    // own Line is replaced wholesale — it now enters directly at pcId,
    // inheriting whatever continuation toward the TLE already exists there
    // (the first existing line found through pcId, an accepted scope
    // boundary for the rare case where pcId's existing lines have already
    // diverged onto different continuations). Always single-line by
    // construction (a Cause has exactly one Line), unlike reattaching an
    // existing barrier's own output — which must be done from the specific
    // Line segment instead (see attachExistingBarrier), since a barrier can
    // carry more than one Line and there is no "which one" to ask here.
    attachInputToPreventativeControl(causeId, pcId) {
      const target = this.preventativeBarriers.find((p) => p.id === pcId);
      const cause = this.causes.find((c) => c.id === causeId);
      if (!target || !cause) throw new Error('Unknown element id');

      const causeLine = this._lineFor(causeId);
      const donor = this.lines.find((l) => l.id !== causeLine.id && l.stops.includes(pcId));
      let continuation = [];
      if (donor) {
        const idx = donor.stops.indexOf(pcId);
        continuation = donor.stops.slice(idx + 1);
      }
      causeLine.stops = [pcId, ...continuation];
      this._emitChange();
    }

    // Mirrors attachInputToPreventativeControl for the outcome/output side.
    attachOutputToMitigativeControl(mcId, outcomeId) {
      const source = this.mitigativeBarriers.find((m) => m.id === mcId);
      const outcome = this.outcomes.find((o) => o.id === outcomeId);
      if (!source || !outcome) throw new Error('Unknown element id');

      const outcomeLine = this._lineFor(outcomeId);
      const donor = this.lines.find((l) => l.id !== outcomeLine.id && l.stops.includes(mcId));
      let continuation = [];
      if (donor) {
        const idx = donor.stops.indexOf(mcId);
        continuation = donor.stops.slice(idx + 1);
      }
      outcomeLine.stops = [mcId, ...continuation];
      this._emitChange();
    }

    // --- Posterity of identifiers -------------------------------------

    reEnableId(type, id) {
      const entry = (this.retiredIds[type] || []).find((e) => e.id === id);
      if (!entry) return;
      entry.reEnabled = true;
      this._emitChange();
    }

    disableRetiredId(type, id) {
      const entry = (this.retiredIds[type] || []).find((e) => e.id === id);
      if (!entry) return;
      entry.reEnabled = false;
      this._emitChange();
    }

    // Manually assigns `newId` (which must be a re-enabled, previously-used
    // id of the same element type) to the element currently identified by
    // `elementId`, cascading the change through every Line that references
    // it. Much simpler than the pre-Line-rework version: there is only one
    // place connectivity lives now.
    reassignId(elementId, newId) {
      const el = this.findById(elementId);
      if (!el || !CONTROL_TYPES.includes(el.type)) {
        throw new Error('That element cannot be assigned a new identifier');
      }
      if (newId === elementId) return;

      const pool = this.retiredIds[el.type] || [];
      const entry = pool.find((e) => e.id === newId && e.reEnabled);
      if (!entry) throw new Error('That identifier is not available for manual assignment');
      if (this.findById(newId)) throw new Error('That identifier is already in use');

      const oldId = el.id;
      el.id = newId;

      this.lines.forEach((line) => {
        if (line.originId === oldId) line.originId = newId;
        line.stops = line.stops.map((s) => (s === oldId ? newId : s));
      });

      this.retiredIds[el.type] = pool.filter((e) => e.id !== newId);
      this.retiredIds[el.type].push({ id: oldId, reEnabled: false });

      this._emitChange();
    }

    // Replaces this instance's contents with data parsed from an imported
    // JSON export. Mutates in place (rather than swapping the model
    // reference) so controllers holding a reference to this model keep working.
    loadFromJSON(data) {
      const fresh = BowtieModel.fromJSON(data);
      this.name = fresh.name;
      this.topLevelEvent = fresh.topLevelEvent;
      this.hazard = fresh.hazard;
      this.causes = fresh.causes;
      this.outcomes = fresh.outcomes;
      this.preventativeBarriers = fresh.preventativeBarriers;
      this.mitigativeBarriers = fresh.mitigativeBarriers;
      this.lines = fresh.lines;
      this.idCounters = fresh.idCounters;
      this.retiredIds = fresh.retiredIds;
      this._emitChange();
    }

    // --- Serialization ----------------------------------------------------

    toJSON() {
      return {
        version: SCHEMA_VERSION,
        name: this.name,
        idCounters: { ...this.idCounters },
        retiredIds: {
          cause: this.retiredIds.cause.map((e) => ({ ...e })),
          outcome: this.retiredIds.outcome.map((e) => ({ ...e })),
          preventativeBarrier: this.retiredIds.preventativeBarrier.map((e) => ({ ...e })),
          mitigativeBarrier: this.retiredIds.mitigativeBarrier.map((e) => ({ ...e })),
        },
        topLevelEvent: {
          id: this.topLevelEvent.id, name: this.topLevelEvent.name,
          x: this.topLevelEvent.x, y: this.topLevelEvent.y, r: this.topLevelEvent.r,
        },
        hazard: { id: this.hazard.id, name: this.hazard.name },
        causes: this.causes.map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, w: c.w, h: c.h })),
        outcomes: this.outcomes.map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y, w: o.w, h: o.h })),
        preventativeBarriers: this.preventativeBarriers.map((p) => ({
          id: p.id, name: p.name, x: p.x, y: p.y, w: p.w, h: p.h,
        })),
        mitigativeBarriers: this.mitigativeBarriers.map((m) => ({
          id: m.id, name: m.name, x: m.x, y: m.y, w: m.w, h: m.h,
        })),
        lines: this.lines.map((l) => ({
          id: l.id, originType: l.originType, originId: l.originId, stops: l.stops.slice(),
        })),
      };
    }

    // Loads a schema-v6 export. There is no migration path for older
    // schema versions — ImportExportController rejects a version mismatch
    // before this is ever called, so this only ever needs to read the
    // current shape.
    static fromJSON(data) {
      const model = new BowtieModel();
      model.idCounters = { ...model.idCounters, ...(data.idCounters || {}) };
      model.name = data.name || 'Untitled Bowtie';
      model.topLevelEvent = new Bowtie.TopLevelEvent(data.topLevelEvent);
      model.hazard = new Bowtie.Hazard(data.hazard);
      model.causes = (data.causes || []).map((c) => new Bowtie.Cause(c));
      model.outcomes = (data.outcomes || []).map((o) => new Bowtie.Outcome(o));
      model.preventativeBarriers = (data.preventativeBarriers || []).map((p) => new Bowtie.PreventativeBarrier(p));
      model.mitigativeBarriers = (data.mitigativeBarriers || []).map((m) => new Bowtie.MitigativeBarrier(m));
      model.lines = (data.lines || []).map((l) => new Bowtie.Line(l));
      model.retiredIds = {
        cause: (data.retiredIds && data.retiredIds.cause) || [],
        outcome: (data.retiredIds && data.retiredIds.outcome) || [],
        preventativeBarrier: (data.retiredIds && data.retiredIds.preventativeBarrier) || [],
        mitigativeBarrier: (data.retiredIds && data.retiredIds.mitigativeBarrier) || [],
      };
      return model;
    }
  }

  BowtieModel.CANVAS_W = CANVAS_W;
  BowtieModel.CANVAS_H = CANVAS_H;
  BowtieModel.SCHEMA_VERSION = SCHEMA_VERSION;

  Bowtie.BowtieModel = BowtieModel;
})(window.Bowtie = window.Bowtie || {});
