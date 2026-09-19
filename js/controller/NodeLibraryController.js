(function (Bowtie) {
  const el = Bowtie.Dom.el;

  // Add › Node Library… (ui_fitness_proposal.md S4): the manager for the
  // shared node library (node_library_proposal.md ask 2) merged with the
  // old identifier-posterity feature (retire/re-enable/reassign, now
  // targeting node ids -- see "Two id spaces" in the design doc). One tab
  // per node type with a count, a real table so nothing truncates, and
  // Edit opening the same Properties modal the canvas double-click uses
  // rather than a second inline copy of the form; the retired-identifier
  // controls sit collapsed under a disclosure per tab. Sits under Add
  // because the library is where "Choose existing" nodes come from.
  //
  // The markup lives in NodeLibraryView.js (proposals/15 part 2). What
  // stays here is what a controller is for: the model reads that turn
  // into the view's plain data, the model writes its handlers make, the
  // tab/disclosure/focus state, and the two confirmation dialogs.
  class NodeLibraryController {
    // `openProperties(el)` opens the Properties modal for a placement-
    // shaped `el` -- the node's first placement when it has one (so the
    // Computed section can show), otherwise a placement-less stand-in
    // (`{ type, nodeId, id: null }`), which PropertiesModal handles by
    // simply having nothing computed to show.
    constructor(model, button, { openProperties }) {
      this.model = model;
      this.openProperties = openProperties;
      this.modal = null;
      this._activeType = 'threat';
      this._retiredOpen = {};
      // Design review finding 04 -- which node's row (if any) should be
      // highlighted on the next open. Cleared on every ordinary open so it
      // never leaks into a later, unrelated visit.
      this._focusNodeId = null;
      button.addEventListener('click', () => { this._focusNodeId = null; this._open(); });
      model.onChange(() => this._refresh());
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Node Library',
        bodyEl: this._buildBody(),
        size: 'xwide',
        actions: [{ label: 'Done', primary: true }],
      });
      this._scrollToFocusedRow();
    }

    // Design review finding 04 -- ContextMenuController's "Delete from
    // Library…" item calls this so a right-click on a node opens straight
    // to that node's own row (which carries the Delete button and its
    // cross-page confirmation), on the right tab, instead of leaving "how
    // do I actually delete this" reachable only by hunting.
    openForNode(nodeId) {
      const node = this.model.getNode(nodeId);
      if (node) this._activeType = node.type;
      this._focusNodeId = nodeId;
      this._open();
    }

    _scrollToFocusedRow() {
      if (!this._focusNodeId || !this.modal) return;
      const row = this.modal.overlay.querySelector('.node-library-row.focused');
      if (row) row.scrollIntoView({ block: 'center' });
    }

    _refresh() {
      if (!this.modal) return;
      if (!document.body.contains(this.modal.overlay)) {
        this.modal = null;
        return;
      }
      this.modal.setBody(this._buildBody());
    }

    _showError(message) {
      const body = document.createElement('div');
      body.appendChild(el('p', null, message));
      Bowtie.ModalView.openModal({ title: 'Cannot Do That', bodyEl: body, actions: [{ label: 'OK', primary: true }] });
    }

    // Rebuilding the body destroys the tab that had focus, so focus is
    // put back on its replacement -- but only if a tab had it, so a
    // mouse user's focus is never yanked into the strip (proposals/18).
    _rebuild() {
      const hadTabFocus = Bowtie.FormControls.tabHasFocus();
      this.modal.setBody(this._buildBody());
      if (hadTabFocus) Bowtie.FormControls.focusSelectedTab(this.modal.dialog);
    }

    // Every model read the view needs, resolved here into plain data --
    // placements become the page names they are shown as, so the view
    // never learns what a placement is.
    _viewState() {
      const counts = {};
      Bowtie.NodeLibraryView.TYPES.forEach((type) => { counts[type.id] = this.model.library[type.id].length; });
      const rows = this.model.library[this._activeType].map((node) => ({
        nodeId: node.id,
        displayId: this.model.displayIdentifierFor(node),
        name: node.name,
        description: node.description,
        pageNames: this._pageNamesFor(node.id),
      }));
      return {
        activeType: this._activeType,
        counts,
        rows,
        retired: this.model.retiredIds[this._activeType] || [],
        retiredOpen: Boolean(this._retiredOpen[this._activeType]),
        liveNodes: this.model.library[this._activeType],
        focusNodeId: this._focusNodeId,
      };
    }

    _pageNamesFor(nodeId) {
      const placements = this.model.placementsForNode(nodeId);
      return [...new Set(placements.map((p) => (this.model.getPage(p.pageId) || {}).name))];
    }

    _buildBody() {
      return Bowtie.NodeLibraryView.body(this._viewState(), {
        onSelectType: (id) => {
          this._activeType = id;
          this._focusNodeId = null;
          this._rebuild();
        },
        onAddNode: (name) => this._addNode(name),
        onEditNode: (nodeId) => this._editNode(nodeId),
        onDeleteNode: (nodeId) => this._confirmDeleteNode(nodeId),
        onToggleRetiredOpen: (open) => { this._retiredOpen[this._activeType] = open; },
        onToggleRetiredId: (entryId, reEnabled) => {
          if (reEnabled) this.model.disableRetiredId(this._activeType, entryId);
          else this.model.reEnableId(this._activeType, entryId);
        },
        onReassign: (nodeId, entryId) => {
          try {
            this.model.reassignId(nodeId, entryId);
          } catch (err) {
            this._showError(err.message);
          }
        },
      });
    }

    // True when the name was accepted, which is what clears the field.
    _addNode(name) {
      try {
        this.model.addNode(this._activeType, { name });
        return true;
      } catch (err) {
        this._showError(err.message);
        return false;
      }
    }

    _editNode(nodeId) {
      const node = this.model.getNode(nodeId);
      const placements = this.model.placementsForNode(nodeId);
      this.openProperties(placements[0] || { type: node.type, nodeId, id: null });
    }

    _confirmDeleteNode(nodeId) {
      const node = this.model.getNode(nodeId);
      const placements = this.model.placementsForNode(nodeId);
      const pageNames = this._pageNamesFor(nodeId);
      const body = document.createElement('div');
      body.appendChild(el('p', null, placements.length === 0
        ? `Delete ${this.model.displayIdentifierFor(node)} (${node.name})? It has no placements on any page.`
        : `Delete ${this.model.displayIdentifierFor(node)} (${node.name})? This removes it from ${placements.length} `
          + `placement(s) across ${pageNames.length} page(s): ${pageNames.join(', ')}. This cannot be undone from here.`));

      Bowtie.ModalView.openModal({
        title: 'Delete Node',
        bodyEl: body,
        actions: [
          { label: 'Cancel' },
          { label: 'Delete', primary: true, onClick: () => this.model.deleteNode(node.id) },
        ],
      });
    }
  }

  Bowtie.NodeLibraryController = NodeLibraryController;
})(window.Bowtie = window.Bowtie || {});
