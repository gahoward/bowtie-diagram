(function (Bowtie) {
  const STORAGE_KEY = 'bowtie-diagram.preferences';

  const DEFAULTS = {
    displayUnit: 'hour', // 'hour' | 'year' -- how computed frequencies are shown
    showAnnotations: true, // line-origin labels on the canvas
    arrangeSpacing: 'loose', // 'loose' | 'tight' -- see AutoArrangeController's COL_SPACING_TIGHT
    pullChainsCloser: false, // auto-arrange-fix.md §7
  };
  const ALLOWED = {
    displayUnit: ['hour', 'year'],
    showAnnotations: [true, false],
    arrangeSpacing: ['loose', 'tight'],
    pullChainsCloser: [true, false],
  };

  // Settings › Preferences… (ui_fitness_proposal.md S3): everything that
  // is about THIS BROWSER rather than the document -- display unit, line
  // annotations, the two auto-arrange knobs. None of it is diagram data,
  // none of it round-trips through JSON export/import; it's kept in
  // localStorage instead so "my display unit reset again" stops happening
  // between visits. Every change applies immediately (the old Visual
  // Settings modal applied on Close, so a change followed by Escape was
  // silently lost). Replaces SettingsController; ProjectSettingsController
  // keeps everything that IS saved with the document.
  class PreferencesController {
    constructor(button, onChange) {
      this.onChange = onChange;
      Object.assign(this, DEFAULTS, this._load());
      button.addEventListener('click', () => this.open());
    }

    getDisplayUnit() {
      return this.displayUnit;
    }

    // localStorage can be absent, full, or blocked (private window,
    // file:// in some browsers) -- every access is best-effort, and a
    // stored value that isn't one of the allowed ones is ignored rather
    // than trusted.
    _load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const valid = {};
        Object.keys(DEFAULTS).forEach((key) => {
          if (ALLOWED[key].includes(parsed[key])) valid[key] = parsed[key];
        });
        return valid;
      } catch {
        return {};
      }
    }

    _save() {
      try {
        const data = {};
        Object.keys(DEFAULTS).forEach((key) => { data[key] = this[key]; });
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Nothing to do -- the preference still applies for this session.
      }
    }

    _set(key, value) {
      this[key] = value;
      this._save();
      this.onChange();
    }

    // Public: the status strip's unit segment opens this too.
    open() {
      const body = document.createElement('div');
      body.className = 'settings-body';
      const subtitle = document.createElement('p');
      subtitle.className = 'modal-subtitle';
      subtitle.textContent = 'For this browser only — not saved in the file.';
      body.appendChild(subtitle);

      const display = this._group('Display');
      display.appendChild(this._radioRow('Show frequencies as', 'display-unit', [
        { value: 'hour', text: 'events/hour' },
        { value: 'year', text: 'events/year' },
      ], this.displayUnit, (v) => this._set('displayUnit', v)));
      display.appendChild(this._checkRow('Lines', 'show-annotations', 'Show line origin annotations',
        this.showAnnotations, (v) => this._set('showAnnotations', v)));
      body.appendChild(display);

      const arrange = this._group('Auto-arrange');
      arrange.appendChild(this._radioRow('Column spacing', 'arrange-spacing', [
        { value: 'loose', text: 'Loose' },
        { value: 'tight', text: 'Tight' },
      ], this.arrangeSpacing, (v) => this._set('arrangeSpacing', v)));
      arrange.appendChild(this._checkRow('Short chains', 'pull-chains-closer',
        'Pull a threat or consequence in toward the top event when it has fewer barriers than its neighbours',
        this.pullChainsCloser, (v) => this._set('pullChainsCloser', v)));
      body.appendChild(arrange);

      Bowtie.ModalView.openModal({
        title: 'Preferences',
        bodyEl: body,
        actions: [{ label: 'Done', primary: true }],
      });
    }

    _group(title) {
      const group = document.createElement('div');
      group.className = 'settings-group';
      const h = document.createElement('h3');
      h.className = 'modal-section-title';
      h.textContent = title;
      group.appendChild(h);
      return group;
    }

    _row(labelText, control) {
      const row = document.createElement('div');
      row.className = 'modal-field settings-row';
      const label = document.createElement('span');
      label.className = 'settings-row-label';
      label.textContent = labelText;
      row.appendChild(label);
      row.appendChild(control);
      return row;
    }

    _radioRow(labelText, name, options, current, onPick) {
      const control = document.createElement('div');
      control.className = 'settings-options';
      options.forEach((opt) => {
        const optionRow = document.createElement('label');
        optionRow.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = name;
        radio.value = opt.value;
        radio.checked = current === opt.value;
        radio.addEventListener('change', () => { if (radio.checked) onPick(opt.value); });
        const span = document.createElement('span');
        span.textContent = opt.text;
        optionRow.append(radio, span);
        control.appendChild(optionRow);
      });
      return this._row(labelText, control);
    }

    _checkRow(labelText, name, text, checked, onToggle) {
      const optionRow = document.createElement('label');
      optionRow.className = 'modal-checkbox-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.checked = checked;
      input.addEventListener('change', () => onToggle(input.checked));
      const span = document.createElement('span');
      span.textContent = text;
      optionRow.append(input, span);
      return this._row(labelText, optionRow);
    }
  }

  Bowtie.PreferencesController = PreferencesController;
})(window.Bowtie = window.Bowtie || {});
