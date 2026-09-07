(function (Bowtie) {
  // A plain shape/position record -- connectivity lives on Line.stops (see
  // Line.js); identity (name/description/identifier, and the quantitative-
  // mode riskReductionFactor) lives on the shared library Node this
  // placement's `nodeId` points at (see Node.js / node_library_proposal.md).
  class PreventativeBarrier {
    constructor({
      id, nodeId, x = 0, y = 0, w = 36, h = 110, pageId,
    } = {}) {
      this.id = id;
      this.type = 'preventativeBarrier';
      this.nodeId = nodeId;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.PreventativeBarrier = PreventativeBarrier;
})(window.Bowtie = window.Bowtie || {});
