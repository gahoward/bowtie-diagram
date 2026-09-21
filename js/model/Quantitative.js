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
  // (threatsForPage, getNode, riskMatrix, ...) -- there's no state of its
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
    // barrier_measures_proposal.md's fix actually is: a Threat's own Line
    // already stores stops threat-first, i.e. in the same direction demand
    // flows toward the TLE, so the preventative fold reads `stops` as-is;
    // an Consequence's Line stores stops CONSEQUENCE-first (nearest the Consequence),
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
        const degradation = this._degradationsFor(barrier.id);
        value = Bowtie.BarrierMeasures.apply(value, node.protection, defaults, degradation);
        if (onBarrier) {
          // `undegraded` lets a caller report claimed vs effective
          // without re-deriving the degradation (proposals/21). Computed
          // only when there IS one, so the ordinary path pays nothing.
          const undegraded = degradation && degradation.length > 0
            ? Bowtie.BarrierMeasures.apply(before, node.protection, defaults)
            : value;
          onBarrier(barrier, node, before, value, { degradation, undegraded });
        }
      });
      return value;
    }

    // The degradations of every UNCONTROLLED escalation factor anchored
    // to this barrier placement (proposals/21), or null when there are
    // none -- which is the overwhelmingly common case, so it short-
    // circuits before touching the escalation arrays at all.
    _degradationsFor(barrierId) {
      const { model } = this;
      if (model.escalationFactors.length === 0) return null;
      const factors = model.escalationFactorsFor(barrierId);
      if (factors.length === 0) return null;
      const degradations = factors
        .filter((f) => model.isEscalationFactorUncontrolled(f))
        .map((f) => model.getNode(f.nodeId).degradation)
        .filter(Boolean);
      return degradations.length > 0 ? degradations : null;
    }

    // `{ describe, factors, effect }` for a barrier whose uncontrolled
    // escalation factors carry a stated degradation, or null. `describe`
    // is the short form the register column shows; `effect` is
    // BarrierMeasures.describe's claimed-and-effective line, which the
    // canvas hover title and the register's Measure tooltip both show.
    // One producer, so no two surfaces can word the same degradation
    // differently.
    degradationSummaryFor(barrierId) {
      const degradations = this._degradationsFor(barrierId);
      if (!degradations || !Bowtie.BarrierMeasures.hasEffect(degradations)) return null;
      const { factor, floor } = Bowtie.BarrierMeasures.composeDegradations(degradations);
      const parts = [];
      if (factor) parts.push(`×${factor.toDisplayNumber(3)} worse`);
      if (floor) parts.push('claim capped');
      const placement = this.model.findById(barrierId);
      const node = placement ? this.model.getNode(placement.nodeId) : null;
      // A barrier marked Unknown is skipped by the fold entirely, so its
      // factors are degrading nothing. Reporting a cost here would have
      // the register (and the diagram) claim an effect the arithmetic
      // does not have.
      if (!node || !node.protection || node.protection.unknown) return null;
      return {
        describe: parts.join(', '),
        factors: degradations.length,
        effect: Bowtie.BarrierMeasures.describe(node.protection, this._defaults(), degradations),
      };
    }

    // Max, over every Threat on `pageId` with a KNOWN frequency, of
    // `frequency / product(known preventive barriers on that Threat's own
    // Line)` -- barriers marked Unknown are skipped from the product
    // entirely (conservative: an unknown barrier is credited with no risk
    // reduction). Threats marked Unknown are excluded from the max
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
      return this._tleLikelihood(pageId, includeBarriers, { memo: new Map(), depth: 0 });
    }

    // `ctx` carries a per-CALL memo and the current link depth
    // (proposals/22). The memo matters because a page reached through
    // several links -- two analyses escalating from the same
    // consequence, or a Risk Summary walking every page -- would
    // otherwise recompute the whole root chain once per visit. It is
    // deliberately per call rather than held on the instance: every
    // figure here is derived from live model state, and a cache that
    // outlived one call would be a staleness bug waiting to happen.
    _tleLikelihood(pageId, includeBarriers, ctx) {
      const key = `${pageId}|${includeBarriers}`;
      if (ctx.memo.has(key)) return ctx.memo.get(key);
      const result = this._computeTleLikelihood(pageId, includeBarriers, ctx);
      ctx.memo.set(key, result);
      return result;
    }

    _computeTleLikelihood(pageId, includeBarriers, ctx) {
      const model = this.model;
      let excludedThreatCount = 0;
      const contributions = [];
      // What this page's top event inherits from another page's
      // consequence (proposals/22). One more contribution, combined by
      // the same `tleAggregation` policy as the page's own threats: an
      // escalated event usually has other causes too, and treating the
      // link as special would make a derived page behave differently
      // from every other page in the same document.
      let excludedLink = false;
      const derived = model.getPage(pageId) && model.getPage(pageId).derivedFrom;
      if (derived) {
        // Defence in depth, not the main defence. Cycles are refused at
        // creation and again by DocumentSerializer.validate, so reaching
        // this means a file got in by some route neither covers. Return
        // "unknown" rather than a number: a wrong figure that looks
        // computed is worse than an absent one, and a stack overflow is
        // worse than both.
        if (ctx.depth > model.pages.length) {
          return { value: null, excludedThreatCount: 0, excludedLink: true };
        }
        const source = this._consequenceLikelihood(
          derived.consequenceId, includeBarriers, { memo: ctx.memo, depth: ctx.depth + 1 },
        );
        if (source.value === null) excludedLink = true;
        else contributions.push(source.value);
      }
      model.threatsForPage(pageId).forEach((threat) => {
        const node = model.getNode(threat.nodeId);
        const freq = Bowtie.RiskMatrix.quantityToDecimal(node.frequency);
        if (freq === null) {
          excludedThreatCount += 1;
          return;
        }
        let contribution = Bowtie.Rational.fromDecimal(freq);
        if (includeBarriers) {
          const line = model._lineFor(threat.id);
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
      // `excludedLink` is the cross-page counterpart of
      // `excludedThreatCount`, and exists for the same reason: a derived
      // page whose source is Unknown would otherwise report a figure
      // computed from its own threats alone, which is LESS conservative
      // than the truth and looks complete. Callers surface it.
      return { value, excludedThreatCount, excludedLink };
    }

    // One consequence's (Consequence's) likelihood = the TLE likelihood (on
    // that Consequence's own page) folded through its own Line's known
    // mitigative barriers, TLE-first -- see `_foldBarriers` above for why
    // that's a REVERSE walk of `line.stops`. Same Unknown-barrier skip
    // rule, and the same measure normalisation, as the preventative side.
    // `excludedThreatCount` is inherited from the TLE calculation, since a
    // consequence's likelihood derives from the exact same threat set.
    computeConsequenceLikelihood(consequenceId, { includeBarriers = true } = {}) {
      return this._consequenceLikelihood(consequenceId, includeBarriers, { memo: new Map(), depth: 0 });
    }

    _consequenceLikelihood(consequenceId, includeBarriers, ctx) {
      const model = this.model;
      const consequence = model.consequences.find((o) => o.id === consequenceId);
      if (!consequence) return { value: null, excludedThreatCount: 0, excludedLink: false };
      const tle = this._tleLikelihood(consequence.pageId, includeBarriers, ctx);
      if (tle.value === null) {
        return {
          value: null,
          excludedThreatCount: tle.excludedThreatCount,
          excludedLink: tle.excludedLink,
        };
      }
      let contribution = tle.value;
      if (includeBarriers) {
        const line = model._lineFor(consequenceId);
        contribution = this._foldBarriers(contribution, line.stops, model.mitigativeBarriers, true);
      }
      return {
        value: contribution,
        excludedThreatCount: tle.excludedThreatCount,
        excludedLink: tle.excludedLink,
      };
    }

    // Risk class for one consequence, mode-aware per quantitative_mode_
    // proposal.md: Qualitative mode uses the manually-picked
    // likelihoodClassId directly (no arithmetic at all); Quantitative mode
    // bands the COMPUTED likelihood against the active matrix instead.
    // Returns null whenever there's no active matrix, no severity picked,
    // or (Quantitative mode) every contributing threat was Unknown.
    getConsequenceRiskClass(consequenceId, opts = {}) {
      const model = this.model;
      if (!model.riskMatrix) return null;
      const consequence = model.consequences.find((o) => o.id === consequenceId);
      if (!consequence) return null;
      const node = model.getNode(consequence.nodeId);
      if (!node.severityClassId) return null;
      const likelihoodClassId = this._consequenceLikelihoodClassId(consequenceId, node, opts);
      if (!likelihoodClassId) return null;
      return Bowtie.RiskMatrix.cellRiskClassId(model.riskMatrix, likelihoodClassId, node.severityClassId);
    }

    // The likelihood-axis half of getConsequenceRiskClass, mode-aware the
    // same way (manual pick in Qualitative mode, banded computed value in
    // Quantitative mode). Note `opts` (includeBarriers) only means anything
    // in Quantitative mode -- a Qualitative pick has no barrier arithmetic
    // behind it to strip out, which is why assessConsequence below reports
    // no pre-mitigation picture at all in that mode rather than echoing the
    // manual pick twice.
    _consequenceLikelihoodClassId(consequenceId, node, opts) {
      const model = this.model;
      if (model.mode === 'qualitative') return node.likelihoodClassId || null;
      if (model.mode !== 'quantitative') return null;
      const computed = this.computeConsequenceLikelihood(consequenceId, opts);
      if (computed.value === null) return null;
      return Bowtie.RiskMatrix.bandForValue(model.riskMatrix, computed.value).id;
    }

    // One Consequence's full before/after picture -- quantitative_mode_
    // proposal.md's "computed twice, inherent and residual" ALARP pair,
    // resolved to matrix classes:
    //
    //   { severity, post: Assessment, pre: Assessment | null }
    //   Assessment = { likelihood: { value, excludedThreatCount } | null,
    //                  likelihoodClass, riskClass }
    //
    // `post` is the residual picture every existing badge already shows
    // (with barriers). `pre` is the same calculation with every barrier
    // removed (`includeBarriers: false` all the way down) -- Quantitative
    // mode only; in Qualitative mode there is no calculation to remove
    // barriers from, so `pre` is null and callers show nothing for it.
    // Every class is the resolved matrix object (or null), so callers
    // never need a second lookup. Returns null outside the two risk modes
    // or without an active matrix, matching getConsequenceRiskClass.
    assessConsequence(consequenceId) {
      const model = this.model;
      if (model.mode === 'simple' || !model.riskMatrix) return null;
      const consequence = model.consequences.find((o) => o.id === consequenceId);
      if (!consequence) return null;
      const node = model.getNode(consequence.nodeId);
      const matrix = model.riskMatrix;
      const severity = Bowtie.RiskMatrix.severityClass(matrix, node.severityClassId);

      const assess = (includeBarriers) => {
        const likelihood = model.mode === 'quantitative'
          ? this.computeConsequenceLikelihood(consequenceId, { includeBarriers })
          : null;
        const likelihoodClassId = this._consequenceLikelihoodClassId(consequenceId, node, { includeBarriers });
        const riskClassId = severity && likelihoodClassId
          ? Bowtie.RiskMatrix.cellRiskClassId(matrix, likelihoodClassId, severity.id)
          : null;
        return {
          likelihood: likelihood && likelihood.value !== null ? likelihood : null,
          likelihoodClass: Bowtie.RiskMatrix.likelihoodClass(matrix, likelihoodClassId),
          riskClass: Bowtie.RiskMatrix.riskClass(matrix, riskClassId),
        };
      };

      return {
        severity,
        post: assess(true),
        pre: model.mode === 'quantitative' ? assess(false) : null,
      };
    }

    // Every Consequence placement on `pageId` (or, with no pageId, in the whole
    // document), each with its assessConsequence picture, ranked worst-
    // first with `rank` numbered 1..n over the returned set. Rows carry
    // the display id/name/page a table needs so the summary UI stays a
    // pure renderer of this -- RiskSummaryController calls it once per
    // page, in document page order, for its page-by-page tables. Same
    // null-return rule as assessConsequence.
    //
    // Ranking (each key a tie-break for the one before it):
    //   1. post-mitigation risk class -- the residual risk is what's
    //      actually being carried today, so it leads;
    //   2. pre-mitigation risk class -- of two consequences carrying the same
    //      residual class, the one relying on more barrier credit to get
    //      there is the more fragile;
    //   3. severity (worst first); 4. post-mitigation likelihood (highest
    //   first); 5. display id, so the order is stable.
    // Risk classes rank by their own `rank` field (0 = worst; see
    // RiskMatrixValidator.withRiskClassRanks, which back-fills it from
    // array order for a matrix authored before the field existed). An
    // consequence whose class can't be determined yet sorts after every one
    // whose class can.
    computeRiskSummary(pageId = null) {
      const model = this.model;
      if (model.mode === 'simple' || !model.riskMatrix) return null;
      const consequences = pageId === null ? model.consequences : model.consequencesForPage(pageId);
      const riskRank = (riskClass) => {
        if (!riskClass || riskClass.rank === undefined || riskClass.rank === null) return Infinity;
        return riskClass.rank;
      };
      const severityRank = (severity) => (severity ? -severity.ordinal : Infinity);
      // Plain subtraction is NaN for two equal infinities (an "undetermined"
      // rank on both sides), which would silently read as "equal" only by
      // accident of NaN being falsy -- made explicit instead.
      const compareRank = (a, b) => (a === b ? 0 : a - b);
      const compareLikelihood = (a, b) => {
        if (a.likelihood && b.likelihood) return b.likelihood.value.compare(a.likelihood.value);
        const ao = a.likelihoodClass ? a.likelihoodClass.ordinal : -Infinity;
        const bo = b.likelihoodClass ? b.likelihoodClass.ordinal : -Infinity;
        return compareRank(bo, ao);
      };

      const rows = consequences.map((consequence) => {
        const node = model.getNode(consequence.nodeId);
        const page = model.getPage(consequence.pageId);
        return {
          consequenceId: consequence.id,
          nodeId: node.id,
          displayId: model.displayIdentifierFor(node),
          name: node.name,
          pageId: page.id,
          pageName: page.name,
          ...this.assessConsequence(consequence.id),
        };
      });

      rows.sort((a, b) => {
        const byPost = compareRank(riskRank(a.post.riskClass), riskRank(b.post.riskClass));
        if (byPost) return byPost;
        const byPre = compareRank(riskRank(a.pre && a.pre.riskClass), riskRank(b.pre && b.pre.riskClass));
        if (byPre) return byPre;
        const bySeverity = compareRank(severityRank(a.severity), severityRank(b.severity));
        if (bySeverity) return bySeverity;
        const byLikelihood = compareLikelihood(a.post, b.post);
        if (byLikelihood) return byLikelihood;
        return a.displayId.localeCompare(b.displayId);
      });
      rows.forEach((row, i) => { row.rank = i + 1; });
      return rows;
    }

    // Every barrier placement as one row, worst-first (proposals/09).
    // The Risk Summary is the consequence owner's view; this is the barrier
    // owner's -- barriers carry more data than anything else in the
    // document (type, owner, effectiveness, the protection measure and
    // its value, a computed demand rate, and up to two advisory
    // warnings) and nothing gathered it before.
    //
    // Unlike computeRiskSummary this works in EVERY mode: a barrier has a
    // type, an owner and an effectiveness whether or not the document
    // does any arithmetic, and the register is exactly as useful for a
    // Simple diagram. The quantitative columns simply come back null and
    // the view drops them.
    computeBarrierRegister(pageId = null) {
      const model = this.model;
      const quantitative = model.mode === 'quantitative';
      const inScope = (placement) => pageId === null || placement.pageId === pageId;

      // Once per call, not once per row: getWarnings() walks the whole
      // document (and, in quantitative mode, folds every line) -- doing
      // that per barrier would make the register quadratic in the thing
      // it is summarising.
      const warningsById = new Map();
      model.getWarnings().forEach((warning) => {
        if (!warningsById.has(warning.id)) warningsById.set(warning.id, []);
        warningsById.get(warning.id).push(warning);
      });

      // Which threats (preventative) or consequences (mitigative) this barrier
      // actually stands in the way of, by the display ids a user reads on
      // the canvas rather than the internal placement ids.
      const protectedOrigins = (barrierId) => model.linesThrough(barrierId)
        .map((line) => {
          const origin = model.findById(line.originId);
          return origin ? model.displayIdentifierFor(model.getNode(origin.nodeId)) : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      const build = (placement, side) => {
        const node = model.getNode(placement.nodeId);
        const page = model.getPage(placement.pageId);
        const warnings = warningsById.get(placement.id) || [];
        return {
          placementId: placement.id,
          nodeId: node.id,
          displayId: model.displayIdentifierFor(node),
          name: node.name,
          side,
          pageId: page.id,
          pageName: page.name,
          barrierType: node.barrierType,
          owner: node.owner,
          effectiveness: node.effectiveness,
          protection: quantitative ? (node.protection || null) : null,
          // What the uncontrolled escalation factors on this barrier
          // actually cost it (proposals/21), or null when nothing
          // degrades it. This table exists to say which barriers need
          // attention, and a degraded barrier is the definition of one.
          degradation: quantitative ? this.degradationSummaryFor(placement.id) : null,
          demandRate: quantitative ? this.computeDemandRateAt(placement.id) : null,
          protects: protectedOrigins(placement.id),
          warnings,
        };
      };

      const rows = [
        ...model.preventativeBarriers.filter(inScope).map((p) => build(p, 'preventative')),
        ...model.mitigativeBarriers.filter(inScope).map((p) => build(p, 'mitigative')),
      ];

      // Worst first: something wrong with it, then something unknown
      // about it, then something weak about it, then whatever it is
      // holding back the most. A blocking warning outranks an advisory
      // one because it also stops the document being exported at all.
      const warningRank = (row) => {
        if (row.warnings.some((w) => w.severity !== 'advisory')) return 0;
        if (row.warnings.length > 0) return 1;
        return 2;
      };
      // Only meaningful where a measure is expected at all: in Simple and
      // Qualitative mode every row is equally "unknown", so this collapses
      // to a no-op rather than sorting by an absence.
      const unknownRank = (row) => {
        if (!quantitative) return 0;
        return (!row.protection || row.protection.unknown) ? 0 : 1;
      };
      // An unrecorded effectiveness sorts last, not first: "nobody has
      // said" is a gap in the register, but a barrier someone has
      // assessed as Low is a live weakness, and the point of the order is
      // to put the weaknesses at the top.
      const EFFECTIVENESS_ORDER = { low: 0, medium: 1, high: 2 };
      const effectivenessRank = (row) => {
        const rank = EFFECTIVENESS_ORDER[row.effectiveness];
        return rank === undefined ? 3 : rank;
      };

      rows.sort((a, b) => {
        const byWarning = warningRank(a) - warningRank(b);
        if (byWarning) return byWarning;
        const byUnknown = unknownRank(a) - unknownRank(b);
        if (byUnknown) return byUnknown;
        const byEffectiveness = effectivenessRank(a) - effectivenessRank(b);
        if (byEffectiveness) return byEffectiveness;
        if (a.demandRate && b.demandRate) {
          const byDemand = b.demandRate.compare(a.demandRate); // busiest first
          if (byDemand) return byDemand;
        } else if (a.demandRate !== b.demandRate) {
          return a.demandRate ? -1 : 1; // a known rate outranks an unknown one
        }
        return a.displayId.localeCompare(b.displayId);
      });
      rows.forEach((row, i) => { row.rank = i + 1; });
      return rows;
    }

    // One row per library NODE, ranked by what the analysis is leaning
    // on (proposals/23). The Barrier Register answers "what is the state
    // of this barrier?"; this answers the other question a safety
    // engineer asks, which is about the analysis rather than any one
    // barrier: "which barriers is the whole thing resting on?"
    //
    // Per node, not per placement, and that is the entire difference: a
    // barrier placed on four pages is ONE barrier that four analyses
    // depend on, not four rows. Aggregating anywhere else -- in the view,
    // say -- would make the ranking a property of the table rather than
    // of the document.
    //
    // Like the register, this works in every mode. Path counts, page
    // counts and sole protection are structural facts about the diagram;
    // only the demand rate needs arithmetic, and it simply comes back
    // null when there is none.
    computeBarrierCriticality(pageId = null) {
      const model = this.model;
      const quantitative = model.mode === 'quantitative';
      const inScope = (placement) => pageId === null || placement.pageId === pageId;

      // Once per call, for the same reason computeBarrierRegister does
      // it: getWarnings() walks the whole document.
      const warningsById = new Map();
      model.getWarnings().forEach((warning) => {
        if (!warningsById.has(warning.id)) warningsById.set(warning.id, []);
        warningsById.get(warning.id).push(warning);
      });

      const originIdOf = (line) => {
        const origin = model.findById(line.originId);
        return origin ? model.displayIdentifierFor(model.getNode(origin.nodeId)) : null;
      };

      const groups = new Map();
      const collect = (placements, side) => {
        placements.filter(inScope).forEach((placement) => {
          if (!groups.has(placement.nodeId)) groups.set(placement.nodeId, { side, placements: [] });
          groups.get(placement.nodeId).placements.push(placement);
        });
      };
      collect(model.preventativeBarriers, 'preventative');
      collect(model.mitigativeBarriers, 'mitigative');

      const rows = [];
      groups.forEach(({ side, placements }, nodeId) => {
        const node = model.getNode(nodeId);
        const pages = new Set();
        const soleOnPaths = new Set();
        const warnings = [];
        const rates = [];
        let pathCount = 0;

        placements.forEach((placement) => {
          pages.add(placement.pageId);
          warnings.push(...(warningsById.get(placement.id) || []));
          model.linesThrough(placement.id).forEach((line) => {
            pathCount += 1;
            // The finding this table exists for: a line whose only stop
            // is this barrier has no second layer behind it. Visible
            // today only by looking at the picture and counting.
            if (line.stops.length === 1) {
              const originId = originIdOf(line);
              if (originId) soleOnPaths.add(originId);
            }
          });
          if (quantitative) {
            const rate = this.computeDemandRateAt(placement.id);
            if (rate) rates.push(rate);
          }
        });

        rows.push({
          nodeId,
          displayId: model.displayIdentifierFor(node),
          name: node.name,
          side,
          pathCount,
          pageCount: pages.size,
          soleOnPaths: [...soleOnPaths].sort((a, b) => a.localeCompare(b)),
          // Summed across placements, the same aggregate
          // computeDemandRateAt already forms across the Lines reaching
          // one placement -- a barrier standing in two places takes the
          // demand arriving at both.
          demandRate: rates.length > 0 ? Bowtie.Rational.sum(rates) : null,
          barrierType: node.barrierType,
          owner: node.owner,
          effectiveness: node.effectiveness,
          protection: quantitative ? (node.protection || null) : null,
          warnings,
        });
      });

      // Sole protection first, and within that whichever carries the
      // most paths; then simply the most paths, the widest page reach,
      // and the busiest. Deliberately NOT a single blended "criticality
      // score": one invented number would read as an assessment this
      // tool is not entitled to make, and the columns let the reader
      // weigh them (proposals/23, open question 4).
      rows.sort((a, b) => {
        const bySole = (b.soleOnPaths.length > 0) - (a.soleOnPaths.length > 0);
        if (bySole) return bySole;
        const byPaths = b.pathCount - a.pathCount;
        if (byPaths) return byPaths;
        const byPages = b.pageCount - a.pageCount;
        if (byPages) return byPages;
        if (a.demandRate && b.demandRate) {
          const byDemand = b.demandRate.compare(a.demandRate);
          if (byDemand) return byDemand;
        } else if (a.demandRate !== b.demandRate) {
          return a.demandRate ? -1 : 1;
        }
        return a.displayId.localeCompare(b.displayId);
      });
      rows.forEach((row, i) => { row.rank = i + 1; });
      return rows;
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
      collectSide(model.threats, model.preventativeBarriers, false);
      collectSide(model.consequences, model.mitigativeBarriers, true);
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
              detail: "Frequency-limiting measure whose own rate isn't below the demand reaching it — "
                + "it isn't reducing risk at all.",
            });
          }
        } else if (Bowtie.BarrierMeasures.isLowDemand(node.protection) && before.compareToDecimal(highDemandFloor) > 0) {
          seen.add(key);
          warnings.push({
            id: barrier.id, type: 'low-demand-measure-on-high-demand-barrier', severity: 'advisory',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" uses a low-demand measure, but the `
              + 'demand rate reaching it is above ~1/year (IEC 61511\'s low/high-demand boundary) -- consider PFH instead.',
            detail: 'Low-demand measure, but the demand reaching it is above ~1/year (IEC 61511) — consider PFH.',
          });
        }
      };

      model.threats.forEach((threat) => {
        const node = model.getNode(threat.nodeId);
        const freq = Bowtie.RiskMatrix.quantityToDecimal(node.frequency);
        if (freq === null) return;
        const line = model._lineFor(threat.id);
        this._foldBarriers(Bowtie.Rational.fromDecimal(freq), line.stops, model.preventativeBarriers, false, check);
      });
      model.consequences.forEach((consequence) => {
        const tle = this.computeTleLikelihood(consequence.pageId);
        if (tle.value === null) return;
        const line = model._lineFor(consequence.id);
        this._foldBarriers(tle.value, line.stops, model.mitigativeBarriers, true, check);
      });
      return warnings;
    }
  }

  Bowtie.Quantitative = Quantitative;
})(window.Bowtie = window.Bowtie || {});
