(function (Bowtie) {
  // Extracted from BowtieModel (design review finding 06, phase 1) --
  // quantitative_mode_proposal.md's "Data model" / "Numeric precision
  // strategy" calculation pipeline, extended by barrier_measures_
  // proposal.md's measure-tagged barrier normalisation, computed fresh on
  // every call rather than cached, which the design doc allows for
  // ("cached for display, recomputed on model change") but isn't required
  // for correctness; every value here is a Bowtie.Decimal/Rational, never
  // a native Number, so no rounding happens anywhere in the chain.
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

    // The project-wide fallbacks a barrier's own protection can override
    // (dangerous fraction, standby proof-test interval) -- barrier_
    // measures_proposal.md's ProjectDefaults, persisted on the model like
    // tleAggregation (see BowtieModel.setQuantitativeDefaults).
    _defaults() {
      return {
        dangerousFraction: this.model.dangerousFraction,
        proofTestIntervalH: this.model.proofTestIntervalH,
      };
    }

    // Walks `stops` (a Line's own array -- see Line.js: index 0 is always
    // nearest that Line's ORIGIN, the last index always nearest the TLE)
    // in the physical direction a demand actually travels, applying each
    // known barrier found in `barrierCollection` via BarrierMeasures.apply
    // and skipping any stop that isn't one (a shared barrier of the other
    // kind, or one since deleted). `reverseOrder` is what
    // barrier_measures_proposal.md's fix actually is: a Cause's own Line
    // already stores stops cause-first, i.e. in the same direction demand
    // flows toward the TLE, so the preventative fold reads `stops` as-is;
    // an Outcome's Line stores stops OUTCOME-first (nearest the Outcome),
    // the opposite of how the TLE's likelihood actually propagates
    // outward through mitigative barriers toward it -- so the mitigative
    // fold must walk `stops` in reverse. This was harmless before `limit`
    // existed (multiplication is commutative; min() is not once mixed
    // with it) -- see barrier_measures_proposal.md "The consequence:
    // barrier order along a line starts to matter".
    //
    // `onBarrier(barrier, node, before, after)`, if given, fires for every
    // known barrier actually applied -- Warnings.js's two new advisory
    // checks are built on this, rather than re-deriving the fold a third
    // time.
    _foldBarriers(startValue, stops, barrierCollection, reverseOrder, onBarrier) {
      const ordered = reverseOrder ? [...stops].reverse() : stops;
      const defaults = this._defaults();
      let value = startValue;
      ordered.forEach((stopId) => {
        const barrier = barrierCollection.find((b) => b.id === stopId);
        if (!barrier) return;
        const node = this.model.getNode(barrier.nodeId);
        const before = value;
        value = Bowtie.BarrierMeasures.apply(value, node.protection, defaults);
        if (onBarrier) onBarrier(barrier, node, before, value);
      });
      return value;
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
    // A barrier's `protection` normalises to one of three composition
    // operations on the running Rational frequency -- see
    // BarrierMeasures.js. `value` is a Bowtie.Rational rather than a
    // Decimal so that no division is ever actually computed here: a
    // divide-op barrier (RRF) grows the denominator exactly, and both the
    // max below and the risk-matrix banding compare by exact cross-
    // multiplication. See Rational.js for why that matters.
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
          contribution = this._foldBarriers(contribution, line.stops, model.preventativeBarriers, false);
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
    // that Outcome's own page) folded through its own Line's known
    // mitigative barriers, TLE-first -- see `_foldBarriers` above for why
    // that's a REVERSE walk of `line.stops`. Same Unknown-barrier skip
    // rule, and the same measure normalisation, as the preventative side.
    // `excludedThreatCount` is inherited from the TLE calculation, since a
    // consequence's likelihood derives from the exact same threat set.
    computeConsequenceLikelihood(outcomeId, { includeBarriers = true } = {}) {
      const model = this.model;
      const outcome = model.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) return { value: null, excludedThreatCount: 0 };
      const tle = this.computeTleLikelihood(outcome.pageId, { includeBarriers });
      if (tle.value === null) return { value: null, excludedThreatCount: tle.excludedThreatCount };
      let contribution = tle.value;
      if (includeBarriers) {
        const line = model._lineFor(outcomeId);
        contribution = this._foldBarriers(contribution, line.stops, model.mitigativeBarriers, true);
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

    // The running frequency at the point a demand reaches `barrierId` on
    // one specific Line -- barrier_measures_proposal.md's UI ask ("the
    // demand rate at this barrier... the single number that decides low-
    // demand versus high-demand mode"). For a barrier shared by several
    // Lines, sums every Line's own incoming rate (the physically correct
    // aggregate for a shared barrier) rather than picking just one.
    // Returns null if no Line reaches this barrier with a known frequency
    // at all.
    computeDemandRateAt(barrierId) {
      const model = this.model;
      const rates = [];
      const collectSide = (placements, barrierCollection, reverseOrder) => {
        placements.forEach((placement) => {
          const line = model._lineFor(placement.id);
          if (!line.stops.includes(barrierId)) return;
          const node = model.getNode(placement.nodeId);
          let start;
          if (barrierCollection === model.preventativeBarriers) {
            const freq = Bowtie.RiskMatrix.quantityToDecimal(node.frequency);
            if (freq === null) return;
            start = Bowtie.Rational.fromDecimal(freq);
          } else {
            const tle = this.computeTleLikelihood(placement.pageId);
            if (tle.value === null) return;
            start = tle.value;
          }
          const ordered = reverseOrder ? [...line.stops].reverse() : line.stops;
          const idx = ordered.indexOf(barrierId);
          const upToBarrier = this._foldBarriers(start, ordered.slice(0, idx), barrierCollection, false);
          rates.push(upToBarrier);
        });
      };
      collectSide(model.causes, model.preventativeBarriers, false);
      collectSide(model.outcomes, model.mitigativeBarriers, true);
      return rates.length > 0 ? Bowtie.Rational.sum(rates) : null;
    }

    // Two advisory warnings barrier_measures_proposal.md asks for, built
    // on the exact same fold `computeTleLikelihood`/
    // `computeConsequenceLikelihood` use (via `_foldBarriers`) rather than
    // re-deriving it a third time:
    //
    //   - "PFH barrier is not limiting": a frequency-limiting barrier
    //     (PFH, or a running rate with no MTTR) whose own rate is >= the
    //     demand rate reaching it, so the clamp did nothing and the
    //     barrier is silently credited with zero risk reduction -- almost
    //     always the wrong mode or units off by orders of magnitude.
    //   - "Low-demand measure on a high-demand barrier": a PFD_avg/RRF/
    //     probability/unavailability/SIL/standby-or-repairable-rate
    //     barrier whose own incoming demand rate exceeds IEC 61511's own
    //     low/high-demand boundary, ~1/year.
    //
    // Both are computed, not stored, like every existing warning, and
    // both are advisory (Warnings.js's `severity`) -- export isn't
    // blocked on either, unlike the orphan checks.
    computeBarrierWarnings() {
      if (this.model.mode !== 'quantitative') return [];
      const model = this.model;
      const seen = new Set();
      const warnings = [];
      // IEC 61511's own low/high-demand boundary: a demand rate of
      // roughly one per year, converted to canonical events/hour through
      // the one sanctioned rounding point every hour<->year conversion
      // uses (see Decimal.js).
      const highDemandFloor = Bowtie.convertHourYear(Bowtie.Decimal.parse('1'), 'yearToHour');

      const check = (barrier, node, before, after) => {
        const key = `${barrier.id}:${node.protection && node.protection.measure}`;
        if (seen.has(key)) return;
        const page = model.getPage(barrier.pageId);
        if (Bowtie.BarrierMeasures.isLimiting(node.protection)) {
          if (after.compare(before) === 0) {
            seen.add(key);
            warnings.push({
              id: barrier.id, type: 'pfh-barrier-not-limiting', severity: 'advisory',
              pageId: page.id, pageName: page.name,
              message: `${node.id} (${node.name}) on page "${page.name}" has a frequency-limiting measure `
                + "whose own rate isn't below the demand reaching it, so it isn't reducing risk at all.",
            });
          }
        } else if (Bowtie.BarrierMeasures.isLowDemand(node.protection) && before.compareToDecimal(highDemandFloor) > 0) {
          seen.add(key);
          warnings.push({
            id: barrier.id, type: 'low-demand-measure-on-high-demand-barrier', severity: 'advisory',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" uses a low-demand measure, but the `
              + 'demand rate reaching it is above ~1/year (IEC 61511\'s low/high-demand boundary) -- consider PFH instead.',
          });
        }
      };

      model.causes.forEach((cause) => {
        const node = model.getNode(cause.nodeId);
        const freq = Bowtie.RiskMatrix.quantityToDecimal(node.frequency);
        if (freq === null) return;
        const line = model._lineFor(cause.id);
        this._foldBarriers(Bowtie.Rational.fromDecimal(freq), line.stops, model.preventativeBarriers, false, check);
      });
      model.outcomes.forEach((outcome) => {
        const tle = this.computeTleLikelihood(outcome.pageId);
        if (tle.value === null) return;
        const line = model._lineFor(outcome.id);
        this._foldBarriers(tle.value, line.stops, model.mitigativeBarriers, true, check);
      });
      return warnings;
    }
  }

  Bowtie.Quantitative = Quantitative;
})(window.Bowtie = window.Bowtie || {});
