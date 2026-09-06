(function (Bowtie) {
  // A Line is the first-order model representation of one continuous path
  // between a Cause and the TLE, or between the TLE and an Outcome. It is no
  // longer derived on demand: it is created alongside its Cause/Outcome and
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
  // its own single-origin label — never a joined "C_1, C_2" list.
  class Line {
    constructor({
      id, originType, originId, stops = [],
    } = {}) {
      this.id = id;
      // 'cause' | 'outcome'
      this.originType = originType;
      // The Cause or Outcome id that owns this Line.
      this.originId = originId;
      // Ordered barrier ids the line passes through. Index 0 is always
      // nearest the origin (the Cause or Outcome); the last index is always
      // nearest the TLE. This convention is the same for both cause- and
      // outcome-origin lines, so "insert toward the TLE" / "insert toward
      // the origin" always mean "push toward the end" / "splice near index
      // 0" regardless of which side of the bowtie a line is on.
      this.stops = stops.slice();
    }
  }

  Bowtie.Line = Line;
})(window.Bowtie = window.Bowtie || {});
