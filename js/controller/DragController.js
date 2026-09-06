(function (Bowtie) {
  // Minimum edge-to-edge gap kept between two sequence-adjacent elements'
  // boxes — without it, "don't resequence past a neighbour" only clamps
  // center-to-center, which still lets two boxes slide fully on top of one
  // another (their centers coinciding) since it never accounts for either
  // box's own width (bugs.md-adjacent report).
  const MIN_GAP = 20;

  // Screen-pixel movement (from the pointerdown point) required before a
  // pointerdown-on-a-node is treated as an actual drag gesture, rather than
  // a plain click. Without this, EVERY click on a node — including
  // FocusController's "click a Cause/Outcome to dim unrelated elements",
  // which is explicitly non-mutating — fired `onDragStart` (undo.snapshot())
  // unconditionally on pointerdown, before any movement was observed. That
  // silently pushed a spurious snapshot AND cleared the entire redo stack on
  // every ordinary inspection click, with no dialog, no visual signal, and
  // no test catching it (architecture review finding, 2026). A small
  // threshold — the standard "did the user actually drag" check most UI
  // toolkits build in — is enough to fix it: a real drag exceeds this
  // within the first pixel or two of intentional movement; a click never
  // does.
  const DRAG_THRESHOLD_PX = 4;

  class DragController {
    // `onDragStart`, if given, fires once per drag gesture — the moment
    // movement first crosses DRAG_THRESHOLD_PX, not on pointerdown itself —
    // so UndoController gets one undo step per whole drag instead of one
    // per pointermove (`moveElement` itself is deliberately excluded from
    // its generic per-method-call snapshot hook), AND a plain click that
    // never becomes a drag never snapshots or touches redo history at all.
    constructor(model, svgRoot, onDragStart) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.onDragStart = onDragStart;
      this.pending = null; // { el, startClientX, startClientY, offset } — below threshold, not yet a drag
      this.dragging = null;
      this.offset = { dx: 0, dy: 0 };

      svgRoot.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      window.addEventListener('pointermove', (e) => this._onPointerMove(e));
      window.addEventListener('pointerup', () => this._onPointerUp());
    }

    _toSvgPoint(clientX, clientY) {
      const pt = this.svgRoot.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(this.svgRoot.getScreenCTM().inverse());
    }

    _onPointerDown(e) {
      if (e.button !== 0) return; // left button only; right-click is the context menu
      const g = e.target.closest('.node');
      if (!g) return;

      const el = this.model.findById(g.getAttribute('data-id'));
      if (!el || el.type === 'hazard') return; // Hazard has no independent position

      const p = this._toSvgPoint(e.clientX, e.clientY);
      this.pending = {
        el,
        startClientX: e.clientX,
        startClientY: e.clientY,
        offset: { dx: p.x - el.x, dy: p.y - el.y },
      };
      e.preventDefault();
    }

    // Below DRAG_THRESHOLD_PX, does nothing but wait — no snapshot, no
    // model mutation, nothing observable at all, so a plain click (and
    // FocusController's own click handling of the same pointerdown/up
    // pair) behaves exactly as if DragController weren't involved.
    _onPointerMove(e) {
      if (this.dragging) {
        const p = this._toSvgPoint(e.clientX, e.clientY);
        const x = this._clampX(this.dragging, p.x - this.offset.dx);
        const y = p.y - this.offset.dy;
        this.model.moveElement(this.dragging.id, x, y);
        return;
      }
      if (!this.pending) return;
      const dx = e.clientX - this.pending.startClientX;
      const dy = e.clientY - this.pending.startClientY;
      if ((dx * dx) + (dy * dy) < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;

      if (this.onDragStart) this.onDragStart();
      this.dragging = this.pending.el;
      this.offset = this.pending.offset;
      this.pending = null;
      this.svgRoot.classList.add('is-dragging');
      const p = this._toSvgPoint(e.clientX, e.clientY);
      const x = this._clampX(this.dragging, p.x - this.offset.dx);
      const y = p.y - this.offset.dy;
      this.model.moveElement(this.dragging.id, x, y);
    }

    // Causes and Preventative Barriers may never be dragged right of the
    // TLE's x-midpoint; Mitigative Barriers and Outcomes may never be
    // dragged left of it. On top of that, nothing may be dragged past
    // whatever Line.stops says comes immediately before/after it — a
    // barrier (or the Cause/Outcome feeding it) visually resequencing past
    // its neighbour would contradict what the model says its order is
    // (bugs.md). The TopLevelEvent itself is unconstrained either way.
    _clampX(el, x) {
      const tleX = this.model.topLevelEvent.x;
      let min = -Infinity;
      let max = Infinity;

      if (el.type === 'cause' || el.type === 'preventativeBarrier') max = tleX;
      if (el.type === 'outcome' || el.type === 'mitigativeBarrier') min = tleX;

      const seq = this._sequenceBounds(el);
      min = Math.max(min, seq.min);
      max = Math.min(max, seq.max);

      return Math.min(Math.max(x, min), max);
    }

    // Every node type here has a fixed, never-resized `w` (Cause/Outcome:
    // 140, both barrier kinds: 36 — see BowtieModel's add*/`_makeBarrierNear`),
    // so half-widths can be read straight off the model instead of guessing.
    _clearance(a, b) {
      return (a.w / 2) + (b.w / 2) + MIN_GAP;
    }

    // The [min, max] x-range `el` may occupy without resequencing past — or
    // overlapping the box of — a neighbour its own Line.stops (or, for a
    // Cause/Outcome, its line's first stop) says comes immediately
    // before/after it. A barrier can be shared by more than one Line, each
    // potentially with a different neighbour — its bounds are the tightest
    // constraint any of them impose.
    _sequenceBounds(el) {
      if (el.type === 'cause') {
        const nextId = this.model._lineFor(el.id).stops[0];
        if (!nextId) return { min: -Infinity, max: Infinity };
        const next = this.model.findById(nextId);
        return { min: -Infinity, max: next.x - this._clearance(el, next) };
      }
      if (el.type === 'outcome') {
        const nextId = this.model._lineFor(el.id).stops[0];
        if (!nextId) return { min: -Infinity, max: Infinity };
        const next = this.model.findById(nextId);
        return { min: next.x + this._clearance(el, next), max: Infinity };
      }
      if (el.type === 'preventativeBarrier') {
        let min = -Infinity;
        let max = Infinity;
        this.model.linesThrough(el.id).forEach((line) => {
          const idx = line.stops.indexOf(el.id);
          const left = this.model.findById(idx > 0 ? line.stops[idx - 1] : line.originId);
          min = Math.max(min, left.x + this._clearance(el, left));
          if (idx < line.stops.length - 1) {
            const right = this.model.findById(line.stops[idx + 1]);
            max = Math.min(max, right.x - this._clearance(el, right));
          }
        });
        return { min, max };
      }
      if (el.type === 'mitigativeBarrier') {
        // Stored nearest-Outcome-first: the stop before this one in the
        // array (idx - 1) sits closer to the Outcome (larger x, so it's
        // this barrier's right-hand bound); the one after (idx + 1) sits
        // closer to the TLE (smaller x, its left-hand bound) — the
        // opposite of the Preventative side's array-vs-x relationship.
        let min = -Infinity;
        let max = Infinity;
        this.model.linesThrough(el.id).forEach((line) => {
          const idx = line.stops.indexOf(el.id);
          const right = this.model.findById(idx > 0 ? line.stops[idx - 1] : line.originId);
          max = Math.min(max, right.x - this._clearance(el, right));
          if (idx < line.stops.length - 1) {
            const left = this.model.findById(line.stops[idx + 1]);
            min = Math.max(min, left.x + this._clearance(el, left));
          }
        });
        return { min, max };
      }
      return { min: -Infinity, max: Infinity };
    }

    _onPointerUp() {
      this.pending = null; // released before crossing the threshold — an ordinary click, nothing to clean up
      if (!this.dragging) return;
      this.dragging = null;
      this.svgRoot.classList.remove('is-dragging');
    }
  }

  Bowtie.DragController = DragController;
})(window.Bowtie = window.Bowtie || {});
