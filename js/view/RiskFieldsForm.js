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

    if (mode === 'simple') return { readValues: () => ({}) };

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
      handles.riskReductionFactor = makeQuantityField('Risk Reduction Factor (< 1)', node.riskReductionFactor);
    }

    return {
      readValues() {
        const result = {};
        if (handles.likelihoodClassId) result.likelihoodClassId = handles.likelihoodClassId.value || null;
        if (handles.severityClassId) result.severityClassId = handles.severityClassId.value || null;
        if (handles.frequency) {
          result.frequency = handles.frequency.unknownCheckbox.checked
            ? { unknown: true } : { value: handles.frequency.input.value.trim() };
        }
        if (handles.riskReductionFactor) {
          result.riskReductionFactor = handles.riskReductionFactor.unknownCheckbox.checked
            ? { unknown: true } : { value: handles.riskReductionFactor.input.value.trim() };
        }
        return result;
      },
    };
  }

  Bowtie.buildRiskFieldsForm = buildRiskFieldsForm;
})(window.Bowtie = window.Bowtie || {});
