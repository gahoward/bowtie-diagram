(function (Bowtie) {
  // Structural review finding 05: every node/label's true shape lived
  // wherever it was first needed -- a model class's own constructor default,
  // a rendering literal in ShapeRenderer -- and every OTHER file that needed
  // the same number for its own purposes (chiefly AutoArrangeController's
  // positioning maths, which has to predict where the render layer will put
  // things before it runs) copied the literal and left a comment promising
  // to keep the two in sync by hand. One canonical source, read by every
  // file that cares what a shape actually measures, turns each of those
  // promises into an actual guarantee instead.
  Bowtie.Geometry = {
    CAUSE_OUTCOME_W: 140,
    TLE_DEFAULT_R: 70,
    HAZARD_W: 170,
    HAZARD_H: 70,
    // Vertical gap between the Hazard's bottom edge and the TLE's top edge.
    HAZARD_GAP: 40,
    BARRIER_W: 36,
    BARRIER_H: 110,
    // ShapeRenderer.renderControl's label-wrap width for a barrier's id/name.
    BARRIER_LABEL_MAX_WIDTH: 110,
    // Vertical gap between a barrier's own box and its id/name label below it.
    LABEL_GAP: 14,
  };
})(window.Bowtie = window.Bowtie || {});
