(function (Bowtie) {
  function presets() {
    return (window.Bowtie && Bowtie.RISK_MATRIX_PRESETS) || {};
  }

  // First-load gate (landing_page_proposal.md): nothing is usable until
  // the user starts a new bowtie, opens an existing .json export, or loads
  // the demo. The modal is non-dismissible — there is no other way past
  // it. Three steps: the start screen, then for a new bowtie the two
  // wizard steps (names, then risk mode). Everything typed is kept in
  // `_draft` on this controller, so Back never loses it.
  //
  // The screens' markup lives in WelcomeView.js (proposals/15 part 2).
  // What stays here is the modal itself, `_draft`, the demo variant, the
  // Ctrl+Alt+D shortcut, and every model call -- including `_create`,
  // which is the only place this flow writes to the model at all.
  class WelcomeController {
    // `importExport` (an ImportExportController instance) is what "Explore
    // the demo" and Ctrl+Alt+D route through — `importExport.loadDocument`
    // runs the exact same shape/version validation a real import gets (see
    // ImportExportController.js), so a stale Bowtie.DEMO_DATA_VARIANTS
    // entry fails the same friendly way a stale real export would, rather
    // than silently handing the model something it wasn't written to
    // expect.
    constructor(model, importFileInput, importExport, onDone, { recovery, recent } = {}) {
      this.model = model;
      this.importFileInput = importFileInput;
      this.importExport = importExport;
      this.onDone = onDone;
      // Both optional (proposals/04): a snapshot of unsaved work from a
      // previous visit, and the files opened or saved natively before
      // now. Either can be absent -- no snapshot stored, no File System
      // Access API -- and the start screen simply shows one fewer thing.
      this.recovery = recovery || null;
      this.recent = recent || null;
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

    _showStartStep() {
      this._setDialogWidth('start');
      const screen = Bowtie.WelcomeView.startScreen({
        recoveryMeta: this.recovery && this.recovery.peek(),
        demoVariant: this._demoVariant,
        schemaVersion: Bowtie.BowtieModel.SCHEMA_VERSION,
      }, {
        onStartNew: () => this._showNamesStep(),
        onPickDemoVariant: (id) => { this._demoVariant = id; },
        onLoadDemo: () => this._loadDemo(),
        onBrowse: () => this.importFileInput.click(),
        onDropFile: (file) => this._importDroppedFile(file),
        onRecover: () => this.recovery.restore(this.importExport),
        onDiscardRecovery: () => this.recovery.clear(),
      });

      this.modal.setTitle('Bowtie Diagram Editor');
      this.modal.setBody(screen.el);
      this.modal.setActions([]);
      this._fillRecentList(screen);
    }

    _fillRecentList(screen) {
      if (!this.recent) return;
      this.recent.list().then((entries) => screen.setRecent(entries, async (entry) => {
        const text = await this.recent.read(entry);
        // Permission refused, or the file has moved since -- the entry
        // drops itself in that case, and the row follows.
        if (text == null) return false;
        this.importExport.importText(text);
        return true;
      }));
    }

    // --- Step 1: names --------------------------------------------------------

    _showNamesStep() {
      this._setDialogWidth('wizard');
      const step = Bowtie.WelcomeView.namesStep(this._draft, {
        onFieldInput: (key, value) => { this._draft[key] = value; },
        onMoreToggle: (open) => { this._draft.moreOpen = open; },
        onPickIdentifierMode: (mode) => { this._draft.identifierMode = mode; },
        onComplete: (complete) => this._setNextEnabled(complete),
        onSubmit: () => this._showModeStep(),
      });

      this.modal.setTitle('New bowtie');
      this.modal.setBody(step.el);
      this.modal.setActions([
        { label: 'Back', onClick: () => { this._showStartStep(); return false; } },
        { label: 'Next', primary: true, onClick: () => { this._showModeStep(); return false; } },
      ]);

      // setActions built the button, so this runs after it: the step
      // reports completeness, and which control that gates is the
      // modal's owner's business.
      this._setNextEnabled(step.isComplete());
      step.focusFirst();
    }

    _setNextEnabled(enabled) {
      const nextBtn = this.modal.dialog.querySelector('.modal-btn-primary');
      if (nextBtn) nextBtn.disabled = !enabled;
    }

    // --- Step 2: risk mode ----------------------------------------------------

    _showModeStep() {
      this._setDialogWidth('wizard');
      const step = Bowtie.WelcomeView.modeStep(this._draft, presets(), {
        onSelectMode: (mode) => { this._draft.mode = mode; },
        onSelectMatrix: (id) => { this._draft.matrixId = id; },
      });

      this.modal.setTitle('New bowtie');
      this.modal.setBody(step.el);
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
