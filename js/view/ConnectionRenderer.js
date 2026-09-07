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

  // `line.originId` is the origin Cause/Outcome's own PLACEMENT id (an
  // internal, never-rendered bookkeeping key -- see "Two id spaces" in
  // node_library_proposal.md) -- the annotation must show the origin
  // NODE's own display identifier (C_1/O_1, or its custom label) instead.
  function originDisplayId(model, line) {
    const origin = model.findById(line.originId);
    const node = model.getNode(origin.nodeId);
    return model.displayIdentifierFor(node);
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

    // The TLE-adjacent edge of the shallowest occupied PB/MB column, on
    // whichever side -- PreventativeBarriers' x increases toward the TLE,
    // so the shallowest column is whichever PB has the LARGEST x (its
    // right edge); MitigativeBarriers' x decreases toward the TLE, so it's
    // whichever MB has the SMALLEST x (its left edge). `null` when that
    // side has no barriers at all (nothing to align with).
    //
    // Every Line's flat run must reach at least this far before bending —
    // not just its own last stop's edge, and not just a bare line's fixed
    // Hazard-clearance margin — or two different problems both surface as
    // "this line's turn happens too early, well short of where every other
    // line on this side already turns": (1) a barrier-terminated line
    // whose own last stop sits at a column shy of the true TLE-adjacent
    // one (reachable via connectLineDirectlyToTle truncating one of
    // several lines sharing a barrier that others still continue past —
    // reported bug: the truncated line's bend visibly cut across the
    // column its former continuation used to occupy), and (2) a bare line
    // whose fixed margin happens to fall short of where the diagram's
    // actual barrier columns are (reported alongside it: a bare Outcome's
    // bend stopping well before the nearest Mitigative Barrier's column).
    // Real barrier positions are already Hazard-safe by construction
    // (AutoArrangeController's TLE_ADJACENT_GAP_TIGHT/LOOSE), so reusing
    // one as every other line's minimum reach is at least as safe as the
    // line that already lives there — never a hazard risk in itself, only
    // ever pulling other lines OUT of one that already existed.
    const shallowestPcEdge = model.preventativeBarriers.length > 0
      ? Math.max(...model.preventativeBarriers.map((pb) => pb.x + boundsById[pb.id].w / 2))
      : null;
    const shallowestMcEdge = model.mitigativeBarriers.length > 0
      ? Math.min(...model.mitigativeBarriers.map((mb) => mb.x - boundsById[mb.id].w / 2))
      : null;

    // --- Cause -> ... -> TLE ---

    model.causes.forEach((cause) => {
      const line = model._lineFor(cause.id);
      const cb = boundsById[cause.id];
      const laneY = cause.y;
      const start = rightEdge(cause, cb);

      if (line.stops.length === 0) {
        const attrs = { 'data-role': 'cause-direct', 'data-line-id': line.id };
        // Hazard clearance is a hard ceiling on how far the flat run may
        // extend (smaller x = more clearance); reaching the shallowest PB
        // column is best-effort on top of that, never past it -- Math.min
        // takes whichever demands the LONGER run, so a column that's
        // further out than pure clearance would need still wins, but
        // never at the cost of clearance itself.
        const hazardCeiling = tleCenter.x - bareBendRunLength(laneY);
        const desiredFlatX = shallowestPcEdge !== null ? Math.min(hazardCeiling, shallowestPcEdge) : hazardCeiling;
        const flatX = Math.max(start.x, desiredFlatX);
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
      const ownEdge = lastBarrier.x + lastBounds.w / 2;
      const flatEnd = { x: shallowestPcEdge !== null ? Math.max(ownEdge, shallowestPcEdge) : ownEdge, y: laneY };

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
          frag.appendChild(makeLabel({ x: sn.x + sb.w / 2 + LABEL_GAP, y: laneY }, originDisplayId(model, line)));
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
        // Mirrors the Cause side: Hazard clearance is the hard floor on
        // how close to the TLE the flat run may reach (larger x = more
        // clearance here, since Outcomes sit right of the TLE); reaching
        // the shallowest MB column is best-effort on top of that, via
        // Math.max so whichever demands the longer run wins.
        const hazardFloor = tleCenter.x + bareBendRunLength(laneY);
        const desiredFlatX = shallowestMcEdge !== null ? Math.max(hazardFloor, shallowestMcEdge) : hazardFloor;
        const flatX = Math.min(end.x, desiredFlatX);
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
      const ownEdge = firstBarrier.x - firstBounds.w / 2;
      const flatStart = { x: shallowestMcEdge !== null ? Math.min(ownEdge, shallowestMcEdge) : ownEdge, y: laneY };

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
          frag.appendChild(makeLabel({ x: sn.x + sb.w / 2 + LABEL_GAP, y: laneY }, originDisplayId(model, line)));
        });
      }
    });

    return frag;
  }

  Bowtie.ConnectionRenderer = { render };
})(window.Bowtie = window.Bowtie || {});
