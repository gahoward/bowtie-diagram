(function (Bowtie) {
  class ContextMenuController {
    // `triggerAutoArrange` re-lays-out the canvas after an action that
    // changes a barrier's position in the topology without moving anything
    // on screen itself (a reorder, a re-attach, or dropping straight to the
    // TLE) — left alone, the diagram would keep showing stale x/y until the
    // user remembered to click Auto-arrange, which is exactly the kind of
    // manual step these actions are meant to replace.
    constructor(model, svgRoot, triggerAutoArrange) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.triggerAutoArrange = triggerAutoArrange;
      this.menuEl = null;

      svgRoot.addEventListener('contextmenu', (e) => this._onContextMenu(e));
      svgRoot.addEventListener('dblclick', (e) => this._onDoubleClick(e));
      document.addEventListener('pointerdown', (e) => {
        if (this.menuEl && !this.menuEl.contains(e.target)) this._closeMenu();
      });
    }

    _onContextMenu(e) {
      const nodeEl = e.target.closest('.node');
      if (nodeEl) {
        e.preventDefault();
        const el = this.model.findById(nodeEl.getAttribute('data-id'));
        if (el) this._renderMenu(e.clientX, e.clientY, this._buildNodeItems(el, this._toSvgPoint(e)));
        return;
      }
      const lineEl = e.target.closest('.connection');
      if (lineEl) {
        e.preventDefault();
        const items = this._buildLineItems(lineEl, e);
        if (items.length > 0) this._renderMenu(e.clientX, e.clientY, items);
        return;
      }
      // Empty canvas — nothing under the cursor to target, so offer the two
      // things that always make sense regardless of what's currently on the
      // diagram: starting a new Cause or Outcome, placed right where the
      // user clicked (same "add it where you clicked" convention as the
      // line-gap and TLE menus below). `e.target` is always inside
      // `svgRoot` here, since that's what this listener is attached to.
      e.preventDefault();
      this._renderMenu(e.clientX, e.clientY, this._buildAddCauseOutcomeItems(this._toSvgPoint(e)));
    }

    // Shared by the empty-canvas menu and the TopLevelEvent's own node menu
    // — both are "nothing specific to react to, just offer to start a new
    // Cause/Outcome here" (feature request: a context menu reachable from
    // anywhere on the diagram or the TLE, not just an existing Cause/Outcome
    // node, to Add Cause/Add Outcome).
    //
    // Both items are offered regardless of which side of the TLE was
    // right-clicked, so a click on the Outcome side still offers "Add
    // Cause" (and vice versa). Placing it at that exact wrong-side point
    // would put a Cause to the right of the TLE / an Outcome to its left —
    // visually the wrong side (wishlist: this must self-correct, the same
    // way it would if the user had used the toolbar's Add Cause/Add Outcome
    // button instead). Only honor the click point when it's already on the
    // correct side; otherwise fall back to the toolbar's own placement
    // (no opts — BowtieModel.addCause/addOutcome's fixed default x, auto y).
    _buildAddCauseOutcomeItems(point) {
      const tleX = this.model.topLevelEvent.x;
      return [
        {
          label: 'Add Cause',
          action: () => (point.x <= tleX ? this.model.addCause(point) : this.model.addCause()),
        },
        {
          label: 'Add Outcome',
          action: () => (point.x >= tleX ? this.model.addOutcome(point) : this.model.addOutcome()),
        },
      ];
    }

    _onDoubleClick(e) {
      const g = e.target.closest('.node');
      if (!g) return;
      const el = this.model.findById(g.getAttribute('data-id'));
      if (el) this._rename(el);
    }

    _buildNodeItems(el, point) {
      const items = [];
      if (el.type === 'topLevelEvent') {
        items.push(...this._buildAddCauseOutcomeItems(point));
      }
      if (el.type === 'cause') {
        items.push({ label: 'Add Preventative Barrier', action: () => this.model.addPreventativeControl(el.id) });
        if (this.model.preventativeBarriers.length > 0) {
          items.push({
            label: 'Attach to Existing Preventative Barrier…',
            action: () => this._openAttachModal(
              'Attach Cause to Preventative Barrier',
              this.model.preventativeBarriers,
              (pb) => this._attachWithInheritPrompt(
                pb.id,
                this.model._lineFor(el.id).id,
                (inherit) => this.model.attachInputToPreventativeControl(el.id, pb.id, inherit),
              ),
            ),
          });
        }
      }
      if (el.type === 'outcome') {
        items.push({ label: 'Add Mitigative Barrier', action: () => this.model.addMitigativeControl(el.id) });
        if (this.model.mitigativeBarriers.length > 0) {
          items.push({
            label: 'Attach to Existing Mitigative Barrier…',
            action: () => this._openAttachModal(
              'Attach Outcome to Mitigative Barrier',
              this.model.mitigativeBarriers,
              (mb) => this._attachWithInheritPrompt(
                mb.id,
                this.model._lineFor(el.id).id,
                (inherit) => this.model.attachOutputToMitigativeControl(mb.id, el.id, inherit),
              ),
            ),
          });
        }
      }
      if (el.type === 'preventativeBarrier') {
        items.push({ label: 'Add Preventative Barrier', action: () => this._addPreventativeControlFrom(el) });
        // No "attach output to existing barrier" here: a barrier can carry
        // more than one Line, and reattaching from the barrier's own menu
        // has no way to ask "which one" — it silently dragged every Line
        // through it along for the ride. Reattachment is line-scoped by
        // construction when done from the specific line segment instead
        // (see _gapInsertItemsForCauseLine/_gapInsertItemsForOutcomeLine).
        items.push(...this._buildShuntItems(el.id));
      }
      if (el.type === 'mitigativeBarrier') {
        items.push({ label: 'Add Mitigative Barrier', action: () => this._addMitigativeControlFrom(el) });
        items.push(...this._buildShuntItems(el.id));
      }
      items.push({ label: 'Rename', action: () => this._rename(el) });
      if (el.type !== 'topLevelEvent' && el.type !== 'hazard') {
        items.push({ label: 'Delete', action: () => this.model.deleteElement(el.id) });
      }
      return items;
    }

    // Manual escape hatch (see BowtieModel.swapBarrierWithNeighbor): lets
    // the user reorder a barrier one step within its own path, toward or
    // away from the TLE -- an actual topology change (unlike an earlier
    // version of this feature, which only nudged the barrier's on-screen
    // x and so got silently undone by the very next Auto-arrange click).
    //
    // A barrier shared by several lines can have a different neighbour (or
    // none at all) in each one, so each direction is offered only for the
    // lines where a swap would actually do something: omitted entirely if
    // no line qualifies, applied directly with no prompt if exactly one
    // does, and offered as a "which path(s)?" picker (mirroring
    // _addPreventativeControlFrom's own multi-line modal) when more than
    // one does.
    _buildShuntItems(id) {
      const lines = this.model.linesThrough(id);
      const items = [];
      [true, false].forEach((towardTle) => {
        const eligible = lines.filter((l) => this._hasPathNeighbor(l, id, towardTle));
        if (eligible.length === 0) return;
        const label = towardTle ? 'Shift Toward TLE' : 'Shift Away From TLE';
        items.push({
          label,
          action: () => {
            if (eligible.length === 1) {
              this.model.swapBarrierWithNeighbor([eligible[0].id], id, towardTle);
              this.triggerAutoArrange();
              return;
            }
            this._openLineSelectModal(
              label,
              eligible.map((l) => ({ key: l.id, label: l.originId })),
              null,
              // Deliberately does NOT fall back to "every eligible line"
              // when nothing is checked (unlike insertBarrier's own
              // null-means-all convention) -- reordering a path the user
              // never selected would be a surprising side effect, not a
              // sensible default. Every checked line is passed to ONE
              // swapBarrierWithNeighbor call (one undo step for the whole
              // batch) rather than one call per line -- see that method's
              // own comment for why calling it repeatedly for the same
              // barrier used to corrupt its position.
              (selected) => {
                if (selected && selected.length > 0) {
                  this.model.swapBarrierWithNeighbor(selected, id, towardTle);
                  this.triggerAutoArrange();
                }
              },
              'This barrier carries multiple lines with a different neighbour here. '
                + 'Select which path(s) to reorder — anything left unselected keeps its current order.',
            );
          },
        });
      });
      return items;
    }

    // Whether swapping `barrierId` with its immediate TLE-ward (or
    // origin-ward) neighbour in `line`'s own stops would do anything --
    // false at whichever end of that line's chain already sits in the
    // requested direction (e.g. asking to shift further toward the TLE
    // when it's already that line's TLE-adjacent stop).
    _hasPathNeighbor(line, barrierId, towardTle) {
      const idx = line.stops.indexOf(barrierId);
      const neighborIdx = towardTle ? idx + 1 : idx - 1;
      return neighborIdx >= 0 && neighborIdx < line.stops.length;
    }

    // Lines are interactable in their own right: right-clicking anywhere
    // along one offers "Add a barrier here", spliced at that exact point.
    // Since a whole run is now drawn as one continuous straight line rather
    // than one segment per gap, which gap gets targeted is resolved from
    // the click's own x position against the line's existing stops.
    _buildLineItems(lineEl, e) {
      const role = lineEl.getAttribute('data-role');
      const lineId = lineEl.getAttribute('data-line-id');
      if (!lineId) return [];
      const point = this._toSvgPoint(e);
      if (role === 'cause-line' || role === 'cause-direct') {
        return this._gapInsertItemsForCauseLine(lineId, point);
      }
      if (role === 'outcome-line' || role === 'outcome-direct') {
        return this._gapInsertItemsForOutcomeLine(lineId, point);
      }
      return [];
    }

    _toSvgPoint(e) {
      const pt = this.svgRoot.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(this.svgRoot.getScreenCTM().inverse());
      return { x: svgPt.x, y: svgPt.y };
    }

    // A cause-origin Line's stops are already in increasing-x order (index 0
    // nearest the Cause, last nearest the TLE) — find the first stop whose x
    // is past the click; inserting "before" it lands in exactly the gap that
    // was clicked (before the first stop, between two stops, or — if none
    // qualify — after the last stop). The new barrier is placed right at the
    // clicked point (bugs.md: barriers were landing on the wrong side of
    // existing ones when placed by a fixed offset instead of the cursor).
    _gapInsertItemsForCauseLine(lineId, point) {
      const line = this.model.lines.find((l) => l.id === lineId);
      if (!line) return [];
      const clickOpts = { x: point.x, y: point.y };
      if (line.stops.length === 0) {
        const items = [{
          label: 'Add Preventative Barrier',
          action: () => this.model.addPreventativeControl(line.originId, clickOpts),
        }];
        if (this.model.preventativeBarriers.length > 0) {
          items.push(this._attachSegmentItem(
            'Attach to Existing Preventative Barrier…',
            this.model.preventativeBarriers,
            (target) => this._attachWithInheritPrompt(
              target.id,
              line.id,
              (inherit) => this.model.attachInputToPreventativeControl(line.originId, target.id, inherit),
            ),
          ));
        }
        return items;
      }
      const ordered = line.stops.map((id) => ({ id, x: this.model.findById(id).x }));
      const before = ordered.find((s) => clickOpts.x < s.x);
      const anchorId = before ? before.id : ordered[ordered.length - 1].id;
      const direction = before ? 'before' : 'after';
      const items = [{
        label: 'Add Preventative Barrier',
        action: () => this.model.insertBarrier('preventativeBarrier', direction, anchorId, clickOpts, [lineId]),
      }];
      const otherPbs = this.model.preventativeBarriers.filter((p) => !line.stops.includes(p.id));
      if (otherPbs.length > 0) {
        items.push(this._attachSegmentItem(
          'Attach to Existing Preventative Barrier…',
          otherPbs,
          (target) => this._safeAttach(() => this.model.attachExistingBarrier(
            'preventativeBarrier', direction, anchorId, target.id, [lineId],
          )),
        ));
      }
      // "Connect directly to the TLE" only does something past this gap's
      // TLE-adjacent barrier (before.id) — everything from there toward the
      // TLE gets dropped from THIS line. Meaningless in the `!before` case:
      // that gap is already the TLE-adjacent one, nothing to remove.
      if (before) {
        const beforeIdx = ordered.indexOf(before);
        const keepThroughId = beforeIdx > 0 ? ordered[beforeIdx - 1].id : null;
        items.push({
          label: 'Connect Directly to TLE',
          action: () => {
            this.model.connectLineDirectlyToTle(lineId, keepThroughId);
            this.triggerAutoArrange();
          },
        });
      }
      return items;
    }

    // Mirrors _gapInsertItemsForCauseLine: an outcome-origin Line's stops
    // are stored nearest-Outcome-first, i.e. decreasing x, so reverse them
    // to get the same increasing-x scan.
    _gapInsertItemsForOutcomeLine(lineId, point) {
      const line = this.model.lines.find((l) => l.id === lineId);
      if (!line) return [];
      const clickOpts = { x: point.x, y: point.y };
      if (line.stops.length === 0) {
        const items = [{
          label: 'Add Mitigative Barrier',
          action: () => this.model.addMitigativeControl(line.originId, clickOpts),
        }];
        if (this.model.mitigativeBarriers.length > 0) {
          items.push(this._attachSegmentItem(
            'Attach to Existing Mitigative Barrier…',
            this.model.mitigativeBarriers,
            (target) => this._attachWithInheritPrompt(
              target.id,
              line.id,
              (inherit) => this.model.attachOutputToMitigativeControl(target.id, line.originId, inherit),
            ),
          ));
        }
        return items;
      }
      const ordered = line.stops.slice().reverse().map((id) => ({ id, x: this.model.findById(id).x }));
      const before = ordered.find((s) => clickOpts.x < s.x);
      const anchorId = before ? before.id : ordered[ordered.length - 1].id;
      const direction = before ? 'before' : 'after';
      const items = [{
        label: 'Add Mitigative Barrier',
        action: () => this.model.insertBarrier('mitigativeBarrier', direction, anchorId, clickOpts, [lineId]),
      }];
      const otherMbs = this.model.mitigativeBarriers.filter((m) => !line.stops.includes(m.id));
      if (otherMbs.length > 0) {
        items.push(this._attachSegmentItem(
          'Attach to Existing Mitigative Barrier…',
          otherMbs,
          (target) => this._safeAttach(() => this.model.attachExistingBarrier(
            'mitigativeBarrier', direction, anchorId, target.id, [lineId],
          )),
        ));
      }
      // Mirrors the cause side, but reflected: meaningless only at the
      // TLE-adjacent-most gap (before === ordered[0], nothing between the
      // TLE and it to drop). Everywhere else — including the outcome-
      // adjacent-most gap (`!before`, which drops every barrier, mirroring
      // the cause side's cause-adjacent-most gap) — keeping through
      // `before.id` (or nothing, past the last one) and dropping whatever
      // used to continue further toward the TLE is exactly "connect
      // directly to the TLE" here. Stops are stored nearest-Outcome-first,
      // so the kept prefix naturally ends at before.id.
      const isTleAdjacentMostGap = before && before.id === ordered[0].id;
      if (!isTleAdjacentMostGap) {
        const keepThroughId = before ? before.id : null;
        items.push({
          label: 'Connect Directly to TLE',
          action: () => {
            this.model.connectLineDirectlyToTle(lineId, keepThroughId);
            this.triggerAutoArrange();
          },
        });
      }
      return items;
    }

    // A right-clicked line segment already identifies a single, specific
    // line (complex requirement: "select a line segment... and attach it to
    // another PB/MB") — so the picker just needs a target, unlike the
    // barrier-node menus which must also ask *which* line(s) since a barrier
    // can carry more than one.
    _attachSegmentItem(label, candidates, onPick) {
      return { label, action: () => this._openAttachModal(label, candidates, onPick) };
    }

    // Inserts a new PB after `pb`, toward the TLE. If pb currently carries
    // more than one distinct line, asks which of them the new barrier
    // should apply to (multi-select, by origin id — nothing is bundled).
    _addPreventativeControlFrom(pb, preselectedLineId) {
      const lines = this.model.linesThrough(pb.id);
      if (lines.length <= 1) {
        this.model.insertBarrier('preventativeBarrier', 'after', pb.id);
        return;
      }
      this._openLineSelectModal(
        'Add Preventative Barrier',
        lines.map((l) => ({ key: l.id, label: l.originId })),
        preselectedLineId,
        (selected) => this.model.insertBarrier('preventativeBarrier', 'after', pb.id, {}, selected),
      );
    }

    // Mirrors _addPreventativeControlFrom for MB's own "add" action, which
    // splices toward the Outcome.
    _addMitigativeControlFrom(mb, preselectedLineId) {
      const lines = this.model.linesThrough(mb.id);
      if (lines.length <= 1) {
        this.model.insertBarrier('mitigativeBarrier', 'after', mb.id);
        return;
      }
      this._openLineSelectModal(
        'Add Mitigative Barrier',
        lines.map((l) => ({ key: l.id, label: l.originId })),
        preselectedLineId,
        (selected) => this.model.insertBarrier('mitigativeBarrier', 'after', mb.id, {}, selected),
      );
    }

    _openLineSelectModal(title, options, preselectedKey, onConfirm, description) {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = description || 'This point currently carries multiple lines. Select which one(s) should route '
        + 'through the new barrier — anything left unselected continues exactly as before.';
      body.appendChild(p);

      const checks = options.map((opt) => {
        const label = document.createElement('label');
        label.className = 'modal-checkbox-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = opt.key;
        if (preselectedKey && opt.key === preselectedKey) input.checked = true;
        const span = document.createElement('span');
        span.textContent = opt.label;
        label.appendChild(input);
        label.appendChild(span);
        body.appendChild(label);
        return input;
      });

      Bowtie.ModalView.openModal({
        title,
        bodyEl: body,
        dismissible: false,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Confirm',
            primary: true,
            onClick: () => {
              const selected = checks.filter((c) => c.checked).map((c) => c.value);
              onConfirm(selected.length > 0 ? selected : null);
            },
          },
        ],
      });
    }

    _rename(el) {
      const body = document.createElement('div');
      const wrap = document.createElement('label');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = 'Name';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = el.name;
      wrap.appendChild(span);
      wrap.appendChild(input);
      body.appendChild(wrap);

      Bowtie.ModalView.openModal({
        title: `Rename ${el.id}`,
        bodyEl: body,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Save',
            primary: true,
            onClick: () => {
              const next = input.value.trim();
              if (next) this.model.renameElement(el.id, next);
            },
          },
        ],
      });
    }

    _showError(message) {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(p);
      Bowtie.ModalView.openModal({ title: 'Cannot Do That', bodyEl: body, actions: [{ label: 'OK', primary: true }] });
    }

    // The sole path every "attach to existing barrier" action runs through
    // (attachExistingBarrier's line-segment reattach, and the inherit-prompt
    // flow's attachInputToPreventativeControl/attachOutputToMitigativeControl
    // calls below) -- re-arranging here on success covers all of them in one
    // place rather than after each individual call site.
    _safeAttach(fn) {
      try {
        fn();
        this.triggerAutoArrange();
        return true;
      } catch (err) {
        this._showError(err.message);
        return false;
      }
    }

    // Wraps attachInputToPreventativeControl/attachOutputToMitigativeControl
    // (via `attach(inheritDownstream)`): only asks the user whether to
    // inherit `targetId`'s existing downstream continuation when there
    // actually IS one on some other line (`excludeLineId` is the line
    // about to be replaced, so it never answers its own question) --
    // otherwise inheriting or not makes no difference, so it just attaches
    // (with `inheritDownstream: true`, though `false` would produce the
    // exact same result) without bothering the user over a non-choice.
    _attachWithInheritPrompt(targetId, excludeLineId, attach) {
      const continuation = this.model._donorContinuation(targetId, excludeLineId);
      if (continuation.length === 0) {
        this._safeAttach(() => attach(true));
        return;
      }
      // What "decline" actually resolves to depends on whether this line
      // already had its own further barriers before this attach -- the
      // modal's wording needs to say which, not just always claim "goes
      // straight to the TLE" (only true for the common bare-origin case).
      const excludeLine = this.model.lines.find((l) => l.id === excludeLineId);
      const ownContinuation = excludeLine ? excludeLine.stops.filter((id) => id !== targetId) : [];
      this._openInheritDownstreamModal(
        continuation,
        ownContinuation,
        (inherit) => this._safeAttach(() => attach(inherit)),
      );
    }

    // `continuation` is the donor's stops past the barrier being attached
    // to (e.g. ['PB_3'] when attaching to a barrier that already continues
    // on to PB_3 before the TLE); `ownContinuation` is whatever this
    // line's OWN stops already were beyond the target barrier, if any --
    // declining keeps those instead, or goes straight to the TLE if there
    // were none. Offers a real third way out (Cancel) alongside the two
    // real choices, since this can come up mid-attach and the user may not
    // have realized the target barrier already continues further.
    _openInheritDownstreamModal(continuation, ownContinuation, onChoice) {
      const nameOf = (id) => {
        const el = this.model.findById(id);
        return el ? `${id} (${el.name})` : id;
      };
      const continuationNames = continuation.map(nameOf).join(', ');
      const declineDescription = ownContinuation.length > 0
        ? `keep going through its own existing path (${ownContinuation.map(nameOf).join(', ')}) instead`
        : 'go straight to the TLE from this barrier instead';
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = `This barrier already continues on to ${continuationNames} before reaching the TLE. `
        + `Should the new connection follow that same path, or ${declineDescription}?`;
      body.appendChild(p);

      Bowtie.ModalView.openModal({
        title: 'Inherit Downstream Barriers?',
        bodyEl: body,
        dismissible: false,
        actions: [
          { label: 'Cancel' },
          { label: 'Stop Here', onClick: () => onChoice(false) },
          { label: 'Follow Existing Path', primary: true, onClick: () => onChoice(true) },
        ],
      });
    }

    _openAttachModal(title, candidates, onPick) {
      const body = document.createElement('div');

      const filterWrap = document.createElement('label');
      filterWrap.className = 'modal-field';
      const filterLabel = document.createElement('span');
      filterLabel.textContent = 'Filter';
      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Search by id or name…';
      filterWrap.appendChild(filterLabel);
      filterWrap.appendChild(filterInput);
      body.appendChild(filterWrap);

      const list = document.createElement('div');
      list.className = 'attach-list';
      body.appendChild(list);

      const rows = candidates.map((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'attach-list-item';

        const idSpan = document.createElement('span');
        idSpan.className = 'attach-list-id';
        idSpan.textContent = c.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'attach-list-name';
        nameSpan.textContent = c.name;

        btn.appendChild(idSpan);
        btn.appendChild(nameSpan);
        btn.addEventListener('click', () => {
          onPick(c);
          modal.close();
        });
        list.appendChild(btn);
        return { el: btn, haystack: `${c.id} ${c.name}`.toLowerCase() };
      });

      filterInput.addEventListener('input', () => {
        const term = filterInput.value.trim().toLowerCase();
        rows.forEach((row) => { row.el.hidden = term.length > 0 && !row.haystack.includes(term); });
      });

      const modal = Bowtie.ModalView.openModal({
        title,
        bodyEl: body,
        actions: [{ label: 'Cancel' }],
      });
      filterInput.focus();
    }

    _renderMenu(x, y, items) {
      this._closeMenu();
      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;

      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'context-menu-item';
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          item.action();
          this._closeMenu();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      this.menuEl = menu;
    }

    _closeMenu() {
      if (this.menuEl) {
        this.menuEl.remove();
        this.menuEl = null;
      }
    }
  }

  Bowtie.ContextMenuController = ContextMenuController;
})(window.Bowtie = window.Bowtie || {});
