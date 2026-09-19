(function (Bowtie) {
  const el = Bowtie.Dom.el;
  const button = Bowtie.Dom.button;

  // The Node Library modal's markup (proposals/15 part 2). Everything
  // here is a pure function of the plain data it is handed: it holds no
  // reference to the model, reads nothing from it, and reports every
  // intent back through a handler. NodeLibraryController keeps what it
  // always had -- the model calls, the tab/disclosure/focus state, and
  // the two confirmation flows, which are dialogs rather than markup.
  //
  // The dividing line, same as the rest of js/view/: a view renders from
  // state and never mutates the model.

  // Display labels for the six node types: the tab label, the singular
  // used in "New <singular> name…", and the lowercased plural in the
  // empty message. Names, so they live with the markup that shows them.
  const TYPES = [
    { id: 'threat', label: 'Threats', singular: 'threat' },
    { id: 'consequence', label: 'Consequences', singular: 'consequence' },
    { id: 'preventativeBarrier', label: 'Preventative', singular: 'preventative barrier' },
    { id: 'mitigativeBarrier', label: 'Mitigative', singular: 'mitigative barrier' },
    { id: 'escalationFactor', label: 'Escalation', singular: 'escalation factor' },
    { id: 'escalationBarrier', label: 'Esc. barriers', singular: 'escalation barrier' },
  ];

  // A library node with zero placements is a normal "staging" state
  // (node_library_proposal.md ask 2) -- this is how one gets created
  // directly, without also creating a placement (unlike every "Add …"
  // entry point, which always creates both together).
  //
  // `onAddNode` returns true when the name was accepted, which is what
  // clears the field: a rejected name (a duplicate, say) stays put so it
  // can be corrected rather than retyped.
  function addNodeRow(type, onAddNode) {
    const row = el('div', 'node-library-add-row');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = `New ${type.singular} name…`;
    row.appendChild(nameInput);
    const addBtn = button('+ Add to library', 'modal-btn');
    const add = () => {
      const name = nameInput.value.trim();
      if (!name) return;
      if (onAddNode(name)) nameInput.value = '';
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

  // `row` is `{ nodeId, displayId, name, description, pageNames }` --
  // the controller has already resolved the placements into page names,
  // so nothing here knows what a placement is.
  function nodeRow(row, focusNodeId, { onEditNode, onDeleteNode }) {
    const tr = el('tr', 'node-library-row');
    tr.dataset.nodeId = row.nodeId;
    if (row.nodeId === focusNodeId) tr.classList.add('focused');

    tr.appendChild(el('td', 'id-manager-id', row.displayId));
    const nameCell = el('td', 'node-library-name', row.name);
    if (row.description) nameCell.title = row.description;
    tr.appendChild(nameCell);

    const pagesCell = el('td', 'node-library-pages');
    if (row.pageNames.length === 0) {
      pagesCell.appendChild(el('span', 'node-library-tag', 'Not placed yet'));
    } else {
      pagesCell.textContent = row.pageNames.join(', ');
    }
    tr.appendChild(pagesCell);

    const actions = el('td', 'node-library-actions');
    const editBtn = button('Edit', 'modal-btn modal-btn-small');
    editBtn.addEventListener('click', () => onEditNode(row.nodeId));
    const deleteBtn = button('Delete', 'modal-btn modal-btn-small');
    deleteBtn.addEventListener('click', () => onDeleteNode(row.nodeId));
    actions.append(editBtn, deleteBtn);
    tr.appendChild(actions);
    return tr;
  }

  function nodeTable(type, rows, focusNodeId, handlers) {
    if (rows.length === 0) {
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
    rows.forEach((row) => tbody.appendChild(nodeRow(row, focusNodeId, handlers)));
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // No page-context label (node_library_proposal.md: "no page history is
  // captured" -- a deleted node may have had several placements across
  // several pages; recording where isn't worth showing) -- just the id
  // and its re-enable/disable status, mirroring `{ id, reEnabled }`.
  function retiredRow(entry, onToggleRetiredId) {
    const row = el('div', 'id-manager-row');
    row.appendChild(el('span', 'id-manager-id', entry.id));
    row.appendChild(el('span', 'id-manager-status', entry.reEnabled ? 'Re-enabled' : 'Retired'));
    const toggleBtn = button(entry.reEnabled ? 'Disable' : 'Re-enable', 'modal-btn modal-btn-small');
    toggleBtn.addEventListener('click', () => onToggleRetiredId(entry.id, entry.reEnabled));
    row.appendChild(toggleBtn);
    return row;
  }

  function reassignRow(liveNodes, reEnabled, onReassign) {
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
    assignBtn.addEventListener('click', () => onReassign(nodeSelect.value, idSelect.value));
    row.append(nodeSelect, idSelect, assignBtn);
    return row;
  }

  // Collapsed by default -- posterity is a rarely-visited feature, and it
  // used to sit at the same level as the live list on every type. Open
  // state is the controller's (remembered per type across rebuilds), which
  // is why it arrives as `retiredOpen` and leaves as `onToggleRetiredOpen`.
  function retiredSection(state, handlers) {
    const { retired, retiredOpen, liveNodes } = state;
    const details = el('details', 'node-library-retired');
    details.open = Boolean(retiredOpen);
    details.addEventListener('toggle', () => handlers.onToggleRetiredOpen(details.open));
    details.appendChild(el('summary', null, `Retired identifiers (${retired.length})`));

    const body = el('div', 'node-library-retired-body');
    if (retired.length === 0) {
      body.appendChild(el('p', 'id-manager-empty', 'No retired identifiers yet.'));
    } else {
      const list = el('div', 'id-manager-list');
      retired.forEach((entry) => list.appendChild(retiredRow(entry, handlers.onToggleRetiredId)));
      body.appendChild(list);
    }

    const reEnabled = retired.filter((e) => e.reEnabled);
    if (reEnabled.length > 0 && liveNodes.length > 0) {
      body.appendChild(reassignRow(liveNodes, reEnabled, handlers.onReassign));
    }
    details.appendChild(body);
    return details;
  }

  // `state` is `{ activeType, counts, rows, retired, retiredOpen,
  // liveNodes, focusNodeId }`; `handlers` is `{ onSelectType, onAddNode,
  // onEditNode, onDeleteNode, onToggleRetiredOpen, onToggleRetiredId,
  // onReassign }`.
  function body(state, handlers) {
    const wrap = el('div', 'node-library');

    wrap.appendChild(Bowtie.FormControls.tabs({
      items: TYPES.map((type) => ({ id: type.id, label: `${type.label} (${state.counts[type.id]})` })),
      activeId: state.activeType,
      dataKey: 'type',
      onSelect: handlers.onSelectType,
    }));

    const type = TYPES.find((t) => t.id === state.activeType);
    const panel = el('div', 'node-library-panel');
    panel.dataset.type = type.id;
    panel.appendChild(addNodeRow(type, handlers.onAddNode));
    panel.appendChild(nodeTable(type, state.rows, state.focusNodeId, handlers));
    panel.appendChild(retiredSection(state, handlers));
    wrap.appendChild(panel);
    return wrap;
  }

  Bowtie.NodeLibraryView = { TYPES, body };
})(window.Bowtie = window.Bowtie || {});
