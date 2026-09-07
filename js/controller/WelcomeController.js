(function (Bowtie) {
  // First-load gate: nothing is usable until the user picks New (name the
  // bowtie/TLE/Hazard) or Import (load an existing .json export). The modal
  // is non-dismissible — there is no third way past it.
  class WelcomeController {
    // `importExport` (an ImportExportController instance) is what "Load
    // Demo" and Ctrl+Alt+D route through — `importExport.loadDocument`
    // runs the exact same shape/version validation a real import gets (see
    // ImportExportController.js), so a stale Bowtie.DEMO_DATA fails the
    // same friendly way a stale real export would, rather than silently
    // handing the model something it wasn't written to expect.
    constructor(model, importFileInput, importExport, onDone) {
      this.model = model;
      this.importFileInput = importFileInput;
      this.importExport = importExport;
      this.onDone = onDone;
      this._dismissed = false;
      // Which demo variant "Load Demo"/Ctrl+Alt+D loads -- one per document
      // mode (quantitative_mode_proposal.md "Modes"), all built from the
      // same underlying diagram (scripts/migrate-demo-to-v8.js) so picking
      // a different variant is purely about which risk fields are filled
      // in, not a different example.
      this._demoVariant = 'simple';

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
      this._showChoiceStep();
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

    // Three side-by-side ways to start, left to right: build a new diagram
    // from the wizard, browse for a .json export, or drag one in directly.
    // The upload button and the dropzone both hand off to the SAME hidden
    // `<input type=file>` that ImportExportController already listens on
    // (via a synthesized `change` event for the drop case) — so the
    // existing validation/import path runs unchanged either way, with
    // nothing duplicated here.
    _showChoiceStep() {
      // Wider than the default modal width — a three-column choice layout
      // needs more room than the single-column forms every other modal
      // uses; the setup step below removes this again.
      this.modal.dialog.classList.add('welcome-dialog');

      const body = document.createElement('div');
      body.className = 'welcome-body';

      const row = document.createElement('div');
      row.className = 'welcome-choice-row';

      const wizardCol = document.createElement('div');
      wizardCol.className = 'welcome-choice-col';
      const wizardBtn = document.createElement('button');
      wizardBtn.type = 'button';
      wizardBtn.className = 'welcome-choice-btn welcome-choice-btn-primary';
      wizardBtn.textContent = 'New Bowtie Wizard';
      wizardBtn.addEventListener('click', () => this._showSetupStep());
      const wizardHint = document.createElement('p');
      wizardHint.className = 'welcome-choice-hint';
      wizardHint.textContent = 'Start from scratch and name your Top-Level Event and Hazard.';

      // Stacked below the wizard button in the SAME column, not a fourth
      // column — `.welcome-choice-row`'s `align-items: stretch` and each
      // column's own `justify-content: center` make the other two columns
      // grow and re-center automatically once this column gets taller.
      const demoBtn = document.createElement('button');
      demoBtn.type = 'button';
      demoBtn.className = 'welcome-choice-btn welcome-choice-btn-demo';
      demoBtn.textContent = 'Load Demo';
      demoBtn.addEventListener('click', () => this._loadDemo());
      const demoHint = document.createElement('p');
      demoHint.className = 'welcome-choice-hint';
      demoHint.textContent = 'See a worked example — shared barriers, multiple causes and outcomes. (Ctrl+Alt+D)';

      // Which document mode the demo loads in (quantitative_mode_
      // proposal.md "Modes") -- same underlying diagram either way, only
      // the risk fields differ. Defaults to Simple (today's only variant).
      const demoVariantSelect = document.createElement('select');
      demoVariantSelect.className = 'welcome-demo-variant-select';
      [
        { value: 'simple', text: 'Simple' },
        { value: 'qualitative', text: 'Qualitative' },
        { value: 'quantitative', text: 'Quantitative' },
      ].forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        demoVariantSelect.appendChild(option);
      });
      demoVariantSelect.value = this._demoVariant;
      demoVariantSelect.addEventListener('change', () => { this._demoVariant = demoVariantSelect.value; });

      wizardCol.append(wizardBtn, wizardHint, demoBtn, demoVariantSelect, demoHint);

      const uploadCol = document.createElement('div');
      uploadCol.className = 'welcome-choice-col';
      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'welcome-choice-btn';
      uploadBtn.textContent = 'Upload a .json file';
      uploadBtn.addEventListener('click', () => this.importFileInput.click());
      const uploadHint = document.createElement('p');
      uploadHint.className = 'welcome-choice-hint';
      uploadHint.textContent = 'Browse for a previously-exported diagram.';
      uploadCol.append(uploadBtn, uploadHint);

      const dropCol = document.createElement('div');
      dropCol.className = 'welcome-choice-col welcome-dropzone';
      dropCol.textContent = 'Drag and drop a .json file here';
      dropCol.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropCol.classList.add('drag-over');
      });
      dropCol.addEventListener('dragleave', () => dropCol.classList.remove('drag-over'));
      dropCol.addEventListener('drop', (e) => {
        e.preventDefault();
        dropCol.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        this.importFileInput.files = dataTransfer.files;
        this.importFileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // A drop zone that only responds to drag-and-drop is an easy-to-miss
      // dead click otherwise — clicking it falls back to the same browse
      // dialog as the upload button.
      dropCol.addEventListener('click', () => this.importFileInput.click());

      row.append(wizardCol, uploadCol, dropCol);
      body.appendChild(row);

      this.modal.setTitle('Bowtie Diagram Editor');
      this.modal.setBody(body);
      this.modal.setActions([]);
    }

    _showSetupStep() {
      this.modal.dialog.classList.remove('welcome-dialog');

      const body = document.createElement('div');
      body.className = 'welcome-body';

      const makeField = (labelText, defaultValue) => {
        const wrap = document.createElement('label');
        wrap.className = 'modal-field';
        const span = document.createElement('span');
        span.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        wrap.appendChild(span);
        wrap.appendChild(input);
        body.appendChild(wrap);
        return input;
      };

      // The document/analysis title, the page's own name, and the TLE's
      // own name are genuinely different things (the project or system
      // under study; a single failure of interest within it; the failure
      // itself) — all three stay, none collapsed into another. The page
      // this wizard configures already exists (BowtieModel's constructor
      // creates a document's first page up front, the same way it already
      // pre-creates a first TLE/Hazard for this same step to rename), so
      // "Create" here renames/describes it rather than adding a second one.
      const firstPage = this.model.pages[0];
      const nameInput = makeField('Analysis title', this.model.name);
      const pageNameInput = makeField('Page name', firstPage.name);
      const pageDescInput = makeField('Page description (optional)', firstPage.description);
      const tleInput = makeField('Top-level event name', this.model.topLevelEvent.name);
      const hazardInput = makeField('Hazard name', this.model.hazard.name);

      // node_library_proposal.md "Display identifiers": the first
      // non-text-field control the wizard has -- a two-option radio group,
      // set once here (there's nothing to backfill yet, no nodes exist),
      // changeable later via the Settings dropdown.
      const identifierField = document.createElement('div');
      identifierField.className = 'modal-field';
      const identifierLabel = document.createElement('span');
      identifierLabel.textContent = 'Show identifiers as';
      identifierField.appendChild(identifierLabel);
      const identifierOptions = [
        { value: 'internal', text: 'Internal IDs (C_1, PB_1, …)' },
        { value: 'custom', text: 'Custom Labels' },
      ];
      const identifierInputs = identifierOptions.map((opt) => {
        const optionRow = document.createElement('label');
        optionRow.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'identifier-display-mode';
        radio.value = opt.value;
        radio.checked = opt.value === 'internal';
        const optionSpan = document.createElement('span');
        optionSpan.textContent = opt.text;
        optionRow.appendChild(radio);
        optionRow.appendChild(optionSpan);
        identifierField.appendChild(optionRow);
        return radio;
      });
      const identifierHint = document.createElement('p');
      identifierHint.className = 'welcome-choice-hint';
      identifierHint.textContent = "You'll set an identifier for each Cause, Outcome, and Barrier yourself as you "
        + 'create them — nothing is generated for you.';
      identifierHint.hidden = true;
      identifierField.appendChild(identifierHint);
      identifierInputs.forEach((radio) => radio.addEventListener('change', () => {
        identifierHint.hidden = radio.value !== 'custom' || !radio.checked;
      }));
      body.appendChild(identifierField);

      this.modal.setTitle('New Bowtie');
      this.modal.setBody(body);
      this.modal.setActions([
        { label: 'Back', onClick: () => { this._showChoiceStep(); return false; } },
        {
          label: 'Create',
          primary: true,
          onClick: () => {
            this.model.setName(nameInput.value.trim());
            this.model.renamePage(firstPage.id, {
              name: pageNameInput.value.trim(),
              description: pageDescInput.value,
            });
            this.model.renameElement(this.model.topLevelEvent.id, tleInput.value.trim());
            this.model.renameElement(this.model.hazard.id, hazardInput.value.trim());
            const identifierChoice = identifierInputs.find((r) => r.checked);
            if (identifierChoice) this.model.setIdentifierDisplayMode(identifierChoice.value);
            // model.onChange (registered in the constructor) handles dismissal
          },
        },
      ]);

      // Analysis title, Page name, TLE name, and Hazard name are all
      // genuinely required — Create stays disabled until every one of
      // them is non-empty after trimming. Page description may stay
      // blank. Replaces the old silent "falls back to a default name"
      // behaviour for the three pre-existing fields too, not just the two
      // new ones — a deliberate behaviour change.
      const createBtn = this.modal.dialog.querySelector('.modal-btn-primary');
      const requiredInputs = [nameInput, pageNameInput, tleInput, hazardInput];
      const updateCreateDisabled = () => {
        createBtn.disabled = requiredInputs.some((input) => input.value.trim() === '');
      };
      requiredInputs.forEach((input) => input.addEventListener('input', updateCreateDisabled));
      updateCreateDisabled();
    }
  }

  Bowtie.WelcomeController = WelcomeController;
})(window.Bowtie = window.Bowtie || {});
