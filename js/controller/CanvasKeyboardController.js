(function (Bowtie) {
  // Nudge distance for Ctrl+arrow, in diagram units -- the same order as a
  // deliberate small drag, so a keyboard user can do what a mouse user
  // does by eye.
  const NUDGE = 10;

  // Canvas keyboard access (proposals/13). Every other surface in this app
  // was already operable: the toolbar, the menus, every modal with its
  // `inert` focus trap. The canvas had no focusable elements at all, so a
  // keyboard-only user could start a bowtie and then do nothing with it.
  //
  // The model here is a **roving tabindex**: exactly one node carries
  // `tabindex="0"` and the rest `-1`, so Tab enters the canvas once and
  // leaves it once, and arrow keys move within. Which node holds it is
  // controller state (`FocusController.selectedId`), deliberately the same
  // state mouse selection uses -- keyboard focus and click selection are
  // one concept in this app, and giving them one home is what keeps the
  // focus ring honest after a re-render replaces every node element.
  //
  // Navigation follows the DIAGRAM, not the DOM: left/right move along the
  // focused node's own line (threat -> its barriers -> top event ->
  // mitigative barriers -> consequence), up/down move between lanes in the
  // same column. That is the structure a sighted user reads off the
  // picture, and it is exactly what document order does not give.
  class CanvasKeyboardController {
    constructor(model, svgRoot, focus, {
      openProperties, openContextMenu, liveRegion, onLeave, onBeforeNudge,
    } = {}) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.focus = focus;
      this.openProperties = openProperties;
      this.openContextMenu = openContextMenu;
      this.liveRegion = liveRegion || null;
      this.onLeave = onLeave;
      // `moveElement` is deliberately NOT in UndoController's snapshotting
      // list -- a drag would otherwise push one entry per pointermove --
      // so a nudge takes its own snapshot first, exactly as
      // DragController does once per gesture.
      this.onBeforeNudge = onBeforeNudge;

      svgRoot.addEventListener('keydown', (e) => this._onKeyDown(e));
      // A click anywhere on the canvas already updates FocusController's
      // selection; the roving tabindex follows it so Tab returns to
      // whatever was last touched, by either input.
      svgRoot.addEventListener('focusin', (e) => this._onFocusIn(e));
      model.onChange(() => this.applyRovingTabindex());
      this.applyRovingTabindex();
    }

    // --- The roving tabindex -------------------------------------------

    // Called after every render (CanvasView replaces the whole node layer,
    // so the attribute has to be put back) and after any change to the
    // selection. Falls back to the first node so Tab always has somewhere
    // to land on a diagram nobody has touched yet.
    applyRovingTabindex() {
      const nodes = [...this.svgRoot.querySelectorAll('#nodes-layer .node, .nodes-layer .node')];
      if (nodes.length === 0) return;
      const wanted = this._domIdFor(this.focus.getSelectedId());
      const holder = nodes.find((n) => n.getAttribute('data-id') === wanted) || nodes[0];
      nodes.forEach((n) => n.setAttribute('tabindex', n === holder ? '0' : '-1'));
    }

    // The DOM key for a placement: its node id, except for an escalation
    // factor, which is keyed by its own placement id because the same
    // factor can appear twice on one page (proposals/08).
    _domIdFor(placementId) {
      if (!placementId) return null;
      const placement = this.model.findById(placementId);
      if (!placement) return null;
      return placement.type === 'escalationFactor' ? placement.id : placement.nodeId;
    }

    _elementFor(domId) {
      return this.model.findById(domId);
    }

    _focusedElement() {
      const active = document.activeElement;
      const g = active && active.closest ? active.closest('.node') : null;
      if (!g) return null;
      return this._elementFor(g.getAttribute('data-id'));
    }

    // Moves focus to `placement` and makes it the tabindex holder, so
    // leaving and re-entering the canvas comes back to the same place.
    focusPlacement(placement) {
      if (!placement) return false;
      const domId = placement.nodeId && placement.type !== 'escalationFactor'
        ? placement.nodeId : placement.id;
      const g = this.svgRoot.querySelector(`#nodes-layer .node[data-id="${domId}"]`);
      if (!g) return false;
      this.focus.selectPlacement(placement.id);
      this.applyRovingTabindex();
      g.focus();
      return true;
    }

    _onFocusIn(e) {
      const g = e.target && e.target.closest ? e.target.closest('.node') : null;
      if (!g) return;
      const placement = this._elementFor(g.getAttribute('data-id'));
      if (placement && placement.id !== this.focus.getSelectedId()) {
        this.focus.selectPlacement(placement.id);
      }
    }

    // --- The navigation map ---------------------------------------------

    // One ordered walk from a threat to a consequence, as a user reads it:
    // the threat, its barriers nearest-first, the top event, then the
    // mitigative barriers and the consequence of whichever line continues.
    // Built per keypress from the model rather than cached, because every
    // structural change would otherwise have to remember to invalidate it.
    _rowFor(placement) {
      const model = this.model;
      const tle = model.topLevelEvent;
      if (placement.type === 'threat' || placement.type === 'consequence') {
        const line = model._lineFor(placement.id);
        const stops = line ? line.stops.map((id) => model.findById(id)).filter(Boolean) : [];
        return placement.type === 'threat'
          ? [placement, ...stops, tle]
          : [tle, ...stops.slice().reverse(), placement];
      }
      if (placement.type === 'preventativeBarrier' || placement.type === 'mitigativeBarrier') {
        // A shared barrier belongs to several rows; the first line through
        // it stands in, which is what a sighted user's eye does too.
        const line = model.linesThrough(placement.id)[0];
        if (!line) return [placement, tle];
        const origin = model.findById(line.originId);
        return origin ? this._rowFor(origin) : [placement, tle];
      }
      if (placement.type === 'escalationFactor') {
        const line = model._lineFor(placement.id);
        const stops = line ? line.stops.map((id) => model.findById(id)).filter(Boolean) : [];
        const barrier = model.findById(placement.barrierId);
        return [placement, ...stops, barrier].filter(Boolean);
      }
      if (placement.type === 'escalationBarrier') {
        const line = model.lines.find((l) => l.stops.includes(placement.id));
        const factor = line ? model.findById(line.originId) : null;
        return factor ? this._rowFor(factor) : [placement];
      }
      return [placement];
    }

    // Up/down: the same "column" is everything at a comparable depth --
    // other threats for a threat, the other barriers in this barrier's own
    // column, other consequences for a consequence. Ordered by y, so the
    // movement matches what is on screen.
    _columnFor(placement) {
      const model = this.model;
      const byY = (a, b) => a.y - b.y;
      switch (placement.type) {
        case 'threat': return model.threats.slice().sort(byY);
        case 'consequence': return model.consequences.slice().sort(byY);
        case 'preventativeBarrier':
          return model.preventativeBarriers.filter((b) => Math.abs(b.x - placement.x) < 1).sort(byY);
        case 'mitigativeBarrier':
          return model.mitigativeBarriers.filter((b) => Math.abs(b.x - placement.x) < 1).sort(byY);
        case 'escalationFactor':
          return model.escalationFactorsFor(placement.barrierId).slice().sort(byY);
        default: return [placement];
      }
    }

    // A barrier's escalation factors hang below it (proposals/08), so Down
    // from a barrier with factors drops into the stack rather than to the
    // next barrier in the column -- the direction matches the drawing.
    _downFrom(placement) {
      if (placement.type === 'preventativeBarrier' || placement.type === 'mitigativeBarrier') {
        const factors = this.model.escalationFactorsFor(placement.id);
        if (factors.length > 0) return factors[0];
      }
      return this._stepInColumn(placement, 1);
    }

    _upFrom(placement) {
      if (placement.type === 'escalationFactor') {
        const first = this.model.escalationFactorsFor(placement.barrierId)[0];
        if (first && first.id === placement.id) return this.model.findById(placement.barrierId);
      }
      return this._stepInColumn(placement, -1);
    }

    _stepInColumn(placement, delta) {
      const column = this._columnFor(placement);
      const index = column.findIndex((p) => p.id === placement.id);
      if (index === -1) return null;
      return column[index + delta] || null;
    }

    _stepAlongRow(placement, delta) {
      const row = this._rowFor(placement);
      const index = row.findIndex((p) => p && p.id === placement.id);
      if (index === -1) return null;
      return row[index + delta] || null;
    }

    // --- Keys -------------------------------------------------------------

    _onKeyDown(e) {
      const placement = this._focusedElement();
      if (!placement) return;
      // A modal is open (ModalView marks #app inert): nothing on the
      // canvas should respond.
      const app = document.getElementById('app');
      if (app && app.inert) return;

      const nudge = e.ctrlKey || e.metaKey;
      const MOVES = {
        ArrowRight: () => (nudge ? this._nudge(placement, NUDGE, 0) : this._go(this._stepAlongRow(placement, 1))),
        ArrowLeft: () => (nudge ? this._nudge(placement, -NUDGE, 0) : this._go(this._stepAlongRow(placement, -1))),
        ArrowDown: () => (nudge ? this._nudge(placement, 0, NUDGE) : this._go(this._downFrom(placement))),
        ArrowUp: () => (nudge ? this._nudge(placement, 0, -NUDGE) : this._go(this._upFrom(placement))),
        Home: () => this._go(this.model.topLevelEvent),
        End: () => {
          const row = this._rowFor(placement);
          return this._go(row[row.length - 1]);
        },
      };
      if (MOVES[e.key]) {
        e.preventDefault();
        MOVES[e.key]();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.openProperties) this.openProperties(placement);
        return;
      }
      // Shift+F10 and the dedicated ContextMenu key are the two standard
      // ways to ask for a context menu from the keyboard.
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        this._openMenu(placement);
        return;
      }
      if (e.key === 'Escape') {
        // Leave the canvas rather than clearing the selection: the
        // selection is what Tab comes back to.
        e.preventDefault();
        if (this.onLeave) this.onLeave();
      }
    }

    _go(placement) {
      if (!placement) return;
      if (placement.type === 'topLevelEvent' || placement.type === 'hazard') {
        const g = this.svgRoot.querySelector(`#nodes-layer .node[data-id="${placement.id}"]`);
        if (g) {
          g.setAttribute('tabindex', '0');
          g.focus();
        }
        return;
      }
      this.focusPlacement(placement);
    }

    // One undo step per key, matching what DragController does for a whole
    // drag: a nudge is a deliberate single adjustment, not a stream.
    _nudge(placement, dx, dy) {
      if (placement.type === 'hazard') return; // fixed to the top event
      if (this.onBeforeNudge) this.onBeforeNudge();
      this.model.moveElement(placement.id, placement.x + dx, placement.y + dy);
      this.announce(`${this._shortName(placement)} moved`);
    }

    _openMenu(placement) {
      if (!this.openContextMenu) return;
      const g = this.svgRoot.querySelector(`#nodes-layer .node[data-id="${this._domIdFor(placement.id)
        || placement.id}"]`);
      const rect = g ? g.getBoundingClientRect() : { left: 0, bottom: 0, width: 0 };
      this.openContextMenu(placement, rect, g);
    }

    _shortName(placement) {
      if (!placement.nodeId) return placement.name || placement.type;
      const node = this.model.getNode(placement.nodeId);
      return node ? this.model.displayIdentifierFor(node) : placement.id;
    }

    // Polite, so it never interrupts what the user is already hearing.
    // Cleared first: repeating the same string would otherwise not be
    // re-announced at all.
    announce(message) {
      if (!this.liveRegion || !message) return;
      this.liveRegion.textContent = '';
      window.setTimeout(() => { this.liveRegion.textContent = message; }, 20);
    }
  }

  Bowtie.CanvasKeyboardController = CanvasKeyboardController;
})(window.Bowtie = window.Bowtie || {});
