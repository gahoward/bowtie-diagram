(function (Bowtie) {
  // Mirrors Cause -- see that file's comment for the placement/node split.
  class Outcome {
    constructor({
      id, nodeId, x = 0, y = 0, w = 140, h = 60, pageId,
    } = {}) {
      this.id = id;
      this.type = 'outcome';
      this.nodeId = nodeId;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.Outcome = Outcome;
})(window.Bowtie = window.Bowtie || {});
