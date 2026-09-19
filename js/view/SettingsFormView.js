(function (Bowtie) {
  const el = Bowtie.Dom.el;

  // Project Settings' three tab panels (proposals/15 part 2). Pure
  // markup: every value arrives in `state`, every intent leaves through
  // `handlers`, and nothing here holds or reads the model.
  //
  // What deliberately did NOT move into this file is the import flow --
  // the native picker, the FileReader fallback, JSON parsing and
  // validation, and the error dialog. That is a sequence of decisions
  // about a file, not markup, and it stays in the controller.

  // See NodeLibraryView's PANEL_ID: one panel on screen, whole body
  // rebuilt on every tab change.
  const PANEL_ID = 'settings-panel';

  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'risk', label: 'Risk analysis' },
    { id: 'quantitative', label: 'Quantitative' }, // only while mode === 'quantitative'
  ];

  let nextRowId = 0;

  // label · control · helper. `.modal-field` so the label text sits
  // inside the same element as its control (what every test in the
  // suite addresses a field by); `.settings-row` lays it out as a row.
  //
  // The label text used to be a bare `<span>`, which named nothing: axe
  // caught it the moment proposals/18 pointed it at this modal, as a
  // CRITICAL "Form elements must have labels". Every text field in
  // Project Settings was anonymous to a screen reader.
  //
  // Two cases, because `control` is sometimes one form element and
  // sometimes a composite:
  //   - an input/select/textarea gets a real `<label for>`;
  //   - anything else (a radio group, the mode cards, the matrix stack)
  //     becomes a named `role="group"`, since `<label for>` may only
  //     point at a labellable element.
  function row(labelText, control, helpText) {
    const wrap = el('div', 'modal-field settings-row');
    nextRowId += 1;
    const labellable = ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName);

    if (labellable) {
      if (!control.id) control.id = `settings-control-${nextRowId}`;
      const labelEl = el('label', 'settings-row-label', labelText);
      labelEl.htmlFor = control.id;
      wrap.appendChild(labelEl);
    } else {
      const labelEl = el('span', 'settings-row-label', labelText);
      labelEl.id = `settings-row-label-${nextRowId}`;
      control.setAttribute('role', 'group');
      control.setAttribute('aria-labelledby', labelEl.id);
      wrap.appendChild(labelEl);
    }

    wrap.appendChild(control);
    if (helpText) wrap.appendChild(el('p', 'settings-row-help', helpText));
    return wrap;
  }

  // A text field committed on change (blur/Enter), reverting to the
  // value it was given when `validate` rejects the entry.
  //
  // `validate` is the caller's because what counts as valid is domain
  // knowledge -- a non-empty name, a Decimal in 0..1 -- and this file
  // has no business knowing about Decimal. `commit` is likewise where
  // the controller's own change-suppression lives (see its
  // _suppressNextRefresh comment): a rebuild triggered by this field
  // would replace the element the user just tabbed out of.
  function textInput({ name, value, validate, commit }) {
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
      commit(next);
    });
    return input;
  }

  // --- General ---------------------------------------------------------

  function generalPanel(panel, state, handlers) {
    panel.appendChild(row(
      'Name',
      textInput({
        name: 'analysis-name',
        value: state.name,
        validate: (v) => v.length > 0,
        commit: handlers.onCommitName,
      }),
      'Shown in the toolbar and used as the export file name.',
    ));

    // node_library_proposal.md "Display identifiers": switching to
    // 'custom' backfills every node's blank identifier with its own
    // current id (BowtieModel.setIdentifierDisplayMode does the
    // backfill; the helper just says so).
    const custom = state.identifierDisplayMode === 'custom';
    panel.appendChild(row(
      'Identifiers',
      Bowtie.FormControls.radioGroup({
        name: 'identifier-display-mode-toggle',
        options: [
          { value: 'internal', text: 'Generated IDs' },
          { value: 'custom', text: 'Custom labels' },
        ],
        selected: state.identifierDisplayMode,
        onPick: handlers.onPickIdentifierMode,
      }),
      custom
        ? 'Every node shows its generated id as a starting label — edit them in the Node Library. New nodes get no label automatically.'
        : 'Generated IDs are T_1, PB_1, …; custom labels are whatever you type per node.',
    ));
  }

  // --- Risk analysis ---------------------------------------------------

  function riskPanel(panel, state, handlers) {
    const cards = Bowtie.buildRiskModeCards({
      selected: state.mode,
      name: 'analysis-mode',
      onSelect: handlers.onSelectMode,
    });
    panel.appendChild(row('Mode', cards.el, null));

    if (state.mode !== 'simple') panel.appendChild(matrixRow(state, handlers));
  }

  function matrixRow(state, handlers) {
    const control = el('div', 'settings-stack');

    const select = document.createElement('select');
    select.name = 'risk-matrix';
    // Inside the `.settings-stack` composite, so the row's group name
    // does not name this control -- it needs its own.
    select.setAttribute('aria-label', 'Risk matrix');
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(none selected)';
    select.appendChild(noneOpt);
    const { presets } = state;
    Object.values(presets).forEach((preset) => {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      select.appendChild(opt);
    });
    const current = state.riskMatrix;
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
        handlers.onSelectMatrix(null);
        return;
      }
      if (!presets[select.value]) return; // the informational "(imported)" option -- re-import to restore it
      handlers.onSelectMatrix(select.value);
    });
    control.appendChild(select);

    if (current) control.appendChild(matrixSummary(current));
    control.appendChild(matrixImportExportRow(Boolean(current), handlers));

    return row(
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
  function matrixSummary(matrix) {
    const wrap = el('div', 'risk-matrix-summary');
    wrap.appendChild(el('span', 'risk-matrix-shape',
      `${matrix.severityClasses.length} severity × ${matrix.likelihoodClasses.length} likelihood classes →`));
    const legend = el('div', 'risk-class-legend');
    Bowtie.riskClassesByRank(matrix).forEach((riskClass) => {
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

  // "Import Risk Matrix..." / "Export Risk Matrix..." (see
  // ProjectSettingsController's scope note): a hand-authored or
  // hand-edited RiskMatrixDefinition JSON file, validated with the exact
  // same rules a bundled preset is built with (RiskMatrixValidator.js)
  // rather than a second, driftable reimplementation.
  function matrixImportExportRow(hasMatrix, handlers) {
    const wrap = el('div', 'settings-button-row');

    const importBtn = Bowtie.Dom.button('Import Risk Matrix…', 'modal-btn modal-btn-small');
    importBtn.addEventListener('click', handlers.onImportMatrix);
    wrap.appendChild(importBtn);

    const exportBtn = Bowtie.Dom.button('Export Risk Matrix…', 'modal-btn modal-btn-small');
    exportBtn.disabled = !hasMatrix;
    exportBtn.addEventListener('click', handlers.onExportMatrix);
    wrap.appendChild(exportBtn);
    return wrap;
  }

  // --- Quantitative ----------------------------------------------------
  //
  // Everything that only means something once likelihoods are computed:
  // how the TLE combines its threats (design review finding 11) and
  // barrier_measures_proposal.md's ProjectDefaults -- the dangerous
  // fraction and standby proof-test interval a barrier's own protection
  // falls back to when it doesn't set its own override. All persisted,
  // since they change what a saved figure MEANS, not just how it's shown.

  function quantitativePanel(panel, state, handlers) {
    panel.appendChild(row(
      'Combine threats at the top event by',
      Bowtie.FormControls.radioGroup({
        name: 'tle-aggregation',
        options: state.aggregationOptions,
        selected: state.tleAggregation,
        onPick: handlers.onPickAggregation,
      }),
      'Highest = the conservative worst-initiator reading. Sum = the independent-initiator LOPA convention. '
        + 'Changes what the saved numbers mean.',
    ));

    panel.appendChild(row(
      'Dangerous fraction',
      textInput({
        name: 'dangerous-fraction',
        value: state.dangerousFraction,
        validate: handlers.validateDangerousFraction,
        commit: handlers.onCommitDangerousFraction,
      }),
      'Fallback when a barrier sets none (0–1).',
    ));
    panel.appendChild(row(
      'Proof-test interval (hours)',
      textInput({
        name: 'proof-test-interval',
        value: state.proofTestIntervalH,
        validate: handlers.validateProofTestInterval,
        commit: handlers.onCommitProofTestInterval,
      }),
      'Standby barriers, unless a barrier overrides it.',
    ));
  }

  // `state` carries every displayed value; `handlers` every intent. The
  // active tab is the controller's state, so it arrives and leaves the
  // same way everything else does.
  function body(state, handlers) {
    const wrap = el('div', 'settings-body');
    wrap.appendChild(el('p', 'modal-subtitle', 'Saved with the document. Changes apply immediately.'));

    wrap.appendChild(Bowtie.FormControls.tabs({
      items: state.availableTabs,
      activeId: state.activeTab,
      dataKey: 'tab',
      onSelect: handlers.onSelectTab,
      panelId: PANEL_ID,
    }));

    const panel = el('div', 'settings-panel');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'tabpanel');
    panel.dataset.tab = state.activeTab;
    if (state.activeTab === 'general') generalPanel(panel, state, handlers);
    else if (state.activeTab === 'risk') riskPanel(panel, state, handlers);
    else quantitativePanel(panel, state, handlers);
    wrap.appendChild(panel);
    return wrap;
  }

  Bowtie.SettingsFormView = { TABS, row, textInput, body };
})(window.Bowtie = window.Bowtie || {});
