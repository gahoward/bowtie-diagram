(function (Bowtie) {
  // The sole connection point for every Cause/PC (left) and Outcome/MC
  // (right). Singleton, uncreatable — matches the role the old "Hazard"
  // node used to play before the Hazard/TLE split.
  class TopLevelEvent {
    constructor({ id = 'TLE', name = 'Top-Level Event', x = 0, y = 0, r = 70 } = {}) {
      this.id = id;
      this.type = 'topLevelEvent';
      this.name = name;
      this.x = x;
      this.y = y;
      this.r = r;
    }
  }

  Bowtie.TopLevelEvent = TopLevelEvent;
})(window.Bowtie = window.Bowtie || {});
