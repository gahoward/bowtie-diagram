(function (Bowtie) {
  // Extracted from BowtieModel (design review finding 06, phase 4):
  // node_library_proposal.md's shared node library, plus the identifier-
  // display-mode/retired-id posterity machinery built on top of it.
  //
  // Unlike Quantitative/Warnings, this collaborator OWNS state --
  // `library`, `retiredIds`, `identifierDisplayMode` live here, not on
  // BowtieModel. BowtieModel exposes them through get/set accessors (see
  // BowtieModel.js) so every existing reader/writer of `model.library`
  // etc. -- DocumentSerializer, views, ~300 tests -- keeps working
  // unchanged. It still holds a `model` reference, for the same reason
  // Quantitative does: `placementsForNode`/`deleteNode`/`reassignId` all
  // need to see every placement across all four types, which live on
  // BowtieModel, not here.
  const CONTROL_TYPES = ['cause', 'outcome', 'preventativeBarrier', 'mitigativeBarrier'];
  const NODE_ID_PREFIX = {
    cause: 'C', outcome: 'O', preventativeBarrier: 'PB', mitigativeBarrier: 'MB',
  };
  const NODE_DEFAULT_NAME = {
    cause: (n) => `Cause ${n}`,
    outcome: (n) => `Outcome ${n}`,
    preventativeBarrier: (n) => `Preventative Barrier ${n}`,
    mitigativeBarrier: (n) => `Mitigative Barrier ${n}`,
  };

  class NodeLibrary {
    constructor(model) {
      this.model = model;
      // The shared node library (node_library_proposal.md): one record per
      // real-world Cause/Outcome/Barrier identity, independent of any page
      // or placement. A node can have zero, one, or several placements —
      // zero is a normal "staging" state, not an orphan (see
      // placementsForNode). Also the home for quantitative_mode_proposal.md's
      // per-element risk fields (frequency/protection/
      // likelihoodClassId/severityClassId), since those are globally
      // linked per node, not per placement — see Node.js.
      this.library = {
        cause: [], outcome: [], preventativeBarrier: [], mitigativeBarrier: [],
      };
      // 'internal' (default, today's behaviour: a node's own id renders) |
      // 'custom' (a node's freeform `identifier` renders instead, when set)
      // — see setIdentifierDisplayMode below.
      this.identifierDisplayMode = 'internal';
      // Posterity of identifiers: every NODE id, once used, is remembered
      // here forever after its node is deleted (deleteNode) — retiring
      // moved from the placement level to the node level by this proposal,
      // since node ids are now the visible ones (see node_library_proposal.md
      // "Interplay with existing features"). `{ id, reEnabled }` — no page
      // history is captured (a deleted node may have had several
      // placements across several pages; recording where isn't worth
      // showing, per feedback on the design mockup). reEnabled ids are
      // eligible for manual (never automatic) reassignment via reassignId.
      // Lines are not part of this system — they are not user-facing
      // identifiers and die with their Cause/Outcome placement.
      this.retiredIds = {
        cause: [], outcome: [], preventativeBarrier: [], mitigativeBarrier: [],
      };
    }

    // Creates a library node record with `id` drawn from `idCounters[type]`
    // — the SAME per-type counter addCause/addOutcome/addPreventativeControl/
    // addMitigativeControl always used for their placement ids before this
    // proposal (now repurposed to count nodes instead). Does not create a
    // placement or emit a change — used internally by addNode (below) and
    // by every creation call site's "brand-new node" shape, which folds
    // this into its own single _emitChange() at the end.
    _createNode(type, opts = {}) {
      if (opts.identifier) {
        const existing = this.getNodeByIdentifier(opts.identifier);
        if (existing) throw new Error('That identifier is already in use');
      }
      this.model.idCounters[type] += 1;
      const n = this.model.idCounters[type];
      const id = `${NODE_ID_PREFIX[type]}_${n}`;
      const node = new Bowtie.Node({
        id,
        type,
        name: opts.name || NODE_DEFAULT_NAME[type](n),
        description: opts.description || '',
        identifier: opts.identifier || '',
      });
      this.library[type].push(node);
      return node;
    }

    // Public standalone creation (ask 2/3): a library node with zero
    // placements, reachable from the Node Library manager directly, not
    // just as a side effect of "Add Cause"/etc. Name-required validation
    // happens at the UI layer, same "defensive floor, not the primary
    // mechanism" pattern addPage already uses for page name.
    addNode(type, opts = {}) {
      const node = this._createNode(type, opts);
      this.model._emitChange();
      return node;
    }

    // Searches all four library arrays — used whenever the caller doesn't
    // already know a node's type (e.g. resolving a placement's own node).
    getNode(nodeId) {
      return (
        this.library.cause.find((n) => n.id === nodeId)
        || this.library.outcome.find((n) => n.id === nodeId)
        || this.library.preventativeBarrier.find((n) => n.id === nodeId)
        || this.library.mitigativeBarrier.find((n) => n.id === nodeId)
        || null
      );
    }

    // Narrower variant when the type is already known — mirrors getPage's
    // single-collection lookup.
    getNodeOfType(type, nodeId) {
      return (this.library[type] || []).find((n) => n.id === nodeId) || null;
    }

    // The uniqueness check's own lookup (addNode/renameNode), reusable by
    // both. Checked across all four types together — the display setting
    // can show any node's identifier in the same visual context as any
    // other's — with a blank identifier exempt (any number of nodes may
    // have no custom identifier set).
    getNodeByIdentifier(identifier) {
      if (!identifier) return null;
      return (
        this.library.cause.find((n) => n.identifier === identifier)
        || this.library.outcome.find((n) => n.identifier === identifier)
        || this.library.preventativeBarrier.find((n) => n.identifier === identifier)
        || this.library.mitigativeBarrier.find((n) => n.identifier === identifier)
        || null
      );
    }

    // The node analogue of renamePage/renameElement — also doubles as the
    // mutator for the quantitative/qualitative risk fields (frequency,
    // protection, likelihoodClassId, severityClassId) and barrier
    // metadata (barrierType, owner, effectiveness — design review
    // finding 10), since those all live on the same Node record (see
    // Node.js). Same identifier-uniqueness check as addNode/_createNode,
    // excluding the node being renamed itself from the collision check
    // (renaming a node to the identifier it already has must not throw).
    renameNode(nodeId, opts = {}) {
      const node = this.getNode(nodeId);
      if (!node) throw new Error(`Unknown node id: ${nodeId}`);
      if (opts.identifier !== undefined && opts.identifier !== '') {
        const existing = this.getNodeByIdentifier(opts.identifier);
        if (existing && existing.id !== nodeId) throw new Error('That identifier is already in use');
      }
      if (opts.name !== undefined) node.name = opts.name;
      if (opts.description !== undefined) node.description = opts.description;
      if (opts.identifier !== undefined) node.identifier = opts.identifier;
      if (opts.likelihoodClassId !== undefined) node.likelihoodClassId = opts.likelihoodClassId;
      if (opts.severityClassId !== undefined) node.severityClassId = opts.severityClassId;
      if (opts.frequency !== undefined) node.frequency = opts.frequency;
      if (opts.protection !== undefined) node.protection = opts.protection;
      if (opts.barrierType !== undefined) node.barrierType = opts.barrierType;
      if (opts.owner !== undefined) node.owner = opts.owner;
      if (opts.effectiveness !== undefined) node.effectiveness = opts.effectiveness;
      this.model._emitChange();
    }

    // Every LIVE placement (any type, any page) referencing `nodeId` — used
    // by the manager UI to show which page(s) a node is currently placed
    // on, and by deleteNode's cascade below.
    placementsForNode(nodeId) {
      const { model } = this;
      return [
        ...model.causes, ...model.outcomes, ...model.preventativeBarriers, ...model.mitigativeBarriers,
      ].filter((p) => p.nodeId === nodeId);
    }

    // Removes the library record AND cascades: every placement referencing
    // it, on every page, is removed the same way deleteElement removes one
    // placement (BowtieModel._removePlacementOnly) — "delete across all
    // pages" is ask 2's explicit request, the one path with a genuinely
    // document-wide blast radius by design. Retires the node's id (see
    // retiredIds above); deleteElement (placement-only removal) no longer
    // retires anything at all.
    deleteNode(nodeId) {
      const node = this.getNode(nodeId);
      if (!node) return;
      this.placementsForNode(nodeId).forEach((p) => this.model._removePlacementOnly(p.id));
      this.library[node.type] = this.library[node.type].filter((n) => n.id !== nodeId);
      this.retiredIds[node.type].push({ id: nodeId, reEnabled: false });
      this.model._emitChange();
    }

    // 'internal' | 'custom' — see "Display identifiers" in
    // node_library_proposal.md. Switching internal -> custom backfills
    // every library node (all four types) whose identifier is blank with
    // its own current id, so the toggle causes no visible change to what's
    // rendered at the moment it's flipped — from that point on `identifier`
    // is a real, independently-editable value, not a fallback. Nodes that
    // already had a custom identifier keep it untouched. Switching the
    // other direction changes only what's displayed; no data is cleared.
    //
    // Design review finding 02: a node's OWN id can already be some OTHER
    // node's hand-set custom identifier (e.g. node C_3 was given the
    // identifier "C_3" by hand while it was still internal-mode) — the
    // backfill has to skip a node whose id collides with an
    // already-in-use identifier, or two nodes end up rendering the same
    // visible label. addNode/_createNode/renameNode all guard this
    // uniqueness already; this is the third write path into `identifier`
    // and needs the same check. A skipped node is left exactly as it was
    // (still blank) rather than minted a suffixed identifier it was never
    // given — inventing one silently would be worse, in a document that
    // may be an audit artifact, than asking the user to set one.
    setIdentifierDisplayMode(mode) {
      if (mode !== 'internal' && mode !== 'custom') throw new Error(`Unknown identifier display mode: ${mode}`);
      if (mode === 'custom' && this.identifierDisplayMode !== 'custom') {
        CONTROL_TYPES.forEach((type) => {
          this.library[type].forEach((node) => {
            if (!node.identifier && !this.getNodeByIdentifier(node.id)) {
              node.identifier = node.id;
            }
          });
        });
      }
      this.identifierDisplayMode = mode;
      this.model._emitChange();
    }

    // The id or identifier actually rendered for a node, per the current
    // identifierDisplayMode — 'custom' shows `identifier` only when it's
    // non-blank (a newly-created node in custom mode starts blank again
    // until the user sets one), falling back to `id` otherwise. This is
    // the SINGLE source of truth every rendering call site (ShapeRenderer,
    // the manager, the create-or-choose modal, getWarnings — though
    // warnings intentionally still name the id explicitly, see BowtieModel)
    // should resolve a node's visible label through.
    displayIdentifierFor(node) {
      if (!node) return '';
      if (this.identifierDisplayMode === 'custom' && node.identifier) return node.identifier;
      return node.id;
    }

    // --- Posterity of identifiers -------------------------------------
    //
    // Operates on NODE ids (node_library_proposal.md "Interplay with
    // existing features") -- node ids are the visible ones, so this
    // existing, deliberately-built posterity feature has to move with
    // them, or it stops meaning anything to a user.

    reEnableId(type, id) {
      const entry = (this.retiredIds[type] || []).find((e) => e.id === id);
      if (!entry) return;
      entry.reEnabled = true;
      this.model._emitChange();
    }

    disableRetiredId(type, id) {
      const entry = (this.retiredIds[type] || []).find((e) => e.id === id);
      if (!entry) return;
      entry.reEnabled = false;
      this.model._emitChange();
    }

    // Manually assigns `newId` (which must be a re-enabled, previously-used
    // NODE id of the same type) to the node currently identified by
    // `nodeId`, cascading the change through every placement's `nodeId`
    // field that referenced it (not a Line -- Lines only ever reference
    // placement ids, which are untouched by this).
    reassignId(nodeId, newId) {
      const node = this.getNode(nodeId);
      if (!node || !CONTROL_TYPES.includes(node.type)) {
        throw new Error('That element cannot be assigned a new identifier');
      }
      if (newId === nodeId) return;

      const pool = this.retiredIds[node.type] || [];
      const entry = pool.find((e) => e.id === newId && e.reEnabled);
      if (!entry) throw new Error('That identifier is not available for manual assignment');
      if (this.getNode(newId)) throw new Error('That identifier is already in use');

      const oldId = node.id;
      node.id = newId;

      this.placementsForNode(oldId).forEach((p) => { p.nodeId = newId; });

      this.retiredIds[node.type] = pool.filter((e) => e.id !== newId);
      this.retiredIds[node.type].push({ id: oldId, reEnabled: false });

      this.model._emitChange();
    }
  }

  Bowtie.NodeLibrary = NodeLibrary;
})(window.Bowtie = window.Bowtie || {});
