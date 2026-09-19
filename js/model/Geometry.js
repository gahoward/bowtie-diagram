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
    THREAT_CONSEQUENCE_W: 140,
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
    // Escalation factors (proposals/08). An EF box hangs BELOW the barrier
    // it degrades, so its width is its own (not a barrier's bar width) and
    // its height is a minimum the label grows past, like a Threat's.
    ESCALATION_FACTOR_W: 120,
    ESCALATION_FACTOR_H: 44,
    // An escalation barrier is the same bar as a PB/MB rotated flat: it
    // sits ON the vertical escalation line, so its long axis is
    // horizontal. Half a barrier's height on purpose -- it reads as the
    // same kind of thing, one step down in importance.
    ESCALATION_BARRIER_W: 55,
    ESCALATION_BARRIER_H: 18,
    // Vertical gap between a barrier's bottom edge and the first thing on
    // its escalation line, and between stacked escalation factors.
    ESCALATION_GAP: 46,
  };
})(window.Bowtie = window.Bowtie || {});
