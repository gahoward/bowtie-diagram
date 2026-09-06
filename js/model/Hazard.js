(function (Bowtie) {
  // Fixed satellite of the TopLevelEvent: singleton, uncreatable, and has
  // no stored position of its own — it is always rendered a fixed offset
  // directly above the TLE (see Layout.hazardPosition) and moves with it.
  class Hazard {
    constructor({
      id = 'HAZARD', name = 'Hazard', w = 170, h = 70, pageId,
    } = {}) {
      this.id = id;
      this.type = 'hazard';
      this.name = name;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.Hazard = Hazard;
})(window.Bowtie = window.Bowtie || {});
