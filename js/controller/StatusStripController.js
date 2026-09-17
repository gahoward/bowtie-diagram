(function (Bowtie) {
  const MODE_LABELS = { simple: 'Simple', qualitative: 'Qualitative', quantitative: 'Quantitative' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The document's own context, always visible at the end of the page-tab
  // strip (ui_fitness_proposal.md 07): which mode it's in, which risk
  // matrix is active with its class letters, the unit every computed
  // figure on the canvas is in, and -- in Quantitative mode -- how the
  // TLE combines its causes. All of it was previously invisible until
  // the user opened Settings, which made "Likelihood: 1.67e-7/hr (max)"
  // under a node a figure with no stated frame of reference.
  //
  // Every segment is a button that opens the settings page it came from,
  // so the strip is also the shortest route to changing any of it.
  class StatusStripController {
    constructor(model, container, { getDisplayUnit, openProjectSettings, openPreferences }) {
      this.model = model;
      this.container = container;
      this.getDisplayUnit = getDisplayUnit;
      this.openProjectSettings = openProjectSettings;
      this.openPreferences = openPreferences;

      // One delegated listener rather than one per segment: render()
      // rebuilds the strip from scratch on every model change.
      container.addEventListener('click', (e) => {
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
          'How multiple causes combine at the top event — click to change',
        ));
      }

      this.container.replaceChildren(strip);
    }
  }

  Bowtie.StatusStripController = StatusStripController;
})(window.Bowtie = window.Bowtie || {});
