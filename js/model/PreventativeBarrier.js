(function (Bowtie) {
  // A plain shape/position/name record. All connectivity (which Causes feed
  // it, what it chains into) lives entirely on Line.stops now — see Line.js.
  class PreventativeBarrier {
    constructor({
      id, name, x = 0, y = 0, w = 36, h = 110,
    } = {}) {
      this.id = id;
      this.type = 'preventativeBarrier';
      this.name = name;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }
  }

  Bowtie.PreventativeBarrier = PreventativeBarrier;
})(window.Bowtie = window.Bowtie || {});
