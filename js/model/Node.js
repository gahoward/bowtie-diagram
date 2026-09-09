(function (Bowtie) {
  // The shared *identity* record for one real-world Cause/Outcome/Barrier —
  // see node_library_proposal.md. Holds name/description/identifier
  // (global across every page it's placed on) plus, per
  // quantitative_mode_proposal.md's "Compatibility with quantitative mode"
  // section, the risk fields: those are per-NODE (globally linked), not
  // per-placement, so they live here rather than on Cause/Outcome/
  // PreventativeBarrier/MitigativeBarrier.
  //
  // Which risk fields are meaningful depends on `type` and the document's
  // current `mode` (BowtieModel.mode) -- this class itself doesn't
  // enforce that, it's just storage:
  //   - `likelihoodClassId`: cause or outcome, Qualitative mode only
  //     (manual pick; in Quantitative mode a cause/outcome's likelihood is
  //     COMPUTED instead, never stored).
  //   - `severityClassId`: outcome only, both Qualitative and Quantitative
  //     mode (severity is never computed).
  //   - `frequency`: cause only, Quantitative mode only -- a Quantity
  //     (`{ value: decimalString } | { unknown: true }`), canonical
  //     events/hour.
  //   - `riskReductionFactor`: preventativeBarrier/mitigativeBarrier only,
  //     Quantitative mode only -- a Quantity in the IEC 61511 RRF sense
  //     (>= 1, equal to 1/PFD; DIVIDES the frequency -- see Quantitative.js).
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
      frequency = null, riskReductionFactor = null,
      barrierType = null, owner = '', effectiveness = null,
    } = {}) {
      this.id = id;
      this.type = type; // 'cause' | 'outcome' | 'preventativeBarrier' | 'mitigativeBarrier'
      this.name = name;
      this.description = description;
      this.identifier = identifier;
      this.likelihoodClassId = likelihoodClassId;
      this.severityClassId = severityClassId;
      this.frequency = frequency;
      this.riskReductionFactor = riskReductionFactor;
      this.barrierType = barrierType; // 'hardware' | 'human' | 'active' | 'passive' | null
      this.owner = owner;
      this.effectiveness = effectiveness; // 'high' | 'medium' | 'low' | null
    }
  }

  Bowtie.Node = Node;
})(window.Bowtie = window.Bowtie || {});
