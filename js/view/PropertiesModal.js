(function (Bowtie) {
  const TYPE_LABELS = {
    cause: 'Cause',
    outcome: 'Outcome',
    preventativeBarrier: 'Preventative Barrier',
    mitigativeBarrier: 'Mitigative Barrier',
    topLevelEvent: 'Top-Level Event',
    hazard: 'Hazard',
  };

  function makeSection(title) {
    const section = document.createElement('div');
    section.className = 'modal-section';
    const h = document.createElement('h3');
    h.className = 'modal-section-title';
    h.textContent = title;
    section.appendChild(h);
    return section;
  }

  function makeTextField(labelText, value, { multiline = false } = {}) {
    const wrap = document.createElement('label');
    wrap.className = 'modal-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value || '';
    wrap.appendChild(span);
    wrap.appendChild(input);
    return { wrap, input };
  }

  function makeComputedRow(label, valueText) {
    const row = document.createElement('div');
    row.className = 'modal-computed-row';
    const l = document.createElement('span');
    l.className = 'modal-computed-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'modal-computed-value';
    v.textContent = valueText;
    row.appendChild(l);
    row.appendChild(v);
    return row;
  }

  function makeRiskClassChip(riskClass) {
    const chip = document.createElement('span');
    chip.className = 'modal-risk-chip';
    const swatch = document.createElement('span');
    swatch.className = 'modal-risk-chip-swatch';
    swatch.style.background = riskClass.colour || '#888';
    const label = document.createElement('span');
    label.textContent = `${riskClass.id} — ${riskClass.label}`;
    chip.appendChild(swatch);
    chip.appendChild(label);
    return chip;
  }

  // Formats a canonical events/hour Decimal for read-only display, in
  // whichever unit the caller's Project Settings display-unit preference
  // says (a pure display choice -- see ProjectSettingsController -- never
  // fed back into a calculation, mirroring Decimal.toDisplayNumber's own
  // "only for on-screen display" rule).
  // `value` is the Bowtie.Rational the calculation produces (see
  // Rational.js) -- the one division in the whole pipeline happens inside
  // its toDisplayNumber, here. Converting to events/year scales the
  // numerator by an exact 8760 rather than going through convertHourYear,
  // so this direction costs no precision at all; only year -> hour ENTRY
  // is irreducibly lossy, since that one divides.
  function formatLikelihood(value, displayUnit) {
    if (value === null) return null;
    const perYear = displayUnit === 'year';
    const shown = perYear
      ? value.multiplyNumerator(Bowtie.Decimal.parse(String(Bowtie.HOURS_PER_YEAR)))
      : value;
    return `${shown.toDisplayNumber(3)} events/${perYear ? 'year' : 'hour'}`;
  }

  function appendExcludedNote(container, excludedThreatCount) {
    if (!excludedThreatCount) return;
    const note = document.createElement('p');
    note.className = 'modal-computed-note';
    note.textContent = `${excludedThreatCount} contributing cause(s) excluded (frequency Unknown) -- `
      + 'this figure is not the full picture.';
    container.appendChild(note);
  }

  // The Computed section for an Outcome: risk class chip (either risk
  // mode) plus, in Quantitative mode, the computed residual likelihood and
  // any excluded-threat note (quantitative_mode_proposal.md "Canvas
  // badges"/"Computed values are never stored").
  function buildOutcomeComputedSection(model, el, displayUnit) {
    if (model.mode === 'simple' || !model.riskMatrix) return null;
    const section = makeSection('Computed');
    let any = false;

    const riskClassId = model.getConsequenceRiskClass(el.id);
    if (riskClassId) {
      const riskClass = Bowtie.RiskMatrix.riskClass(model.riskMatrix, riskClassId);
      if (riskClass) {
        const row = document.createElement('div');
        row.className = 'modal-computed-row';
        const l = document.createElement('span');
        l.className = 'modal-computed-label';
        l.textContent = 'Risk class';
        row.appendChild(l);
        row.appendChild(makeRiskClassChip(riskClass));
        section.appendChild(row);
        any = true;
      }
    }

    if (model.mode === 'quantitative') {
      const residual = model.computeConsequenceLikelihood(el.id);
      const text = formatLikelihood(residual.value, displayUnit);
      if (text) {
        section.appendChild(makeComputedRow('Likelihood (residual)', text));
        appendExcludedNote(section, residual.excludedThreatCount);
        any = true;
      }
    }

    return any ? section : null;
  }

  // The Computed section for the TLE: the highest contributing cause's
  // frequency x its own known preventative barriers (BowtieModel.
  // computeTleLikelihoodForActivePage), residual and inherent (before any
  // barriers), Quantitative mode only -- Qualitative mode has no arithmetic
  // combination defined for causes at all (each is a direct class pick).
  function buildTleComputedSection(model, displayUnit) {
    if (model.mode !== 'quantitative') return null;
    const residual = model.computeTleLikelihoodForActivePage();
    const inherent = model.computeTleLikelihoodForActivePage({ includeBarriers: false });
    const residualText = formatLikelihood(residual.value, displayUnit);
    const inherentText = formatLikelihood(inherent.value, displayUnit);
    if (!residualText && !inherentText) return null;

    const section = makeSection('Computed');
    if (residualText) section.appendChild(makeComputedRow('Likelihood (residual, with barriers)', residualText));
    if (inherentText) section.appendChild(makeComputedRow('Likelihood (inherent, no barriers)', inherentText));
    appendExcludedNote(section, residual.excludedThreatCount);
    return section;
  }

  // Bowtie.openPropertiesModal({model, el, displayUnit}) -- the single
  // modal every node type (Cause/Outcome/Barrier/TLE/Hazard) opens on
  // double-click or the context menu's "Properties" item. Replaces the old
  // ad hoc rename-only modal: Identity (name/description, + identifier for
  // library nodes in custom-identifier mode), Risk Analysis (existing
  // RiskFieldsForm, library nodes only, non-Simple mode), and a read-only
  // Computed section wherever BowtieModel has something derived to show.
  function openPropertiesModal({ model, el, displayUnit = 'hour' }) {
    const isNode = ['cause', 'outcome', 'preventativeBarrier', 'mitigativeBarrier'].includes(el.type);
    const node = isNode ? model.getNode(el.nodeId) : null;
    const currentName = isNode ? node.name : el.name;
    const displayId = isNode ? model.displayIdentifierFor(node) : el.id;
    const typeLabel = TYPE_LABELS[el.type] || el.type;

    const body = document.createElement('div');

    const identitySection = makeSection('Identity');
    const nameField = makeTextField('Name', currentName);
    identitySection.appendChild(nameField.wrap);
    const descriptionField = makeTextField('Description', isNode ? node.description : el.description, { multiline: true });
    identitySection.appendChild(descriptionField.wrap);
    let identifierField = null;
    if (isNode && model.identifierDisplayMode === 'custom') {
      identifierField = makeTextField('Identifier', node.identifier);
      identitySection.appendChild(identifierField.wrap);
      const hint = document.createElement('p');
      hint.className = 'modal-field-hint';
      hint.textContent = `Internal id: ${node.id}`;
      identitySection.appendChild(hint);
    }
    body.appendChild(identitySection);

    let riskFields = null;
    if (isNode && model.mode !== 'simple') {
      const riskSection = makeSection('Risk Analysis');
      riskFields = Bowtie.buildRiskFieldsForm(model, node, riskSection);
      if (riskSection.childElementCount > 1) body.appendChild(riskSection); // more than just the title
    }

    let computedSection = null;
    if (el.type === 'outcome') computedSection = buildOutcomeComputedSection(model, el, displayUnit);
    else if (el.type === 'topLevelEvent') computedSection = buildTleComputedSection(model, displayUnit);
    if (computedSection) body.appendChild(computedSection);

    const errorP = document.createElement('p');
    errorP.className = 'modal-field-error';
    errorP.hidden = true;
    body.appendChild(errorP);

    Bowtie.ModalView.openModal({
      title: `${displayId} — ${typeLabel}`,
      bodyEl: body,
      size: 'wide',
      actions: [
        { label: 'Cancel' },
        {
          label: 'Save',
          primary: true,
          onClick: () => {
            const next = nameField.input.value.trim();
            if (!next) {
              errorP.textContent = 'Name is required.';
              errorP.hidden = false;
              return false;
            }
            // Risk fields validate themselves (RiskFieldsForm) -- a bad
            // frequency or an RRF below 1 keeps the dialog open with the
            // reason, rather than being stored and quietly changing the
            // calculation.
            let riskValues = {};
            if (riskFields) {
              const read = riskFields.readValues();
              if (!read.ok) {
                errorP.textContent = read.error;
                errorP.hidden = false;
                return false;
              }
              riskValues = read.values;
            }
            try {
              if (isNode) {
                model.renameNode(el.nodeId, {
                  name: next,
                  description: descriptionField.input.value.trim(),
                  ...(identifierField ? { identifier: identifierField.input.value.trim() } : {}),
                  ...riskValues,
                });
              } else {
                model.renameElement(el.id, next, descriptionField.input.value.trim());
              }
              return undefined;
            } catch (err) {
              errorP.textContent = err.message;
              errorP.hidden = false;
              return false;
            }
          },
        },
      ],
    });
  }

  Bowtie.openPropertiesModal = openPropertiesModal;
})(window.Bowtie = window.Bowtie || {});
