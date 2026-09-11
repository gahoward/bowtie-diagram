(function (Bowtie) {
  const MODE_LABELS = {
    simple: 'Simple (no risk fields)',
    qualitative: 'Qualitative (pick likelihood/severity classes)',
    quantitative: 'Quantitative (raw frequencies, computed likelihoods)',
  };

  // Design review finding 11 -- see BowtieModel's tleAggregation
  // constructor comment and Quantitative.js's computeTleLikelihood.
  const AGGREGATION_LABELS = {
    max: 'Highest single cause (original, conservative default)',
    sum: 'Sum of all causes (independent-initiator LOPA convention)',
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
  // Scope note: risk matrix selection is bundled-preset selection PLUS
  // import/export of a hand-authored custom one (see _buildMatrixPicker
  // below) -- not a live, click-to-edit cell grid. Import/export covers the
  // practical need (author or tweak a matrix in a spreadsheet/text editor,
  // matching the RiskMatrixDefinition JSON shape any bundled preset under
  // js/data/risk-matrices/*.json already demonstrates) without the much
  // larger surface a full in-browser grid editor would be.
  class ProjectSettingsController {
    constructor(model, button, onDisplayUnitChange, importFileInput) {
      this.model = model;
      this.onDisplayUnitChange = onDisplayUnitChange;
      this.importFileInput = importFileInput;
      this.modal = null;
      // Session-only display preference (like SettingsController's visual
      // toggles) -- never part of the diagram data, never round-trips
      // through JSON export/import.
      this.displayUnit = 'hour';
      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
      importFileInput.addEventListener('change', (e) => this._onImportFile(e));
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
        if (this.model.riskMatrix) section.appendChild(this._buildRiskClassLegend());
      }
      if (this.model.mode === 'quantitative') {
        section.appendChild(this._buildTleAggregationToggle());
        section.appendChild(this._buildDisplayUnitToggle());
      }
      return section;
    }

    // Design review finding 11 -- how the TLE combines multiple causes'
    // own contributions into one top-event figure. Document-wide and
    // persisted (DocumentSerializer.js), unlike the session-only display-
    // unit toggle just below, because it changes what the document's own
    // saved numbers MEAN, not just how they're shown.
    _buildTleAggregationToggle() {
      const field = document.createElement('div');
      field.className = 'modal-field';
      const label = document.createElement('span');
      label.textContent = 'Combine multiple causes at the top event by';
      field.appendChild(label);

      Object.keys(AGGREGATION_LABELS).forEach((policy) => {
        const row = document.createElement('label');
        row.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'tle-aggregation';
        radio.value = policy;
        radio.checked = this.model.tleAggregation === policy;
        radio.addEventListener('change', () => {
          if (radio.checked) this.model.setTleAggregation(policy);
        });
        const span = document.createElement('span');
        span.textContent = AGGREGATION_LABELS[policy];
        row.appendChild(radio);
        row.appendChild(span);
        field.appendChild(row);
      });
      return field;
    }

    _buildMatrixPicker() {
      const wrap = document.createElement('div');

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
      const currentIsPreset = current && presets[current.id];
      // An imported/custom matrix isn't one of the bundled presets -- give
      // it its own (disabled, selectable-only-by-code) option rather than
      // silently falling back to "(none selected)", which would misstate
      // that nothing is active.
      if (current && !currentIsPreset) {
        const customOpt = document.createElement('option');
        customOpt.value = current.id;
        customOpt.textContent = `${current.name} (imported)`;
        select.appendChild(customOpt);
      }
      select.value = current ? current.id : '';

      select.addEventListener('change', () => {
        if (!select.value) {
          this.model.setRiskMatrix(null);
          return;
        }
        if (!presets[select.value]) return; // the informational "(imported)" option -- re-import to restore it
        // Embedded as a full, independent copy (per the design doc: exports
        // stay self-contained even if the bundled preset is later edited).
        this.model.setRiskMatrix(JSON.parse(JSON.stringify(presets[select.value])));
      });
      field.appendChild(select);
      wrap.appendChild(field);
      wrap.appendChild(this._buildMatrixImportExportRow(current));
      return wrap;
    }

    // Design review finding 02: the canvas risk badge only ever draws a
    // bare `riskClass.id` (a single letter) — nothing else in the app
    // showed what that letter actually means, short of exporting the
    // document and reading the matrix JSON by hand. This is the persistent
    // reference that pairs with the badge's own hover tooltip
    // (CanvasView._renderRiskBadge): the same colour + letter, plus the
    // full label every shipped preset already carries, shown once here
    // rather than requiring a hover per badge per visit.
    _buildRiskClassLegend() {
      const wrap = document.createElement('div');
      wrap.className = 'modal-field risk-class-legend-field';
      const label = document.createElement('span');
      label.textContent = 'Risk classes';
      wrap.appendChild(label);

      const legend = document.createElement('div');
      legend.className = 'risk-class-legend';
      (this.model.riskMatrix.riskClasses || []).forEach((riskClass) => {
        const item = document.createElement('div');
        item.className = 'risk-class-legend-item';
        const swatch = document.createElement('span');
        swatch.className = 'risk-class-legend-swatch';
        swatch.style.background = riskClass.colour || '#888';
        swatch.textContent = riskClass.id;
        const text = document.createElement('span');
        text.textContent = riskClass.label;
        item.appendChild(swatch);
        item.appendChild(text);
        legend.appendChild(item);
      });
      wrap.appendChild(legend);
      return wrap;
    }

    // "Import Risk Matrix..." / "Export Risk Matrix..." (see the class doc
    // comment's scope note): a hand-authored or hand-edited
    // RiskMatrixDefinition JSON file, validated with the exact same rules
    // a bundled preset is built with (RiskMatrixValidator.js) rather than a
    // second, driftable reimplementation.
    _buildMatrixImportExportRow(current) {
      const row = document.createElement('div');
      row.className = 'node-library-add-row';

      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.className = 'modal-btn';
      importBtn.textContent = 'Import Risk Matrix…';
      importBtn.addEventListener('click', () => this._importRiskMatrix());
      row.appendChild(importBtn);

      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'modal-btn';
      exportBtn.textContent = 'Export Risk Matrix…';
      exportBtn.disabled = !current;
      exportBtn.addEventListener('click', () => {
        const denormalized = Bowtie.denormalizeRiskMatrixForExport(this.model.riskMatrix);
        Bowtie.ExportUtil.exportJsonObject(denormalized, `${denormalized.id || 'risk-matrix'}.json`);
      });
      row.appendChild(exportBtn);
      return row;
    }

    // Prefers the real native "Open" dialog (mirrors ImportExportController's
    // own whole-document import); falls back to the hidden <input
    // type=file> everywhere that API doesn't exist.
    async _importRiskMatrix() {
      const result = await Bowtie.ExportUtil.pickJsonFileText();
      if (result.supported) {
        if (result.text != null) this._applyImportedMatrixText(result.text);
        return;
      }
      this.importFileInput.click();
    }

    _onImportFile(e) {
      const file = e.target.files[0];
      e.target.value = ''; // allow re-importing the same filename later
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this._applyImportedMatrixText(reader.result);
      reader.onerror = () => this._showImportError('Failed to read the file.');
      reader.readAsText(file);
    }

    _applyImportedMatrixText(text) {
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        this._showImportError('That file is not valid JSON.');
        return;
      }
      const result = Bowtie.validateRiskMatrix(raw);
      if (!result.ok) {
        this._showImportError(`That file isn't a valid risk matrix: ${result.error}`);
        return;
      }
      this.model.setRiskMatrix(result.matrix);
    }

    _showImportError(message) {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(p);
      Bowtie.ModalView.openModal({ title: 'Cannot Import Risk Matrix', bodyEl: body, actions: [{ label: 'OK', primary: true }] });
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
