(function (Bowtie) {
  // Fixed satellite of the TopLevelEvent: singleton, uncreatable, and has
  // no stored position of its own — it is always rendered a fixed offset
  // directly above the TLE (see Layout.hazardPosition) and moves with it.
  class Hazard {
    constructor({
      id = 'HAZARD', name = 'Hazard', description = '',
      w = Bowtie.Geometry.HAZARD_W, h = Bowtie.Geometry.HAZARD_H, pageId,
    } = {}) {
      this.id = id;
      this.type = 'hazard';
      this.name = name;
      this.description = description;
      this.w = w;
      this.h = h;
      this.pageId = pageId;
    }
  }

  Bowtie.Hazard = Hazard;
})(window.Bowtie = window.Bowtie || {});
