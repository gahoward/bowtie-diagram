(function (Bowtie) {
  const MODE_LABELS = { simple: 'Simple', qualitative: 'Qualitative', quantitative: 'Quantitative' };

  const el = Bowtie.Dom.el;

  // The document's own context, always visible at the end of the page-tab
  // strip (ui_fitness_proposal.md 07): which mode it's in, which risk
  // matrix is active with its class letters, the unit every computed
  // figure on the canvas is in, and -- in Quantitative mode -- how the
  // TLE combines its threats. All of it was previously invisible until
  // the user opened Settings, which made "Likelihood: 1.67e-7/hr (max)"
  // under a node a figure with no stated frame of reference.
  //
  // Every segment is a button that opens the settings page it came from,
  // so the strip is also the shortest route to changing any of it.
  class StatusStripController {
    constructor(model, container, {
      getDisplayUnit, openProjectSettings, openPreferences, getRecoveryState,
      getActivePageId, goToPage,
    }) {
      this.model = model;
      // proposals/22: which page is active, so the strip can say when
      // that page's top event is really a consequence somewhere else.
      // Optional, like getRecoveryState -- a caller without pages simply
      // gets no segment.
      this.getActivePageId = getActivePageId || (() => null);
      this.goToPage = goToPage || (() => {});
      this.container = container;
      this.getDisplayUnit = getDisplayUnit;
      this.openProjectSettings = openProjectSettings;
      this.openPreferences = openPreferences;
      // `() => ({ disabled, reason })` (proposals/19). Optional, so a
      // caller that has no RecoveryController simply gets no segment.
      this.getRecoveryState = getRecoveryState || (() => ({ disabled: false }));

      // One delegated listener rather than one per segment: render()
      // rebuilds the strip from scratch on every model change.
      container.addEventListener('click', (e) => {
        const source = e.target.closest('[data-go-to-page]');
        if (source) {
          this.goToPage(source.dataset.goToPage);
          return;
        }
        const btn = e.target.closest('[data-open]');
        if (!btn) return;
        if (btn.dataset.open === 'preferences') this.openPreferences();
        else this.openProjectSettings({ tab: btn.dataset.open });
      });
      model.onChange(() => this.render());
      this.render();
    }

    _segment(text, open, title) {
      const btn = el('button', 'status-segment', text);
      btn.type = 'button';
      btn.dataset.open = open;
      if (title) btn.title = title;
      return btn;
    }

    render() {
      const { model } = this;
      const strip = el('div', 'status-strip');

      strip.appendChild(this._segment(
        MODE_LABELS[model.mode] || model.mode,
        'risk',
        'Risk analysis mode — click to change',
      ));

      if (model.mode !== 'simple') {
        const matrix = model.riskMatrix;
        strip.appendChild(this._segment(
          matrix ? matrix.name : 'No risk matrix',
          'risk',
          matrix ? 'Risk matrix — click to change' : 'Pick a risk matrix',
        ));
        if (matrix) {
          const chips = el('span', 'status-chips');
          Bowtie.riskClassesByRank(matrix).forEach((riskClass) => {
            const chip = el('span', 'risk-class-legend-swatch', riskClass.id);
            chip.style.background = riskClass.colour || '#888';
            chip.title = riskClass.reviewPeriod ? `${riskClass.label} — ${riskClass.reviewPeriod}` : riskClass.label;
            chips.appendChild(chip);
          });
          strip.appendChild(chips);
        }
      }

      if (model.mode === 'quantitative') {
        strip.appendChild(this._segment(
          this.getDisplayUnit() === 'year' ? 'per year' : 'per hour',
          'preferences',
          'How computed frequencies are shown — click to change',
        ));
        strip.appendChild(this._segment(
          model.tleAggregation === 'sum' ? 'sum' : 'max',
          'quantitative',
          'How multiple threats combine at the top event — click to change',
        ));
      }

      // Where this page's top event came from (proposals/22), when it
      // came from anywhere: this strip is already the "frame of
      // reference" surface, and "the top event of this analysis is a
      // consequence of that one" is exactly that. A button, like every
      // other segment -- but it goes to the source page rather than
      // opening a setting, because that is the only thing anyone wants
      // to do with it.
      const derived = this.model.derivedSourceFor(this.getActivePageId());
      if (derived) {
        const btn = el('button', 'status-segment status-derived', `↑ ${derived.displayId} · ${derived.page.name}`);
        btn.type = 'button';
        btn.dataset.goToPage = derived.page.id;
        btn.title = `This page's top event is ${derived.displayId} on "${derived.page.name}" — click to go there`;
        strip.appendChild(btn);
      }

      // Last, and only when it applies: automatic recovery having
      // stopped is not part of the document's frame of reference, it is
      // a warning about this session (proposals/19). Said once in a
      // dialog is not said -- the dialog is gone a second later, and the
      // user goes on believing their work is being kept.
      //
      // Not a `.status-segment`: every other segment opens the setting
      // it names, and there is no setting that turns this back on.
      const recovery = this.getRecoveryState();
      if (recovery.disabled) {
        const warning = el('span', 'status-recovery-off', '⚠ Recovery off');
        warning.title = `${recovery.reason || ''} Export to a file to keep your work.`.trim();
        strip.appendChild(warning);
      }

      this.container.replaceChildren(strip);
    }
  }

  Bowtie.StatusStripController = StatusStripController;
})(window.Bowtie = window.Bowtie || {});
