(function (Bowtie) {
  class Outcome {
    constructor({ id, name, x = 0, y = 0, w = 140, h = 60 } = {}) {
      this.id = id;
      this.type = 'outcome';
      this.name = name;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }
  }

  Bowtie.Outcome = Outcome;
})(window.Bowtie = window.Bowtie || {});
