(function (Bowtie) {
  // A placement: one node's appearance on one specific page (position +
  // Line). `name`/`description`/`identifier` moved to the shared library
  // Node record this placement's `nodeId` points at -- see Node.js and
  // node_library_proposal.md's "Two id spaces". `id` is drawn from
  // idCounters.placement (purely internal bookkeeping -- findById/
  // Line.stops/Line.originId/undo's page-attribution key on it, but a user
  // never sees it); the NODE's own id (nodeId's target) is what actually
  // renders inside the shape.
  class Cause {
    constructor({
      id, nodeId, x = 0, y = 0, w = 140, h = 60, pageId,
    } = {}) {
      this.id = id;
      this.type = 'cause';
      this.nodeId = nodeId;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.Cause = Cause;
})(window.Bowtie = window.Bowtie || {});
