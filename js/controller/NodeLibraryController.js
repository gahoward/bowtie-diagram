(function (Bowtie) {
  const TYPES = [
    { id: 'cause', label: 'Causes', singular: 'cause' },
    { id: 'outcome', label: 'Outcomes', singular: 'outcome' },
    { id: 'preventativeBarrier', label: 'Preventative', singular: 'preventative barrier' },
    { id: 'mitigativeBarrier', label: 'Mitigative', singular: 'mitigative barrier' },
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, className) {
    const btn = el('button', className, label);
    btn.type = 'button';
    return btn;
  }

  // Add › Node Library… (ui_fitness_proposal.md S4): the manager for the
  // shared node library (node_library_proposal.md ask 2) merged with the
  // old identifier-posterity feature (retire/re-enable/reassign, now
  // targeting node ids -- see "Two id spaces" in the design doc). One tab
  // per node type with a count, a real table so nothing truncates, and
  // Edit opening the same Properties modal the canvas double-click uses
  // rather than a second inline copy of the form; the retired-identifier
  // controls sit collapsed under a disclosure per tab. Sits under Add
  // because the library is where "Choose existing" nodes come from.
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
      this._activeType = 'cause';
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

    _buildBody() {
      const wrap = el('div', 'node-library');

      const tabs = el('div', 'settings-tabs');
      tabs.setAttribute('role', 'tablist');
      TYPES.forEach((type) => {
        const count = this.model.library[type.id].length;
        const tab = button(`${type.label} (${count})`, 'settings-tab');
        tab.dataset.type = type.id;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(type.id === this._activeType));
        tab.addEventListener('click', () => {
          this._activeType = type.id;
          this._focusNodeId = null;
          this.modal.setBody(this._buildBody());
        });
        tabs.appendChild(tab);
      });
      wrap.appendChild(tabs);

      const type = TYPES.find((t) => t.id === this._activeType);
      const panel = el('div', 'node-library-panel');
      panel.dataset.type = type.id;
      panel.appendChild(this._buildAddNodeRow(type));
      panel.appendChild(this._buildTable(type));
      panel.appendChild(this._buildRetiredSection(type));
      wrap.appendChild(panel);
      return wrap;
    }

    // A library node with zero placements is a normal "staging" state
    // (ask 2) -- this is how one gets created directly, without also
    // creating a placement (unlike every "Add ..." entry point, which
    // always creates both together).
    _buildAddNodeRow(type) {
      const row = el('div', 'node-library-add-row');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = `New ${type.singular} name…`;
      row.appendChild(nameInput);
      const addBtn = button('+ Add to library', 'modal-btn');
      const add = () => {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
          this.model.addNode(type.id, { name });
          nameInput.value = '';
        } catch (err) {
          this._showError(err.message);
        }
      };
      addBtn.addEventListener('click', add);
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add();
        }
      });
      row.appendChild(addBtn);
      return row;
    }

    _buildTable(type) {
      const nodes = this.model.library[type.id];
      if (nodes.length === 0) {
        return el('p', 'id-manager-empty', `No ${type.label.toLowerCase()} yet.`);
      }
      const wrap = el('div', 'node-library-table-wrap');
      const table = el('table', 'node-library-table');
      const thead = document.createElement('thead');
      const head = document.createElement('tr');
      ['ID', 'Name', 'Placed on', ''].forEach((text) => head.appendChild(el('th', null, text)));
      thead.appendChild(head);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      nodes.forEach((node) => tbody.appendChild(this._buildRow(node)));
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    _buildRow(node) {
      const tr = el('tr', 'node-library-row');
      tr.dataset.nodeId = node.id;
      if (node.id === this._focusNodeId) tr.classList.add('focused');

      tr.appendChild(el('td', 'id-manager-id', this.model.displayIdentifierFor(node)));
      const nameCell = el('td', 'node-library-name', node.name);
      if (node.description) nameCell.title = node.description;
      tr.appendChild(nameCell);

      const placements = this.model.placementsForNode(node.id);
      const pagesCell = el('td', 'node-library-pages');
      if (placements.length === 0) {
        pagesCell.appendChild(el('span', 'node-library-tag', 'Not placed yet'));
      } else {
        const names = [...new Set(placements.map((p) => (this.model.getPage(p.pageId) || {}).name))];
        pagesCell.textContent = names.join(', ');
      }
      tr.appendChild(pagesCell);

      const actions = el('td', 'node-library-actions');
      const editBtn = button('Edit', 'modal-btn modal-btn-small');
      editBtn.addEventListener('click', () => {
        const placement = placements[0] || { type: node.type, nodeId: node.id, id: null };
        this.openProperties(placement);
      });
      const deleteBtn = button('Delete', 'modal-btn modal-btn-small');
      deleteBtn.addEventListener('click', () => this._confirmDeleteNode(node, placements));
      actions.append(editBtn, deleteBtn);
      tr.appendChild(actions);
      return tr;
    }

    _confirmDeleteNode(node, placements) {
      const pageNames = [...new Set(placements.map((p) => (this.model.getPage(p.pageId) || {}).name))];
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

    // --- Retired (posterity of ids) ----------------------------------------
    //
    // Collapsed by default -- posterity is a rarely-visited feature, and
    // it used to sit at the same level as the live list on every one of
    // the four types. Open state is remembered per type across rebuilds.

    _buildRetiredSection(type) {
      const retired = this.model.retiredIds[type.id] || [];
      const details = el('details', 'node-library-retired');
      details.open = Boolean(this._retiredOpen[type.id]);
      details.addEventListener('toggle', () => { this._retiredOpen[type.id] = details.open; });
      details.appendChild(el('summary', null, `Retired identifiers (${retired.length})`));

      const body = el('div', 'node-library-retired-body');
      if (retired.length === 0) {
        body.appendChild(el('p', 'id-manager-empty', 'No retired identifiers yet.'));
      } else {
        const list = el('div', 'id-manager-list');
        retired.forEach((entry) => list.appendChild(this._buildRetiredRow(type.id, entry)));
        body.appendChild(list);
      }

      const reEnabled = retired.filter((e) => e.reEnabled);
      const liveNodes = this.model.library[type.id];
      if (reEnabled.length > 0 && liveNodes.length > 0) {
        body.appendChild(this._buildReassignRow(liveNodes, reEnabled));
      }
      details.appendChild(body);
      return details;
    }

    // No page-context label (node_library_proposal.md: "no page history is
    // captured" -- a deleted node may have had several placements across
    // several pages; recording where isn't worth showing) -- just the id
    // and its re-enable/disable status, mirroring `{ id, reEnabled }`.
    _buildRetiredRow(type, entry) {
      const row = el('div', 'id-manager-row');
      row.appendChild(el('span', 'id-manager-id', entry.id));
      row.appendChild(el('span', 'id-manager-status', entry.reEnabled ? 'Re-enabled' : 'Retired'));
      const toggleBtn = button(entry.reEnabled ? 'Disable' : 'Re-enable', 'modal-btn modal-btn-small');
      toggleBtn.addEventListener('click', () => {
        if (entry.reEnabled) this.model.disableRetiredId(type, entry.id);
        else this.model.reEnableId(type, entry.id);
      });
      row.appendChild(toggleBtn);
      return row;
    }

    _buildReassignRow(liveNodes, reEnabled) {
      const row = el('div', 'id-manager-reassign');
      const nodeSelect = document.createElement('select');
      liveNodes.forEach((node) => {
        const opt = document.createElement('option');
        opt.value = node.id;
        opt.textContent = `${node.id} — ${node.name}`;
        nodeSelect.appendChild(opt);
      });
      const idSelect = document.createElement('select');
      reEnabled.forEach((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.id;
        idSelect.appendChild(opt);
      });
      const assignBtn = button('Assign', 'modal-btn modal-btn-primary modal-btn-small');
      assignBtn.addEventListener('click', () => {
        try {
          this.model.reassignId(nodeSelect.value, idSelect.value);
        } catch (err) {
          this._showError(err.message);
        }
      });
      row.append(nodeSelect, idSelect, assignBtn);
      return row;
    }
  }

  Bowtie.NodeLibraryController = NodeLibraryController;
})(window.Bowtie = window.Bowtie || {});
