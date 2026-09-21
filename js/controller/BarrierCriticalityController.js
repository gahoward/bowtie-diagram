(function (Bowtie) {
  // Same display rule as every other table and the canvas: canonical
  // events/hour shown in the preferred display unit, 3 significant
  // figures, never fed back into a calculation.
  function rateNumber(value, displayUnit) {
    const shown = displayUnit === 'year'
      ? value.multiplyNumerator(Bowtie.Decimal.parse(String(Bowtie.HOURS_PER_YEAR)))
      : value;
    return shown.toDisplayNumber(3);
  }

  function unitSuffix(displayUnit) {
    return displayUnit === 'year' ? '/yr' : '/hr';
  }

  const SIDE_LABELS = { preventative: 'Preventative', mitigative: 'Mitigative' };
  const EFFECTIVENESS_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

  // One row per library node, and the counts as bare numbers so a
  // spreadsheet can sort on them -- the same shape rule the Risk
  // Summary's and the Barrier Register's exports follow. `sole_for` is
  // space-separated display ids for the same reason `protects` is.
  const EXPORT_COLUMNS = [
    'id', 'name', 'side', 'paths', 'pages', 'sole_for', 'owner', 'effectiveness',
    'demand_rate', 'demand_rate_unit', 'warnings',
  ];

  const el = Bowtie.Dom.el;

  // View > "Barrier Criticality…" (proposals/23). The Barrier Register
  // says what state each barrier is in; this says what the ANALYSIS is
  // leaning on -- which barriers carry the most paths, which reach the
  // most pages, and which are the sole protection on some path.
  //
  // That last column is the one that earns the table. A line whose only
  // stop is one barrier is the highest-value finding a bowtie can
  // produce, and before this it was visible only by looking at the
  // picture and counting.
  //
  // A third modal rather than a tab inside the register (proposals/23,
  // open question 3): the register is already extra-wide and dense, and
  // the two answer different questions for different readers. Everything
  // around the table -- the shell, the exports, the print behaviour --
  // comes from SummaryModalView, so this is a third caller rather than a
  // third copy.
  class BarrierCriticalityController {
    constructor(model, button, getDisplayUnit) {
      this.model = model;
      this.button = button;
      this.getDisplayUnit = getDisplayUnit;
      this.modal = null;

      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
    }

    _open() {
      this.modal = Bowtie.SummaryModalView.open({
        title: 'Barrier Criticality',
        bodyEl: this._buildBody(),
        exportable: this._hasRows(),
        onCopy: () => Bowtie.SummaryModalView.copyTable(this.modal, this._exportTable()),
        onExportCsv: (includeHeader) => Bowtie.SummaryModalView.exportCsv(
          this._exportTable(), this.model.name, 'barrier criticality',
          includeHeader ? this.model.document : null,
        ),
      });
    }

    _hasRows() {
      return this.model.preventativeBarriers.length + this.model.mitigativeBarriers.length > 0;
    }

    _quantitative() {
      return this.model.mode === 'quantitative';
    }

    _rows() {
      // Document-wide, unlike the register's per-page sections: "how many
      // pages does this barrier appear on" has no answer inside a single
      // page, and it is half the question this table exists to answer.
      return this.model.computeBarrierCriticality();
    }

    // --- Export ----------------------------------------------------------

    _exportTable() {
      const displayUnit = this.getDisplayUnit();
      const unit = displayUnit === 'year' ? 'events/year' : 'events/hour';
      const rows = this._rows().map((row) => [
        row.displayId, row.name, row.side, row.pathCount, row.pageCount,
        row.soleOnPaths.join(' '),
        row.owner || '', row.effectiveness || '',
        row.demandRate ? rateNumber(row.demandRate, displayUnit) : '',
        row.demandRate ? unit : '',
        row.warnings.map((w) => w.detail || w.message).join(' | '),
      ]);
      return { columns: EXPORT_COLUMNS, rows };
    }

    _refresh() {
      Bowtie.SummaryModalView.refresh(this.modal, () => this._buildBody());
    }

    // --- Rendering --------------------------------------------------------

    _buildBody() {
      const wrap = el('div', 'barrier-criticality');
      if (!this._hasRows()) {
        wrap.appendChild(el('p', 'summary-empty', 'No barriers yet.'));
        return wrap;
      }

      const heading = el('div', 'summary-print-heading');
      heading.appendChild(el('h2', null, `${this.model.name} — Barrier Criticality`));
      heading.appendChild(el('p', null, new Date().toLocaleDateString()));
      wrap.appendChild(heading);
      wrap.appendChild(el('p', 'summary-intro',
        'Every barrier in the library, ranked by what the analysis is leaning on: anything that is '
        + 'the sole protection on a path first, then whatever carries the most paths, reaches the '
        + 'most pages, and takes the most demand. One row per barrier, however many pages it is '
        + 'placed on.'
        + (this._quantitative() ? '' : ' Demand rate needs Quantitative mode.')));

      const rows = this._rows();
      const table = el('table', 'summary-table barrier-criticality-table');
      table.appendChild(this._buildHead());
      const tbody = document.createElement('tbody');
      rows.forEach((row) => tbody.appendChild(this._buildRow(row)));
      table.appendChild(tbody);
      const tableWrap = el('div', 'summary-table-wrap');
      tableWrap.appendChild(table);
      wrap.appendChild(tableWrap);

      const sole = rows.filter((row) => row.soleOnPaths.length > 0).length;
      // Stated plainly under the table rather than dressed up as a
      // warning: a sole-protection path is a finding, not a defect --
      // plenty of legitimate analyses have one (proposals/23).
      wrap.appendChild(el('p', 'summary-intro',
        sole === 0
          ? 'No barrier is the sole protection on any path.'
          : `${sole} barrier${sole === 1 ? ' is' : 's are'} the sole protection on at least one path.`));
      return wrap;
    }

    _buildHead() {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      const columns = ['#', 'Barrier', 'Side', 'Paths', 'Pages', 'Sole protection for'];
      if (this._quantitative()) columns.push('Demand');
      columns.push('Owner', 'Effectiveness', '');
      columns.forEach((label) => tr.appendChild(el('th', null, label)));
      thead.appendChild(tr);
      return thead;
    }

    _buildRow(row) {
      const tr = document.createElement('tr');
      tr.dataset.nodeId = row.nodeId;
      tr.dataset.rank = String(row.rank);
      tr.appendChild(el('td', 'summary-rank', String(row.rank)));

      const barrierCell = el('td', null);
      barrierCell.appendChild(el('span', 'summary-id', row.displayId));
      if (row.name && row.name !== row.displayId) {
        barrierCell.appendChild(el('span', 'summary-sub', row.name));
      }
      tr.appendChild(barrierCell);

      tr.appendChild(el('td', null, SIDE_LABELS[row.side]));
      tr.appendChild(el('td', 'barrier-criticality-count', String(row.pathCount)));
      tr.appendChild(el('td', 'barrier-criticality-count', String(row.pageCount)));
      tr.appendChild(this._soleCell(row));

      if (this._quantitative()) tr.appendChild(this._demandCell(row));

      tr.appendChild(el('td', null, row.owner || '—'));
      tr.appendChild(el('td', null, EFFECTIVENESS_LABELS[row.effectiveness] || '—'));
      tr.appendChild(this._warningCell(row));
      return tr;
    }

    // The origins whose line this barrier alone stands in the way of.
    // Named rather than counted: "PB_4 is the only thing between T_5 and
    // the top event" is the sentence a reader needs, and a bare "1"
    // would send them back to the diagram to find out which one.
    _soleCell(row) {
      if (row.soleOnPaths.length === 0) return el('td', null, '—');
      const td = el('td', 'barrier-criticality-sole', row.soleOnPaths.join(', '));
      td.title = 'No other barrier stands on these paths';
      return td;
    }

    _demandCell(row) {
      const td = el('td', null);
      if (!row.demandRate) {
        td.textContent = '—';
        return td;
      }
      const displayUnit = this.getDisplayUnit();
      td.textContent = `${rateNumber(row.demandRate, displayUnit)}${unitSuffix(displayUnit)}`;
      return td;
    }

    // Same one-cell treatment as the register: worst severity decides the
    // colour, every message is in the tooltip. A node placed on several
    // pages can carry one warning per placement, which is exactly the
    // reach this table is about.
    _warningCell(row) {
      const td = el('td', 'barrier-register-warning');
      if (row.warnings.length === 0) {
        td.textContent = '';
        return td;
      }
      const blocking = row.warnings.some((w) => w.severity !== 'advisory');
      const mark = el('span', blocking ? 'barrier-register-blocking' : 'barrier-register-advisory', '⚠');
      mark.title = row.warnings.map((w) => w.detail || w.message).join('\n');
      td.appendChild(mark);
      return td;
    }
  }

  Bowtie.BarrierCriticalityController = BarrierCriticalityController;
})(window.Bowtie = window.Bowtie || {});
