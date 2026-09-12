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
      const usedPb = new Set(model.lines.filter((l) => l.originType === 'cause').flatMap((l) => l.stops));
      model.preventativeBarriers.forEach((pb) => {
        if (!usedPb.has(pb.id)) {
          // Always safe: a live barrier's page can't have been deleted,
          // since deletePage cascades to remove it too.
          const page = model.getPage(pb.pageId);
          const node = model.getNode(pb.nodeId);
          warnings.push({
            id: pb.id, type: 'orphaned-preventative-control', severity: 'blocking',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" is not connected to any Cause.`,
          });
        }
      });
      const usedMb = new Set(model.lines.filter((l) => l.originType === 'outcome').flatMap((l) => l.stops));
      model.mitigativeBarriers.forEach((mb) => {
        if (!usedMb.has(mb.id)) {
          const page = model.getPage(mb.pageId);
          const node = model.getNode(mb.nodeId);
          warnings.push({
            id: mb.id, type: 'orphaned-mitigative-control', severity: 'blocking',
            pageId: page.id, pageName: page.name,
            message: `${node.id} (${node.name}) on page "${page.name}" is not connected to any Outcome.`,
          });
        }
      });
      return warnings;
    }
  }

  Bowtie.Warnings = Warnings;
})(window.Bowtie = window.Bowtie || {});
