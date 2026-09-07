(function (Bowtie) {
  const TYPE_LABELS = {
    cause: 'Causes',
    outcome: 'Outcomes',
    preventativeBarrier: 'Preventative Barriers',
    mitigativeBarrier: 'Mitigative Barriers',
  };
  const TYPE_COLLECTIONS = {
    cause: 'causes',
    outcome: 'outcomes',
    preventativeBarrier: 'preventativeBarriers',
    mitigativeBarrier: 'mitigativeBarriers',
  };

  // Posterity of identifiers: every id, once used, stays remembered forever
  // (BowtieModel.retiredIds). This panel lets the user re-enable a retired
  // id (making it eligible for manual assignment only, never automatic) and
  // manually assign a re-enabled id to a live element.
  class IdentifierManagerController {
    constructor(model, button) {
      this.model = model;
      this.modal = null;
      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Manage Identifiers',
        bodyEl: this._buildBody(),
        actions: [{ label: 'Close' }],
      });
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

      const retired = this.model.retiredIds[type] || [];
      if (retired.length === 0) {
        const p = document.createElement('p');
        p.className = 'id-manager-empty';
        p.textContent = 'No retired identifiers yet.';
        section.appendChild(p);
      } else {
        const list = document.createElement('div');
        list.className = 'id-manager-list';
        retired.forEach((entry) => list.appendChild(this._buildRetiredRow(type, entry)));
        section.appendChild(list);
      }

      const reEnabled = retired.filter((e) => e.reEnabled);
      const liveElements = this.model[TYPE_COLLECTIONS[type]];
      if (reEnabled.length > 0 && liveElements.length > 0) {
        section.appendChild(this._buildReassignRow(type, liveElements, reEnabled));
      }

      return section;
    }

    _buildRetiredRow(type, entry) {
      const row = document.createElement('div');
      row.className = 'id-manager-row';

      const idSpan = document.createElement('span');
      idSpan.className = 'id-manager-id';
      idSpan.textContent = entry.id;

      // `entry.pageId` is the page the element belonged to at the moment
      // it was deleted (see BowtieModel.deleteElement) — that page may
      // itself have since been deleted too, so this can't assume it still
      // exists.
      const page = this.model.getPage(entry.pageId);
      const pageSpan = document.createElement('span');
      pageSpan.className = 'id-manager-page';
      pageSpan.textContent = page ? `Page: ${page.name}` : '(page since deleted)';

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
      row.appendChild(pageSpan);
      row.appendChild(statusSpan);
      row.appendChild(toggleBtn);
      return row;
    }

    _buildReassignRow(type, liveElements, reEnabled) {
      const row = document.createElement('div');
      row.className = 'id-manager-reassign';

      const elementSelect = document.createElement('select');
      liveElements.forEach((el) => {
        const opt = document.createElement('option');
        opt.value = el.id;
        // A live element's own page can't have been deleted out from under
        // it — getPage(el.pageId) is always resolvable here.
        opt.textContent = `${el.id} — ${el.name} (Page: ${this.model.getPage(el.pageId).name})`;
        elementSelect.appendChild(opt);
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
          this.model.reassignId(elementSelect.value, idSelect.value);
        } catch (err) {
          this._showError(err.message);
        }
      });

      row.appendChild(elementSelect);
      row.appendChild(idSelect);
      row.appendChild(assignBtn);
      return row;
    }
  }

  Bowtie.IdentifierManagerController = IdentifierManagerController;
})(window.Bowtie = window.Bowtie || {});
