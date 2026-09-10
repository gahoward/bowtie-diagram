(function (Bowtie) {
  // Extracted from BowtieModel (design review finding 06, phase 1) --
  // quantitative_mode_proposal.md's "Data model" / "Numeric precision
  // strategy" calculation pipeline, computed fresh on every call rather than
  // cached, which the design doc allows for ("cached for display, recomputed
  // on model change") but isn't required for correctness; every value here
  // is a Bowtie.Decimal/Rational, never a native Number, so no rounding
  // happens anywhere in the chain.
  //
  // Read-only: this class never mutates the model it's given. It holds onto
  // the model reference (rather than being a set of free functions) only
  // because every method here needs several of the model's own lookups
  // (causesForPage, getNode, riskMatrix, ...) -- there's no state of its
  // own to own.
  //
  // BowtieModel keeps computeTleLikelihood/computeConsequenceLikelihood/
  // getConsequenceRiskClass as its own public methods, unchanged in name
  // and signature, and just delegates to an instance of this class -- see
  // the file-header note in BowtieModel.js about why the public surface
  // can never move, only what sits behind it.
  class Quantitative {
    constructor(model) {
      this.model = model;
    }

    // Max, over every Cause on `pageId` with a KNOWN frequency, of
    // `frequency / product(known preventive barriers on that Cause's own
    // Line)` -- barriers marked Unknown are skipped from the product
    // entirely (conservative: an unknown barrier is credited with no risk
    // reduction). Causes marked Unknown are excluded from the max
    // (non-conservative) and counted in `excludedThreatCount`, which
    // callers must surface visibly rather than silently drop (see "Modes"
    // in the design doc). `includeBarriers: false` computes the INHERENT
    // likelihood (every barrier ignored) for the standard ALARP
    // before/after picture; the default (true) is the RESIDUAL likelihood.
    //
    // A barrier's riskReductionFactor is an RRF in the IEC 61511 sense --
    // >= 1, equal to 1/PFD, so SIL 1 is 10-100 -- and therefore DIVIDES the
    // frequency. `value` is a Bowtie.Rational rather than a Decimal so that
    // division never actually happens here: the frequency stays the
    // numerator, RRFs multiply into the denominator, and both the max below
    // and the risk-matrix banding compare by exact cross-multiplication.
    // See Rational.js for why that matters.
    computeTleLikelihood(pageId, { includeBarriers = true } = {}) {
      const model = this.model;
      let excludedThreatCount = 0;
      const contributions = [];
      model.causesForPage(pageId).forEach((cause) => {
        const node = model.getNode(cause.nodeId);
        const freq = Bowtie.RiskMatrix.quantityToDecimal(node.frequency);
        if (freq === null) {
          excludedThreatCount += 1;
          return;
        }
        let contribution = Bowtie.Rational.fromDecimal(freq);
        if (includeBarriers) {
          const line = model._lineFor(cause.id);
          line.stops.forEach((stopId) => {
            const barrier = model.preventativeBarriers.find((p) => p.id === stopId);
            if (!barrier) return;
            const rrf = Bowtie.RiskMatrix.quantityToDecimal(model.getNode(barrier.nodeId).riskReductionFactor);
            if (rrf === null) return; // Unknown barrier: skip entirely (conservative)
            contribution = contribution.divideBy(rrf);
          });
        }
        contributions.push(contribution);
      });
      // Design review finding 11: which of two threats' contributions get
      // combined into is a modeling choice, not a fixed fact -- `'max'`
      // (the original, still-default behaviour) picks the single largest
      // contributing threat; `'sum'` adds every known threat's own
      // contribution, the conventional LOPA treatment of independent
      // initiating events, which `'max'` can understate by up to a factor
      // of the threat count. Persisted per-document (BowtieModel.
      // tleAggregation / DocumentSerializer.js), not a session setting,
      // because it changes what the document's own numbers mean.
      const value = model.tleAggregation === 'sum'
        ? Bowtie.Rational.sum(contributions)
        : Bowtie.Rational.max(contributions);
      return { value, excludedThreatCount };
    }

    // One consequence's (Outcome's) likelihood = the TLE likelihood (on
    // that Outcome's own page) / product(known mitigative barriers on its
    // own Line) -- same Unknown-barrier skip rule, and the same RRF
    // convention, as the TLE side above. `excludedThreatCount` is inherited
    // from the TLE calculation, since a consequence's likelihood derives
    // from the exact same threat set.
    computeConsequenceLikelihood(outcomeId, { includeBarriers = true } = {}) {
      const model = this.model;
      const outcome = model.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) return { value: null, excludedThreatCount: 0 };
      const tle = this.computeTleLikelihood(outcome.pageId, { includeBarriers });
      if (tle.value === null) return { value: null, excludedThreatCount: tle.excludedThreatCount };
      let contribution = tle.value;
      if (includeBarriers) {
        const line = model._lineFor(outcomeId);
        line.stops.forEach((stopId) => {
          const barrier = model.mitigativeBarriers.find((m) => m.id === stopId);
          if (!barrier) return;
          const rrf = Bowtie.RiskMatrix.quantityToDecimal(model.getNode(barrier.nodeId).riskReductionFactor);
          if (rrf === null) return;
          contribution = contribution.divideBy(rrf);
        });
      }
      return { value: contribution, excludedThreatCount: tle.excludedThreatCount };
    }

    // Risk class for one consequence, mode-aware per quantitative_mode_
    // proposal.md: Qualitative mode uses the manually-picked
    // likelihoodClassId directly (no arithmetic at all); Quantitative mode
    // bands the COMPUTED likelihood against the active matrix instead.
    // Returns null whenever there's no active matrix, no severity picked,
    // or (Quantitative mode) every contributing threat was Unknown.
    getConsequenceRiskClass(outcomeId, opts = {}) {
      const model = this.model;
      if (!model.riskMatrix) return null;
      const outcome = model.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) return null;
      const node = model.getNode(outcome.nodeId);
      if (!node.severityClassId) return null;

      let likelihoodClassId = null;
      if (model.mode === 'qualitative') {
        likelihoodClassId = node.likelihoodClassId || null;
      } else if (model.mode === 'quantitative') {
        const computed = this.computeConsequenceLikelihood(outcomeId, opts);
        if (computed.value !== null) {
          likelihoodClassId = Bowtie.RiskMatrix.bandForValue(model.riskMatrix, computed.value).id;
        }
      }
      if (!likelihoodClassId) return null;
      return Bowtie.RiskMatrix.cellRiskClassId(model.riskMatrix, likelihoodClassId, node.severityClassId);
    }
  }

  Bowtie.Quantitative = Quantitative;
})(window.Bowtie = window.Bowtie || {});
