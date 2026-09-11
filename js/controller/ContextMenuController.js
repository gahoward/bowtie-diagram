(function (Bowtie) {
  // Design review finding 07: the two largest mirrored pairs in this file
  // -- _gapInsertItemsForCauseLine/-OutcomeLine (originally 77/84 lines,
  // 48 byte-identical) and _addPreventativeControlFrom/
  // _addMitigativeControlFrom -- differed only by barrier kind, which
  // model collection/method to use, argument order on the origin-vs-
  // barrier-first attach calls, and (gap-insert only) which physical
  // x-direction is "toward the TLE" from the origin, since a Cause sits
  // left of the TLE and an Outcome sits right of it. This table writes
  // that down once, mirroring LineTopology.js's own SIDE table for the
  // same asymmetry at the model layer -- each pair now collapses to one
  // shared method reading the difference out of here.
  const SIDE = {
    preventativeBarrier: {
      barrierCollection: 'preventativeBarriers',
      addLabel: 'Add Preventative Barrier',
      attachLabel: 'Attach to Existing Preventative Barrier…',
      // A Cause sits to the LEFT of the TLE, so its barrier chain grows
      // toward increasing x -- physical left-to-right (x-increasing)
      // order already matches origin-to-TLE order, no reversal needed
      // to scan a line's stops in physical order.
      originLeftOfTle: true,
      addFn: (model, originId, opts) => model.addPreventativeControl(originId, opts),
      attachFn: (model, originId, barrierId, inherit) => (
        model.attachInputToPreventativeControl(originId, barrierId, inherit)
      ),
    },
    mitigativeBarrier: {
      barrierCollection: 'mitigativeBarriers',
      addLabel: 'Add Mitigative Barrier',
      attachLabel: 'Attach to Existing Mitigative Barrier…',
      // An Outcome sits to the RIGHT of the TLE, so its barrier chain
      // grows toward DEcreasing x -- physical left-to-right order runs
      // origin-to-TLE BACKWARDS, so stops (nearest-origin-first, same as
      // PB) must be reversed to scan them in physical x order.
      originLeftOfTle: false,
      addFn: (model, originId, opts) => model.addMitigativeControl(originId, opts),
      attachFn: (model, originId, barrierId, inherit) => (
        model.attachOutputToMitigativeControl(barrierId, originId, inherit)
      ),
    },
  };

  // Structural review finding 04: this class used to also own painting the
  // floating menu itself (ContextMenuView.js now) and six modal-
  // orchestration flows with nothing to do with deciding what to offer
  // (ContextMenuModalFlows.js now) -- rename/error/attach-picker/line-
  // select/inherit-prompt, none of which care whether they were reached
  // from a node's menu or a line's. What's left is exactly its own job:
  // listen for the two events that open a menu, and build the list of
  // items each one should offer.
  class ContextMenuController {
    // `triggerAutoArrange` re-lays-out the canvas after an action that
    // changes a barrier's position in the topology without moving anything
    // on screen itself (a reorder, a re-attach, or dropping straight to the
    // TLE) — left alone, the diagram would keep showing stale x/y until the
    // user remembered to click Auto-arrange, which is exactly the kind of
    // manual step these actions are meant to replace.
    // `openNodeLibraryFor` (design review finding 04): right-clicking a
    // node never offered a path to actually deleting it, only "Remove from
    // Page" -- a defensible consequence of placements vs. library nodes
    // (see node_library_proposal.md), but nothing in the menu said so.
    // Defaults to a no-op so this stays constructible without it (tests
    // that build a ContextMenuController directly, if any ever do).
    constructor(model, svgRoot, triggerAutoArrange, getDisplayUnit = () => 'hour', openNodeLibraryFor = () => {}) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.triggerAutoArrange = triggerAutoArrange;
      this.openNodeLibraryFor = openNodeLibraryFor;
      this.view = new Bowtie.ContextMenuView();
      this.flows = new Bowtie.ContextMenuModalFlows(model, triggerAutoArrange, getDisplayUnit);

      svgRoot.addEventListener('contextmenu', (e) => this._onContextMenu(e));
      svgRoot.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    }

    _onContextMenu(e) {
      const nodeEl = e.target.closest('.node');
      if (nodeEl) {
        e.preventDefault();
        const el = this.model.findById(nodeEl.getAttribute('data-id'));
        if (el) this.view.render(e.clientX, e.clientY, this._buildNodeItems(el, this._toSvgPoint(e)));
        return;
      }
      const lineEl = e.target.closest('.connection');
      if (lineEl) {
        e.preventDefault();
        const items = this._buildLineItems(lineEl, e);
        if (items.length > 0) this.view.render(e.clientX, e.clientY, items);
        return;
      }
      // Empty canvas — nothing under the cursor to target, so offer the two
      // things that always make sense regardless of what's currently on the
      // diagram: starting a new Cause or Outcome, placed right where the
      // user clicked (same "add it where you clicked" convention as the
      // line-gap and TLE menus below). `e.target` is always inside
      // `svgRoot` here, since that's what this listener is attached to.
      e.preventDefault();
      this.view.render(e.clientX, e.clientY, this._buildAddCauseOutcomeItems(this._toSvgPoint(e)));
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
          action: () => this._openCreateOrChooseLeaf('cause', point.x <= tleX ? point : {}),
        },
        {
          label: 'Add Outcome',
          action: () => this._openCreateOrChooseLeaf('outcome', point.x >= tleX ? point : {}),
        },
      ];
    }

    // Shared by the empty-canvas/TLE menu's "Add Cause"/"Add Outcome" items:
    // the create-or-choose modal (node_library_proposal.md ask 3), placed
    // at `placementOpts` (the click point when it's already on the correct
    // side of the TLE, or {} to fall back to the model's own default
    // placement — see _buildAddCauseOutcomeItems above).
    _openCreateOrChooseLeaf(kind, placementOpts) {
      const addFn = kind === 'cause'
        ? (opts) => this.model.addCause(opts)
        : (opts) => this.model.addOutcome(opts);
      Bowtie.openCreateOrChooseNodeModal({
        model: this.model,
        type: kind,
        onCreate: (fields) => addFn({ ...placementOpts, ...fields }),
        onChooseExisting: (node) => addFn({ ...placementOpts, nodeId: node.id }),
      });
    }

    _onDoubleClick(e) {
      const g = e.target.closest('.node');
      if (!g) return;
      const el = this.model.findById(g.getAttribute('data-id'));
      if (el) this.flows.rename(el);
    }

    _buildNodeItems(el, point) {
      const items = [];
      if (el.type === 'topLevelEvent') {
        items.push(...this._buildAddCauseOutcomeItems(point));
      }
      if (el.type === 'cause') {
        items.push({
          label: 'Add Preventative Barrier',
          action: () => this._openCreateOrChooseBarrier('preventativeBarrier', el),
        });
        if (this.model.preventativeBarriers.length > 0) {
          items.push({
            label: 'Attach to Existing Preventative Barrier…',
            action: () => this.flows.openAttachModal(
              'Attach Cause to Preventative Barrier',
              this.model.preventativeBarriers,
              (pb) => this.flows.attachWithInheritPrompt(
                pb.id,
                this.model._lineFor(el.id).id,
                (inherit) => this.model.attachInputToPreventativeControl(el.id, pb.id, inherit),
              ),
            ),
          });
        }
      }
      if (el.type === 'outcome') {
        items.push({
          label: 'Add Mitigative Barrier',
          action: () => this._openCreateOrChooseBarrier('mitigativeBarrier', el),
        });
        if (this.model.mitigativeBarriers.length > 0) {
          items.push({
            label: 'Attach to Existing Mitigative Barrier…',
            action: () => this.flows.openAttachModal(
              'Attach Outcome to Mitigative Barrier',
              this.model.mitigativeBarriers,
              (mb) => this.flows.attachWithInheritPrompt(
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
        // (see _gapInsertItems).
        items.push(...this._buildShuntItems(el.id));
      }
      if (el.type === 'mitigativeBarrier') {
        items.push({ label: 'Add Mitigative Barrier', action: () => this._addMitigativeControlFrom(el) });
        items.push(...this._buildShuntItems(el.id));
      }
      items.push({ label: 'Properties', action: () => this.flows.rename(el) });
      if (el.type !== 'topLevelEvent' && el.type !== 'hazard') {
        // "Remove from Page" (node_library_proposal.md, decided): this only
        // ever called deleteElement and always will — the label just stops
        // implying it destroys the node, which may still be placed on other
        // pages, or sit in the library with no placement at all.
        items.push({ label: 'Remove from Page', action: () => this.model.deleteElement(el.id) });
        // The actual delete-the-node action lives in Node Library (it can
        // affect every page the node is placed on, so it needs the
        // cross-page confirmation that modal already shows) — this just
        // opens straight to it, pre-expanded to this exact node, rather
        // than leaving "how do I really delete this" undiscoverable.
        items.push({ label: 'Delete from Library…', action: () => this.openNodeLibraryFor(el.nodeId) });
      }
      return items;
    }

    // Shared by the Cause/Outcome node menu's own "Add ... Barrier" item:
    // the create-or-choose modal (node_library_proposal.md ask 3), created
    // against `anchorEl`'s own chain the exact same way
    // addPreventativeControl/addMitigativeControl always have.
    _openCreateOrChooseBarrier(kind, anchorEl) {
      const addFn = kind === 'preventativeBarrier'
        ? (opts) => this.model.addPreventativeControl(anchorEl.id, opts)
        : (opts) => this.model.addMitigativeControl(anchorEl.id, opts);
      Bowtie.openCreateOrChooseNodeModal({
        model: this.model,
        type: kind,
        onCreate: (fields) => addFn(fields),
        onChooseExisting: (node) => addFn({ nodeId: node.id }),
      });
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
            this.flows.openLineSelectModal(
              label,
              eligible.map((l) => ({ key: l.id, label: this._labelForOrigin(l.originId) })),
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
        return this._gapInsertItems('preventativeBarrier', lineId, point);
      }
      if (role === 'outcome-line' || role === 'outcome-direct') {
        return this._gapInsertItems('mitigativeBarrier', lineId, point);
      }
      return [];
    }

    // The display id/name for a Line's own origin (a Cause/Outcome
    // placement) -- resolved through its shared library node, same as
    // everywhere else a node's label renders.
    _labelForOrigin(originId) {
      const origin = this.model.findById(originId);
      if (!origin) return originId;
      return this.model.displayIdentifierFor(this.model.getNode(origin.nodeId));
    }

    _toSvgPoint(e) {
      const pt = this.svgRoot.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(this.svgRoot.getScreenCTM().inverse());
      return { x: svgPt.x, y: svgPt.y };
    }

    // A line's stops are always nearest-origin-first (see LineTopology.js)
    // -- find the first stop, scanning in PHYSICAL left-to-right order,
    // whose x is past the click; inserting "before" it lands in exactly
    // the gap that was clicked (before the first stop, between two stops,
    // or -- if none qualify -- after the last stop). The new barrier is
    // placed right at the clicked point (bugs.md: barriers were landing
    // on the wrong side of existing ones when placed by a fixed offset
    // instead of the cursor). One shared implementation behind
    // _buildLineItems' two call sites -- see the SIDE table above (design
    // review finding 07); `SIDE.originLeftOfTle` says whether the origin-
    // first stops array already runs left-to-right (Cause) or needs
    // reversing first to scan it in physical order (Outcome, whose chain
    // grows toward decreasing x).
    _gapInsertItems(kind, lineId, point) {
      const { model } = this;
      const side = SIDE[kind];
      const line = model.lines.find((l) => l.id === lineId);
      if (!line) return [];
      const clickOpts = { x: point.x, y: point.y };

      if (line.stops.length === 0) {
        const items = [{
          label: side.addLabel,
          action: () => Bowtie.openCreateOrChooseNodeModal({
            model,
            type: kind,
            onCreate: (fields) => side.addFn(model, line.originId, { ...clickOpts, ...fields }),
            onChooseExisting: (node) => side.addFn(model, line.originId, { ...clickOpts, nodeId: node.id }),
          }),
        }];
        const collection = model[side.barrierCollection];
        if (collection.length > 0) {
          items.push(this._attachSegmentItem(
            side.attachLabel,
            collection,
            (target) => this.flows.attachWithInheritPrompt(
              target.id,
              line.id,
              (inherit) => side.attachFn(model, line.originId, target.id, inherit),
            ),
          ));
        }
        return items;
      }

      const stopsFromOrigin = line.stops.map((id) => ({ id, x: model.findById(id).x }));
      const orderedByX = side.originLeftOfTle ? stopsFromOrigin : stopsFromOrigin.slice().reverse();
      const before = orderedByX.find((s) => clickOpts.x < s.x);
      const anchorId = before ? before.id : orderedByX[orderedByX.length - 1].id;
      const direction = before ? 'before' : 'after';

      const items = [{
        label: side.addLabel,
        action: () => Bowtie.openCreateOrChooseNodeModal({
          model,
          type: kind,
          onCreate: (fields) => model.insertBarrier(kind, direction, anchorId, { ...clickOpts, ...fields }, [lineId]),
          onChooseExisting: (node) => model.insertBarrier(
            kind, direction, anchorId, { ...clickOpts, nodeId: node.id }, [lineId],
          ),
        }),
      }];
      const others = model[side.barrierCollection].filter((b) => !line.stops.includes(b.id));
      if (others.length > 0) {
        items.push(this._attachSegmentItem(
          side.attachLabel,
          others,
          (target) => this.flows.safeAttach(() => model.attachExistingBarrier(
            kind, direction, anchorId, target.id, [lineId],
          )),
        ));
      }

      // "Connect directly to the TLE" only does something past this gap's
      // TLE-adjacent barrier -- everything from there toward the TLE gets
      // dropped from THIS line. Meaningless when the click already sits
      // in the gap right next to the TLE itself, nothing left to drop.
      // Which shape that check (and the "keep through" stop) takes
      // depends on SIDE.originLeftOfTle: for a Cause, physical order
      // already IS origin-to-TLE order, so "nothing toward the TLE" is
      // simply "before not found" (past the last, TLE-most, stop), and
      // the stop to keep is `before`'s predecessor. For an Outcome,
      // `orderedByX` was reversed to get physical order, so it now runs
      // TLE-to-origin -- "nothing toward the TLE" is instead "before
      // found, and it's the very first (TLE-most) entry," and `before`
      // itself (the next entry away from the TLE) is already the stop to
      // keep.
      const beforeIdx = before ? orderedByX.indexOf(before) : -1;
      const nothingTowardTle = side.originLeftOfTle ? !before : (!!before && beforeIdx === 0);
      if (!nothingTowardTle) {
        const keepThroughId = side.originLeftOfTle
          ? (beforeIdx > 0 ? orderedByX[beforeIdx - 1].id : null)
          : (before ? before.id : null);
        items.push({
          label: 'Connect Directly to TLE',
          action: () => {
            model.connectLineDirectlyToTle(lineId, keepThroughId);
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
      return { label, action: () => this.flows.openAttachModal(label, candidates, onPick) };
    }

    // Inserts a new barrier of `kind` after `barrier`, toward the TLE. If
    // `barrier` currently carries more than one distinct line, asks which
    // of them the new barrier should apply to (multi-select, by origin id
    // — nothing is bundled). The one shared implementation behind
    // _addPreventativeControlFrom/_addMitigativeControlFrom below — see
    // the SIDE table above (design review finding 07); unlike
    // _gapInsertItems, nothing here is x-order-sensitive, so `kind` alone
    // is enough to parameterize.
    _addBarrierFrom(kind, barrier, preselectedLineId) {
      const lines = this.model.linesThrough(barrier.id);
      const proceed = (selected) => Bowtie.openCreateOrChooseNodeModal({
        model: this.model,
        type: kind,
        onCreate: (fields) => this.model.insertBarrier(kind, 'after', barrier.id, fields, selected),
        onChooseExisting: (node) => this.model.insertBarrier(
          kind, 'after', barrier.id, { nodeId: node.id }, selected,
        ),
      });
      if (lines.length <= 1) {
        proceed(null);
        return;
      }
      this.flows.openLineSelectModal(
        SIDE[kind].addLabel,
        lines.map((l) => ({ key: l.id, label: this._labelForOrigin(l.originId) })),
        preselectedLineId,
        (selected) => proceed(selected),
      );
    }

    _addPreventativeControlFrom(pb, preselectedLineId) {
      return this._addBarrierFrom('preventativeBarrier', pb, preselectedLineId);
    }

    _addMitigativeControlFrom(mb, preselectedLineId) {
      return this._addBarrierFrom('mitigativeBarrier', mb, preselectedLineId);
    }
  }

  Bowtie.ContextMenuController = ContextMenuController;
})(window.Bowtie = window.Bowtie || {});
