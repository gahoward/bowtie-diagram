(function (Bowtie) {
  // Toolbar warning badge (orphaned PCs/MCs, plus barrier_measures_
  // proposal.md's two advisory barrier-measure checks) with a
  // notification count. Export is blocked only while a BLOCKING warning
  // is active (severity !== 'advisory') -- the two barrier-measure checks
  // are advisory: they inform without blocking export.
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
      const blocking = warnings.filter((w) => w.severity !== 'advisory');
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
        if (btn) btn.disabled = blocking.length > 0;
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
      const blocking = warnings.filter((w) => w.severity !== 'advisory');
      const advisory = warnings.filter((w) => w.severity === 'advisory');

      const addList = (items, introText) => {
        const intro = document.createElement('p');
        intro.textContent = introText;
        wrap.appendChild(intro);
        const list = document.createElement('ul');
        list.className = 'warning-list';
        items.forEach((w) => {
          const li = document.createElement('li');
          li.textContent = w.message;
          list.appendChild(li);
        });
        wrap.appendChild(list);
      };

      if (blocking.length > 0) addList(blocking, 'Export is disabled while these warnings are unresolved:');
      // Advisory (barrier_measures_proposal.md): informational, never
      // block export -- shown in their own section so the distinction is
      // visible rather than lumped in with the blocking ones above.
      if (advisory.length > 0) addList(advisory, "Advisory -- don't block export, but worth a look:");
      return wrap;
    }
  }

  Bowtie.WarningsController = WarningsController;
})(window.Bowtie = window.Bowtie || {});
