(function (Bowtie) {
  const el = Bowtie.Dom.el;
  const button = Bowtie.Dom.button;

  // The welcome flow's three screens (proposals/15 part 2): the start
  // screen, and the two wizard steps. WelcomeController keeps the modal,
  // the `_draft`, the demo variant, the Ctrl+Alt+D shortcut and every
  // model call; this file owns the markup and the live behaviour that is
  // purely about the form itself.
  //
  // "Purely about the form" is the line that decides what moved. The
  // names step disables Next until three fields are non-blank, and its
  // illustration echoes what is typed -- neither touches the model, so
  // both are here, and the controller is told only `onComplete(true)`.
  // Which button that enables is the controller's business, because the
  // controller owns the modal.
  //
  // Each builder returns `{ el, … }` -- the same shape RiskModeCards.js
  // already uses, so a caller that must reach back into a built screen
  // does it through a named function rather than a querySelector.

  function stepHeader(question, step) {
    const head = el('div', 'welcome-step-head');
    head.appendChild(el('h3', 'welcome-step-question', question));
    const indicator = el('span', 'welcome-step-indicator', `Step ${step} of 2 `);
    [1, 2].forEach((n) => indicator.appendChild(el('i', n <= step ? 'welcome-step-dot done' : 'welcome-step-dot')));
    head.appendChild(indicator);
    return head;
  }

  function textField(labelText, value, placeholder, helpText, { multiline = false, onInput } = {}) {
    const wrap = el('label', 'modal-field');
    wrap.appendChild(el('span', null, labelText));
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.placeholder = placeholder;
    input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    wrap.appendChild(input);
    if (helpText) wrap.appendChild(el('p', 'welcome-field-help', helpText));
    return { wrap, input };
  }

  // --- Start screen ------------------------------------------------------
  //
  // Left: what this is (headline + labelled illustration), the one
  // primary action, and the demo with its mode chooser. Right: one Open
  // zone — browse and drop are the same box, and the whole body is a
  // drop target so a drop on the left half doesn't fail.

  // Unsaved work from a previous visit (proposals/04). Deliberately a
  // card on the start screen rather than a dialog on load: it is
  // non-blocking, and this screen is already where the user decides
  // which document to work on.
  function recoveryCard(meta, { onRecover, onDiscardRecovery }) {
    const card = el('div', 'welcome-recovery');
    card.appendChild(el('div', 'welcome-recovery-title', 'Recover unsaved work'));
    const pages = `${meta.pages} ${meta.pages === 1 ? 'page' : 'pages'}`;
    const nodes = `${meta.nodes} ${meta.nodes === 1 ? 'node' : 'nodes'}`;
    card.appendChild(el('div', 'welcome-recovery-meta', `${meta.name} · ${pages} · ${nodes}`));
    const when = Bowtie.RecoveryController.describeTime(meta.savedAt);
    if (when) card.appendChild(el('div', 'welcome-recovery-when', `last edited ${when}`));

    const actions = el('div', 'welcome-recovery-actions');
    const recoverBtn = button('Recover', 'welcome-btn welcome-btn-primary');
    // A snapshot that fails validation leaves its own dialog up and the
    // start screen untouched -- nothing is dismissed here.
    recoverBtn.addEventListener('click', onRecover);
    const discardBtn = button('Discard', 'welcome-btn');
    discardBtn.addEventListener('click', () => {
      onDiscardRecovery();
      card.remove();
    });
    actions.append(recoverBtn, discardBtn);
    card.appendChild(actions);
    return card;
  }

  // `state` is `{ recoveryMeta, demoVariant, schemaVersion }`.
  // `handlers` is `{ onStartNew, onPickDemoVariant, onLoadDemo, onBrowse,
  // onDropFile, onRecover, onDiscardRecovery }`.
  //
  // The returned `setRecent(entries, onOpen)` fills the recently-opened
  // list once IndexedDB resolves -- the screen must not wait on it to
  // paint. `onOpen(entry)` resolves false when the file could not be
  // read (permission refused, or it has moved since), and the row drops
  // itself.
  function startScreen(state, handlers) {
    const body = el('div', 'welcome-body welcome-start');

    const main = el('div', 'welcome-start-main');
    if (state.recoveryMeta) main.appendChild(recoveryCard(state.recoveryMeta, handlers));
    main.appendChild(el('p', 'welcome-headline', 'Map the threats, barriers and consequences around one top event.'));
    const illustration = el('div', 'welcome-illustration');
    illustration.appendChild(Bowtie.WelcomeIllustration.full());
    main.appendChild(illustration);

    const startBtn = button('Start a new bowtie', 'welcome-btn welcome-btn-primary');
    startBtn.addEventListener('click', handlers.onStartNew);
    main.appendChild(startBtn);

    main.appendChild(el('p', 'welcome-lead', 'Or explore the worked example:'));
    const segmented = el('div', 'welcome-segmented');
    segmented.setAttribute('role', 'group');
    segmented.setAttribute('aria-label', 'Demo variant');
    const segButtons = Bowtie.RISK_MODES.map((mode) => {
      const btn = button(mode.label, 'welcome-segmented-option');
      btn.dataset.variant = mode.id;
      btn.setAttribute('aria-pressed', String(mode.id === state.demoVariant));
      btn.addEventListener('click', () => {
        handlers.onPickDemoVariant(mode.id);
        segButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      });
      segmented.appendChild(btn);
      return btn;
    });
    main.appendChild(segmented);
    const gloss = el('div', 'welcome-segmented-gloss');
    Bowtie.RISK_MODES.forEach((mode) => gloss.appendChild(el('span', null, mode.gloss)));
    main.appendChild(gloss);
    const demoBtn = button('Explore the demo', 'welcome-btn');
    demoBtn.addEventListener('click', handlers.onLoadDemo);
    main.appendChild(demoBtn);

    const open = el('div', 'welcome-open');
    open.appendChild(el('div', 'welcome-open-label', 'Open a saved bowtie'));
    const dropzone = el('div', 'welcome-dropzone');
    dropzone.appendChild(el('span', null, 'Drop a .json export here, or anywhere on this screen'));
    const browseBtn = button('Browse…', 'welcome-btn');
    browseBtn.addEventListener('click', handlers.onBrowse);
    dropzone.appendChild(browseBtn);
    // A drop zone that only responds to drag-and-drop is an easy-to-miss
    // dead click otherwise — clicking anywhere in it (bar the button,
    // which already does this) falls back to the same browse dialog.
    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      handlers.onBrowse();
    });
    open.appendChild(dropzone);
    // Filled in when the IndexedDB read resolves -- the start screen
    // must not wait on it to paint.
    const recentList = el('div', 'welcome-recent');
    recentList.hidden = true;
    open.appendChild(recentList);
    open.appendChild(el('p', 'welcome-hint', `Exports made by this editor (schema v${state.schemaVersion}).`));

    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    body.addEventListener('dragleave', (e) => {
      if (!body.contains(e.relatedTarget)) dropzone.classList.remove('drag-over');
    });
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handlers.onDropFile(file);
    });

    body.append(main, open);

    function setRecent(entries, onOpen) {
      // The start screen can have moved on (or been dismissed) while
      // IndexedDB was reading.
      if (!entries.length || !recentList.isConnected) return;
      recentList.appendChild(el('div', 'welcome-recent-label', 'Recently opened'));
      entries.forEach((entry) => {
        const row = button(entry.name, 'welcome-recent-item');
        row.appendChild(el('span', 'welcome-recent-when', Bowtie.RecoveryController.describeTime(entry.openedAt)));
        row.addEventListener('click', async () => {
          const opened = await onOpen(entry);
          if (!opened) row.remove();
        });
        recentList.appendChild(row);
      });
      recentList.hidden = false;
    }

    return { el: body, setRecent };
  }

  // --- Step 1: names -----------------------------------------------------
  //
  // Three fields, empty by design: a placeholder can never become the
  // name (the old pre-filled "Top-Level Event"/"Hazard" defaults passed
  // the required-field check they were meant to enforce). The analysis
  // title, the page's own name, and the TLE's name are genuinely
  // different things (the project under study; one failure of interest
  // within it; the failure itself) — all three stay, but page name and
  // description, plus identifier display, live under "More options"
  // since a first-time user hasn't met pages yet.

  // node_library_proposal.md "Display identifiers": a two-option radio
  // group, set once here (there's nothing to backfill yet, no nodes
  // exist), changeable later via Settings > Project Settings.
  function identifierField(current, onPick) {
    const field = el('div', 'modal-field');
    field.appendChild(el('span', null, 'Show identifiers as'));
    const hint = el('p', 'welcome-hint', "You'll set an identifier for each Threat, Consequence, and Barrier yourself as you "
      + 'create them — nothing is generated for you.');
    let mode = current;
    const syncHint = () => { hint.hidden = mode !== 'custom'; };
    // Rows straight into the `.modal-field`, not FormControls.radioGroup's
    // `.settings-options` wrapper -- this field puts the hint below the
    // options, inside the same field.
    [
      { value: 'internal', text: 'Generated IDs' },
      { value: 'custom', text: 'Custom labels' },
    ].forEach((opt) => field.appendChild(Bowtie.FormControls.radioRow({
      name: 'identifier-display-mode',
      value: opt.value,
      text: opt.text,
      checked: current === opt.value,
      onPick: (value) => {
        mode = value;
        onPick(value);
        syncHint();
      },
    })));
    syncHint();
    field.appendChild(hint);
    return field;
  }

  // `draft` supplies every field's current value (Back never loses what
  // was typed). `handlers` is `{ onFieldInput, onMoreToggle,
  // onPickIdentifierMode, onComplete, onSubmit }`.
  //
  // `onComplete(bool)` fires whenever required-field completeness
  // changes, including once up front: Title, TLE and Hazard are
  // genuinely required, while page name (which defaults to the TLE name)
  // and description may stay blank. `onSubmit()` fires on Enter, and
  // only while complete.
  function namesStep(draft, handlers) {
    const body = el('div', 'welcome-body');
    body.appendChild(stepHeader('What are you analysing?', 1));

    const field = (labelText, key, placeholder, helpText) => textField(
      labelText, draft[key], placeholder, helpText,
      { onInput: (value) => handlers.onFieldInput(key, value) },
    );

    const grid = el('div', 'welcome-names');
    const fields = el('div', 'welcome-fields');
    const title = field('Analysis title', 'title', 'e.g. Pipeline overpressure study');
    const tle = field('Top-level event', 'tle', 'e.g. Loss of containment', 'The moment control is lost.');
    const hazard = field('Hazard', 'hazard', 'e.g. Flammable liquid under pressure', 'What is being kept under control.');
    fields.append(title.wrap, tle.wrap, hazard.wrap);
    grid.appendChild(fields);

    const preview = el('div', 'welcome-preview');
    const picture = Bowtie.WelcomeIllustration.centre();
    preview.appendChild(picture.svg);
    preview.appendChild(el('p', 'welcome-hint', 'The two names you type appear here, on the shapes they label.'));
    grid.appendChild(preview);
    body.appendChild(grid);
    picture.setTle(tle.input.value);
    picture.setHazard(hazard.input.value);
    tle.input.addEventListener('input', () => picture.setTle(tle.input.value));
    hazard.input.addEventListener('input', () => picture.setHazard(hazard.input.value));

    const more = el('details', 'welcome-more');
    more.open = draft.moreOpen;
    more.addEventListener('toggle', () => handlers.onMoreToggle(more.open));
    more.appendChild(el('summary', null, 'More options'));
    const moreBody = el('div', 'welcome-more-body');
    const pageName = field('Page name', 'pageName', 'Defaults to the top-level event name');
    const pageDesc = field('Page description (optional)', 'pageDescription', '');
    moreBody.append(
      pageName.wrap,
      pageDesc.wrap,
      identifierField(draft.identifierMode, handlers.onPickIdentifierMode),
    );
    more.appendChild(moreBody);
    body.appendChild(more);

    const required = [title.input, tle.input, hazard.input];
    const isComplete = () => required.every((input) => input.value.trim() !== '');
    required.forEach((input) => input.addEventListener('input', () => handlers.onComplete(isComplete())));
    [title.input, tle.input, hazard.input, pageName.input].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && isComplete()) {
          e.preventDefault();
          handlers.onSubmit();
        }
      });
    });

    return {
      el: body,
      isComplete,
      focusFirst: () => title.input.focus(),
    };
  }

  // --- Step 2: risk mode -------------------------------------------------
  //
  // The one decision that shapes everything downstream, asked at
  // creation with enough words to choose — previously only reachable
  // three clicks away in Project Settings. Simple stays the default (the
  // plain diagram is the baseline starting point). The matrix select
  // lists the same bundled presets Project Settings does; importing a
  // custom matrix stays there.
  function modeStep(draft, presets, handlers) {
    const body = el('div', 'welcome-body');
    body.appendChild(stepHeader('How will you assess risk?', 2));
    body.appendChild(el('p', 'welcome-aside', 'You can change this later in Settings › Project Settings.'));

    // Built before the cards (which toggle it) and appended after them.
    const matrixField = el('label', 'modal-field welcome-matrix-field');
    let mode = draft.mode;
    const syncMatrixField = () => { matrixField.hidden = mode === 'simple'; };

    const cards = Bowtie.buildRiskModeCards({
      selected: draft.mode,
      name: 'welcome-mode',
      onSelect: (picked) => {
        mode = picked;
        handlers.onSelectMode(picked);
        syncMatrixField();
      },
    });
    body.appendChild(cards.el);

    matrixField.appendChild(el('span', null, 'Risk matrix'));
    const select = document.createElement('select');
    Object.values(presets).forEach((preset) => {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      select.appendChild(opt);
    });
    if (draft.matrixId) select.value = draft.matrixId;
    matrixField.appendChild(select);
    const summary = el('p', 'welcome-field-help');
    matrixField.appendChild(summary);
    const syncSummary = () => {
      const preset = presets[select.value];
      if (!preset) {
        summary.textContent = 'No bundled risk matrices available — import one later in Project Settings.';
        return;
      }
      const letters = preset.riskClasses.map((r) => r.id).join(' ');
      summary.textContent = `${preset.severityClasses.length} severity × ${preset.likelihoodClasses.length} likelihood classes `
        + `→ ${letters}. Import your own later in Project Settings.`;
    };
    select.addEventListener('change', () => {
      handlers.onSelectMatrix(select.value);
      syncSummary();
    });
    syncSummary();
    syncMatrixField();
    body.appendChild(matrixField);

    return { el: body };
  }

  Bowtie.WelcomeView = { startScreen, namesStep, modeStep };
})(window.Bowtie = window.Bowtie || {});
