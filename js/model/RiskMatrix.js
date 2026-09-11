(function (Bowtie) {
  // Pure lookup/banding helpers over a RiskMatrixDefinition (see
  // quantitative_mode_proposal.md "Data model") -- no BowtieModel
  // dependency, so these are independently unit-testable and reusable by
  // both the matrix editor UI and BowtieModel's calculation pipeline.
  //
  // RiskMatrixDefinition shape:
  //   { id, name, source, authoringUnit,
  //     severityClasses:   [{ id, ordinal, label, description }],
  //     likelihoodClasses: [{ id, ordinal, label, description, minValue }],
  //     riskClasses:       [{ id, label, colour, description, reviewPeriod }],
  //     cells: riskClassId[likelihoodOrdinal][severityOrdinal] }
  //
  // Quantity shape (quantitative-mode fields): `{ value: decimalString } |
  // { unknown: true }` -- see "Data model" in the design doc.

  function classById(classes, id) {
    return classes.find((c) => c.id === id) || null;
  }

  function severityClass(matrix, severityClassId) {
    return severityClassId ? classById(matrix.severityClasses, severityClassId) : null;
  }

  function likelihoodClass(matrix, likelihoodClassId) {
    return likelihoodClassId ? classById(matrix.likelihoodClasses, likelihoodClassId) : null;
  }

  function riskClass(matrix, riskClassId) {
    return riskClassId ? classById(matrix.riskClasses, riskClassId) : null;
  }

  // Risk class = matrix.cells[likelihoodOrdinal][severityOrdinal], looked
  // up only when both axes are available -- null otherwise (no partial
  // lookup exists, per the design doc's "if either is unset, the risk
  // class simply isn't shown").
  function cellRiskClassId(matrix, likelihoodClassId, severityClassId) {
    const lc = likelihoodClass(matrix, likelihoodClassId);
    const sc = severityClass(matrix, severityClassId);
    if (!lc || !sc) return null;
    const row = matrix.cells[lc.ordinal];
    return (row && row[sc.ordinal]) || null;
  }

  // Bands a computed canonical-events/hour likelihood against the matrix's
  // likelihoodClasses. Band i's range is [minValue_i, minValue_{i-1}) by
  // construction (see "Band boundaries" in the design doc) -- the array is
  // stored most-frequent-first, so the first entry whose minValue the
  // value is >= is its band; the value can't be below the last (bottom)
  // band's minValue in a well-formed matrix (bottom band's minValue is the
  // floor, typically "0").
  //
  // `value` is a Bowtie.Rational (what the calculation pipeline produces --
  // see Rational.js) or a plain Decimal. The Rational path compares by
  // exact cross-multiplication rather than dividing first, so a likelihood
  // sitting exactly ON a band boundary -- which round-numbered LOPA inputs
  // routinely produce -- lands in the correct band instead of being nudged
  // across it by a rounding step.
  function bandForValue(matrix, value) {
    const sorted = matrix.likelihoodClasses; // already most-frequent-first per build validation
    const atLeast = (minValue) => (value instanceof Bowtie.Rational
      ? value.greaterThanOrEqualToDecimal(minValue)
      : value.greaterThanOrEqual(minValue));
    for (let i = 0; i < sorted.length; i += 1) {
      if (atLeast(Bowtie.Decimal.parse(sorted[i].minValue))) return sorted[i];
    }
    return sorted[sorted.length - 1] || null;
  }

  // Quantity -> Decimal, or null if unknown/absent. Never throws on a
  // malformed Quantity (treats it as absent) -- validation of user input
  // happens at the UI boundary, not here.
  function quantityToDecimal(quantity) {
    if (!quantity || quantity.unknown || quantity.value === undefined || quantity.value === null) return null;
    try {
      return Bowtie.Decimal.parse(quantity.value);
    } catch {
      return null;
    }
  }

  Bowtie.RiskMatrix = {
    severityClass,
    likelihoodClass,
    riskClass,
    cellRiskClassId,
    bandForValue,
    quantityToDecimal,
  };
})(window.Bowtie = window.Bowtie || {});
