(function (Bowtie) {
  const MODE_LABELS = {
    simple: 'Simple (no risk fields)',
    qualitative: 'Qualitative (pick likelihood/severity classes)',
    quantitative: 'Quantitative (raw frequencies, computed likelihoods)',
  };

  // One home for every document-wide setting that isn't "the diagram
  // itself": the analysis name, the identifier display mode
  // (node_library_proposal.md "Display identifiers", moved out of
  // NodeLibraryController -- that modal is about the nodes themselves, not
  // document config), the risk analysis mode/matrix (quantitative_mode_
  // proposal.md "UI/UX", formerly ModeController), and the events/hour <->
  // events/year display-unit preference used by the Properties modal's and
  // canvas's read-only computed values.
  //
  // Scope note (inherited from the old ModeController): risk matrix
  // selection is preset SELECTION (a bundled matrix, e.g. Leaflet 5, or
  // none), not a full custom-matrix authoring grid editor.
  class ProjectSettingsController {
    constructor(model, button, onDisplayUnitChange) {
      this.model = model;
      this.onDisplayUnitChange = onDisplayUnitChange;
      this.modal = null;
      // Session-only display preference (like SettingsController's visual
      // toggles) -- never part of the diagram data, never round-trips
      // through JSON export/import.
      this.displayUnit = 'hour';
      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
    }

    getDisplayUnit() {
      return this.displayUnit;
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Project Settings',
        bodyEl: this._buildBody(),
        size: 'wide',
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

    _makeSection(title) {
      const section = document.createElement('div');
      section.className = 'modal-section';
      const h = document.createElement('h3');
      h.className = 'modal-section-title';
      h.textContent = title;
      section.appendChild(h);
      return section;
    }

    _buildBody() {
      const body = document.createElement('div');
      body.appendChild(this._buildNameSection());
      body.appendChild(this._buildIdentifierDisplayModeSection());
      body.appendChild(this._buildAnalysisModeSection());
      return body;
    }

    _buildNameSection() {
      const section = this._makeSection('Analysis');
      const field = document.createElement('label');
      field.className = 'modal-field';
      const label = document.createElement('span');
      label.textContent = 'Name';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = this.model.name;
      input.addEventListener('change', () => {
        const next = input.value.trim();
        if (next) this.model.setName(next);
        else input.value = this.model.name;
      });
      field.appendChild(label);
      field.appendChild(input);
      section.appendChild(field);
      return section;
    }

    // node_library_proposal.md "Display identifiers": switching to
    // 'custom' backfills every node's blank identifier with its own current
    // id (BowtieModel.setIdentifierDisplayMode already does the backfill;
    // this just warns about it, mirroring the wizard's own inline copy).
    _buildIdentifierDisplayModeSection() {
      const section = this._makeSection('Identifiers');
      const field = document.createElement('div');
      field.className = 'modal-field';
      const label = document.createElement('span');
      label.textContent = 'Show identifiers as';
      field.appendChild(label);

      const warning = document.createElement('p');
      warning.className = 'modal-field-hint';
      warning.textContent = 'Every Cause, Outcome, and Barrier now shows its current id as a starting identifier — '
        + "rename any of them from the Node Library. New ones you create won't get an identifier automatically.";
      warning.hidden = this.model.identifierDisplayMode !== 'custom';

      [
        { value: 'internal', text: 'Internal IDs' },
        { value: 'custom', text: 'Custom Labels' },
      ].forEach((opt) => {
        const row = document.createElement('label');
        row.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'identifier-display-mode-toggle';
        radio.value = opt.value;
        radio.checked = this.model.identifierDisplayMode === opt.value;
        radio.addEventListener('change', () => {
          if (radio.checked) this.model.setIdentifierDisplayMode(opt.value);
        });
        const span = document.createElement('span');
        span.textContent = opt.text;
        row.appendChild(radio);
        row.appendChild(span);
        field.appendChild(row);
      });
      field.appendChild(warning);
      section.appendChild(field);
      return section;
    }

    _buildAnalysisModeSection() {
      const section = this._makeSection('Risk Analysis');

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
      section.appendChild(modeField);

      if (this.model.mode !== 'simple') {
        section.appendChild(this._buildMatrixPicker());
      }
      if (this.model.mode === 'quantitative') {
        section.appendChild(this._buildDisplayUnitToggle());
      }
      return section;
    }

    _buildMatrixPicker() {
      const field = document.createElement('label');
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
        radio.addEventListener('change', () => {
          if (radio.checked) {
            this.displayUnit = unit;
            this.onDisplayUnitChange();
          }
        });
        const span = document.createElement('span');
        span.textContent = unit === 'hour' ? 'events/hour' : 'events/year';
        row.appendChild(radio);
        row.appendChild(span);
        field.appendChild(row);
      });
      return field;
    }
  }

  Bowtie.ProjectSettingsController = ProjectSettingsController;
})(window.Bowtie = window.Bowtie || {});
