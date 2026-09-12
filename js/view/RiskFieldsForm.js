(function (Bowtie) {
  // Shared qualitative/quantitative field builder (quantitative_mode_
  // proposal.md "UI/UX", barrier-side reworked per barrier_measures_
  // proposal.md) -- appended into an existing modal body by both
  // ContextMenuController's rename modal and NodeLibraryController's
  // edit-in-place form, so the two don't duplicate this. Renders nothing
  // in Simple mode. Per node type:
  //   - Cause/Outcome: a likelihood-class dropdown in Qualitative mode
  //     only (Quantitative mode computes likelihood instead of picking it).
  //   - Outcome only: a severity-class dropdown in EITHER risk mode
  //     (severity is always a direct pick, never computed).
  //   - Cause only, Quantitative mode only: a frequency value-or-Unknown
  //     field (canonical events/hour).
  //   - Preventative/MitigativeBarrier, Quantitative mode only: a measure
  //     picker (BarrierMeasures.list()) plus that measure's own value-or-
  //     Unknown field and, for the rate-based measures, its extra
  //     parameters (rate unit, dangerous fraction override, and a test
  //     interval or MTTR where that measure needs one).
  // Returns a handle whose `readValues()` produces exactly the opts bag
  // `renameNode` expects for whichever fields were actually rendered.
  function buildRiskFieldsForm(model, node, container) {
    const { mode } = model;
    const matrix = model.riskMatrix;
    const handles = {};

    const makeSelect = (labelText, options, currentValue) => {
      const wrap = document.createElement('label');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      const select = document.createElement('select');
      const blankOpt = document.createElement('option');
      blankOpt.value = '';
      blankOpt.textContent = '(not set)';
      select.appendChild(blankOpt);
      options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.id;
        o.textContent = opt.label;
        select.appendChild(o);
      });
      select.value = currentValue || '';
      wrap.appendChild(span);
      wrap.appendChild(select);
      container.appendChild(wrap);
      return select;
    };

    // A Quantity is always a value-or-Unknown pair, never a blank input
    // box (quantitative_mode_proposal.md: "the input widget itself
    // defaults new fields to Unknown rather than empty, so nothing can be
    // omitted by accident, only by explicit choice"). `into`, if given,
    // appends into that element instead of `container` -- the barrier
    // form below builds its value field inside a rebuildable sub-panel.
    const makeQuantityField = (labelText, currentQuantity, into, opts = {}) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      wrap.appendChild(span);

      let input;
      if (opts.selectOptions) {
        input = document.createElement('select');
        opts.selectOptions.forEach((value) => {
          const o = document.createElement('option');
          o.value = value;
          o.textContent = value;
          input.appendChild(o);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'e.g. 1E-3';
      }

      const unknownRow = document.createElement('label');
      unknownRow.className = 'modal-checkbox-row';
      const unknownCheckbox = document.createElement('input');
      unknownCheckbox.type = 'checkbox';
      const unknownSpan = document.createElement('span');
      unknownSpan.textContent = 'Unknown';
      unknownRow.appendChild(unknownCheckbox);
      unknownRow.appendChild(unknownSpan);

      const hasValue = currentQuantity && currentQuantity.value !== undefined;
      unknownCheckbox.checked = !hasValue;
      if (input.tagName === 'SELECT') {
        if (hasValue) input.value = currentQuantity.value;
      } else {
        input.value = hasValue ? currentQuantity.value : '';
      }
      input.disabled = unknownCheckbox.checked;
      unknownCheckbox.addEventListener('change', () => { input.disabled = unknownCheckbox.checked; });

      wrap.appendChild(input);
      wrap.appendChild(unknownRow);
      (into || container).appendChild(wrap);
      return { input, unknownCheckbox };
    };

    // A plain optional text field (dangerous fraction / test interval /
    // MTTR overrides) -- not a Quantity: leaving it blank means "fall back
    // to the project default" (or, for MTTR, is simply required), not
    // "Unknown" in the barrier-skip sense.
    const makeOptionalTextField = (labelText, currentValue, into, placeholder) => {
      const wrap = document.createElement('label');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder || '';
      input.value = currentValue != null ? currentValue : '';
      wrap.appendChild(span);
      wrap.appendChild(input);
      into.appendChild(wrap);
      return input;
    };

    // Turns one Quantity field's current state into a storable Quantity, or
    // reports why it can't be stored. Without this, `Decimal.parse`'s own
    // warning came true: unparseable text was saved verbatim, and the
    // calculation then treated it as Unknown -- silently EXCLUDING that
    // threat from the top-event max while the field still showed what the
    // user typed. Bounds are enforced here too, at the only boundary where
    // there's a human to tell.
    const parseQuantityInput = (handle, { label, min, exclusiveMin, boundMessage }) => {
      if (handle.unknownCheckbox.checked) return { ok: true, quantity: { unknown: true } };
      const text = handle.input.value.trim();
      if (!text) return { ok: false, error: `${label} is empty — enter a value, or tick Unknown.` };
      let parsed;
      try {
        parsed = Bowtie.Decimal.parse(text);
      } catch {
        return { ok: false, error: `${label} must be a number — for example 1E-3 or 0.001.` };
      }
      const floor = Bowtie.Decimal.parse(min);
      const belowBound = exclusiveMin ? !parsed.greaterThan(floor) : parsed.lessThan(floor);
      if (belowBound) return { ok: false, error: boundMessage };
      return { ok: true, quantity: { value: text } };
    };

    if (mode === 'simple') return { readValues: () => ({ ok: true, values: {} }) };

    if (matrix && mode === 'qualitative' && (node.type === 'cause' || node.type === 'outcome')) {
      handles.likelihoodClassId = makeSelect(
        'Likelihood',
        matrix.likelihoodClasses.map((c) => ({ id: c.id, label: c.label })),
        node.likelihoodClassId,
      );
    }
    if (matrix && node.type === 'outcome') {
      handles.severityClassId = makeSelect(
        'Severity',
        matrix.severityClasses.map((c) => ({ id: c.id, label: c.label })),
        node.severityClassId,
      );
    }
    if (mode === 'quantitative' && node.type === 'cause') {
      handles.frequency = makeQuantityField('Frequency (events/hour)', node.frequency);
    }
    if (mode === 'quantitative' && (node.type === 'preventativeBarrier' || node.type === 'mitigativeBarrier')) {
      handles.protection = buildBarrierProtectionField(container, node.protection, makeQuantityField, makeOptionalTextField);
    }

    // Returns `{ ok: true, values }` for the caller to merge into its
    // renameNode opts, or `{ ok: false, error }` for it to show inline and
    // keep the dialog open.
    return {
      readValues() {
        const values = {};
        if (handles.likelihoodClassId) values.likelihoodClassId = handles.likelihoodClassId.value || null;
        if (handles.severityClassId) values.severityClassId = handles.severityClassId.value || null;
        if (handles.frequency) {
          const parsed = parseQuantityInput(handles.frequency, {
            label: 'Frequency',
            min: '0',
            exclusiveMin: true,
            boundMessage: 'Frequency must be greater than 0.',
          });
          if (!parsed.ok) return parsed;
          values.frequency = parsed.quantity;
        }
        if (handles.protection) {
          const read = handles.protection.readValue();
          if (!read.ok) return read;
          values.protection = read.quantity;
        }
        return { ok: true, values };
      },
    };
  }

  // The barrier-only "measure" picker + its own value-or-Unknown field and
  // (rate-based measures) extra parameters -- barrier_measures_
  // proposal.md's UI/UX section: "Selecting a measure swaps the field's
  // label, placeholder, unit suffix, and validation bounds -- all read
  // from the same registry row, so the form has no per-measure branching
  // of its own" (the branching that DOES exist below is only "which extra
  // fields does this measure need", read from the same row).
  function buildBarrierProtectionField(container, currentProtection, makeQuantityField, makeOptionalTextField) {
    const measures = Bowtie.BarrierMeasures.list();
    const measureById = Object.fromEntries(measures.map((m) => [m.id, m]));

    const wrap = document.createElement('div');
    wrap.className = 'modal-field barrier-protection-field';
    const span = document.createElement('span');
    span.textContent = 'Barrier measure';
    wrap.appendChild(span);

    const measureSelect = document.createElement('select');
    measures.forEach((m) => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label;
      measureSelect.appendChild(o);
    });
    const initialMeasureId = (currentProtection && !currentProtection.unknown && currentProtection.measure) || 'rrf';
    measureSelect.value = initialMeasureId;
    wrap.appendChild(measureSelect);

    const detail = document.createElement('div');
    detail.className = 'barrier-protection-detail';
    wrap.appendChild(detail);
    container.appendChild(wrap);

    let current = null; // filled in by renderDetail

    function renderDetail(measureId, protection) {
      detail.innerHTML = '';
      const row = measureById[measureId];
      const preserved = protection && !protection.unknown && protection.measure === measureId ? protection : null;

      const valueHandle = makeQuantityField(
        row.label, preserved, detail,
        row.uiValueKind === 'select' ? { selectOptions: row.uiOptions } : {},
      );

      let rateUnitSelect = null;
      let dangerousFractionInput = null;
      let testIntervalInput = null;
      let mttrInput = null;
      if (row.needsRateFields) {
        rateUnitSelect = document.createElement('label');
        rateUnitSelect.className = 'modal-field';
        const s = document.createElement('span');
        s.textContent = 'Rate unit';
        const select = document.createElement('select');
        Bowtie.BarrierMeasures.rateUnitOptions().forEach((u) => {
          const o = document.createElement('option');
          o.value = u.id;
          o.textContent = u.label;
          select.appendChild(o);
        });
        select.value = (preserved && preserved.rateUnit) || 'perHour';
        rateUnitSelect.appendChild(s);
        rateUnitSelect.appendChild(select);
        detail.appendChild(rateUnitSelect);
        rateUnitSelect = select;

        dangerousFractionInput = makeOptionalTextField(
          'Dangerous fraction (optional, 0–1 — defaults to the project setting)',
          preserved ? preserved.dangerousFraction : null,
          detail, 'project default',
        );

        if (row.needsTestInterval) {
          testIntervalInput = makeOptionalTextField(
            'Test interval, hours (optional — defaults to the project setting)',
            preserved ? preserved.testIntervalH : null,
            detail, 'project default',
          );
        }
        if (row.needsMttr) {
          mttrInput = makeOptionalTextField('MTTR, hours', preserved ? preserved.mttrH : null, detail);
        }
      }

      const disableExtras = () => {
        if (rateUnitSelect) rateUnitSelect.disabled = valueHandle.unknownCheckbox.checked;
        if (dangerousFractionInput) dangerousFractionInput.disabled = valueHandle.unknownCheckbox.checked;
        if (testIntervalInput) testIntervalInput.disabled = valueHandle.unknownCheckbox.checked;
        if (mttrInput) mttrInput.disabled = valueHandle.unknownCheckbox.checked;
      };
      valueHandle.unknownCheckbox.addEventListener('change', disableExtras);
      disableExtras();

      current = { row, valueHandle, rateUnitSelect, dangerousFractionInput, testIntervalInput, mttrInput };
    }

    renderDetail(initialMeasureId, currentProtection);
    // Switching measure starts that measure's own fields fresh (per
    // barrier_measures_proposal.md's registry design, each measure's
    // bounds/units are unrelated to any other's) rather than trying to
    // carry a value across a change of dimension.
    measureSelect.addEventListener('change', () => renderDetail(measureSelect.value, null));

    return {
      readValue() {
        if (current.valueHandle.unknownCheckbox.checked) return { ok: true, quantity: { unknown: true } };
        const text = current.valueHandle.input.value.trim();
        if (!text) {
          return { ok: false, error: `${current.row.label} is empty — enter a value, or tick Unknown.` };
        }
        const protection = { measure: measureSelect.value, value: text };
        if (current.rateUnitSelect) protection.rateUnit = current.rateUnitSelect.value;
        if (current.dangerousFractionInput && current.dangerousFractionInput.value.trim()) {
          protection.dangerousFraction = current.dangerousFractionInput.value.trim();
        }
        if (current.testIntervalInput && current.testIntervalInput.value.trim()) {
          protection.testIntervalH = current.testIntervalInput.value.trim();
        }
        if (current.mttrInput) protection.mttrH = current.mttrInput.value.trim();
        const check = Bowtie.BarrierMeasures.validate(protection);
        if (!check.ok) return { ok: false, error: check.error };
        return { ok: true, quantity: protection };
      },
    };
  }

  Bowtie.buildRiskFieldsForm = buildRiskFieldsForm;
})(window.Bowtie = window.Bowtie || {});
