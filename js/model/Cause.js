(function (Bowtie) {
  class Cause {
    constructor({
      id, name, x = 0, y = 0, w = 140, h = 60, pageId,
    } = {}) {
      this.id = id;
      this.type = 'cause';
      this.name = name;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.Cause = Cause;
})(window.Bowtie = window.Bowtie || {});
