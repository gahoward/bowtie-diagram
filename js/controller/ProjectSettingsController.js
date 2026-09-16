(function (Bowtie) {
  // Design review finding 11 -- see BowtieModel's tleAggregation
  // constructor comment and Quantitative.js's computeTleLikelihood.
  const AGGREGATION_OPTIONS = [
    { value: 'max', text: 'Highest single cause' },
    { value: 'sum', text: 'Sum of all causes' },
  ];

  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'risk', label: 'Risk analysis' },
    { id: 'quantitative', label: 'Quantitative' }, // only while mode === 'quantitative'
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Settings › Project Settings… (ui_fitness_proposal.md S2): one home for
  // every setting that is SAVED WITH THE DOCUMENT -- the analysis name,
  // the identifier display mode (node_library_proposal.md "Display
  // identifiers"), the risk analysis mode/matrix (quantitative_mode_
  // proposal.md "UI/UX"), the TLE aggregation policy and the quantitative
  // defaults (barrier_measures_proposal.md). Per-browser preferences
  // (display unit, annotations, auto-arrange knobs) live in
  // PreferencesController instead, so the split the subtitle states --
  // "saved with the document" -- is exact.
  //
  // Three tabs (General / Risk analysis / Quantitative, the last only in
  // that mode) so nothing scrolls; every row is label · control · one-line
  // helper. Every change applies immediately; the button is Done.
  //
  // Scope note: risk matrix selection is bundled-preset selection PLUS
  // import/export of a hand-authored custom one (see _buildMatrixRow
  // below) -- not a live, click-to-edit cell grid. Import/export covers the
  // practical need (author or tweak a matrix in a spreadsheet/text editor,
  // matching the RiskMatrixDefinition JSON shape any bundled preset under
  // js/data/risk-matrices/*.json already demonstrates) without the much
  // larger surface a full in-browser grid editor would be.
  class ProjectSettingsController {
    constructor(model, button, importFileInput) {
      this.model = model;
      this.importFileInput = importFileInput;
      this.modal = null;
      this._activeTab = 'general';
      // Structural review finding 09: every model change rebuilds the whole
      // modal body from scratch, which is fine for a radio toggle (nothing
      // was focused inside it a moment later) but not for a text field --
      // its 'change' event fires on blur, after focus has already moved to
      // whatever's next in tab order, and a same-tick body rebuild replaces
      // that element too, dropping focus to <body> with no way back. Nothing
      // else in this modal depends on those values changing, so each text
      // field's commit sets this flag to skip the one rebuild it triggers.
      this._suppressNextRefresh = false;
      button.addEventListener('click', () => this.open());
      model.onChange(() => this._refresh());
      importFileInput.addEventListener('change', (e) => this._onImportFile(e));
    }

    // `tab` picks which tab opens; `focusName` lands the cursor in the
    // Name field -- what the toolbar's title button does, so there is one
    // place to rename the analysis rather than a separate dialog.
    open({ tab = 'general', focusName = false } = {}) {
      this._activeTab = tab;
      this.modal = Bowtie.ModalView.openModal({
        title: 'Project Settings',
        bodyEl: this._buildBody(),
        size: 'wide',
        actions: [{ label: 'Done', primary: true }],
      });
      if (focusName) {
        const input = this.modal.dialog.querySelector('input[name=analysis-name]');
        if (input) {
          input.focus();
          input.select();
        }
      }
    }

    _refresh() {
      if (!this.modal) return;
      if (this._suppressNextRefresh) {
        this._suppressNextRefresh = false;
        return;
      }
      if (!document.body.contains(this.modal.overlay)) {
        this.modal = null;
        return;
      }
      this.modal.setBody(this._buildBody());
    }

    _availableTabs() {
      return TABS.filter((t) => t.id !== 'quantitative' || this.model.mode === 'quantitative');
    }

    _buildBody() {
      const body = el('div', 'settings-body');
      body.appendChild(el('p', 'modal-subtitle', 'Saved with the document. Changes apply immediately.'));

      const tabs = this._availableTabs();
      if (!tabs.some((t) => t.id === this._activeTab)) this._activeTab = 'risk';

      const nav = el('div', 'settings-tabs');
      nav.setAttribute('role', 'tablist');
      tabs.forEach((tab) => {
        const btn = el('button', 'settings-tab', tab.label);
        btn.type = 'button';
        btn.dataset.tab = tab.id;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(tab.id === this._activeTab));
        btn.addEventListener('click', () => {
          this._activeTab = tab.id;
          this.modal.setBody(this._buildBody());
        });
        nav.appendChild(btn);
      });
      body.appendChild(nav);

      const panel = el('div', 'settings-panel');
      panel.dataset.tab = this._activeTab;
      if (this._activeTab === 'general') this._buildGeneral(panel);
      else if (this._activeTab === 'risk') this._buildRiskAnalysis(panel);
      else this._buildQuantitative(panel);
      body.appendChild(panel);
      return body;
    }

    // label · control · helper. `.modal-field` so the label text sits
    // inside the same element as its control (what every test in the
    // suite addresses a field by); `.settings-row` lays it out as a row.
    _row(labelText, control, helpText) {
      const row = el('div', 'modal-field settings-row');
      row.appendChild(el('span', 'settings-row-label', labelText));
      row.appendChild(control);
      if (helpText) row.appendChild(el('p', 'settings-row-help', helpText));
      return row;
    }

    _radios(name, options, current, onPick) {
      const control = el('div', 'settings-options');
      options.forEach((opt) => {
        const optionRow = el('label', 'modal-checkbox-row');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = name;
        radio.value = opt.value;
        radio.checked = current === opt.value;
        radio.addEventListener('change', () => { if (radio.checked) onPick(opt.value); });
        optionRow.append(radio, el('span', null, opt.text));
        control.appendChild(optionRow);
      });
      return control;
    }

    // A text field committed on change (blur/Enter), reverting to the
    // model's own value when `validate` rejects the entry -- the same
    // change-on-blur / _suppressNextRefresh pattern for every text field
    // in this modal.
    _textInput(name, value, validate, commit) {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = name;
      input.value = value;
      input.addEventListener('change', () => {
        const next = input.value.trim();
        if (!validate(next)) {
          input.value = value;
          return;
        }
        this._suppressNextRefresh = true;
        commit(next);
      });
      return input;
    }

    // --- General ---------------------------------------------------------

    _buildGeneral(panel) {
      panel.appendChild(this._row(
        'Name',
        this._textInput('analysis-name', this.model.name, (v) => v.length > 0, (v) => this.model.setName(v)),
        'Shown in the toolbar and used as the export file name.',
      ));

      // node_library_proposal.md "Display identifiers": switching to
      // 'custom' backfills every node's blank identifier with its own
      // current id (BowtieModel.setIdentifierDisplayMode does the
      // backfill; the helper just says so).
      const custom = this.model.identifierDisplayMode === 'custom';
      panel.appendChild(this._row(
        'Identifiers',
        this._radios('identifier-display-mode-toggle', [
          { value: 'internal', text: 'Generated IDs' },
          { value: 'custom', text: 'Custom labels' },
        ], this.model.identifierDisplayMode, (v) => this.model.setIdentifierDisplayMode(v)),
        custom
          ? 'Every node shows its generated id as a starting label — edit them in the Node Library. New nodes get no label automatically.'
          : 'Generated IDs are C_1, PB_1, …; custom labels are whatever you type per node.',
      ));
    }

    // --- Risk analysis ---------------------------------------------------

    _buildRiskAnalysis(panel) {
      const cards = Bowtie.buildRiskModeCards({
        selected: this.model.mode,
        name: 'analysis-mode',
        onSelect: (mode) => this.model.setMode(mode),
      });
      panel.appendChild(this._row('Mode', cards.el, null));

      if (this.model.mode !== 'simple') panel.appendChild(this._buildMatrixRow());
    }

    _buildMatrixRow() {
      const control = el('div', 'settings-stack');

      const select = document.createElement('select');
      select.name = 'risk-matrix';
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
      // it its own (selectable-only-by-code) option rather than silently
      // falling back to "(none selected)", which would misstate that
      // nothing is active.
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
      control.appendChild(select);

      if (current) control.appendChild(this._buildMatrixSummary(current));
      control.appendChild(this._buildMatrixImportExportRow(current));

      return this._row(
        'Risk matrix',
        control,
        'Bundled presets, or import a hand-authored one. Exports embed a full copy so the file stays self-contained.',
      );
    }

    // Design review finding 02: the canvas risk badge only ever draws a
    // bare `riskClass.id` (a single letter) — nothing else in the app
    // showed what that letter actually means, short of exporting the
    // document and reading the matrix JSON by hand. This is the persistent
    // reference that pairs with the badge's own hover tooltip
    // (CanvasView._renderRiskBadge): the same colour + letter, plus the
    // full label every shipped preset already carries, on one line with
    // the matrix's own shape.
    _buildMatrixSummary(matrix) {
      const wrap = el('div', 'risk-matrix-summary');
      wrap.appendChild(el('span', 'risk-matrix-shape',
        `${matrix.severityClasses.length} severity × ${matrix.likelihoodClasses.length} likelihood classes →`));
      const legend = el('div', 'risk-class-legend');
      (matrix.riskClasses || []).forEach((riskClass) => {
        const item = el('div', 'risk-class-legend-item');
        const swatch = el('span', 'risk-class-legend-swatch', riskClass.id);
        swatch.style.background = riskClass.colour || '#888';
        item.appendChild(swatch);
        item.appendChild(el('span', null, riskClass.label));
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
      const row = el('div', 'settings-button-row');

      const importBtn = el('button', 'modal-btn modal-btn-small', 'Import Risk Matrix…');
      importBtn.type = 'button';
      importBtn.addEventListener('click', () => this._importRiskMatrix());
      row.appendChild(importBtn);

      const exportBtn = el('button', 'modal-btn modal-btn-small', 'Export Risk Matrix…');
      exportBtn.type = 'button';
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
      body.appendChild(el('p', null, message));
      Bowtie.ModalView.openModal({ title: 'Cannot Import Risk Matrix', bodyEl: body, actions: [{ label: 'OK', primary: true }] });
    }

    // --- Quantitative ----------------------------------------------------
    //
    // Everything that only means something once likelihoods are computed:
    // how the TLE combines its causes (design review finding 11) and
    // barrier_measures_proposal.md's ProjectDefaults -- the dangerous
    // fraction and standby proof-test interval a barrier's own protection
    // falls back to when it doesn't set its own override. All persisted,
    // since they change what a saved figure MEANS, not just how it's shown.

    _buildQuantitative(panel) {
      panel.appendChild(this._row(
        'Combine causes at the top event by',
        this._radios('tle-aggregation', AGGREGATION_OPTIONS, this.model.tleAggregation, (v) => this.model.setTleAggregation(v)),
        'Highest = the conservative worst-initiator reading. Sum = the independent-initiator LOPA convention. '
          + 'Changes what the saved numbers mean.',
      ));

      const zero = Bowtie.Decimal.parse('0');
      const one = Bowtie.Decimal.parse('1');
      const inRange = (text, check) => {
        try {
          return check(Bowtie.Decimal.parse(text));
        } catch {
          return false;
        }
      };
      panel.appendChild(this._row(
        'Dangerous fraction',
        this._textInput('dangerous-fraction', this.model.dangerousFraction,
          (v) => inRange(v, (d) => !d.lessThan(zero) && !d.greaterThan(one)),
          (v) => this.model.setQuantitativeDefaults({ dangerousFraction: v })),
        'Fallback when a barrier sets none (0–1).',
      ));
      panel.appendChild(this._row(
        'Proof-test interval (hours)',
        this._textInput('proof-test-interval', this.model.proofTestIntervalH,
          (v) => inRange(v, (d) => d.greaterThan(zero)),
          (v) => this.model.setQuantitativeDefaults({ proofTestIntervalH: v })),
        'Standby barriers, unless a barrier overrides it.',
      ));
    }
  }

  Bowtie.ProjectSettingsController = ProjectSettingsController;
})(window.Bowtie = window.Bowtie || {});
