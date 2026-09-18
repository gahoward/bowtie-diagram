(function (Bowtie) {
  // Same display rule as the Risk Summary, CanvasView and the Properties
  // modal: canonical events/hour shown in the preferred display unit, 3
  // significant figures, never fed back into a calculation.
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
  const TYPE_LABELS = {
    hardware: 'Hardware', human: 'Human', active: 'Active', passive: 'Passive',
  };
  const EFFECTIVENESS_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

  // One row per barrier placement across every page. Ids rather than
  // labels (a spreadsheet filters on those), the measure split into its
  // kind and its value, and the demand rate as a bare number with its
  // unit in its own column -- the same shape rule the Risk Summary's
  // export follows.
  const EXPORT_COLUMNS = [
    'page', 'rank', 'id', 'name', 'side', 'type', 'owner', 'effectiveness',
    'measure', 'measure_value', 'demand_rate', 'demand_rate_unit', 'protects', 'warnings',
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function measureFor(protection) {
    if (!protection || protection.unknown) return null;
    return Bowtie.BarrierMeasures.list().find((m) => m.id === protection.measure) || null;
  }

  // View > "Barrier Register…": the barrier owner's counterpart to the
  // Risk Summary (proposals/09). Barriers carry more data than anything
  // else in the document -- type, owner, effectiveness, the protection
  // measure and its value, a computed demand rate, and up to two advisory
  // warnings -- and before this the only way to read it was to open every
  // barrier's Properties one at a time.
  //
  // Same shape as RiskSummaryController deliberately: an xwide modal, one
  // table per page in document order, live-refreshed on every model
  // change while open, and a pure renderer of
  // BowtieModel.computeBarrierRegister (all ranking and every figure live
  // there). Unlike the Risk Summary it works in every mode -- a barrier
  // has an owner and an effectiveness whether or not the document does
  // any arithmetic -- and simply drops the quantitative columns when
  // there are no figures to put in them.
  class BarrierRegisterController {
    constructor(model, button, getDisplayUnit) {
      this.model = model;
      this.button = button;
      this.getDisplayUnit = getDisplayUnit;
      this.modal = null;

      button.addEventListener('click', () => this._open());
      model.onChange(() => this._refresh());
    }

    _open() {
      const exportable = this._hasRows();
      this.modal = Bowtie.ModalView.openModal({
        title: 'Barrier Register',
        bodyEl: this._buildBody(),
        size: 'xwide',
        actions: [
          ...(exportable ? [
            { label: 'Copy as table', onClick: () => { this._copy(); return false; } },
            { label: 'Export CSV…', onClick: () => { this._exportCsv(); return false; } },
            { label: 'Print…', onClick: () => { this._print(); return false; } },
          ] : []),
          { label: 'Close', primary: true },
        ],
      });
    }

    _hasRows() {
      return this.model.preventativeBarriers.length + this.model.mitigativeBarriers.length > 0;
    }

    _quantitative() {
      return this.model.mode === 'quantitative';
    }

    // --- Export ----------------------------------------------------------

    _exportTable() {
      const displayUnit = this.getDisplayUnit();
      const unit = displayUnit === 'year' ? 'events/year' : 'events/hour';
      const rows = [];
      this.model.pages.forEach((page) => {
        this.model.computeBarrierRegister(page.id).forEach((row) => {
          const measure = measureFor(row.protection);
          const unknown = this._quantitative() && (!row.protection || row.protection.unknown);
          rows.push([
            page.name, row.rank, row.displayId, row.name, row.side,
            row.barrierType || '', row.owner || '', row.effectiveness || '',
            measure ? measure.id : (unknown ? 'unknown' : ''),
            measure ? row.protection.value : '',
            row.demandRate ? rateNumber(row.demandRate, displayUnit) : '',
            row.demandRate ? unit : '',
            row.protects.join(' '),
            row.warnings.map((w) => w.detail || w.message).join(' | '),
          ]);
        });
      });
      return { columns: EXPORT_COLUMNS, rows };
    }

    async _copy() {
      const ok = await Bowtie.TableExport.copyText(Bowtie.TableExport.toTsv(this._exportTable()));
      this._flashAction('Copy as table', ok ? 'Copied' : "Couldn't copy");
    }

    _exportCsv() {
      const name = Bowtie.ExportUtil.safeFileName(this.model.name, 'bowtie-diagram');
      Bowtie.ExportUtil.exportCsv(Bowtie.TableExport.toCsv(this._exportTable()), `${name} - barrier register.csv`);
    }

    _flashAction(label, message) {
      if (!this.modal) return;
      const btn = [...this.modal.dialog.querySelectorAll('.modal-actions button')]
        .find((b) => b.textContent === label);
      if (!btn) return;
      btn.textContent = message;
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 1500);
    }

    // The same print-the-tables-not-the-app treatment the Risk Summary
    // uses, through the shared `printing-summary` body class.
    _print() {
      const done = () => {
        document.body.classList.remove('printing-summary');
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      document.body.classList.add('printing-summary');
      window.print();
    }

    _refresh() {
      if (this.modal && document.body.contains(this.modal.overlay)) {
        this.modal.setBody(this._buildBody());
      }
    }

    // --- Rendering --------------------------------------------------------

    _buildBody() {
      const wrap = el('div', 'barrier-register');
      const model = this.model;
      if (!this._hasRows()) {
        wrap.appendChild(el('p', 'summary-empty', 'No barriers yet.'));
        return wrap;
      }

      const heading = el('div', 'summary-print-heading');
      heading.appendChild(el('h2', null, `${model.name} — Barrier Register`));
      heading.appendChild(el('p', null, new Date().toLocaleDateString()));
      wrap.appendChild(heading);
      wrap.appendChild(el('p', 'summary-intro',
        "Every barrier on each page, worst-first: anything warned about, then anything unknown about it, "
        + 'then the weakest assessed effectiveness, then whatever is holding back the most. "Protects" '
        + 'names the threats or consequences whose lines run through it.'
        + (this._quantitative() ? '' : ' Measure and demand rate need Quantitative mode.')));

      model.pages.forEach((page) => {
        const section = el('section', 'summary-page barrier-register-page');
        section.dataset.pageId = page.id;
        section.appendChild(el('h3', 'summary-page-title', page.name));
        const rows = model.computeBarrierRegister(page.id);
        if (rows.length === 0) {
          section.appendChild(el('p', 'summary-empty', 'No barriers on this page.'));
          wrap.appendChild(section);
          return;
        }
        const table = el('table', 'summary-table barrier-register-table');
        table.appendChild(this._buildHead());
        const tbody = document.createElement('tbody');
        rows.forEach((row) => tbody.appendChild(this._buildRow(row)));
        table.appendChild(tbody);
        const tableWrap = el('div', 'summary-table-wrap');
        tableWrap.appendChild(table);
        section.appendChild(tableWrap);
        wrap.appendChild(section);
      });
      return wrap;
    }

    _buildHead() {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      const columns = ['#', 'Barrier', 'Side', 'Type', 'Owner', 'Effectiveness'];
      if (this._quantitative()) columns.push('Measure', 'Demand');
      columns.push('Protects', '');
      columns.forEach((label) => tr.appendChild(el('th', null, label)));
      thead.appendChild(tr);
      return thead;
    }

    _buildRow(row) {
      const tr = document.createElement('tr');
      tr.dataset.placementId = row.placementId;
      tr.dataset.rank = String(row.rank);
      tr.appendChild(el('td', 'summary-rank', String(row.rank)));

      const barrierCell = el('td', null);
      barrierCell.appendChild(el('span', 'summary-id', row.displayId));
      if (row.name && row.name !== row.displayId) {
        barrierCell.appendChild(el('span', 'summary-sub', row.name));
      }
      tr.appendChild(barrierCell);

      tr.appendChild(el('td', null, SIDE_LABELS[row.side]));
      tr.appendChild(el('td', null, TYPE_LABELS[row.barrierType] || '—'));
      tr.appendChild(el('td', null, row.owner || '—'));
      tr.appendChild(el('td', null, EFFECTIVENESS_LABELS[row.effectiveness] || '—'));

      if (this._quantitative()) {
        tr.appendChild(this._measureCell(row));
        tr.appendChild(this._demandCell(row));
      }

      tr.appendChild(el('td', 'barrier-register-protects', row.protects.length > 0 ? row.protects.join(', ') : '—'));
      tr.appendChild(this._warningCell(row));
      return tr;
    }

    // The same short form the canvas puts under a barrier
    // (CanvasView._barrierInfoLines), with the normalised reading as the
    // hover title -- so the register and the diagram say the same thing
    // about the same barrier.
    _measureCell(row) {
      const td = el('td', null);
      const measure = measureFor(row.protection);
      if (!measure) {
        td.textContent = 'Unknown';
        td.className = 'barrier-register-unknown';
        return td;
      }
      const value = Bowtie.Decimal.parse(row.protection.value).toDisplayNumber(3);
      td.textContent = `${measure.short}: ${value}`;
      const defaults = {
        dangerousFraction: this.model.dangerousFraction,
        proofTestIntervalH: this.model.proofTestIntervalH,
      };
      const description = Bowtie.BarrierMeasures.describe(row.protection, defaults);
      if (description) td.title = description;
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

    // One cell whatever the count: the worst severity decides the colour,
    // and every message is in the tooltip. A row can carry both an orphan
    // warning and a measure warning, and three stacked glyphs would say
    // less than one that can be hovered.
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

  Bowtie.BarrierRegisterController = BarrierRegisterController;
})(window.Bowtie = window.Bowtie || {});
