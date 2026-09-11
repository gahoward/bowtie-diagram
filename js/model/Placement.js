(function (Bowtie) {
  // The single placement record for all four kinds -- one node's
  // appearance on one page (position + size). `name`/`description`/
  // `identifier` live on the shared library Node this placement's
  // `nodeId` points at, not here -- see Node.js and node_library_
  // proposal.md's "Two id spaces". `id` is drawn from idCounters.placement
  // (purely internal bookkeeping -- findById/Line.stops/Line.originId/
  // undo's page-attribution key on it, but a user never sees it); the
  // NODE's own id (nodeId's target) is what actually renders inside the
  // shape.
  //
  // Design review finding 07: this used to be four separate classes
  // (Cause/Outcome/PreventativeBarrier/MitigativeBarrier) whose bodies
  // were otherwise byte-identical -- every field, every line, the same --
  // differing only in `type` and each kind's own default w/h. Collapsing
  // them doesn't touch the actual duplication finding 07 was about (which
  // barrier collection to search, which model method to call, and so on
  // -- see LineTopology.js/ContextMenuController.js's own SIDE tables):
  // none of that lives in these classes, it lives in which collection an
  // object sits in and in code that reads `.type`. This just retires four
  // files that had nothing to differ over.
  //
  // Every live construction site passes `w`/`h` explicitly; the defaults
  // below only matter when parsing a document (DocumentSerializer) whose
  // stored placement is missing one -- an older or hand-edited file.
  // Cause/Outcome's `h` (60) has no Geometry entry of its own -- it's a
  // dynamic minimum a real box always grows past once its name wraps
  // (Layout.MIN_H), not a true fixed shape constant the way `w` is.
  const DEFAULT_DIMENSIONS = {
    cause: { w: Bowtie.Geometry.CAUSE_OUTCOME_W, h: 60 },
    outcome: { w: Bowtie.Geometry.CAUSE_OUTCOME_W, h: 60 },
    preventativeBarrier: { w: Bowtie.Geometry.BARRIER_W, h: Bowtie.Geometry.BARRIER_H },
    mitigativeBarrier: { w: Bowtie.Geometry.BARRIER_W, h: Bowtie.Geometry.BARRIER_H },
  };

  class Placement {
    constructor({
      id, type, nodeId, x = 0, y = 0, w, h, pageId,
    } = {}) {
      const defaults = DEFAULT_DIMENSIONS[type] || {};
      this.id = id;
      this.type = type; // 'cause' | 'outcome' | 'preventativeBarrier' | 'mitigativeBarrier'
      this.nodeId = nodeId;
      this.x = x;
      this.y = y;
      this.w = w ?? defaults.w;
      this.h = h ?? defaults.h;
      this.pageId = pageId;
    }
  }

  Bowtie.Placement = Placement;
})(window.Bowtie = window.Bowtie || {});
