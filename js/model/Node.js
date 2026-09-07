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
  //     Quantitative mode only -- a Quantity, unitless multiplier < 1.
  class Node {
    constructor({
      id, type, name, description = '', identifier = '',
      likelihoodClassId = null, severityClassId = null,
      frequency = null, riskReductionFactor = null,
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
    }
  }

  Bowtie.Node = Node;
})(window.Bowtie = window.Bowtie || {});
