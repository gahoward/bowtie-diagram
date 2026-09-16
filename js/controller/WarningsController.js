(function (Bowtie) {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Toolbar warning badge (orphaned PCs/MCs, plus barrier_measures_
  // proposal.md's two advisory barrier-measure checks) with a
  // notification count. Export is blocked only while a BLOCKING warning
  // is active (severity !== 'advisory') -- the two barrier-measure checks
  // are advisory: they inform without blocking export.
  //
  // The modal (ui_fitness_proposal.md) lists one row per warning -- id,
  // name, page, a Show button and the finding itself -- in two labelled
  // groups, blocking first, rather than paragraphs of prose. `onShow(w)`
  // is main.js's "switch to that page and focus that node".
  class WarningsController {
    constructor(model, button, exportButtonIds, { onShow } = {}) {
      this.model = model;
      this.button = button;
      this.exportButtonIds = exportButtonIds;
      this.onShow = onShow;
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
        size: 'wide',
        actions: [{ label: 'Close' }],
      });
    }

    _buildBody(warnings) {
      const wrap = el('div', 'warnings');
      if (warnings.length === 0) {
        wrap.appendChild(el('p', null, 'No warnings.'));
        return wrap;
      }
      const blocking = warnings.filter((w) => w.severity !== 'advisory');
      const advisory = warnings.filter((w) => w.severity === 'advisory');

      const addGroup = (items, kind, label) => {
        const head = el('div', `warning-group-head warning-group-${kind}`);
        head.appendChild(el('span', 'warning-group-label', label));
        head.appendChild(el('span', 'warning-group-count', String(items.length)));
        wrap.appendChild(head);
        const list = el('div', 'warning-list');
        items.forEach((w) => list.appendChild(this._buildRow(w, kind)));
        wrap.appendChild(list);
      };

      if (blocking.length > 0) addGroup(blocking, 'blocking', 'Blocking — export is disabled until these are fixed');
      // Advisory (barrier_measures_proposal.md): informational, never
      // block export -- shown in their own group so the distinction is
      // visible rather than lumped in with the blocking ones above.
      if (advisory.length > 0) addGroup(advisory, 'advisory', 'Advisory — worth a look');
      return wrap;
    }

    _buildRow(warning, kind) {
      const row = el('div', `warning-row warning-row-${kind}`);
      row.dataset.warningId = warning.id;
      row.appendChild(el('span', 'warning-row-icon', '⚠'));

      const placement = this.model.findById(warning.id);
      const node = placement ? this.model.getNode(placement.nodeId) : null;
      row.appendChild(el('span', 'warning-row-id', node ? this.model.displayIdentifierFor(node) : warning.id));
      row.appendChild(el('span', 'warning-row-name', node ? node.name : ''));
      row.appendChild(el('span', 'warning-row-page', warning.pageName || ''));

      const showBtn = el('button', 'modal-btn modal-btn-small', 'Show');
      showBtn.type = 'button';
      showBtn.title = 'Go to this node';
      showBtn.disabled = !this.onShow || !placement;
      showBtn.addEventListener('click', () => {
        this.modal.close();
        this.onShow(warning);
      });
      row.appendChild(showBtn);

      const detail = el('p', 'warning-row-detail', warning.detail || warning.message);
      detail.title = warning.message;
      row.appendChild(detail);
      return row;
    }
  }

  Bowtie.WarningsController = WarningsController;
})(window.Bowtie = window.Bowtie || {});
