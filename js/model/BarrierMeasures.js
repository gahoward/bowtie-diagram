(function (Bowtie) {
  // barrier_measures_proposal.md -- the measure-tagged replacement for
  // Node.riskReductionFactor (now Node.protection). A barrier's reliability
  // arrives in whichever of several standardised conventions an engineer's
  // source document actually uses (PFD_avg, PFH, raw probability,
  // unavailability, RRF, a SIL band, or a bare failure rate/MTBF with a
  // running/standby duty and an optional dangerous fraction) -- these are
  // NOT interchangeable by a unit conversion, so this module normalises
  // each to a canonical COMPOSITION OPERATION on the running Rational
  // frequency instead of to a canonical value:
  //
  //   attenuate: f_out = f_in x d   (Rational.multiplyNumerator -- exact)
  //   divide:    f_out = f_in / d   (Rational.divideBy -- exact)
  //   limit:     f_out = min(f_in, d) (Rational.clampTo -- exact)
  //
  // Pure and stateless, like Decimal.js/Rational.js/RiskMatrix.js: no DOM,
  // no BowtieModel dependency, independently unit-testable. `apply()` is
  // called only from `Quantitative._foldBarriers`; `list()`/`validate()`/
  // `rateUnitOptions()`/`describe()` are also read directly by
  // RiskFieldsForm.js (the measure picker + its bounds) and CanvasView.js
  // (the barrier's own hover title).
  //
  // No no-op state: `apply` returns the input Rational unchanged for
  // `{ unknown: true }` or `null`, the same conservative skip rule the
  // pipeline has always used for a barrier with nothing entered.

  const HALF = Bowtie.Decimal.parse('0.5');

  // IEC 61508 SIL bands (low-demand PFD_avg ranges). Worst-case (the
  // higher, less-safe end of the band) per barrier_measures_proposal.md's
  // resolved open question -- a midpoint would flatter the numbers, and
  // (unlike the endpoints) isn't representable exactly in decimal anyway
  // (it's a geometric mean of two adjacent decades, i.e. an irrational
  // multiple of sqrt(10)).
  const SIL_WORST_CASE_PFD = { 1: '1E-1', 2: '1E-2', 3: '1E-3', 4: '1E-4' };

  const RATE_UNITS = {
    perHour: { label: 'per hour (λ)' },
    perYear: { label: 'per year' },
    per1e6h: { label: 'per 10⁶ hours' },
    mtbfH: { label: 'MTBF, hours' },
    mtbfY: { label: 'MTBF, years' },
    mttfH: { label: 'MTTF, hours' },
    mttfY: { label: 'MTTF, years' },
  };

  // Every rate-based measure (running / running-repairable / standby)
  // shares the same raw-rate parsing: a value in one of RATE_UNITS, scaled
  // by a dangerous fraction (the barrier's own override, or the project
  // default), reduced to a single exact `lambda_D` -- a plain Decimal when
  // the unit was already a rate (per_hour/per_year/per_1e6h), or a Rational
  // df/MTBF_h when it was an MTBF/MTTF unit, since 1/MTBF generally doesn't
  // terminate in base 10 and there's no need to ever actually compute it:
  // every place lambda_D is used below (clampTo, multiplyNumerator) already
  // accepts a Rational operand, so the reciprocal simply never happens.
  function dangerousFractionOf(protection, defaults) {
    return Bowtie.Decimal.parse(
      protection.dangerousFraction != null ? protection.dangerousFraction : defaults.dangerousFraction,
    );
  }

  function lambdaDangerousOf(protection, defaults) {
    const raw = Bowtie.Decimal.parse(protection.value);
    const df = dangerousFractionOf(protection, defaults);
    switch (protection.rateUnit) {
      case 'perHour':
        return Bowtie.Rational.fromDecimal(raw.multiply(df));
      case 'perYear':
        // The one sanctioned rounding point (dividing by 8760) -- same
        // helper, same precision, as every other hour<->year conversion.
        return Bowtie.Rational.fromDecimal(Bowtie.convertHourYear(raw, 'yearToHour').multiply(df));
      case 'per1e6h':
        return Bowtie.Rational.fromDecimal(raw.multiply(Bowtie.Decimal.parse('1E-6')).multiply(df));
      case 'mtbfH':
      case 'mttfH':
        return new Bowtie.Rational(df, raw); // df / MTBF_h, exact, no reciprocal computed
      case 'mtbfY':
      case 'mttfY': {
        const hours = raw.multiply(Bowtie.Decimal.parse(String(Bowtie.HOURS_PER_YEAR))); // exact multiply
        return new Bowtie.Rational(df, hours);
      }
      default:
        throw new Error(`Unknown rate unit: ${protection.rateUnit}`);
    }
  }

  // Standby (periodically tested) unavailability: the low-demand
  // approximation PFD_avg = lambda_D x T / 2 -- exact under Rational (T/2
  // is always an exact decimal, since 10 = 2x5), unlike the textbook exact
  // form 1-(1-e^-lambda*T)/(lambda*T), which needs a transcendental and so
  // can't be represented without breaking this pipeline's no-floating-
  // point invariant. Valid in exactly the regime this measure is for --
  // low demand, lambda*T << 1 -- and `Warnings.js` flags the case it stops
  // being a good approximation.
  function standbyOperand(protection, defaults) {
    const testIntervalH = Bowtie.Decimal.parse(
      protection.testIntervalH != null ? protection.testIntervalH : defaults.proofTestIntervalH,
    );
    return lambdaDangerousOf(protection, defaults).multiplyNumerator(testIntervalH.multiply(HALF));
  }

  // Repairable running barrier: U = MTTR / (MTBF_D + MTTR), the steady-
  // state probability the barrier is down at the moment of a demand.
  // Rewritten to avoid ever computing MTBF_D = 1/lambda_D (which may not
  // terminate): let R = MTTR x lambda_D = a/b (a Rational); then
  // U = R/(1+R) = a/(a+b), exact, whatever R's own numerator/denominator
  // shape turned out to be (a plain rate or an MTBF-derived quotient).
  function repairableOperand(protection, defaults) {
    const mttrH = Bowtie.Decimal.parse(protection.mttrH);
    const r = lambdaDangerousOf(protection, defaults).multiplyNumerator(mttrH);
    return new Bowtie.Rational(r.numerator, r.numerator.add(r.denominator));
  }

  // `group` is UI-only: which <optgroup> a measure's own <option> sits in
  // (RiskFieldsForm.js) — the registry itself makes no arithmetic
  // distinction beyond `op` above. Splitting "probability" (a barrier's
  // reliability entered as a single dimensionless number, however that
  // number's own source convention names it) from "rate" (entered as a
  // raw failure rate + duty, which this module itself derives a
  // dimensionless-or-limiting operand FROM) is what actually separates
  // these nine rows into two families a user picks between.
  const MEASURES = {
    rrf: {
      label: 'Risk Reduction Factor (RRF, ≥ 1)',
      short: 'RRF', op: 'divide', dimension: 'dimensionless', group: 'probability',
      bounds: { min: '1', exclusiveMin: false },
      boundMessage: 'Risk Reduction Factor must be 1 or greater. RRF is 1/PFD, so a barrier worth one order of '
        + 'magnitude is 10 — a value below 1 would increase the risk.',
      toOperand: (p) => Bowtie.Decimal.parse(p.value),
    },
    pfdavg: {
      label: 'PFD_avg — average probability of failure on demand',
      short: 'PFD', op: 'attenuate', dimension: 'dimensionless', group: 'probability',
      bounds: { min: '0', exclusiveMin: true, max: '1', exclusiveMax: false },
      boundMessage: 'PFD_avg must be greater than 0 and no more than 1.',
      toOperand: (p) => Bowtie.Decimal.parse(p.value),
    },
    probability: {
      label: 'Raw probability of failure on demand (p)',
      short: 'p', op: 'attenuate', dimension: 'dimensionless', group: 'probability',
      bounds: { min: '0', exclusiveMin: true, max: '1', exclusiveMax: false },
      boundMessage: 'Probability must be greater than 0 and no more than 1.',
      toOperand: (p) => Bowtie.Decimal.parse(p.value),
    },
    unavailability: {
      label: 'Unavailability (U)',
      short: 'U', op: 'attenuate', dimension: 'dimensionless', group: 'probability',
      bounds: { min: '0', exclusiveMin: true, max: '1', exclusiveMax: false },
      boundMessage: 'Unavailability must be greater than 0 and no more than 1.',
      toOperand: (p) => Bowtie.Decimal.parse(p.value),
    },
    sil: {
      label: 'SIL band (low demand, worst case)',
      short: 'SIL', op: 'attenuate', dimension: 'sil', group: 'probability',
      bounds: { min: '1', max: '4', integer: true },
      boundMessage: 'SIL must be an integer from 1 to 4.',
      uiValueKind: 'select', uiOptions: ['1', '2', '3', '4'],
      toOperand: (p) => Bowtie.Decimal.parse(SIL_WORST_CASE_PFD[p.value]),
    },
    pfh: {
      label: 'PFH — probability of dangerous failure per hour',
      short: 'PFH', op: 'limit', dimension: 'perHour', group: 'rate',
      bounds: { min: '0', exclusiveMin: true },
      boundMessage: 'PFH must be greater than 0.',
      toOperand: (p) => Bowtie.Decimal.parse(p.value),
    },
    rateRunning: {
      label: 'Running / continuous — frequency-limiting',
      short: 'λₑ(run)', op: 'limit', dimension: 'rate', group: 'rate',
      bounds: { min: '0', exclusiveMin: true },
      boundMessage: 'Rate must be greater than 0.',
      needsRateFields: true,
      toOperand: (p, defaults) => lambdaDangerousOf(p, defaults),
    },
    rateRunningRepairable: {
      label: 'Running / continuous, repairable — with MTTR',
      short: 'λₑ(MTTR)', op: 'attenuate', dimension: 'rate', group: 'rate',
      bounds: { min: '0', exclusiveMin: true },
      boundMessage: 'Rate must be greater than 0.',
      needsRateFields: true,
      needsMttr: true,
      toOperand: (p, defaults) => repairableOperand(p, defaults),
    },
    rateStandby: {
      label: 'Standby / periodically tested — with test interval',
      short: 'λₑ(standby)', op: 'attenuate', dimension: 'rate', group: 'rate',
      bounds: { min: '0', exclusiveMin: true },
      boundMessage: 'Rate must be greater than 0.',
      needsRateFields: true,
      needsTestInterval: true,
      toOperand: (p, defaults) => standbyOperand(p, defaults),
    },
  };

  function list() {
    return Object.entries(MEASURES).map(([id, row]) => ({
      id, label: row.label, short: row.short, dimension: row.dimension, group: row.group,
      needsRateFields: !!row.needsRateFields, needsMttr: !!row.needsMttr, needsTestInterval: !!row.needsTestInterval,
      uiValueKind: row.uiValueKind || 'decimal', uiOptions: row.uiOptions || null,
    }));
  }

  function rateUnitOptions() {
    return Object.entries(RATE_UNITS).map(([id, u]) => ({ id, label: u.label }));
  }

  // Domain check for one protection value, mirroring the `{ ok, error }`
  // shape RiskFieldsForm's own parseQuantityInput already uses. Never
  // throws on a malformed row id (treated as invalid, not absent) --
  // that's a real validation failure, unlike RiskMatrix.quantityToDecimal's
  // "treat as unknown" rule for the plain Quantity type.
  function validate(protection) {
    if (!protection || protection.unknown) return { ok: true };
    const row = MEASURES[protection.measure];
    if (!row) return { ok: false, error: `Unknown barrier measure: ${protection.measure}` };
    let value;
    try {
      value = Bowtie.Decimal.parse(protection.value);
    } catch {
      return { ok: false, error: `${row.label} must be a number — for example 1E-3 or 0.001.` };
    }
    const { bounds } = row;
    const belowMin = bounds.min !== undefined && (bounds.exclusiveMin
      ? !value.greaterThan(Bowtie.Decimal.parse(bounds.min))
      : value.lessThan(Bowtie.Decimal.parse(bounds.min)));
    const aboveMax = bounds.max !== undefined && (bounds.exclusiveMax
      ? !value.lessThan(Bowtie.Decimal.parse(bounds.max))
      : value.greaterThan(Bowtie.Decimal.parse(bounds.max)));
    if (belowMin || aboveMax) return { ok: false, error: row.boundMessage };
    if (bounds.integer && !/^\d+$/.test(String(protection.value).trim())) {
      return { ok: false, error: row.boundMessage };
    }
    if (row.needsRateFields) {
      if (!RATE_UNITS[protection.rateUnit]) return { ok: false, error: 'Choose a rate unit.' };
      if (protection.dangerousFraction != null) {
        let df;
        try {
          df = Bowtie.Decimal.parse(protection.dangerousFraction);
        } catch {
          return { ok: false, error: 'Dangerous fraction must be a number.' };
        }
        if (df.lessThan(Bowtie.Decimal.parse('0')) || df.greaterThan(Bowtie.Decimal.parse('1'))) {
          return { ok: false, error: 'Dangerous fraction must be between 0 and 1.' };
        }
      }
      if (row.needsTestInterval && protection.testIntervalH != null) {
        try {
          if (!Bowtie.Decimal.parse(protection.testIntervalH).greaterThan(Bowtie.Decimal.parse('0'))) {
            return { ok: false, error: 'Test interval must be greater than 0.' };
          }
        } catch {
          return { ok: false, error: 'Test interval must be a number, in hours.' };
        }
      }
      if (row.needsMttr) {
        let mttr;
        try {
          mttr = Bowtie.Decimal.parse(protection.mttrH);
        } catch {
          return { ok: false, error: 'MTTR must be a number, in hours.' };
        }
        if (!mttr.greaterThan(Bowtie.Decimal.parse('0'))) return { ok: false, error: 'MTTR must be greater than 0.' };
      }
    }
    return { ok: true };
  }

  // The one call `Quantitative` makes, replacing the old inline
  // `divideBy`. Returns `rational` unchanged for `{ unknown: true }` or
  // `null` -- the existing conservative skip rule.
  function apply(rational, protection, defaults) {
    if (!protection || protection.unknown) return rational;
    const row = MEASURES[protection.measure];
    if (!row) return rational;
    const operand = row.toOperand(protection, defaults);
    switch (row.op) {
      case 'divide': return rational.divideBy(operand);
      case 'limit': return rational.clampTo(operand);
      case 'attenuate':
      default:
        return operand instanceof Bowtie.Rational
          ? rational.multiplyNumerator(operand.numerator).divideBy(operand.denominator)
          : rational.multiplyNumerator(operand);
    }
  }

  // Whether this measure's op is the frequency-limiting `min()` rule
  // (PFH, running-without-MTTR) -- Warnings.js uses this to flag a limit
  // that never actually limited anything (lambda >= f_in).
  function isLimiting(protection) {
    const row = protection && !protection.unknown && MEASURES[protection.measure];
    return !!row && row.op === 'limit';
  }

  // A one-line human description of what a barrier's entered value
  // normalises to -- barrier_measures_proposal.md's "live normalised
  // readout... so the conversion is visible rather than hidden". Display
  // only (uses toDisplayNumber, never fed back into a calculation) --
  // CanvasView shows this in the barrier's own hover title.
  function describe(protection, defaults) {
    if (!protection || protection.unknown) return null;
    const row = MEASURES[protection.measure];
    if (!row) return null;
    const operand = row.toOperand(protection, defaults);
    const shown = operand.toDisplayNumber(3);
    if (row.op === 'divide') return `${row.label} — equivalent PFD: ${(1 / shown).toPrecision(3)}`;
    if (row.op === 'limit') return `${row.label} — limiting rate: ${shown}/hr`;
    return `${row.label} — equivalent PFD: ${shown}`;
  }

  // Whether this measure assumes low-demand operation (everything except
  // PFH and the frequency-limiting running-rate form) -- Warnings.js uses
  // this to flag one applied where the local demand rate exceeds IEC
  // 61511's own low/high-demand boundary (~1/year).
  function isLowDemand(protection) {
    const row = protection && !protection.unknown && MEASURES[protection.measure];
    return !!row && row.op !== 'limit';
  }

  Bowtie.BarrierMeasures = {
    list, validate, apply, isLimiting, isLowDemand, rateUnitOptions, describe,
  };
})(window.Bowtie = window.Bowtie || {});
