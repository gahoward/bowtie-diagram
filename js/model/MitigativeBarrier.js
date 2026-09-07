(function (Bowtie) {
  // Mirrors PreventativeBarrier -- see that file's comment for the
  // placement/node split. Connectivity lives on Line.stops.
  class MitigativeBarrier {
    constructor({
      id, nodeId, x = 0, y = 0, w = 36, h = 110, pageId,
    } = {}) {
      this.id = id;
      this.type = 'mitigativeBarrier';
      this.nodeId = nodeId;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.MitigativeBarrier = MitigativeBarrier;
})(window.Bowtie = window.Bowtie || {});
