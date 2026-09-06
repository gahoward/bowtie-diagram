(function (Bowtie) {
  // All model coordinates (x, y) are the CENTER point of the shape, for
  // every node type that stores one (the Hazard is the exception — its
  // position is always derived from the TopLevelEvent, see hazardLayout).
  // This keeps circle vs. rect placement symmetric and makes the
  // "left/right of the TLE midpoint" drag constraint a simple x comparison.

  const FONT_SIZE = 13;
  const ID_FONT_SIZE = 11;
  const LINE_HEIGHT = 16;
  const PADDING = 10;
  const MIN_H = 60;
  const HAZARD_GAP = 40; // vertical gap between the Hazard's bottom edge and the TLE's top edge

  function causeOutcomeBounds(svgRoot, el) {
    const maxTextWidth = el.w - PADDING * 2;
    const lines = Bowtie.TextWrap.wrapText(svgRoot, el.name, maxTextWidth, FONT_SIZE);
    const textBlockHeight = (lines.length * LINE_HEIGHT) + LINE_HEIGHT; // + id line
    const h = Math.max(MIN_H, textBlockHeight + PADDING * 2);
    return { w: el.w, h, lines };
  }

  function topLevelEventBounds(svgRoot, tle) {
    let r = tle.r;
    let lines;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const maxTextWidth = r * 1.3;
      lines = Bowtie.TextWrap.wrapText(svgRoot, tle.name, maxTextWidth, FONT_SIZE);
      const neededHeight = lines.length * LINE_HEIGHT + PADDING * 2;
      if (neededHeight <= r * 1.6) break;
      r += 12;
    }
    return { r, lines };
  }

  // The Hazard has no stored position — it always sits centered directly
  // above the TopLevelEvent, offset by its own (dynamically-grown) height.
  function hazardLayout(svgRoot, hazard, tle, tleR) {
    const maxTextWidth = hazard.w - PADDING * 2;
    const lines = Bowtie.TextWrap.wrapText(svgRoot, hazard.name, maxTextWidth, FONT_SIZE);
    const textBlockHeight = (lines.length * LINE_HEIGHT) + PADDING * 2;
    const h = Math.max(hazard.h, textBlockHeight);
    const w = hazard.w;
    return {
      x: tle.x,
      y: tle.y - tleR - HAZARD_GAP - (h / 2),
      w,
      h,
      lines,
    };
  }

  const LANE_MARGIN = 16;

  // A barrier grows taller than its default height when it needs to
  // visually intersect lines that don't all travel at its own y — each line
  // stays perfectly straight (it never bends to meet the barrier), so the
  // box must span every "lane" y-value passing through it. The box is
  // centered on the midpoint of those lanes (`cy`), not forced to stay
  // symmetric around the barrier's own stored `el.y` — that would only
  // waste space when `el.y` happens to sit near one extreme rather than the
  // middle of its lanes. A single lane (or none — an orphaned barrier)
  // collapses `cy` back to that lane's y, or `el.y`, with no growth.
  function controlBounds(el, laneYs) {
    const relevant = laneYs && laneYs.length > 0 ? laneYs : [el.y];
    const minY = Math.min(...relevant);
    const maxY = Math.max(...relevant);
    const cy = (minY + maxY) / 2;
    const h = Math.max(el.h, (maxY - minY) + LANE_MARGIN);
    return { w: el.w, h, cy };
  }

  // Point on the TLE's circumference closest to (tx, ty), used as the
  // terminus for any line arriving at (or leaving from) the TLE.
  function circleEdgePoint(center, r, tx, ty) {
    const theta = Math.atan2(ty - center.y, tx - center.x);
    return { x: center.x + r * Math.cos(theta), y: center.y + r * Math.sin(theta) };
  }

  // Left/right edge midpoints for any axis-aligned rect-shaped node
  // (Cause, Outcome, PreventativeControl, MitigativeControl).
  function leftEdge(node, bounds) {
    return { x: node.x - bounds.w / 2, y: node.y };
  }

  function rightEdge(node, bounds) {
    return { x: node.x + bounds.w / 2, y: node.y };
  }

  Bowtie.Layout = {
    FONT_SIZE,
    ID_FONT_SIZE,
    LINE_HEIGHT,
    causeOutcomeBounds,
    topLevelEventBounds,
    hazardLayout,
    controlBounds,
    circleEdgePoint,
    leftEdge,
    rightEdge,
  };
})(window.Bowtie = window.Bowtie || {});
