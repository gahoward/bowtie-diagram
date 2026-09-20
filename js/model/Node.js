(function (Bowtie) {
  // The shared *identity* record for one real-world Threat/Consequence/Barrier —
  // see node_library_proposal.md. Holds name/description/identifier
  // (global across every page it's placed on) plus, per
  // quantitative_mode_proposal.md's "Compatibility with quantitative mode"
  // section, the risk fields: those are per-NODE (globally linked), not
  // per-placement, so they live here rather than on Threat/Consequence/
  // PreventativeBarrier/MitigativeBarrier.
  //
  // Which risk fields are meaningful depends on `type` and the document's
  // current `mode` (BowtieModel.mode) -- this class itself doesn't
  // enforce that, it's just storage:
  //   - `likelihoodClassId`: threat or consequence, Qualitative mode only
  //     (manual pick; in Quantitative mode a threat/consequence's likelihood is
  //     COMPUTED instead, never stored).
  //   - `severityClassId`: consequence only, both Qualitative and Quantitative
  //     mode (severity is never computed).
  //   - `frequency`: threat only, Quantitative mode only -- a Quantity
  //     (`{ value: decimalString } | { unknown: true }`), canonical
  //     events/hour.
  //   - `protection`: preventativeBarrier/mitigativeBarrier only,
  //     Quantitative mode only -- barrier_measures_proposal.md's
  //     measure-tagged quantity: `{ measure, value, ...extra } |
  //     { unknown: true } | null`. Renamed from `riskReductionFactor` (v9
  //     -> v10, no migration -- see BowtieModel.js's version comment) once
  //     the field could hold a PFH or a bare rate as easily as an RRF; see
  //     BarrierMeasures.js for what `measure` normalises to.
  //
  //   - `degradation`: escalationFactor only, Quantitative mode only
  //     (proposals/21) -- how much worse the barrier this factor is
  //     anchored to actually performs while the factor is live:
  //       { mode: 'factor', value: '10' }    multiply the barrier's PFD by 10
  //     | { mode: 'floor',  value: '1E-1' }  claim no better than this PFD
  //     | { unknown: true }
  //     | null
  //     `factor` is the conventional treatment (an untested ESDV is some
  //     multiple worse than a tested one); `floor` is what analysts more
  //     often say out loud ("with this live I will not claim better than
  //     10^-1 from that barrier, whatever the datasheet says"). Both
  //     compose EXACTLY -- a Rational multiply and a clamp respectively
  //     -- so this adds no rounding point.
  //
  //     Defaults to null, deliberately: proposals/08 shipped escalation
  //     factors as structure only, so an existing document's figures
  //     change only once an analyst STATES a degradation, which is a
  //     decision they make rather than one the tool makes for them.
  //
  // Barrier metadata (design review finding 10, phase 1): `barrierType`/
  // `owner`/`effectiveness`, preventativeBarrier/mitigativeBarrier only,
  // independent of `mode` -- unlike the risk fields above, these are plain
  // descriptive metadata a reviewer of the bowtie asks for regardless of
  // whether the document does any arithmetic at all, so they're not gated
  // behind Simple mode. Purely additive optional fields with safe
  // defaults (an older document simply lacks them, and reads as "not
  // set") -- unlike the structural/meaning changes each SCHEMA_VERSION
  // bump so far has guarded against, so this doesn't need one.
  class Node {
    constructor({
      id, type, name, description = '', identifier = '',
      likelihoodClassId = null, severityClassId = null,
      frequency = null, protection = null, degradation = null,
      barrierType = null, owner = '', effectiveness = null,
    } = {}) {
      this.id = id;
      this.type = type; // 'threat' | 'consequence' | 'preventativeBarrier' | 'mitigativeBarrier'
      this.name = name;
      this.description = description;
      this.identifier = identifier;
      this.likelihoodClassId = likelihoodClassId;
      this.severityClassId = severityClassId;
      this.frequency = frequency;
      this.protection = protection;
      this.degradation = degradation; // escalationFactor only -- see above
      this.barrierType = barrierType; // 'hardware' | 'human' | 'active' | 'passive' | null
      this.owner = owner;
      this.effectiveness = effectiveness; // 'high' | 'medium' | 'low' | null
    }
  }

  Bowtie.Node = Node;
})(window.Bowtie = window.Bowtie || {});
