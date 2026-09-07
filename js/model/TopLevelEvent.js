(function (Bowtie) {
  // The sole connection point for every Cause/PC (left) and Outcome/MC
  // (right). Singleton, uncreatable — matches the role the old "Hazard"
  // node used to play before the Hazard/TLE split.
  class TopLevelEvent {
    constructor({
      id = 'TLE', name = 'Top-Level Event', description = '', x = 0, y = 0, r = 70, pageId,
    } = {}) {
      this.id = id;
      this.type = 'topLevelEvent';
      this.name = name;
      this.description = description;
      this.x = x;
      this.y = y;
      this.r = r;
      this.pageId = pageId;
    }
  }

  Bowtie.TopLevelEvent = TopLevelEvent;
})(window.Bowtie = window.Bowtie || {});
