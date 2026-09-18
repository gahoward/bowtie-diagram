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
  // (Threat/Consequence/PreventativeBarrier/MitigativeBarrier) whose bodies
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
  // Threat/Consequence's `h` (60) has no Geometry entry of its own -- it's a
  // dynamic minimum a real box always grows past once its name wraps
  // (Layout.MIN_H), not a true fixed shape constant the way `w` is.
  const DEFAULT_DIMENSIONS = {
    threat: { w: Bowtie.Geometry.THREAT_CONSEQUENCE_W, h: 60 },
    consequence: { w: Bowtie.Geometry.THREAT_CONSEQUENCE_W, h: 60 },
    preventativeBarrier: { w: Bowtie.Geometry.BARRIER_W, h: Bowtie.Geometry.BARRIER_H },
    mitigativeBarrier: { w: Bowtie.Geometry.BARRIER_W, h: Bowtie.Geometry.BARRIER_H },
    escalationFactor: { w: Bowtie.Geometry.ESCALATION_FACTOR_W, h: Bowtie.Geometry.ESCALATION_FACTOR_H },
    escalationBarrier: { w: Bowtie.Geometry.ESCALATION_BARRIER_W, h: Bowtie.Geometry.ESCALATION_BARRIER_H },
  };

  class Placement {
    constructor({
      id, type, nodeId, x = 0, y = 0, w, h, pageId, barrierId = null,
    } = {}) {
      const defaults = DEFAULT_DIMENSIONS[type] || {};
      this.id = id;
      // 'threat' | 'consequence' | 'preventativeBarrier' | 'mitigativeBarrier'
      // | 'escalationFactor' | 'escalationBarrier'
      this.type = type;
      this.nodeId = nodeId;
      this.x = x;
      this.y = y;
      this.w = w ?? defaults.w;
      this.h = h ?? defaults.h;
      this.pageId = pageId;
      // Escalation factors only (proposals/08): the barrier PLACEMENT this
      // factor degrades. An EF is the one placement kind that is anchored
      // to another placement rather than free on the page -- it has no
      // meaning apart from the barrier it hangs off, and deleting that
      // barrier takes it with it. Null for every other kind.
      this.barrierId = barrierId;
    }
  }

  Bowtie.Placement = Placement;
})(window.Bowtie = window.Bowtie || {});
