(function (Bowtie) {
  // Shared qualitative/quantitative field builder (quantitative_mode_
  // proposal.md "UI/UX") -- appended into an existing modal body by both
  // ContextMenuController's rename modal and NodeLibraryController's
  // edit-in-place form, so the two don't duplicate this. Renders nothing
  // in Simple mode. Per node type:
  //   - Cause/Outcome: a likelihood-class dropdown in Qualitative mode
  //     only (Quantitative mode computes likelihood instead of picking it).
  //   - Outcome only: a severity-class dropdown in EITHER risk mode
  //     (severity is always a direct pick, never computed).
  //   - Cause only, Quantitative mode only: a frequency value-or-Unknown
  //     field (canonical events/hour).
  //   - Preventative/MitigativeBarrier, Quantitative mode only: a risk-
  //     reduction-factor value-or-Unknown field.
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
    // omitted by accident, only by explicit choice").
    const makeQuantityField = (labelText, currentQuantity) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-field';
      const span = document.createElement('span');
      span.textContent = labelText;
      wrap.appendChild(span);

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'e.g. 1E-3';

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
      input.value = hasValue ? currentQuantity.value : '';
      input.disabled = unknownCheckbox.checked;
      unknownCheckbox.addEventListener('change', () => { input.disabled = unknownCheckbox.checked; });

      wrap.appendChild(input);
      wrap.appendChild(unknownRow);
      container.appendChild(wrap);
      return { input, unknownCheckbox };
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
      // RRF in the IEC 61511 sense: >= 1, equal to 1/PFD, so a barrier
      // worth one order of magnitude is 10 and SIL 1 spans 10-100. It
      // DIVIDES the frequency (see BowtieModel.computeTleLikelihood).
      handles.riskReductionFactor = makeQuantityField(
        'Risk Reduction Factor (≥ 1, e.g. 10 = one order of magnitude)',
        node.riskReductionFactor,
      );
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
        if (handles.riskReductionFactor) {
          const parsed = parseQuantityInput(handles.riskReductionFactor, {
            label: 'Risk Reduction Factor',
            min: '1',
            exclusiveMin: false,
            boundMessage: 'Risk Reduction Factor must be 1 or greater. RRF is 1/PFD, so a barrier '
              + 'worth one order of magnitude is 10 — a value below 1 would increase the risk.',
          });
          if (!parsed.ok) return parsed;
          values.riskReductionFactor = parsed.quantity;
        }
        return { ok: true, values };
      },
    };
  }

  Bowtie.buildRiskFieldsForm = buildRiskFieldsForm;
})(window.Bowtie = window.Bowtie || {});
