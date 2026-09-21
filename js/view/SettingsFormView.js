(function (Bowtie) {
  const el = Bowtie.Dom.el;

  // Project Settings' four tab panels (proposals/15 part 2). Pure
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
    // proposals/20. Last, because it is about the document rather than
    // about the analysis in it -- and because a working sketch never
    // needs to come here at all.
    { id: 'document', label: 'Document' },
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

  // --- Document ---------------------------------------------------------
  //
  // Who produced this analysis, when, at what revision, and who accepted
  // it (proposals/20). Every field is free text and every field may stay
  // blank: this tab RECORDS WHAT THE USER STATES, it does not enforce a
  // process. Nothing here is marked required, nothing is validated
  // beyond being a string, and nothing blocks an export.

  const DOCUMENT_FIELDS = [
    ['reference', 'Reference', "Your organisation's own document number."],
    ['revision', 'Revision', "Free text — 'A', '2.1', 'Issue 3'. Never parsed, so use whatever your scheme is."],
    ['status', 'Status', 'Draft, For review, Issued — or whatever your process calls it.'],
    ['author', 'Prepared by', 'Name and/or role.'],
    ['checkedBy', 'Checked by', null],
    ['approvedBy', 'Approved by', 'Recorded, not verified — this tool cannot check an approval.'],
    ['organisation', 'Organisation', null],
  ];

  function documentPanel(panel, state, handlers) {
    panel.appendChild(el('p', 'settings-note',
      'Recorded as stated. The editor does not verify any of it, and none of it is required.'));

    const doc = state.document;
    DOCUMENT_FIELDS.forEach(([key, label, help]) => {
      panel.appendChild(row(
        label,
        textInput({
          name: `document-${key}`,
          value: doc[key],
          validate: () => true,
          commit: (v) => handlers.onCommitDocumentField(key, v),
        }),
        help,
      ));
    });

    panel.appendChild(row('Date', dateControl(doc.date, handlers), "This revision's date."));

    // A textarea rather than a text input: scope, limitations and
    // assumptions are the fields most likely to run to a paragraph, and
    // they are the ones a reader most needs in full.
    const notes = document.createElement('textarea');
    notes.name = 'document-notes';
    notes.rows = 3;
    notes.value = doc.notes;
    notes.addEventListener('change', () => handlers.onCommitDocumentField('notes', notes.value.trim()));
    panel.appendChild(row('Notes', notes, 'Scope, limitations, assumptions.'));

    panel.appendChild(historySection(doc, handlers));
  }

  // The date field, plus a "Today" button (proposals/20, open question
  // 3). Deliberately NOT auto-filled: a date the tool invented is a
  // statement the user did not make, and this whole block is about
  // statements the user makes. One click is a small price for that.
  function dateControl(value, handlers) {
    const stack = el('div', 'settings-inline');
    const input = document.createElement('input');
    input.type = 'date';
    input.name = 'document-date';
    input.value = value;
    input.addEventListener('change', () => handlers.onCommitDocumentField('date', input.value));
    const today = Bowtie.Dom.button('Today', 'modal-btn modal-btn-small');
    today.addEventListener('click', () => handlers.onCommitDocumentField('date', isoToday()));
    stack.append(input, today);
    return stack;
  }

  // Local date, not UTC: `toISOString()` would hand someone in UTC+13 a
  // "today" that is yesterday for most of their working day.
  function isoToday() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  // Bumping a revision should leave a trail rather than overwrite the
  // last one, so "Add revision" pre-populates from what is currently in
  // the fields above -- one action, previous state kept.
  function historySection(doc, handlers) {
    const wrap = el('div', 'modal-field settings-row document-history');
    wrap.appendChild(el('span', 'settings-row-label', 'Revision history'));

    if (doc.history.length === 0) {
      wrap.appendChild(el('p', 'id-manager-empty', 'No revisions recorded yet.'));
    } else {
      const table = el('table', 'document-history-table');
      const thead = document.createElement('thead');
      const head = document.createElement('tr');
      ['Revision', 'Date', 'Author', 'Summary', ''].forEach((t) => head.appendChild(el('th', null, t)));
      thead.appendChild(head);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      doc.history.forEach((entry, index) => {
        const tr = el('tr', 'document-history-row');
        tr.appendChild(el('td', null, entry.revision));
        tr.appendChild(el('td', null, entry.date));
        tr.appendChild(el('td', null, entry.author));
        tr.appendChild(el('td', 'document-history-summary', entry.summary));
        const actions = el('td', null);
        const remove = Bowtie.Dom.button('Remove', 'modal-btn modal-btn-small');
        remove.setAttribute('aria-label', `Remove revision ${entry.revision || index + 1}`);
        remove.addEventListener('click', () => handlers.onRemoveRevision(index));
        actions.appendChild(remove);
        tr.appendChild(actions);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }

    const addRow = el('div', 'document-history-add');
    const summary = document.createElement('input');
    summary.type = 'text';
    summary.name = 'document-revision-summary';
    summary.placeholder = 'What changed in this revision…';
    summary.setAttribute('aria-label', 'Summary of this revision');
    const addBtn = Bowtie.Dom.button('Add revision', 'modal-btn');
    const add = () => {
      handlers.onAddRevision(summary.value.trim());
      summary.value = '';
    };
    addBtn.addEventListener('click', add);
    summary.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    addRow.append(summary, addBtn);
    wrap.appendChild(addRow);
    wrap.appendChild(el('p', 'settings-row-help',
      'Records the Revision, Date and Prepared by above as they stand now, so the next revision can change them.'));
    return wrap;
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
    else if (state.activeTab === 'document') documentPanel(panel, state, handlers);
    else quantitativePanel(panel, state, handlers);
    wrap.appendChild(panel);
    return wrap;
  }

  Bowtie.SettingsFormView = { TABS, row, textInput, body };
})(window.Bowtie = window.Bowtie || {});
