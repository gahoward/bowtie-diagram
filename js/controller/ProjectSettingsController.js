(function (Bowtie) {
  // Design review finding 11 -- see BowtieModel's tleAggregation
  // constructor comment and Quantitative.js's computeTleLikelihood.
  const AGGREGATION_OPTIONS = [
    { value: 'max', text: 'Highest single threat' },
    { value: 'sum', text: 'Sum of all threats' },
  ];

  const el = Bowtie.Dom.el;

  function presets() {
    return (window.Bowtie && Bowtie.RISK_MATRIX_PRESETS) || {};
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
  // The form's markup lives in SettingsFormView.js (proposals/15 part 2).
  // What stays here: the model reads and writes, the active tab, the
  // focus-preserving refresh suppression, and the risk-matrix import
  // flow -- which is a sequence of decisions about a file rather than
  // markup, and so did not move.
  //
  // Scope note: risk matrix selection is bundled-preset selection PLUS
  // import/export of a hand-authored custom one -- not a live,
  // click-to-edit cell grid. Import/export covers the practical need
  // (author or tweak a matrix in a spreadsheet/text editor, matching the
  // RiskMatrixDefinition JSON shape any bundled preset under
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
      return Bowtie.SettingsFormView.TABS
        .filter((t) => t.id !== 'quantitative' || this.model.mode === 'quantitative');
    }

    // Rebuilding the body destroys the tab that had focus, so focus is
    // put back on its replacement -- but only if a tab had it, so a
    // mouse user's focus is never yanked into the strip (proposals/18).
    _rebuild() {
      const hadTabFocus = Bowtie.FormControls.tabHasFocus();
      this.modal.setBody(this._buildBody());
      if (hadTabFocus) Bowtie.FormControls.focusSelectedTab(this.modal.dialog);
    }

    // A text field's commit must not trigger the rebuild its own model
    // change would otherwise cause -- see _suppressNextRefresh above.
    _commit(write) {
      return (value) => {
        this._suppressNextRefresh = true;
        write(value);
      };
    }

    // Every value the form shows, read here so the view reads nothing.
    _viewState() {
      const tabs = this._availableTabs();
      if (!tabs.some((t) => t.id === this._activeTab)) this._activeTab = 'risk';
      return {
        activeTab: this._activeTab,
        availableTabs: tabs,
        name: this.model.name,
        identifierDisplayMode: this.model.identifierDisplayMode,
        mode: this.model.mode,
        riskMatrix: this.model.riskMatrix,
        presets: presets(),
        aggregationOptions: AGGREGATION_OPTIONS,
        tleAggregation: this.model.tleAggregation,
        dangerousFraction: this.model.dangerousFraction,
        proofTestIntervalH: this.model.proofTestIntervalH,
        document: this.model.document,
      };
    }

    // The two quantitative fields' validators. Decimal parsing lives
    // here rather than in the view: what counts as a valid figure is
    // domain knowledge, and js/view/ has no business knowing about
    // Decimal.
    _validators() {
      const zero = Bowtie.Decimal.parse('0');
      const one = Bowtie.Decimal.parse('1');
      const inRange = (text, check) => {
        try {
          return check(Bowtie.Decimal.parse(text));
        } catch {
          return false;
        }
      };
      return {
        dangerousFraction: (v) => inRange(v, (d) => !d.lessThan(zero) && !d.greaterThan(one)),
        proofTestInterval: (v) => inRange(v, (d) => d.greaterThan(zero)),
      };
    }

    _buildBody() {
      const validate = this._validators();
      return Bowtie.SettingsFormView.body(this._viewState(), {
        onSelectTab: (id) => {
          this._activeTab = id;
          this._rebuild();
        },
        onCommitName: this._commit((v) => this.model.setName(v)),
        onPickIdentifierMode: (v) => this.model.setIdentifierDisplayMode(v),
        onSelectMode: (mode) => this.model.setMode(mode),
        onSelectMatrix: (presetId) => {
          if (presetId === null) {
            this.model.setRiskMatrix(null);
            return;
          }
          // Embedded as a full, independent copy (per the design doc:
          // exports stay self-contained even if the bundled preset is
          // later edited).
          this.model.setRiskMatrix(JSON.parse(JSON.stringify(presets()[presetId])));
        },
        onImportMatrix: () => this._importRiskMatrix(),
        onExportMatrix: () => {
          const denormalized = Bowtie.denormalizeRiskMatrixForExport(this.model.riskMatrix);
          Bowtie.ExportUtil.exportJsonObject(denormalized, `${denormalized.id || 'risk-matrix'}.json`);
        },
        onPickAggregation: (v) => this.model.setTleAggregation(v),
        // proposals/20. Text fields commit on blur, so they take the
        // same suppression as every other text field here -- a rebuild
        // would replace the element the user just tabbed out of. The
        // date picker and the Today button are not text fields and do
        // want the rebuild, so they go through the plain setter.
        onCommitDocumentField: (key, value) => {
          if (key === 'date') this.model.setDocumentMetadata({ date: value });
          else this._commit((v) => this.model.setDocumentMetadata({ [key]: v }))(value);
        },
        onAddRevision: (summary) => this._addRevision(summary),
        onRemoveRevision: (index) => this.model.removeDocumentRevision(index),
        validateDangerousFraction: validate.dangerousFraction,
        onCommitDangerousFraction: this._commit((v) => this.model.setQuantitativeDefaults({ dangerousFraction: v })),
        validateProofTestInterval: validate.proofTestInterval,
        onCommitProofTestInterval: this._commit((v) => this.model.setQuantitativeDefaults({ proofTestIntervalH: v })),
      });
    }

    // "Add revision" snapshots the Revision/Date/Prepared-by fields as
    // they currently stand (proposals/20), so bumping a revision is one
    // action and the previous state is kept rather than overwritten.
    // The summary is the only thing typed in the history row itself.
    _addRevision(summary) {
      const doc = this.model.document;
      this.model.addDocumentRevision({
        revision: doc.revision,
        date: doc.date,
        author: doc.author,
        summary,
      });
    }

    // --- Risk matrix import ------------------------------------------------
    //
    // "Import Risk Matrix…" validates a hand-authored or hand-edited
    // RiskMatrixDefinition JSON file with the exact same rules a bundled
    // preset is built with (RiskMatrixValidator.js) rather than a second,
    // driftable reimplementation. Prefers the real native "Open" dialog
    // (mirroring ImportExportController's own whole-document import) and
    // falls back to the hidden <input type=file> everywhere that API
    // doesn't exist.

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
  }

  Bowtie.ProjectSettingsController = ProjectSettingsController;
})(window.Bowtie = window.Bowtie || {});
