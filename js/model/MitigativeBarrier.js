(function (Bowtie) {
  // Mirrors PreventativeBarrier. All connectivity lives on Line.stops.
  class MitigativeBarrier {
    constructor({
      id, name, x = 0, y = 0, w = 36, h = 110, pageId,
    } = {}) {
      this.id = id;
      this.type = 'mitigativeBarrier';
      this.name = name;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.MitigativeBarrier = MitigativeBarrier;
})(window.Bowtie = window.Bowtie || {});
