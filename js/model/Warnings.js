(function (Bowtie) {
  // Extracted from BowtieModel (design review finding 06, phase 2) -- orphan
  // detection, read-only like Quantitative.js. Small on purpose: this is
  // also the natural home for whatever new warning types escalation
  // factors (finding 10) eventually add.
  class Warnings {
    constructor(model) {
      this.model = model;
    }

    // A barrier not appearing in any Line's stops is an orphan -- nothing
    // actually flows through it. Export is blocked while any BLOCKING
    // warning exists (WarningsController.js) -- these two are integrity
    // failures, unlike the advisory barrier-measure checks Quantitative.js
    // computes (see BowtieModel.getWarnings, which merges the two). A
    // library node with zero placements anywhere is deliberately NOT
    // flagged here (node_library_proposal.md Open question 2, resolved
    // toward silent) -- ask 2 explicitly wants nodes to survive with no
    // placements as a normal "staging" state, not a mistake.
    getWarnings() {
      const model = this.model;
      const warnings = [];
      const usedPb = new Set(model.lines.filter((l) => l.originType === 'threat').flatMap((l) => l.stops));
      model.preventativeBarriers.forEach((pb) => {
        if (!usedPb.has(pb.id)) {
          // Always safe: a live barrier's page can't have been deleted,
          // since deletePage cascades to remove it too.
          const page = model.getPage(pb.pageId);
          const node = model.getNode(pb.nodeId);
          // `message` is the full, self-contained sentence (what a log or
          // an export note wants); `detail` is the same finding without
          // the who/where, for a UI that already shows those as their own
          // columns (WarningsController's rows).
          warnings.push({
            id: pb.id, type: 'orphaned-preventative-control', severity: 'blocking',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" is not connected to any Threat.`,
            detail: 'Not connected to any Threat — nothing flows through it.',
          });
        }
      });
      const usedMb = new Set(model.lines.filter((l) => l.originType === 'consequence').flatMap((l) => l.stops));
      model.mitigativeBarriers.forEach((mb) => {
        if (!usedMb.has(mb.id)) {
          const page = model.getPage(mb.pageId);
          const node = model.getNode(mb.nodeId);
          warnings.push({
            id: mb.id, type: 'orphaned-mitigative-control', severity: 'blocking',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" is not connected to any Consequence.`,
            detail: 'Not connected to any Consequence — nothing flows through it.',
          });
        }
      });
      // Escalation factors (proposals/08). Two checks, mirroring the two
      // above in spirit but not in severity:
      //
      //   - an escalation barrier on no escalation line is an orphan in
      //     exactly the sense the barrier checks above mean -- it claims
      //     to control something and controls nothing -- so it is
      //     BLOCKING, and export stops until it is resolved;
      //   - an escalation factor with no escalation barrier is a real
      //     finding, not a broken document: "this barrier can be degraded
      //     and nothing is stopping that" is often exactly what an
      //     analyst means to record, so it is ADVISORY.
      const usedEb = new Set(
        model.lines.filter((l) => l.originType === 'escalationFactor').flatMap((l) => l.stops),
      );
      model.escalationBarriers.forEach((eb) => {
        if (!usedEb.has(eb.id)) {
          const page = model.getPage(eb.pageId);
          const node = model.getNode(eb.nodeId);
          warnings.push({
            id: eb.id, type: 'orphaned-escalation-barrier', severity: 'blocking',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" is not connected to any Escalation Factor.`,
            detail: 'Not connected to any Escalation Factor — it controls nothing.',
          });
        }
      });
      model.escalationFactors.forEach((ef) => {
        // One definition, shared with the arithmetic -- see
        // BowtieModel.isEscalationFactorUncontrolled.
        if (!model.isEscalationFactorUncontrolled(ef)) return;
        const page = model.getPage(ef.pageId);
        const node = model.getNode(ef.nodeId);
        const barrier = model.findById(ef.barrierId);
        const barrierName = barrier ? model.getNode(barrier.nodeId).id : 'its barrier';
        warnings.push({
          id: ef.id, type: 'uncontrolled-escalation-factor', severity: 'advisory',
          pageId: page.id, pageName: page.name,
          message: `${node.id} (${node.name}) on page "${page.name}" degrades ${barrierName} `
            + 'with no escalation barrier controlling it.',
          detail: 'No escalation barrier — nothing is controlling this factor.',
        });
      });
      return warnings;
    }
  }

  Bowtie.Warnings = Warnings;
})(window.Bowtie = window.Bowtie || {});
