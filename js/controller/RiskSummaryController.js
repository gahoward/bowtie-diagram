(function (Bowtie) {
  // Same display rule as CanvasView._formatLikelihood / PropertiesModal's
  // formatLikelihood: canonical events/hour shown in the Project Settings
  // display unit, 3 significant figures, never fed back into a calculation.
  function formatLikelihood(value, displayUnit) {
    const perYear = displayUnit === 'year';
    const shown = perYear
      ? value.multiplyNumerator(Bowtie.Decimal.parse(String(Bowtie.HOURS_PER_YEAR)))
      : value;
    return `${shown.toDisplayNumber(3)}/${perYear ? 'yr' : 'hr'}`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // View > "Risk Summary…": one table per page, in document page order,
  // each ranking that page's Outcomes worst-first with their pre-
  // mitigation (every barrier removed) and post-mitigation (residual)
  // likelihood and risk class side by side -- the ALARP before/after
  // picture quantitative_mode_proposal.md asks for, as a table rather
  // than one badge pair per node. Page by page (rather than one document-
  // wide ranking) because each page is its own bowtie with its own TLE
  // likelihood, so ranks only compare like with like within a page. A
  // pure renderer of BowtieModel.computeRiskSummary (ranking and every
  // figure live there), re-rendered in place on every model change while
  // open, the same way WarningsController keeps its list live.
  class RiskSummaryController {
    constructor(model, button, getDisplayUnit) {
      this.model = model;
      this.button = button;
      this.getDisplayUnit = getDisplayUnit;
      this.modal = null;

      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
    }

    _open() {
      this.modal = Bowtie.ModalView.openModal({
        title: 'Risk Summary',
        bodyEl: this._buildBody(),
        size: 'xwide',
        actions: [{ label: 'Close' }],
      });
    }

    _refresh() {
      if (this.modal && document.body.contains(this.modal.overlay)) {
        this.modal.setBody(this._buildBody());
      }
    }

    _buildBody() {
      const wrap = el('div', 'risk-summary');
      const model = this.model;
      if (model.mode === 'simple') {
        wrap.appendChild(el('p', 'risk-summary-empty',
          'The risk summary needs Qualitative or Quantitative mode — pick one in Project Settings.'));
        return wrap;
      }
      if (!model.riskMatrix) {
        wrap.appendChild(el('p', 'risk-summary-empty',
          'No risk matrix selected — pick one in Project Settings.'));
        return wrap;
      }
      if (model.outcomes.length === 0) {
        wrap.appendChild(el('p', 'risk-summary-empty', 'No outcomes yet.'));
        return wrap;
      }

      const quantitative = model.mode === 'quantitative';
      wrap.appendChild(el('p', 'risk-summary-intro',
        "Each page's outcomes, ranked worst-first by post-mitigation risk class, then "
        + 'pre-mitigation class, severity and likelihood. '
        + (quantitative
          ? 'Pre-mitigation figures are the same calculation with every barrier removed; severity is a '
            + 'property of the outcome itself and is never changed by barriers.'
          : 'Pre-mitigation figures need Quantitative mode — a Qualitative likelihood is picked by hand, '
            + 'with no barrier arithmetic to remove.')));

      let anyExcluded = false;
      model.pages.forEach((page) => {
        const section = el('section', 'risk-summary-page');
        section.dataset.pageId = page.id;
        section.appendChild(el('h3', 'risk-summary-page-title', page.name));
        const rows = model.computeRiskSummary(page.id);
        if (rows.length === 0) {
          section.appendChild(el('p', 'risk-summary-empty', 'No outcomes on this page.'));
          wrap.appendChild(section);
          return;
        }
        const table = el('table', 'risk-summary-table');
        table.appendChild(this._buildHead());
        const tbody = document.createElement('tbody');
        rows.forEach((row) => {
          tbody.appendChild(this._buildRow(row));
          if (row.post.likelihood && row.post.likelihood.excludedThreatCount) anyExcluded = true;
        });
        table.appendChild(tbody);
        const tableWrap = el('div', 'risk-summary-table-wrap');
        tableWrap.appendChild(table);
        section.appendChild(tableWrap);
        wrap.appendChild(section);
      });

      if (anyExcluded) {
        wrap.appendChild(el('p', 'risk-summary-note',
          '* One or more contributing causes excluded (frequency Unknown) — this figure is not the full picture.'));
      }
      return wrap;
    }

    _buildHead() {
      const thead = document.createElement('thead');
      const top = document.createElement('tr');
      const bottom = document.createElement('tr');
      const rowSpan = (text) => {
        const th = el('th', null, text);
        th.rowSpan = 2;
        top.appendChild(th);
      };
      rowSpan('#');
      rowSpan('Outcome');
      rowSpan('Severity');
      ['Pre-mitigation', 'Post-mitigation'].forEach((label) => {
        const th = el('th', 'risk-summary-group', label);
        th.colSpan = 2;
        top.appendChild(th);
        bottom.appendChild(el('th', 'risk-summary-group-start', 'Likelihood'));
        bottom.appendChild(el('th', null, 'Risk class'));
      });
      thead.appendChild(top);
      thead.appendChild(bottom);
      return thead;
    }

    _buildRow(row) {
      const tr = document.createElement('tr');
      tr.dataset.outcomeId = row.outcomeId;
      tr.dataset.rank = String(row.rank);
      tr.appendChild(el('td', 'risk-summary-rank', String(row.rank)));

      const outcomeCell = el('td', null);
      outcomeCell.appendChild(el('span', 'risk-summary-id', row.displayId));
      if (row.name && row.name !== row.displayId) {
        outcomeCell.appendChild(el('span', 'risk-summary-sub', row.name));
      }
      tr.appendChild(outcomeCell);
      tr.appendChild(el('td', null, row.severity ? row.severity.label : '—'));

      [row.pre, row.post].forEach((assessment) => {
        tr.appendChild(this._likelihoodCell(assessment));
        tr.appendChild(this._riskClassCell(assessment));
      });
      return tr;
    }

    // Quantitative mode: the computed figure, with the band it lands in
    // underneath; Qualitative mode: just the manually-picked band. An
    // undetermined half (no known cause frequency yet, or -- for the pre-
    // mitigation column in Qualitative mode -- no calculation at all)
    // reads as a dash rather than an empty cell.
    _likelihoodCell(assessment) {
      const td = el('td', 'risk-summary-group-start');
      if (!assessment || (!assessment.likelihood && !assessment.likelihoodClass)) {
        td.textContent = '—';
        return td;
      }
      if (assessment.likelihood) {
        const excluded = assessment.likelihood.excludedThreatCount > 0;
        const text = formatLikelihood(assessment.likelihood.value, this.getDisplayUnit());
        td.appendChild(el('span', 'risk-summary-value', excluded ? `${text}*` : text));
        if (assessment.likelihoodClass) td.appendChild(el('span', 'risk-summary-sub', assessment.likelihoodClass.label));
      } else {
        td.textContent = assessment.likelihoodClass.label;
      }
      return td;
    }

    // Mirrors the canvas badge / Project Settings legend treatment (colour
    // + letter swatch) so the three are recognizably the same class.
    _riskClassCell(assessment) {
      const td = el('td', null);
      const riskClass = assessment ? assessment.riskClass : null;
      if (!riskClass) {
        td.textContent = '—';
        return td;
      }
      const chip = el('span', 'risk-summary-chip');
      chip.title = riskClass.reviewPeriod ? `${riskClass.label} — ${riskClass.reviewPeriod}` : riskClass.label;
      const swatch = el('span', 'risk-class-legend-swatch', riskClass.id);
      swatch.style.background = riskClass.colour || '#888';
      chip.appendChild(swatch);
      chip.appendChild(el('span', null, riskClass.label));
      td.appendChild(chip);
      return td;
    }
  }

  Bowtie.RiskSummaryController = RiskSummaryController;
})(window.Bowtie = window.Bowtie || {});
