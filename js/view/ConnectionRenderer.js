(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const { leftEdge, rightEdge, circleEdgePoint } = Bowtie.Layout;
  const LABEL_GAP = 6;

  // `attrs` carries data-* identifiers so controllers can tell what a
  // clicked line represents ("Lines shall be interactable in their own right").
  function makeLine(a, b, cls, attrs) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', `connection ${cls}`);
    Object.entries(attrs || {}).forEach(([k, v]) => line.setAttribute(k, v));
    return line;
  }

  // Small id annotation on the exiting side of a barrier, shown only when
  // that barrier currently carries more than one lane — each lane gets its
  // own label with its own (single) origin id, since lines are never
  // bundled together any more.
  function makeLabel(point, text) {
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', point.x);
    label.setAttribute('y', point.y - 6);
    label.setAttribute('class', 'connection-label');
    label.textContent = text;
    return label;
  }

  // Draws every Line as a single continuous, perfectly straight run at its
  // own origin's y (its "lane") — it never bends to meet a barrier; barriers
  // instead grow tall enough (Layout.controlBounds) to visually intersect
  // whichever lanes pass through them, each exiting at its own distinct
  // point. The only bend in the whole run is the final approach into the
  // TLE's circular edge, which cannot be avoided geometrically.
  function render(model, boundsById, hazardLayout, opts = {}) {
    const showAnnotations = opts.showAnnotations !== false;
    const frag = document.createDocumentFragment();
    const tle = model.topLevelEvent;
    const tleR = boundsById[tle.id].r;
    const tleCenter = { x: tle.x, y: tle.y };

    // Hazard -> TopLevelEvent: fixed single connector, always present.
    const hazardBottom = { x: hazardLayout.x, y: hazardLayout.y + hazardLayout.h / 2 };
    const tleTop = circleEdgePoint(tleCenter, tleR, hazardBottom.x, hazardBottom.y);
    frag.appendChild(makeLine(hazardBottom, tleTop, 'to-hazard'));

    const hazardHalfW = hazardLayout.w / 2;
    const BARE_BEND_MARGIN = 20;

    // Minimum horizontal run, at a bare (barrier-less) origin's own constant
    // lane-y, that must be kept flat before bending toward the TLE (see
    // auto-arrange-fix.md §4). A single long diagonal all the way from the
    // origin to the TLE — the old behavior — necessarily crosses the
    // x-range of every barrier column in between; staying flat at the
    // origin's own lane-y (already guaranteed clear of every other row's
    // barriers by AutoArrangeController's GROUP_GAP/ROW_SPACING) until close
    // to the TLE eliminates that class of collision entirely. Below the
    // TLE's own y, nothing but the TLE itself occupies that space, so a
    // short fixed run is enough; above it, the run must be long enough that
    // the bend has already dropped below the Hazard's bottom edge by the
    // time it re-enters the Hazard's x-range — the same derivation
    // AutoArrangeController's TLE_ADJACENT_GAP_TIGHT uses, but parameterized
    // by this line's own real laneY/tleR/hazardLayout (already available
    // here at draw time) rather than assumed worst-case constants.
    function bareBendRunLength(laneY) {
      if (laneY >= tleCenter.y) return tleR * 1.5;
      const hazardBottomY = hazardLayout.y + hazardLayout.h / 2;
      const verticalDrop = tleCenter.y - laneY;
      return BARE_BEND_MARGIN + (verticalDrop * hazardHalfW) / (tleCenter.y - hazardBottomY);
    }

    // --- Cause -> ... -> TLE ---

    model.causes.forEach((cause) => {
      const line = model._lineFor(cause.id);
      const cb = boundsById[cause.id];
      const laneY = cause.y;
      const start = rightEdge(cause, cb);

      if (line.stops.length === 0) {
        const attrs = { 'data-role': 'cause-direct', 'data-line-id': line.id };
        const flatX = Math.max(start.x, tleCenter.x - bareBendRunLength(laneY));
        const flatEnd = { x: flatX, y: laneY };
        if (flatX > start.x) frag.appendChild(makeLine(start, flatEnd, 'to-control', attrs));
        const bendStart = flatX > start.x ? flatEnd : start;
        const bendEnd = circleEdgePoint(tleCenter, tleR, bendStart.x, laneY);
        frag.appendChild(makeLine(bendStart, bendEnd, 'to-hazard', attrs));
        return;
      }

      const lastId = line.stops[line.stops.length - 1];
      const lastBounds = boundsById[lastId];
      const lastBarrier = model.findById(lastId);
      const flatEnd = { x: lastBarrier.x + lastBounds.w / 2, y: laneY };

      frag.appendChild(makeLine(start, flatEnd, 'to-control', {
        'data-role': 'cause-line', 'data-line-id': line.id,
      }));
      const bendEnd = circleEdgePoint(tleCenter, tleR, flatEnd.x, laneY);
      frag.appendChild(makeLine(flatEnd, bendEnd, 'to-hazard', {
        'data-role': 'cause-line', 'data-line-id': line.id,
      }));

      if (showAnnotations) {
        line.stops.forEach((stopId) => {
          if (model.laneYsThrough(stopId).length <= 1) return;
          const sb = boundsById[stopId];
          const sn = model.findById(stopId);
          frag.appendChild(makeLabel({ x: sn.x + sb.w / 2 + LABEL_GAP, y: laneY }, line.originId));
        });
      }
    });

    // --- TLE -> ... -> Outcome ---

    model.outcomes.forEach((outcome) => {
      const line = model._lineFor(outcome.id);
      const ob = boundsById[outcome.id];
      const laneY = outcome.y;
      const end = leftEdge(outcome, ob);

      if (line.stops.length === 0) {
        const attrs = { 'data-role': 'outcome-direct', 'data-line-id': line.id };
        const flatX = Math.min(end.x, tleCenter.x + bareBendRunLength(laneY));
        const flatStart = { x: flatX, y: laneY };
        const bendEnd = flatX < end.x ? flatStart : end;
        const bendStart = circleEdgePoint(tleCenter, tleR, bendEnd.x, laneY);
        frag.appendChild(makeLine(bendStart, bendEnd, 'from-hazard', attrs));
        if (flatX < end.x) frag.appendChild(makeLine(flatStart, end, 'to-outcome', attrs));
        return;
      }

      const firstId = line.stops[line.stops.length - 1]; // nearest the TLE
      const firstBounds = boundsById[firstId];
      const firstBarrier = model.findById(firstId);
      const flatStart = { x: firstBarrier.x - firstBounds.w / 2, y: laneY };

      const bendStart = circleEdgePoint(tleCenter, tleR, flatStart.x, laneY);
      frag.appendChild(makeLine(bendStart, flatStart, 'from-hazard', {
        'data-role': 'outcome-line', 'data-line-id': line.id,
      }));
      frag.appendChild(makeLine(flatStart, end, 'to-outcome', {
        'data-role': 'outcome-line', 'data-line-id': line.id,
      }));

      if (showAnnotations) {
        line.stops.forEach((stopId) => {
          if (model.laneYsThrough(stopId).length <= 1) return;
          const sb = boundsById[stopId];
          const sn = model.findById(stopId);
          frag.appendChild(makeLabel({ x: sn.x + sb.w / 2 + LABEL_GAP, y: laneY }, line.originId));
        });
      }
    });

    return frag;
  }

  Bowtie.ConnectionRenderer = { render };
})(window.Bowtie = window.Bowtie || {});
