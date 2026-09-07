(function (Bowtie) {
  const TYPE_LABELS = {
    cause: 'Cause',
    outcome: 'Outcome',
    preventativeBarrier: 'Preventative Barrier',
    mitigativeBarrier: 'Mitigative Barrier',
  };

  // The shared "create new, or choose an existing library node" modal every
  // "Add ..." entry point now goes through (node_library_proposal.md ask 3
  // / "The create-or-choose modal" — Open question 6, "own module",
  // resolved here rather than duplicating this on both ToolbarController
  // and ContextMenuController). Two independent sections rather than one
  // combined submit: "Create new" has its own Create button (Name required,
  // Description/Identifier optional); "Choose existing" is a filtered,
  // click-to-pick list (mirroring ContextMenuController's own
  // attach-existing-barrier picker) of every library node of `type` NOT
  // already placed on the current page — offered only when that list is
  // non-empty, since an empty "Choose existing" section would just be
  // confusing filler.
  //
  // `model` is whatever page-scoped model facade the caller already holds
  // (ToolbarController/ContextMenuController are both constructed with
  // PageScopedModel) — needs `libraryNodesAvailableToPlace(type)` and
  // `displayIdentifierFor(node)`.
  function openCreateOrChooseNodeModal({
    model, type, onCreate, onChooseExisting,
  }) {
    const typeLabel = TYPE_LABELS[type] || type;
    const body = document.createElement('div');
    body.className = 'create-or-choose-modal';

    // --- Create new ---
    const createSection = document.createElement('div');
    createSection.className = 'create-or-choose-section';
    const createHeading = document.createElement('h3');
    createHeading.textContent = 'Create New';
    createSection.appendChild(createHeading);

    const makeField = (labelText, opts = {}) => {
      const wrap = document.createElement('label');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'text';
      if (opts.placeholder) input.placeholder = opts.placeholder;
      wrap.appendChild(span);
      wrap.appendChild(input);
      createSection.appendChild(wrap);
      return input;
    };

    const nameInput = makeField('Name*');
    const descriptionInput = makeField('Description');
    const identifierInput = makeField('Identifier', { placeholder: 'optional, must be unique' });

    const createError = document.createElement('p');
    createError.className = 'modal-field-error';
    createError.hidden = true;
    createSection.appendChild(createError);

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'modal-btn modal-btn-primary';
    createBtn.textContent = `Create ${typeLabel}`;
    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        createError.textContent = 'Name is required.';
        createError.hidden = false;
        return;
      }
      try {
        onCreate({
          name,
          description: descriptionInput.value.trim(),
          identifier: identifierInput.value.trim(),
        });
        modal.close();
      } catch (err) {
        createError.textContent = err.message;
        createError.hidden = false;
      }
    });
    createSection.appendChild(createBtn);
    body.appendChild(createSection);

    // --- Choose existing ---
    const available = model.libraryNodesAvailableToPlace(type);
    if (available.length > 0) {
      const chooseSection = document.createElement('div');
      chooseSection.className = 'create-or-choose-section';
      const chooseHeading = document.createElement('h3');
      chooseHeading.textContent = 'Choose Existing';
      chooseSection.appendChild(chooseHeading);

      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Search by id or name…';
      filterInput.className = 'modal-field-input';
      chooseSection.appendChild(filterInput);

      const list = document.createElement('div');
      list.className = 'attach-list';
      chooseSection.appendChild(list);

      const rows = available.map((node) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'attach-list-item';

        const idSpan = document.createElement('span');
        idSpan.className = 'attach-list-id';
        idSpan.textContent = model.displayIdentifierFor(node);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'attach-list-name';
        nameSpan.textContent = node.name;

        btn.appendChild(idSpan);
        btn.appendChild(nameSpan);
        btn.addEventListener('click', () => {
          onChooseExisting(node);
          modal.close();
        });
        list.appendChild(btn);
        return { el: btn, haystack: `${node.id} ${node.identifier} ${node.name}`.toLowerCase() };
      });

      filterInput.addEventListener('input', () => {
        const term = filterInput.value.trim().toLowerCase();
        rows.forEach((row) => { row.el.hidden = term.length > 0 && !row.haystack.includes(term); });
      });

      body.appendChild(chooseSection);
    }

    const modal = Bowtie.ModalView.openModal({
      title: `Add ${typeLabel}`,
      bodyEl: body,
      actions: [{ label: 'Cancel' }],
    });
    nameInput.focus();
    return modal;
  }

  Bowtie.openCreateOrChooseNodeModal = openCreateOrChooseNodeModal;
})(window.Bowtie = window.Bowtie || {});
