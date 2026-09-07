(function (Bowtie) {
  const MODE_LABELS = {
    simple: 'Simple (no risk fields)',
    qualitative: 'Qualitative (pick likelihood/severity classes)',
    quantitative: 'Quantitative (raw frequencies, computed likelihoods)',
  };

  // Document-level mode selector (quantitative_mode_proposal.md "UI/UX"):
  // Simple / Qualitative / Quantitative, plus the active risk matrix
  // (a bundled preset, e.g. Leaflet 5, or none) and the events/hour <->
  // events/year display-unit setting (shown only once Quantitative is
  // active, since Qualitative mode has no raw numbers to convert).
  //
  // Scope note: this ships preset SELECTION (choose a bundled matrix, or
  // none) rather than a full custom-matrix authoring grid editor -- the
  // design doc's "build/edit a custom one via a grid editor" is real scope
  // this pass doesn't cover; "Clone as custom" and the cell-by-cell editor
  // are a natural follow-up once this lands.
  class ModeController {
    constructor(model, button) {
      this.model = model;
      this.modal = null;
      this.displayUnit = 'hour';
      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Analysis Mode',
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

    _buildBody() {
      const body = document.createElement('div');

      const modeField = document.createElement('div');
      modeField.className = 'modal-field';
      const modeLabel = document.createElement('span');
      modeLabel.textContent = 'Mode';
      modeField.appendChild(modeLabel);

      Object.keys(MODE_LABELS).forEach((mode) => {
        const row = document.createElement('label');
        row.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'analysis-mode';
        radio.value = mode;
        radio.checked = this.model.mode === mode;
        radio.addEventListener('change', () => {
          if (radio.checked) this.model.setMode(mode);
        });
        const span = document.createElement('span');
        span.textContent = MODE_LABELS[mode];
        row.appendChild(radio);
        row.appendChild(span);
        modeField.appendChild(row);
      });
      body.appendChild(modeField);

      if (this.model.mode !== 'simple') {
        body.appendChild(this._buildMatrixPicker());
      }
      if (this.model.mode === 'quantitative') {
        body.appendChild(this._buildDisplayUnitToggle());
      }
      return body;
    }

    _buildMatrixPicker() {
      const field = document.createElement('div');
      field.className = 'modal-field';
      const label = document.createElement('span');
      label.textContent = 'Risk matrix';
      field.appendChild(label);

      const select = document.createElement('select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '(none selected)';
      select.appendChild(noneOpt);

      const presets = (window.Bowtie && Bowtie.RISK_MATRIX_PRESETS) || {};
      Object.values(presets).forEach((preset) => {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.name;
        select.appendChild(opt);
      });
      const current = this.model.riskMatrix;
      select.value = current ? current.id : '';

      select.addEventListener('change', () => {
        if (!select.value) {
          this.model.setRiskMatrix(null);
          return;
        }
        // Embedded as a full, independent copy (per the design doc: exports
        // stay self-contained even if the bundled preset is later edited).
        this.model.setRiskMatrix(JSON.parse(JSON.stringify(presets[select.value])));
      });
      field.appendChild(select);
      return field;
    }

    _buildDisplayUnitToggle() {
      const field = document.createElement('div');
      field.className = 'modal-field';
      const label = document.createElement('span');
      label.textContent = 'Display frequencies as';
      field.appendChild(label);

      ['hour', 'year'].forEach((unit) => {
        const row = document.createElement('label');
        row.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'display-unit';
        radio.value = unit;
        radio.checked = this.displayUnit === unit;
        radio.addEventListener('change', () => { if (radio.checked) this.displayUnit = unit; });
        const span = document.createElement('span');
        span.textContent = unit === 'hour' ? 'events/hour' : 'events/year';
        row.appendChild(radio);
        row.appendChild(span);
        field.appendChild(row);
      });
      return field;
    }
  }

  Bowtie.ModeController = ModeController;
})(window.Bowtie = window.Bowtie || {});
