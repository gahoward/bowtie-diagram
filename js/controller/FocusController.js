(function (Bowtie) {
  // "Focus": clicking a Cause, Outcome, or a specific line greys out
  // everything on that same side not connected to the selection. Purely a
  // transient UI/view concern — not diagram data, computed fresh from the
  // model's Lines each time, and re-applied after every render (since
  // CanvasView replaces the whole node/connection DOM on every change).
  class FocusController {
    constructor(model, svgRoot) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.focusedLineIds = null; // Set<string> | null
      this.hoveredLineId = null; // string | null
      // The placement the user last clicked -- what Delete removes, and
      // (later) the seed of the canvas keyboard focus model. Distinct
      // from `focusedLineIds`: focus dims a whole side, selection marks
      // one node, and a barrier click selects without focusing anything.
      this.selectedId = null; // placement id | null

      svgRoot.addEventListener('click', (e) => this._onClick(e));
      svgRoot.addEventListener('pointerover', (e) => this._onPointerOver(e));
      svgRoot.addEventListener('pointerout', (e) => this._onPointerOut(e));
      model.onChange(() => {
        this.hoveredLineId = null;
        // A selected node can have been deleted (or removed with the very
        // Delete key that reads this) -- drop a selection that no longer
        // resolves rather than leaving a dangling id behind.
        if (this.selectedId && !this.model.findById(this.selectedId)) this.selectedId = null;
        this._apply();
      });
    }

    // A Line renders as up to two separate <line> elements sharing one
    // data-line-id (a flat run plus the bend into the TLE) — bolding only
    // whichever single element the pointer happens to be over (plain CSS
    // `:hover`) made the far segment look like a disconnected, separate
    // thing. Toggling `.hovered` on every element sharing that id keeps the
    // whole line consistent regardless of which part triggered it.
    _onPointerOver(e) {
      const lineEl = e.target.closest('.connection[data-line-id]');
      if (!lineEl) return;
      this._setHoveredLine(lineEl.getAttribute('data-line-id'));
    }

    _onPointerOut(e) {
      const lineEl = e.target.closest('.connection[data-line-id]');
      if (!lineEl) return;
      const related = e.relatedTarget && e.relatedTarget.closest
        ? e.relatedTarget.closest('.connection[data-line-id]') : null;
      if (related && related.getAttribute('data-line-id') === lineEl.getAttribute('data-line-id')) return;
      this._setHoveredLine(null);
    }

    _setHoveredLine(lineId) {
      if (this.hoveredLineId === lineId) return;
      this.hoveredLineId = lineId;
      this.svgRoot.querySelectorAll('.connection[data-line-id]').forEach((l) => {
        l.classList.toggle('hovered', l.getAttribute('data-line-id') === lineId);
      });
    }

    getSelectedId() {
      return this.selectedId;
    }

    clearSelection() {
      this.selectedId = null;
      this._apply();
    }

    _onClick(e) {
      const nodeEl = e.target.closest('.node');
      const lineEl = e.target.closest('.connection');

      // Selection tracks whichever node was clicked (never the TLE or
      // Hazard -- neither can be removed from a page). `data-id` is the
      // NODE id; Delete needs the placement on THIS page, so resolve it
      // through the model rather than assuming the two are the same.
      this.selectedId = null;
      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-id');
        const placement = [...this.model.causes, ...this.model.outcomes,
          ...this.model.preventativeBarriers, ...this.model.mitigativeBarriers]
          .find((p) => p.nodeId === nodeId);
        if (placement) this.selectedId = placement.id;
      }

      let clickedLineIds = null;
      if (nodeEl) {
        const type = nodeEl.className.baseVal || nodeEl.getAttribute('class') || '';
        if (type.includes('cause') || type.includes('outcome')) {
          const id = nodeEl.getAttribute('data-id');
          const line = this.model._lineFor(id);
          if (line) clickedLineIds = [line.id];
        }
      } else if (lineEl) {
        const raw = lineEl.getAttribute('data-line-id');
        if (raw) clickedLineIds = [raw];
      }

      if (!clickedLineIds) {
        // Clicked empty canvas, a Barrier/TLE/Hazard node, or an
        // unfocusable line (e.g. the fixed Hazard->TLE connector) — clears
        // any active focus.
        this._setFocus(null);
        return;
      }

      const same = this.focusedLineIds
        && clickedLineIds.length === this.focusedLineIds.size
        && clickedLineIds.every((id) => this.focusedLineIds.has(id));
      this._setFocus(same ? null : new Set(clickedLineIds));
    }

    _setFocus(lineIdSet) {
      this.focusedLineIds = lineIdSet;
      this._apply();
    }

    // Programmatic focus on one placement (the Warnings modal's "Show"):
    // a Cause/Outcome focuses its own Line, a barrier every Line through
    // it -- the same effect as clicking the node, without the click. A
    // placement with no Line at all (an orphaned barrier -- exactly what
    // the blocking warnings are about) clears focus instead, since there
    // is nothing to dim against.
    focusPlacement(placementId) {
      const placement = this.model.findById(placementId);
      if (!placement) return;
      let lineIds = [];
      if (placement.type === 'cause' || placement.type === 'outcome') {
        const line = this.model._lineFor(placementId);
        if (line) lineIds = [line.id];
      } else {
        lineIds = this.model.linesThrough(placementId).map((l) => l.id);
      }
      this._setFocus(lineIds.length > 0 ? new Set(lineIds) : null);
    }

    _apply() {
      const nodes = this.svgRoot.querySelectorAll('.node');
      const lines = this.svgRoot.querySelectorAll('.connection');

      // Re-applied after every render, like the dimming below: CanvasView
      // replaces the whole node layer, so the class has to be put back.
      const selected = this.selectedId ? this.model.findById(this.selectedId) : null;
      nodes.forEach((n) => {
        n.classList.toggle('selected', Boolean(selected) && n.getAttribute('data-id') === selected.nodeId);
      });

      if (!this.focusedLineIds) {
        nodes.forEach((n) => n.classList.remove('dimmed'));
        lines.forEach((l) => l.classList.remove('dimmed'));
        return;
      }

      const focusedLines = Array.from(this.focusedLineIds)
        .map((id) => this.model.lines.find((l) => l.id === id))
        .filter(Boolean);
      if (focusedLines.length === 0) return;
      const side = focusedLines[0].originType; // 'cause' | 'outcome'

      // Line.originId/.stops are internal PLACEMENT ids (never rendered),
      // but a node's DOM element is keyed by its NODE id (`data-id` --
      // node_library_proposal.md "Two id spaces") since the node-library
      // rework. Resolve each placement id to its owning node's id before
      // comparing against `data-id` below.
      const nodeIdFor = (placementId) => {
        const el = this.model.findById(placementId);
        return el ? el.nodeId : null;
      };
      const relatedOriginIds = new Set(focusedLines.map((l) => nodeIdFor(l.originId)));
      const relatedBarrierIds = new Set(focusedLines.flatMap((l) => l.stops).map(nodeIdFor));

      nodes.forEach((n) => {
        const cls = n.getAttribute('class') || '';
        const id = n.getAttribute('data-id');
        let dim = false;
        if (side === 'cause') {
          if (cls.includes(' cause')) dim = !relatedOriginIds.has(id);
          else if (cls.includes('preventative-barrier')) dim = !relatedBarrierIds.has(id);
        } else {
          if (cls.includes(' outcome')) dim = !relatedOriginIds.has(id);
          else if (cls.includes('mitigative-barrier')) dim = !relatedBarrierIds.has(id);
        }
        n.classList.toggle('dimmed', dim);
      });

      lines.forEach((l) => {
        const role = l.getAttribute('data-role');
        if (!role) { l.classList.remove('dimmed'); return; } // Hazard<->TLE: always visible
        const lineId = l.getAttribute('data-line-id');
        const relevantSide = side === 'cause'
          ? ['cause-line', 'cause-direct'].includes(role)
          : ['outcome-line', 'outcome-direct'].includes(role);
        if (!relevantSide) { l.classList.remove('dimmed'); return; }
        l.classList.toggle('dimmed', !this.focusedLineIds.has(lineId));
      });
    }
  }

  Bowtie.FocusController = FocusController;
})(window.Bowtie = window.Bowtie || {});
