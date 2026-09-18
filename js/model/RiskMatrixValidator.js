(function (Bowtie) {
  // Runtime counterpart to scripts/build-risk-matrix-presets.js's own
  // validateAndConvert -- same checks, ported so a user-supplied custom
  // risk matrix (Project Settings' "Import Risk Matrix...") gets exactly
  // the same scrutiny a bundled preset gets at build time, rather than a
  // second, driftable reimplementation. Returns { ok: true, matrix } (the
  // likelihoodClasses[].minValue fields converted to canonical events/hour,
  // same as every bundled preset already is) or { ok: false, error } --
  // never throws, so the caller can show the message inline rather than
  // catching an exception.
  function validateRiskMatrix(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a JSON object.' };
    if (!raw.id || !raw.name || !raw.cells) return { ok: false, error: 'Missing id/name/cells.' };
    if (!['hour', 'year', 'lifetime'].includes(raw.authoringUnit)) {
      return { ok: false, error: 'authoringUnit must be "hour", "year" or "lifetime".' };
    }
    // "lifetime" means the bands are probabilities per item life rather
    // than rates (MIL-STD-882E, proposals/10). The item life is the one
    // number such a standard doesn't supply, so the matrix has to state
    // its own assumption -- without it there is no way to reach canonical
    // events/hour, and silently picking one would bury the assumption.
    if (raw.authoringUnit === 'lifetime') {
      const exposure = Number(raw.authoringExposureHours);
      if (!Number.isFinite(exposure) || exposure <= 0) {
        return {
          ok: false,
          error: 'authoringUnit "lifetime" requires a positive authoringExposureHours '
            + '(the item life the probabilities are stated over, in hours).',
        };
      }
    }

    const severity = raw.severityClasses || [];
    const likelihood = raw.likelihoodClasses || [];
    const riskClasses = raw.riskClasses || [];
    const riskIds = new Set(riskClasses.map((r) => r.id));

    // A real matrix needs at least one of each axis -- without this, an
    // empty severityClasses/likelihoodClasses/riskClasses/cells (all
    // trivially "matching" at 0x0) would otherwise slip through every
    // check below as "valid" (this only matters once this validator is
    // exposed to arbitrary user-supplied import files, rather than only
    // hand-curated preset JSON under js/data/risk-matrices/).
    if (severity.length === 0 || likelihood.length === 0 || riskClasses.length === 0) {
      return { ok: false, error: 'Must have at least one severity class, likelihood class, and risk class.' };
    }

    // Ordinals contiguous from 0, one per class, no gaps or duplicates.
    const contiguousFromZero = (values, label, field) => {
      const sorted = values.slice().sort((a, b) => a - b);
      for (let idx = 0; idx < sorted.length; idx += 1) {
        if (sorted[idx] !== idx) {
          return `${label} ${field} must be contiguous from 0 (got ${JSON.stringify(sorted)}).`;
        }
      }
      return null;
    };
    const classGroups = [
      { label: 'severityClasses', classes: severity },
      { label: 'likelihoodClasses', classes: likelihood },
    ];
    for (let g = 0; g < classGroups.length; g += 1) {
      const { label, classes } = classGroups[g];
      const err = contiguousFromZero(classes.map((c) => c.ordinal), label, 'ordinals');
      if (err) return { ok: false, error: err };
    }

    // `rank` orders risk classes by severity, 0 = worst. All-or-nothing:
    // a partially ranked matrix is a mistake, not a default. See
    // withRiskClassRanks below for the back-fill an unranked matrix gets.
    const ranked = riskClasses.filter((r) => r.rank !== undefined && r.rank !== null);
    if (ranked.length > 0 && ranked.length !== riskClasses.length) {
      return { ok: false, error: 'riskClasses: either every class has a rank or none does.' };
    }
    if (ranked.length === riskClasses.length) {
      const err = contiguousFromZero(riskClasses.map((r) => r.rank), 'riskClasses', 'ranks');
      if (err) return { ok: false, error: err };
    }

    // likelihoodClasses must be sorted most-frequent-first (array order,
    // per quantitative_mode_proposal.md's "band boundaries" reasoning) --
    // each entry's own minValue strictly greater than the next, no
    // duplicates, so gaps/overlaps are structurally impossible.
    for (let i = 0; i < likelihood.length - 1; i += 1) {
      let a;
      let b;
      try {
        a = Bowtie.Decimal.parse(likelihood[i].minValue);
        b = Bowtie.Decimal.parse(likelihood[i + 1].minValue);
      } catch (err) {
        return { ok: false, error: `likelihoodClasses[${i}] or [${i + 1}]: ${err.message}` };
      }
      if (!a.greaterThan(b)) {
        return {
          ok: false,
          error: `likelihoodClasses must be sorted strictly most-frequent-first with no duplicate minValue (index ${i}).`,
        };
      }
    }

    // Every matrix cell must reference a real riskClasses id, and the grid
    // dimensions must exactly match the declared class counts.
    if (raw.cells.length !== likelihood.length) {
      return {
        ok: false,
        error: `cells has ${raw.cells.length} rows, expected ${likelihood.length} (one per likelihood class).`,
      };
    }
    for (let li = 0; li < raw.cells.length; li += 1) {
      const row = raw.cells[li];
      if (row.length !== severity.length) {
        return {
          ok: false,
          error: `cells[${li}] has ${row.length} columns, expected ${severity.length} (one per severity class).`,
        };
      }
      for (let si = 0; si < row.length; si += 1) {
        if (!riskIds.has(row[si])) {
          return { ok: false, error: `cells[${li}][${si}] = "${row[si]}" is not a known risk class id.` };
        }
      }
    }

    // Convert every minValue from the declared authoringUnit into
    // canonical events/hour -- the ONE shared conversion helper, so an
    // imported matrix can never drift out of step with the bundled
    // presets, the Properties/canvas displays, or threat/barrier entry.
    const convertedLikelihood = likelihood.map((cls) => {
      let parsed;
      try {
        parsed = Bowtie.Decimal.parse(cls.minValue);
      } catch {
        return cls; // already reported above if this were reachable; kept defensive
      }
      let canonical = parsed;
      if (raw.authoringUnit === 'year') canonical = Bowtie.convertHourYear(parsed, 'yearToHour');
      else if (raw.authoringUnit === 'lifetime') {
        canonical = Bowtie.convertLifetimeHour(parsed, 'lifetimeToHour', raw.authoringExposureHours);
      }
      return { ...cls, minValue: canonical.toDecimalString() };
    });

    return { ok: true, matrix: withRiskClassRanks({ ...raw, likelihoodClasses: convertedLikelihood }) };
  }

  // `rank` orders risk classes by severity, 0 = worst -- what the Risk
  // Summary ranks by and what the legend/chips display in. Distinct from
  // `ordinal` (higher = more severe/frequent) precisely because its
  // direction is the opposite, which is why it has its own name.
  //
  // A matrix that omits it gets rank = array index, so every matrix
  // authored or embedded in a document before this field existed keeps
  // exactly its current meaning: the bundled presets and
  // quantitative_mode_proposal.md have always listed risk classes
  // most-severe-first, and index order is what the ranking code used to
  // read directly. Idempotent, and safe on a null/odd matrix (returns it
  // untouched) since it runs on every load, not only on a validated
  // import.
  function withRiskClassRanks(matrix) {
    if (!matrix || !Array.isArray(matrix.riskClasses)) return matrix;
    if (matrix.riskClasses.every((r) => r.rank !== undefined && r.rank !== null)) return matrix;
    return { ...matrix, riskClasses: matrix.riskClasses.map((r, i) => ({ ...r, rank: i })) };
  }

  // Risk classes most-severe-first, whatever order the matrix lists them
  // in -- the one place the legend, the summary chips and any future
  // consumer get their display order from.
  function riskClassesByRank(matrix) {
    if (!matrix || !Array.isArray(matrix.riskClasses)) return [];
    return withRiskClassRanks(matrix).riskClasses.slice().sort((a, b) => a.rank - b.rank);
  }

  // The mirror image of validateRiskMatrix's own conversion step, for
  // Project Settings' "Export Risk Matrix..." -- an embedded matrix's
  // likelihoodClasses[].minValue is always canonical events/hour, but its
  // `authoringUnit` field is preserved unchanged as display metadata (see
  // scripts/build-risk-matrix-presets.js), so naively re-exporting it as-is
  // would leave a "year"-authored matrix's minValues looking like raw
  // events/hour under a stale "year" label -- reimporting would then
  // convert them AGAIN, silently corrupting every band boundary. Always
  // converts fresh from the canonical stored value (Decimal.js's own
  // "repeated open/edit/save cycles can't compound rounding" rule), so
  // export -> hand-edit -> reimport round-trips safely no matter how many
  // times it's repeated.
  function denormalizeRiskMatrixForExport(matrix) {
    const likelihoodClasses = matrix.likelihoodClasses.map((cls) => {
      const canonical = Bowtie.Decimal.parse(cls.minValue);
      let authored = canonical;
      if (matrix.authoringUnit === 'year') authored = Bowtie.convertHourYear(canonical, 'hourToYear');
      else if (matrix.authoringUnit === 'lifetime') {
        authored = Bowtie.convertLifetimeHour(canonical, 'hourToLifetime', matrix.authoringExposureHours);
      }
      return { ...cls, minValue: authored.toDecimalString() };
    });
    return { ...matrix, likelihoodClasses };
  }

  Bowtie.validateRiskMatrix = validateRiskMatrix;
  Bowtie.denormalizeRiskMatrixForExport = denormalizeRiskMatrixForExport;
  Bowtie.withRiskClassRanks = withRiskClassRanks;
  Bowtie.riskClassesByRank = riskClassesByRank;
})(window.Bowtie = window.Bowtie || {});
