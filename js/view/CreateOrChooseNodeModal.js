(function (Bowtie) {
  const TYPE_LABELS = {
    cause: 'Cause',
    outcome: 'Outcome',
    preventativeBarrier: 'Preventative Barrier',
    mitigativeBarrier: 'Mitigative Barrier',
  };

  function makeSection(title) {
    const section = document.createElement('div');
    section.className = 'modal-section';
    const h = document.createElement('h3');
    h.className = 'modal-section-title';
    h.textContent = title;
    section.appendChild(h);
    return section;
  }

  // The shared "create new, or choose an existing library node" modal every
  // "Add ..." entry point now goes through (node_library_proposal.md ask 3
  // / "The create-or-choose modal" — Open question 6, "own module",
  // resolved here rather than duplicating this on both ToolbarController
  // and ContextMenuController). "Choose existing" -- a filtered, click-to-
  // pick list (mirroring ContextMenuController's own attach-existing-
  // barrier picker) of every library node of `type` NOT already placed on
  // the current page -- comes FIRST when it has entries, since picking a
  // node that already exists is the cheaper action; it's omitted entirely
  // when empty. "Create new" is the form, with its Create button in the
  // footer beside Cancel and disabled until a name is typed, like every
  // other required name in the app (ui_fitness_proposal.md).
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
    let modal = null;

    // --- Choose existing ---
    const available = model.libraryNodesAvailableToPlace(type);
    if (available.length > 0) {
      const chooseSection = makeSection('Choose existing');
      chooseSection.classList.add('create-or-choose-section');

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

    // --- Create new ---
    const createSection = makeSection(available.length > 0 ? 'Or create new' : 'Create new');
    createSection.classList.add('create-or-choose-section');

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

    const nameInput = makeField('Name');
    const descriptionInput = makeField('Description');
    const identifierInput = makeField('Identifier', { placeholder: 'optional, must be unique' });

    const createError = document.createElement('p');
    createError.className = 'modal-field-error';
    createError.hidden = true;
    createSection.appendChild(createError);
    body.appendChild(createSection);

    const create = () => {
      const name = nameInput.value.trim();
      if (!name) return false;
      try {
        onCreate({
          name,
          description: descriptionInput.value.trim(),
          identifier: identifierInput.value.trim(),
        });
        return undefined;
      } catch (err) {
        createError.textContent = err.message;
        createError.hidden = false;
        return false;
      }
    };

    modal = Bowtie.ModalView.openModal({
      title: `Add ${typeLabel}`,
      bodyEl: body,
      actions: [
        { label: 'Cancel' },
        { label: `Create ${typeLabel}`, primary: true, onClick: create },
      ],
    });

    const createBtn = modal.dialog.querySelector('.modal-btn-primary');
    const syncCreateDisabled = () => { createBtn.disabled = nameInput.value.trim() === ''; };
    nameInput.addEventListener('input', syncCreateDisabled);
    syncCreateDisabled();
    [nameInput, descriptionInput, identifierInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !createBtn.disabled) {
          e.preventDefault();
          createBtn.click();
        }
      });
    });
    nameInput.focus();
    return modal;
  }

  Bowtie.openCreateOrChooseNodeModal = openCreateOrChooseNodeModal;
})(window.Bowtie = window.Bowtie || {});
