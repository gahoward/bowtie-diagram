(function (Bowtie) {
  // Toolbar warning badge (orphaned PCs/MCs, etc.) with a notification count.
  // Export is blocked entirely while any warning is active.
  class WarningsController {
    constructor(model, button, exportButtonIds) {
      this.model = model;
      this.button = button;
      this.exportButtonIds = exportButtonIds;
      this.modal = null;

      button.addEventListener('click', () => this._open());
      model.onChange(() => this.refresh());
      this.refresh();
    }

    refresh() {
      const warnings = this.model.getWarnings();
      const countEl = this.button.querySelector('.warning-count');
      if (countEl) countEl.textContent = String(warnings.length);
      this.button.hidden = warnings.length === 0;
      // Design review finding 06 -- the count alone gives no hint where to
      // look on a multi-page document before opening the modal; a native
      // hover tooltip naming the affected page(s) costs nothing new to
      // build (the modal one click away already names them in full).
      const pageNames = [...new Set(warnings.map((w) => w.pageName).filter(Boolean))];
      this.button.title = pageNames.length > 0
        ? `Warnings on: ${pageNames.join(', ')}`
        : 'Warnings';

      this.exportButtonIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = warnings.length > 0;
      });

      if (this.modal && document.body.contains(this.modal.overlay)) {
        this.modal.setBody(this._buildBody(warnings));
      }
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Warnings',
        bodyEl: this._buildBody(this.model.getWarnings()),
        actions: [{ label: 'Close' }],
      });
    }

    _buildBody(warnings) {
      const wrap = document.createElement('div');
      if (warnings.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'No warnings.';
        wrap.appendChild(p);
        return wrap;
      }
      const intro = document.createElement('p');
      intro.textContent = 'Export is disabled while these warnings are unresolved:';
      wrap.appendChild(intro);

      const list = document.createElement('ul');
      list.className = 'warning-list';
      warnings.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = w.message;
        list.appendChild(li);
      });
      wrap.appendChild(list);
      return wrap;
    }
  }

  Bowtie.WarningsController = WarningsController;
})(window.Bowtie = window.Bowtie || {});
