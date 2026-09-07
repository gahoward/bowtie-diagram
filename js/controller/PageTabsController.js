(function (Bowtie) {
  // Owns which page is active, page switching, and page CRUD (add/rename/
  // delete) — but always through `model` (expected to be `undo.model`, the
  // undo-tracking Proxy passed in from main.js, never the raw model: going
  // straight to the raw model would silently make page operations
  // non-undoable). Never touches diagram content directly; that's what
  // PageScopedModel (constructed with this controller's getActivePageId)
  // is for.
  class PageTabsController {
    constructor(model, container) {
      this.model = model;
      this.container = container;
      this.view = new Bowtie.PageTabsView(container);
      this.activePageId = model.pages[0].id;
      this.jumpOpen = false;
      this._listeners = [];

      container.addEventListener('click', (e) => this._onClick(e));

      // Mirrors MenuBarController's own trigger/dropdown idiom: a
      // document-level pointerdown closes the dropdown on any outside
      // click, and Escape closes it too. pointerdown (not click) fires
      // before this controller's own click handler below, so a click on
      // the trigger itself is never immediately undone by this listener —
      // at that point jumpOpen is still whatever it was before the toggle.
      document.addEventListener('pointerdown', (e) => {
        if (!this.jumpOpen || container.contains(e.target)) return;
        this.jumpOpen = false;
        this._render();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.jumpOpen) {
          this.jumpOpen = false;
          this._render();
        }
      });

      // Nothing in this app currently mutates `pages` outside this
      // controller's own handlers below, but re-rendering (and re-checking
      // that the active page still exists) on every model change is cheap
      // and keeps the strip correct if that ever stops being true.
      model.onChange(() => this._onModelChange());
      this._render();
    }

    getActivePageId() { return this.activePageId; }

    onChange(fn) { this._listeners.push(fn); }

    _emitChange() { this._listeners.forEach((fn) => fn()); }

    _onModelChange() {
      if (!this.model.getPage(this.activePageId)) {
        this.activePageId = this.model.pages[0].id;
      }
      this._render();
    }

    _render() {
      this.view.render(this.model.pages, this.activePageId, { jumpOpen: this.jumpOpen });
    }

    _scrollActiveIntoView() {
      const tab = this.container.querySelector('.page-tab.active');
      if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    _onClick(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, pageId } = btn.dataset;
      if (action === 'select') this._select(pageId);
      else if (action === 'edit') this._openEditModal(pageId);
      else if (action === 'delete') this._confirmDelete(pageId);
      else if (action === 'add') this._openAddModal();
      else if (action === 'toggle-jump') { this.jumpOpen = !this.jumpOpen; this._render(); }
      else if (action === 'jump-to') this._select(pageId);
    }

    _select(pageId) {
      this.jumpOpen = false;
      if (pageId === this.activePageId) { this._render(); return; }
      this.activePageId = pageId;
      this._render();
      this._scrollActiveIntoView();
      this._emitChange();
    }

    // Shared by both "+ Add page" and each tab's edit affordance — same
    // name (required) + description (optional) fields, same Create/Save-
    // disabled-until-named rule.
    _openPageModal({ title, submitLabel, name = '', description = '', onSubmit }) {
      const body = document.createElement('div');

      const nameWrap = document.createElement('label');
      nameWrap.className = 'modal-field';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = 'Page name';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = name;
      nameWrap.append(nameSpan, nameInput);

      const descWrap = document.createElement('label');
      descWrap.className = 'modal-field';
      const descSpan = document.createElement('span');
      descSpan.textContent = 'Page description (optional)';
      const descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.value = description;
      descWrap.append(descSpan, descInput);

      body.append(nameWrap, descWrap);

      const modal = Bowtie.ModalView.openModal({
        title,
        bodyEl: body,
        actions: [
          { label: 'Cancel' },
          {
            label: submitLabel,
            primary: true,
            onClick: () => onSubmit({ name: nameInput.value.trim(), description: descInput.value }),
          },
        ],
      });

      const submitBtn = modal.dialog.querySelector('.modal-btn-primary');
      const updateDisabled = () => { submitBtn.disabled = nameInput.value.trim() === ''; };
      nameInput.addEventListener('input', updateDisabled);
      updateDisabled();
      nameInput.focus();
    }

    _openAddModal() {
      this._openPageModal({
        title: 'Add Page',
        submitLabel: 'Create',
        onSubmit: ({ name, description }) => {
          const page = this.model.addPage({ name, description });
          this.activePageId = page.id;
          this._render();
          this._scrollActiveIntoView();
          this._emitChange();
        },
      });
    }

    _openEditModal(pageId) {
      const page = this.model.getPage(pageId);
      if (!page) return;
      this._openPageModal({
        title: 'Edit Page',
        submitLabel: 'Save',
        name: page.name,
        description: page.description,
        onSubmit: ({ name, description }) => this.model.renamePage(pageId, { name, description }),
      });
    }

    _confirmDelete(pageId) {
      const page = this.model.getPage(pageId);
      if (!page || this.model.pages.length <= 1) return;

      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = `Delete page "${page.name}" and everything on it? This cannot be undone from here.`;
      body.appendChild(p);

      Bowtie.ModalView.openModal({
        title: 'Delete Page',
        bodyEl: body,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Delete',
            primary: true,
            onClick: () => this._deletePage(pageId),
          },
        ],
      });
    }

    _deletePage(pageId) {
      const wasActive = pageId === this.activePageId;
      // Computed before the delete: the removed page's own position tells
      // us which neighbor should become active in its place.
      const removedIndex = this.model.pages.findIndex((p) => p.id === pageId);
      this.model.deletePage(pageId);
      if (wasActive) {
        const remaining = this.model.pages;
        this.activePageId = (remaining[removedIndex - 1] || remaining[0]).id;
      }
      this._render();
      this._emitChange();
    }
  }

  Bowtie.PageTabsController = PageTabsController;
})(window.Bowtie = window.Bowtie || {});
