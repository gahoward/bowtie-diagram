(function (Bowtie) {
  const TYPE_LABELS = {
    cause: 'Causes',
    outcome: 'Outcomes',
    preventativeBarrier: 'Preventative Barriers',
    mitigativeBarrier: 'Mitigative Barriers',
  };

  // Merges the old IdentifierManagerController (posterity of ids: retire/
  // re-enable/reassign) with the new node library manager
  // (node_library_proposal.md ask 2) into one "Node Library…" toolbar
  // entry — per type, a Library subsection (every LIVE node: identifier/
  // name/description, which page(s) it's currently placed on, Edit/
  // Delete) stacked above a Retired subsection (today's posterity
  // feature, retargeted at node ids instead of placement ids — see "Two
  // id spaces" in the design doc: node ids are the visible ones now, so
  // this is where that existing, deliberately-built feature has to live).
  class NodeLibraryController {
    constructor(model, button) {
      this.model = model;
      this.modal = null;
      // Design review finding 04 -- which node's edit form (if any) should
      // start expanded on the next _open()/_refresh(). Cleared on every
      // ordinary open so it never leaks into a later, unrelated visit.
      this._focusNodeId = null;
      button.addEventListener('click', () => { this._focusNodeId = null; this._open(); });
      model.onChange(() => this._refresh());
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Node Library',
        bodyEl: this._buildBody(),
        actions: [{ label: 'Close' }],
      });
      this._scrollToFocusedRow();
    }

    // Design review finding 04 -- ContextMenuController's "Delete from
    // Library…" item calls this so a right-click on a node opens straight
    // to that node's own edit form (which already carries the Delete
    // button and its cross-page confirmation), instead of leaving "how do
    // I actually delete this" reachable only by hunting through every
    // section of the modal by hand.
    openForNode(nodeId) {
      this._focusNodeId = nodeId;
      this._open();
    }

    _scrollToFocusedRow() {
      if (!this._focusNodeId || !this.modal) return;
      const row = this.modal.overlay.querySelector('.node-library-edit-form:not([hidden])');
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
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(p);
      Bowtie.ModalView.openModal({ title: 'Cannot Do That', bodyEl: body, actions: [{ label: 'OK', primary: true }] });
    }

    // The identifier-display-mode toggle used to live here, but it's a
    // document-wide setting alongside mode/risk-matrix, not a node-library
    // concern -- moved to ProjectSettingsController so this modal stays
    // focused on the nodes themselves (node_library_proposal.md ask 2).
    _buildBody() {
      const wrap = document.createElement('div');
      wrap.className = 'id-manager';
      Object.keys(TYPE_LABELS).forEach((type) => wrap.appendChild(this._buildTypeSection(type)));
      return wrap;
    }

    _buildTypeSection(type) {
      const section = document.createElement('div');
      section.className = 'id-manager-section';

      const h = document.createElement('h3');
      h.textContent = TYPE_LABELS[type];
      section.appendChild(h);

      section.appendChild(this._buildLibrarySubsection(type));
      section.appendChild(this._buildRetiredSubsection(type));

      return section;
    }

    // --- Library (live nodes) ---------------------------------------------

    _buildLibrarySubsection(type) {
      const wrap = document.createElement('div');
      wrap.className = 'node-library-subsection';

      const h = document.createElement('h4');
      h.textContent = 'Library';
      wrap.appendChild(h);

      const nodes = this.model.library[type];
      if (nodes.length === 0) {
        const p = document.createElement('p');
        p.className = 'id-manager-empty';
        p.textContent = 'No nodes of this type yet.';
        wrap.appendChild(p);
      } else {
        const list = document.createElement('div');
        list.className = 'node-library-list';
        nodes.forEach((node) => list.appendChild(this._buildLibraryRow(type, node)));
        wrap.appendChild(list);
      }

      wrap.appendChild(this._buildAddNodeRow(type));
      return wrap;
    }

    _buildLibraryRow(type, node) {
      const row = document.createElement('div');
      row.className = 'node-library-row';

      const idSpan = document.createElement('span');
      idSpan.className = 'id-manager-id';
      idSpan.textContent = this.model.displayIdentifierFor(node);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'node-library-name';
      nameSpan.textContent = node.name;

      const placements = this.model.placementsForNode(node.id);
      const pageSpan = document.createElement('span');
      pageSpan.className = 'node-library-pages';
      pageSpan.textContent = placements.length === 0
        ? 'Not placed on any page yet'
        : `Placed on: ${placements.map((p) => (this.model.getPage(p.pageId) || {}).name).join(', ')}`;

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'modal-btn';
      editBtn.textContent = 'Edit';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'modal-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => this._confirmDeleteNode(node, placements));

      row.appendChild(idSpan);
      row.appendChild(nameSpan);
      row.appendChild(pageSpan);
      row.appendChild(editBtn);
      row.appendChild(deleteBtn);

      const editForm = this._buildEditForm(type, node);
      // Design review finding 04 -- pre-expanded when this is the node
      // openForNode() was asked to focus, so "Delete from Library…" on the
      // canvas lands directly on the right form instead of a collapsed list.
      editForm.hidden = node.id !== this._focusNodeId;
      editBtn.addEventListener('click', () => { editForm.hidden = !editForm.hidden; });

      const container = document.createElement('div');
      container.appendChild(row);
      container.appendChild(editForm);
      return container;
    }

    // Expands in place into the same Name/Description/Identifier field set
    // the create-or-choose modal's "Create new" section uses, against
    // renameNode.
    _buildEditForm(type, node) {
      const form = document.createElement('div');
      form.className = 'node-library-edit-form';

      const makeField = (labelText, value) => {
        const wrap = document.createElement('label');
        wrap.className = 'modal-field';
        const span = document.createElement('span');
        span.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        wrap.appendChild(span);
        wrap.appendChild(input);
        form.appendChild(wrap);
        return input;
      };

      const nameInput = makeField('Name', node.name);
      const descriptionInput = makeField('Description', node.description);
      const identifierInput = makeField('Identifier', node.identifier);
      const riskFields = Bowtie.buildRiskFieldsForm(this.model, node, form);

      const errorP = document.createElement('p');
      errorP.className = 'modal-field-error';
      errorP.hidden = true;
      form.appendChild(errorP);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'modal-btn modal-btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) {
          errorP.textContent = 'Name is required.';
          errorP.hidden = false;
          return;
        }
        const read = riskFields.readValues();
        if (!read.ok) {
          errorP.textContent = read.error;
          errorP.hidden = false;
          return;
        }
        try {
          this.model.renameNode(node.id, {
            name,
            description: descriptionInput.value.trim(),
            identifier: identifierInput.value.trim(),
            ...read.values,
          });
        } catch (err) {
          errorP.textContent = err.message;
          errorP.hidden = false;
        }
      });
      form.appendChild(saveBtn);
      return form;
    }

    _confirmDeleteNode(node, placements) {
      const pageNames = [...new Set(placements.map((p) => (this.model.getPage(p.pageId) || {}).name))];
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = placements.length === 0
        ? `Delete ${this.model.displayIdentifierFor(node)} (${node.name})? It has no placements on any page.`
        : `Delete ${this.model.displayIdentifierFor(node)} (${node.name})? This removes it from ${placements.length} `
          + `placement(s) across ${pageNames.length} page(s): ${pageNames.join(', ')}. This cannot be undone from here.`;
      body.appendChild(p);

      Bowtie.ModalView.openModal({
        title: 'Delete Node',
        bodyEl: body,
        actions: [
          { label: 'Cancel' },
          { label: 'Delete', primary: true, onClick: () => this.model.deleteNode(node.id) },
        ],
      });
    }

    // A library node with zero placements is a normal "staging" state
    // (ask 2) -- this is how one gets created directly, without also
    // creating a placement (unlike every "Add ..." entry point, which
    // always creates both together).
    _buildAddNodeRow(type) {
      const row = document.createElement('div');
      row.className = 'node-library-add-row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'New node name…';
      row.appendChild(nameInput);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'modal-btn';
      addBtn.textContent = '+ Add to Library';
      addBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
          this.model.addNode(type, { name });
          nameInput.value = '';
        } catch (err) {
          this._showError(err.message);
        }
      });
      row.appendChild(addBtn);
      return row;
    }

    // --- Retired (posterity of ids) ----------------------------------------

    _buildRetiredSubsection(type) {
      const wrap = document.createElement('div');
      wrap.className = 'node-library-subsection';

      const h = document.createElement('h4');
      h.textContent = 'Retired';
      wrap.appendChild(h);

      const retired = this.model.retiredIds[type] || [];
      if (retired.length === 0) {
        const p = document.createElement('p');
        p.className = 'id-manager-empty';
        p.textContent = 'No retired identifiers yet.';
        wrap.appendChild(p);
      } else {
        const list = document.createElement('div');
        list.className = 'id-manager-list';
        retired.forEach((entry) => list.appendChild(this._buildRetiredRow(type, entry)));
        wrap.appendChild(list);
      }

      const reEnabled = retired.filter((e) => e.reEnabled);
      const liveNodes = this.model.library[type];
      if (reEnabled.length > 0 && liveNodes.length > 0) {
        wrap.appendChild(this._buildReassignRow(type, liveNodes, reEnabled));
      }

      return wrap;
    }

    // No page-context label any more (node_library_proposal.md: "no page
    // history is captured" -- a deleted node may have had several
    // placements across several pages; recording where isn't worth
    // showing) -- just the id and its re-enable/disable status, mirroring
    // `{ id, reEnabled }`'s own info exactly.
    _buildRetiredRow(type, entry) {
      const row = document.createElement('div');
      row.className = 'id-manager-row';

      const idSpan = document.createElement('span');
      idSpan.className = 'id-manager-id';
      idSpan.textContent = entry.id;

      const statusSpan = document.createElement('span');
      statusSpan.className = 'id-manager-status';
      statusSpan.textContent = entry.reEnabled ? 'Re-enabled' : 'Retired';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'modal-btn';
      toggleBtn.textContent = entry.reEnabled ? 'Disable' : 'Re-enable';
      toggleBtn.addEventListener('click', () => {
        if (entry.reEnabled) this.model.disableRetiredId(type, entry.id);
        else this.model.reEnableId(type, entry.id);
      });

      row.appendChild(idSpan);
      row.appendChild(statusSpan);
      row.appendChild(toggleBtn);
      return row;
    }

    _buildReassignRow(type, liveNodes, reEnabled) {
      const row = document.createElement('div');
      row.className = 'id-manager-reassign';

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

      const assignBtn = document.createElement('button');
      assignBtn.type = 'button';
      assignBtn.className = 'modal-btn modal-btn-primary';
      assignBtn.textContent = 'Assign';
      assignBtn.addEventListener('click', () => {
        try {
          this.model.reassignId(nodeSelect.value, idSelect.value);
        } catch (err) {
          this._showError(err.message);
        }
      });

      row.appendChild(nodeSelect);
      row.appendChild(idSelect);
      row.appendChild(assignBtn);
      return row;
    }
  }

  Bowtie.NodeLibraryController = NodeLibraryController;
})(window.Bowtie = window.Bowtie || {});
