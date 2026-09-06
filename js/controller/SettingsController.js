(function (Bowtie) {
  // Visual display preferences — not diagram data, so these are transient
  // session state, not part of BowtieModel, and do not round-trip through
  // JSON export/import. Designed to hold more toggles later (the
  // requirement text says "options including: Disabling annotation of
  // lines", implying this modal is a home for future settings too).
  class SettingsController {
    constructor(button, onChange) {
      this.onChange = onChange;
      this.showAnnotations = true;
      // 'loose' (the original, generously-padded default) or 'tight' (the
      // real minimum column spacing that still avoids horizontal
      // collisions — see AutoArrangeController's COL_SPACING_TIGHT). Read
      // fresh by AutoArrangeController on every arrange(), so changing this
      // here takes effect on the next Auto-arrange click without needing
      // to re-run anything itself.
      this.arrangeSpacing = 'loose';
      // Independent axis from Loose/Tight (auto-arrange-fix.md §7): when on,
      // an origin with fewer barriers than a sibling it merges with (down to
      // zero) is positioned closer to the TLE instead of always starting at
      // the fixed causes/outcomes column — see AutoArrangeController's
      // causeOriginX/outcomeOriginX. Off by default (today's behavior).
      this.pullChainsCloser = false;
      button.addEventListener('click', () => this._open());
    }

    _open() {
      const body = document.createElement('div');

      const row = document.createElement('label');
      row.className = 'modal-checkbox-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.showAnnotations;
      const span = document.createElement('span');
      span.textContent = 'Show line origin annotations';
      row.appendChild(input);
      row.appendChild(span);
      body.appendChild(row);

      const spacingField = document.createElement('div');
      spacingField.className = 'modal-field';
      const spacingLabel = document.createElement('span');
      spacingLabel.textContent = 'Auto-arrange spacing';
      spacingField.appendChild(spacingLabel);

      const spacingOptions = [
        { value: 'loose', text: 'Loose (default)' },
        { value: 'tight', text: 'Tight' },
      ];
      const spacingInputs = spacingOptions.map((opt) => {
        const optionRow = document.createElement('label');
        optionRow.className = 'modal-checkbox-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'arrange-spacing';
        radio.value = opt.value;
        radio.checked = this.arrangeSpacing === opt.value;
        const optionSpan = document.createElement('span');
        optionSpan.textContent = opt.text;
        optionRow.appendChild(radio);
        optionRow.appendChild(optionSpan);
        spacingField.appendChild(optionRow);
        return radio;
      });
      body.appendChild(spacingField);

      const pullRow = document.createElement('label');
      pullRow.className = 'modal-checkbox-row';
      const pullInput = document.createElement('input');
      pullInput.type = 'checkbox';
      pullInput.checked = this.pullChainsCloser;
      const pullSpan = document.createElement('span');
      pullSpan.textContent = 'Pull causes/outcomes closer to their first real stop';
      pullRow.appendChild(pullInput);
      pullRow.appendChild(pullSpan);
      body.appendChild(pullRow);

      Bowtie.ModalView.openModal({
        title: 'Visual Settings',
        bodyEl: body,
        actions: [
          {
            label: 'Close',
            primary: true,
            onClick: () => {
              this.showAnnotations = input.checked;
              const selected = spacingInputs.find((r) => r.checked);
              if (selected) this.arrangeSpacing = selected.value;
              this.pullChainsCloser = pullInput.checked;
              this.onChange();
            },
          },
        ],
      });
    }
  }

  Bowtie.SettingsController = SettingsController;
})(window.Bowtie = window.Bowtie || {});
