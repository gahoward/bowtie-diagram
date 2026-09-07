(function (Bowtie) {
  class ToolbarController {
    constructor(model, { addCauseBtn, addOutcomeBtn, nameEl }) {
      this.model = model;
      addCauseBtn.addEventListener('click', () => this.model.addCause());
      addOutcomeBtn.addEventListener('click', () => this.model.addOutcome());

      this.nameEl = nameEl;
      nameEl.addEventListener('click', () => this._openRenameModal());
      model.onChange(() => this._renderName());
      this._renderName();
    }

    _renderName() {
      this.nameEl.textContent = this.model.name;
    }

    _openRenameModal() {
      const body = document.createElement('div');
      const wrap = document.createElement('label');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = 'Analysis title';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = this.model.name;
      wrap.appendChild(span);
      wrap.appendChild(input);
      body.appendChild(wrap);

      Bowtie.ModalView.openModal({
        title: 'Rename Analysis',
        bodyEl: body,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Save',
            primary: true,
            onClick: () => this.model.setName(input.value.trim() || 'Untitled Bowtie'),
          },
        ],
      });
    }
  }

  Bowtie.ToolbarController = ToolbarController;
})(window.Bowtie = window.Bowtie || {});
