(function (Bowtie) {
  // The three document modes, with the two lengths of explanation the
  // welcome flow uses: a four-word gloss under the start screen's demo
  // chooser, and a full sentence on the wizard's mode cards. Same order
  // and ids as ProjectSettingsController's MODE_LABELS.
  const MODES = [
    {
      id: 'simple', label: 'Simple', gloss: 'no risk fields',
      description: 'Just the diagram. No likelihood, severity or risk fields.',
    },
    {
      id: 'qualitative', label: 'Qualitative', gloss: 'pick likelihood & severity',
      description: 'Pick a likelihood and severity class per cause/outcome; the matrix gives the risk class.',
    },
    {
      id: 'quantitative', label: 'Quantitative', gloss: 'compute from frequencies',
      description: 'Enter cause frequencies and barrier measures (RRF, PFD, PFH…); likelihood and risk class are computed.',
    },
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, className) {
    const btn = el('button', className, label);
    btn.type = 'button';
    return btn;
  }

  function presets() {
    return (window.Bowtie && Bowtie.RISK_MATRIX_PRESETS) || {};
  }

  // First-load gate (landing_page_proposal.md): nothing is usable until
  // the user starts a new bowtie, opens an existing .json export, or loads
  // the demo. The modal is non-dismissible — there is no other way past
  // it. Three steps: the start screen, then for a new bowtie the two
  // wizard steps (names, then risk mode). Everything typed is kept in
  // `_draft` on this controller, so Back never loses it.
  class WelcomeController {
    // `importExport` (an ImportExportController instance) is what "Explore
    // the demo" and Ctrl+Alt+D route through — `importExport.loadDocument`
    // runs the exact same shape/version validation a real import gets (see
    // ImportExportController.js), so a stale Bowtie.DEMO_DATA_VARIANTS
    // entry fails the same friendly way a stale real export would, rather
    // than silently handing the model something it wasn't written to
    // expect.
    constructor(model, importFileInput, importExport, onDone) {
      this.model = model;
      this.importFileInput = importFileInput;
      this.importExport = importExport;
      this.onDone = onDone;
      this._dismissed = false;
      // Which demo variant "Explore the demo"/Ctrl+Alt+D loads -- one per
      // document mode (quantitative_mode_proposal.md "Modes"), all built
      // from the same underlying diagram, so the choice is purely about
      // which risk fields are filled in. Independent of the wizard's own
      // mode pick below: the chooser explains the modes, it isn't a setting.
      this._demoVariant = 'simple';
      const presetIds = Object.keys(presets());
      this._draft = {
        title: '', tle: '', hazard: '',
        pageName: '', pageDescription: '', identifierMode: 'internal', moreOpen: false,
        mode: 'simple', matrixId: presetIds[0] || null,
      };

      model.onChange(() => this._dismissOnFirstChange());

      // Scoped to while this modal is open — there is nothing to lose yet
      // (a fresh TLE/Hazard, no user work), so triggering the demo needs no
      // confirmation dialog. Deliberately not a global, always-on shortcut:
      // that could wipe real in-progress work with a stray key combo later
      // in a session.
      this._onKeydown = (e) => {
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          this._loadDemo();
        }
      };
      document.addEventListener('keydown', this._onKeydown);

      this.modal = Bowtie.ModalView.openModal({
        title: '', bodyEl: document.createElement('div'), actions: [], dismissible: false,
      });
      // The canvas's dot-grid idiom behind the dialog (styles.css), so the
      // screen reads as "an editor before you've started" rather than an
      // alert on a grey void -- #app itself stays hidden until this
      // completes, see main.js.
      this.modal.overlay.classList.add('welcome-overlay');
      this._showStartStep();
    }

    _loadDemo() {
      this.importExport.loadDocument(Bowtie.DEMO_DATA_VARIANTS[this._demoVariant]);
    }

    _dismissOnFirstChange() {
      if (this._dismissed) return;
      this._dismissed = true;
      document.removeEventListener('keydown', this._onKeydown);
      this.modal.close();
      if (this.onDone) this.onDone();
    }

    _setDialogWidth(kind) {
      const { dialog } = this.modal;
      dialog.classList.toggle('welcome-dialog', kind === 'start');
      dialog.classList.toggle('welcome-dialog-wizard', kind === 'wizard');
    }

    // Hands a dropped file to the SAME hidden <input type=file> that
    // ImportExportController already listens on (via a synthesized
    // `change` event) — so the existing validation/import path runs
    // unchanged, with nothing duplicated here.
    _importDroppedFile(file) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      this.importFileInput.files = dataTransfer.files;
      this.importFileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // --- Step 0: start screen ----------------------------------------------
    //
    // Left: what this is (headline + labelled illustration), the one
    // primary action, and the demo with its mode chooser. Right: one Open
    // zone — browse and drop are the same box, and the whole body is a
    // drop target so a drop on the left half doesn't fail.
    _showStartStep() {
      this._setDialogWidth('start');
      const body = el('div', 'welcome-body welcome-start');

      const main = el('div', 'welcome-start-main');
      main.appendChild(el('p', 'welcome-headline', 'Map the causes, barriers and outcomes around one top event.'));
      const illustration = el('div', 'welcome-illustration');
      illustration.appendChild(Bowtie.WelcomeIllustration.full());
      main.appendChild(illustration);

      const startBtn = button('Start a new bowtie', 'welcome-btn welcome-btn-primary');
      startBtn.addEventListener('click', () => this._showNamesStep());
      main.appendChild(startBtn);

      main.appendChild(el('p', 'welcome-lead', 'Or explore the worked example:'));
      const segmented = el('div', 'welcome-segmented');
      segmented.setAttribute('role', 'group');
      segmented.setAttribute('aria-label', 'Demo variant');
      const segButtons = MODES.map((mode) => {
        const btn = button(mode.label, 'welcome-segmented-option');
        btn.dataset.variant = mode.id;
        btn.setAttribute('aria-pressed', String(mode.id === this._demoVariant));
        btn.addEventListener('click', () => {
          this._demoVariant = mode.id;
          segButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        });
        segmented.appendChild(btn);
        return btn;
      });
      main.appendChild(segmented);
      const gloss = el('div', 'welcome-segmented-gloss');
      MODES.forEach((mode) => gloss.appendChild(el('span', null, mode.gloss)));
      main.appendChild(gloss);
      const demoBtn = button('Explore the demo', 'welcome-btn');
      demoBtn.addEventListener('click', () => this._loadDemo());
      main.appendChild(demoBtn);

      const open = el('div', 'welcome-open');
      open.appendChild(el('div', 'welcome-open-label', 'Open a saved bowtie'));
      const dropzone = el('div', 'welcome-dropzone');
      dropzone.appendChild(el('span', null, 'Drop a .json export here, or anywhere on this screen'));
      const browseBtn = button('Browse…', 'welcome-btn');
      browseBtn.addEventListener('click', () => this.importFileInput.click());
      dropzone.appendChild(browseBtn);
      // A drop zone that only responds to drag-and-drop is an easy-to-miss
      // dead click otherwise — clicking anywhere in it (bar the button,
      // which already does this) falls back to the same browse dialog.
      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.importFileInput.click();
      });
      open.appendChild(dropzone);
      open.appendChild(el('p', 'welcome-hint', `Exports made by this editor (schema v${Bowtie.BowtieModel.SCHEMA_VERSION}).`));

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
        if (file) this._importDroppedFile(file);
      });

      body.append(main, open);
      this.modal.setTitle('Bowtie Diagram Editor');
      this.modal.setBody(body);
      this.modal.setActions([]);
    }

    _stepHeader(question, step) {
      const head = el('div', 'welcome-step-head');
      head.appendChild(el('h3', 'welcome-step-question', question));
      const indicator = el('span', 'welcome-step-indicator', `Step ${step} of 2 `);
      [1, 2].forEach((n) => indicator.appendChild(el('i', n <= step ? 'welcome-step-dot done' : 'welcome-step-dot')));
      head.appendChild(indicator);
      return head;
    }

    _makeTextField(labelText, key, placeholder, helpText, { multiline = false } = {}) {
      const wrap = el('label', 'modal-field');
      wrap.appendChild(el('span', null, labelText));
      const input = document.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.placeholder = placeholder;
      input.value = this._draft[key];
      input.addEventListener('input', () => { this._draft[key] = input.value; });
      wrap.appendChild(input);
      if (helpText) wrap.appendChild(el('p', 'welcome-field-help', helpText));
      return { wrap, input };
    }

    // --- Step 1: names --------------------------------------------------------
    //
    // Three fields, empty by design: a placeholder can never become the
    // name (the old pre-filled "Top-Level Event"/"Hazard" defaults passed
    // the required-field check they were meant to enforce). The analysis
    // title, the page's own name, and the TLE's name are genuinely
    // different things (the project under study; one failure of interest
    // within it; the failure itself) — all three stay, but page name and
    // description, plus identifier display, live under "More options"
    // since a first-time user hasn't met pages yet. The page this
    // configures already exists (BowtieModel's constructor creates a
    // document's first page up front), so Create renames it rather than
    // adding a second one.
    _showNamesStep() {
      this._setDialogWidth('wizard');
      const body = el('div', 'welcome-body');
      body.appendChild(this._stepHeader('What are you analysing?', 1));

      const grid = el('div', 'welcome-names');
      const fields = el('div', 'welcome-fields');
      const title = this._makeTextField('Analysis title', 'title', 'e.g. Pipeline overpressure study');
      const tle = this._makeTextField('Top-level event', 'tle', 'e.g. Loss of containment', 'The moment control is lost.');
      const hazard = this._makeTextField('Hazard', 'hazard', 'e.g. Flammable liquid under pressure', 'What is being kept under control.');
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
      more.open = this._draft.moreOpen;
      more.addEventListener('toggle', () => { this._draft.moreOpen = more.open; });
      more.appendChild(el('summary', null, 'More options'));
      const moreBody = el('div', 'welcome-more-body');
      const pageName = this._makeTextField('Page name', 'pageName', 'Defaults to the top-level event name');
      const pageDesc = this._makeTextField('Page description (optional)', 'pageDescription', '');
      moreBody.append(pageName.wrap, pageDesc.wrap, this._buildIdentifierField());
      more.appendChild(moreBody);
      body.appendChild(more);

      this.modal.setTitle('New bowtie');
      this.modal.setBody(body);
      this.modal.setActions([
        { label: 'Back', onClick: () => { this._showStartStep(); return false; } },
        { label: 'Next', primary: true, onClick: () => { this._showModeStep(); return false; } },
      ]);

      // Title, TLE and Hazard are genuinely required — Next stays disabled
      // until every one is non-blank after trimming. Page name (defaults
      // to the TLE name) and description may stay blank.
      const nextBtn = this.modal.dialog.querySelector('.modal-btn-primary');
      const required = [title.input, tle.input, hazard.input];
      const updateNextDisabled = () => {
        nextBtn.disabled = required.some((input) => input.value.trim() === '');
      };
      required.forEach((input) => input.addEventListener('input', updateNextDisabled));
      updateNextDisabled();
      [title.input, tle.input, hazard.input, pageName.input].forEach((input) => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !nextBtn.disabled) {
            e.preventDefault();
            nextBtn.click();
          }
        });
      });
      title.input.focus();
    }

    // node_library_proposal.md "Display identifiers": a two-option radio
    // group, set once here (there's nothing to backfill yet, no nodes
    // exist), changeable later via Settings > Project Settings.
    _buildIdentifierField() {
      const field = el('div', 'modal-field');
      field.appendChild(el('span', null, 'Show identifiers as'));
      const hint = el('p', 'welcome-hint', "You'll set an identifier for each Cause, Outcome, and Barrier yourself as you "
        + 'create them — nothing is generated for you.');
      const options = [
        { value: 'internal', text: 'Generated IDs' },
        { value: 'custom', text: 'Custom labels' },
      ];
      const radios = options.map((opt) => {
        const row = el('label', 'modal-checkbox-row');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'identifier-display-mode';
        radio.value = opt.value;
        radio.checked = this._draft.identifierMode === opt.value;
        row.appendChild(radio);
        row.appendChild(el('span', null, opt.text));
        field.appendChild(row);
        return radio;
      });
      const syncHint = () => { hint.hidden = this._draft.identifierMode !== 'custom'; };
      radios.forEach((radio) => radio.addEventListener('change', () => {
        if (radio.checked) this._draft.identifierMode = radio.value;
        syncHint();
      }));
      syncHint();
      field.appendChild(hint);
      return field;
    }

    // --- Step 2: risk mode ----------------------------------------------------
    //
    // The one decision that shapes everything downstream, asked at
    // creation with enough words to choose — previously only reachable
    // three clicks away in Project Settings. Simple stays the default (the
    // plain diagram is the baseline starting point). The matrix select
    // lists the same bundled presets Project Settings does; importing a
    // custom matrix stays there.
    _showModeStep() {
      this._setDialogWidth('wizard');
      const body = el('div', 'welcome-body');
      body.appendChild(this._stepHeader('How will you assess risk?', 2));
      body.appendChild(el('p', 'welcome-aside', 'You can change this later in Settings › Project Settings.'));

      // Built before the cards (which toggle it) and appended after them.
      const matrixField = el('label', 'modal-field welcome-matrix-field');
      const syncMatrixField = () => { matrixField.hidden = this._draft.mode === 'simple'; };

      const cards = el('div', 'welcome-mode-cards');
      const cardEls = MODES.map((mode) => {
        const card = el('label', 'welcome-mode-card');
        card.dataset.mode = mode.id;
        const titleRow = el('span', 'welcome-mode-card-title');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'welcome-mode';
        radio.value = mode.id;
        radio.checked = this._draft.mode === mode.id;
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          this._draft.mode = mode.id;
          cardEls.forEach((c) => c.classList.toggle('selected', c === card));
          syncMatrixField();
        });
        titleRow.append(radio, el('span', null, mode.label));
        card.append(titleRow, el('span', 'welcome-mode-card-description', mode.description));
        card.classList.toggle('selected', this._draft.mode === mode.id);
        cards.appendChild(card);
        return card;
      });
      body.appendChild(cards);

      matrixField.appendChild(el('span', null, 'Risk matrix'));
      const select = document.createElement('select');
      const all = presets();
      Object.values(all).forEach((preset) => {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.name;
        select.appendChild(opt);
      });
      if (this._draft.matrixId) select.value = this._draft.matrixId;
      matrixField.appendChild(select);
      const summary = el('p', 'welcome-field-help');
      matrixField.appendChild(summary);
      const syncSummary = () => {
        const preset = all[select.value];
        if (!preset) {
          summary.textContent = 'No bundled risk matrices available — import one later in Project Settings.';
          return;
        }
        const letters = preset.riskClasses.map((r) => r.id).join(' ');
        summary.textContent = `${preset.severityClasses.length} severity × ${preset.likelihoodClasses.length} likelihood classes `
          + `→ ${letters}. Import your own later in Project Settings.`;
      };
      select.addEventListener('change', () => {
        this._draft.matrixId = select.value;
        syncSummary();
      });
      syncSummary();
      syncMatrixField();
      body.appendChild(matrixField);

      this.modal.setTitle('New bowtie');
      this.modal.setBody(body);
      this.modal.setActions([
        { label: 'Back', onClick: () => { this._showNamesStep(); return false; } },
        { label: 'Create', primary: true, onClick: () => this._create() },
      ]);
    }

    // Every call below is an existing model method. The first one
    // (`setName`) fires model.onChange, which dismisses this modal and
    // runs main.js's completion callback; the rest run with the modal
    // already gone, and the callback's deferred `undo.reset()` wipes the
    // lot from the undo stack, so none of this is undo-able back to a
    // blank document.
    _create() {
      const d = this._draft;
      const firstPage = this.model.pages[0];
      this.model.setName(d.title.trim());
      this.model.renamePage(firstPage.id, {
        name: d.pageName.trim() || d.tle.trim(),
        description: d.pageDescription,
      });
      this.model.renameElement(this.model.topLevelEvent.id, d.tle.trim());
      this.model.renameElement(this.model.hazard.id, d.hazard.trim());
      this.model.setIdentifierDisplayMode(d.identifierMode);
      if (d.mode !== 'simple') {
        this.model.setMode(d.mode);
        const preset = presets()[d.matrixId];
        // Embedded as a full, independent copy, exactly as Project
        // Settings does: exports stay self-contained even if the bundled
        // preset is later edited.
        if (preset) this.model.setRiskMatrix(JSON.parse(JSON.stringify(preset)));
      }
    }
  }

  Bowtie.WelcomeController = WelcomeController;
})(window.Bowtie = window.Bowtie || {});
