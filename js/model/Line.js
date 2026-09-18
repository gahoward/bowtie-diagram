(function (Bowtie) {
  // A Line is the first-order model representation of one continuous path
  // between a Threat and the TLE, or between the TLE and an Consequence. It is no
  // longer derived on demand: it is created alongside its Threat/Consequence and
  // mutated directly whenever a barrier is inserted/removed/attached.
  //
  // There is no "mode" here. A Line always passes through its stops
  // continuously, end to end, by construction — what earlier designs called
  // "passthrough" is simply the only behavior a Line has. What those designs
  // called "merge" is not a property of any Line at all: it is purely a
  // SHARED BARRIER — two (or more) Lines can each independently list the
  // same barrier id in their own `stops`, and that barrier's rendered box
  // grows tall enough to visually cover every Line's own lane through it
  // (ConnectionRenderer/Layout.controlBounds). Lines are NEVER bundled or
  // drawn as one edge, even when they currently share a next stop: each
  // Line always renders as its own straight run at its own origin's y, with
  // its own single-origin label — never a joined "T_1, T_2" list.
  class Line {
    constructor({
      id, originType, originId, stops = [], pageId,
    } = {}) {
      this.id = id;
      // 'threat' | 'consequence'
      this.originType = originType;
      // The Threat or Consequence id that owns this Line.
      this.originId = originId;
      this.pageId = pageId;
      // Ordered barrier ids the line passes through. Index 0 is always
      // nearest the origin (the Threat or Consequence); the last index is always
      // nearest the TLE. This convention is the same for both threat- and
      // consequence-origin lines, so "insert toward the TLE" / "insert toward
      // the origin" always mean "push toward the end" / "splice near index
      // 0" regardless of which side of the bowtie a line is on.
      this.stops = stops.slice();
    }
  }

  Bowtie.Line = Line;
})(window.Bowtie = window.Bowtie || {});
