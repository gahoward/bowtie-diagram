(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const { LINE_HEIGHT, FONT_SIZE } = Bowtie.Layout;

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  // Renders a vertically-centered block of tspans, one <tspan> per line,
  // starting with an optional bold id line followed by the wrapped name.
  function textBlock(cx, cy, idText, nameLines) {
    const totalLines = (idText ? 1 : 0) + nameLines.length;
    const blockHeight = totalLines * LINE_HEIGHT;
    let y = cy - (blockHeight / 2) + (LINE_HEIGHT / 2);

    const text = el('text', { x: cx, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });

    if (idText) {
      const tspan = el('tspan', { x: cx, y, class: 'node-id-text' });
      tspan.textContent = idText;
      text.appendChild(tspan);
      y += LINE_HEIGHT;
    }

    nameLines.forEach((line) => {
      const tspan = el('tspan', { x: cx, y, class: 'node-name-text' });
      tspan.textContent = line;
      text.appendChild(tspan);
      y += LINE_HEIGHT;
    });

    return text;
  }

  let tleGradientSeq = 0;

  // Red-orange radial gradient, built fresh into the TLE's own <defs> on
  // every render (cheap, avoids id-collision headaches since the whole <g>
  // gets replaced each render anyway — mirrors the Hazard's stripe pattern).
  function renderTopLevelEvent(svgRoot, tle) {
    const { r, lines } = Bowtie.Layout.topLevelEventBounds(svgRoot, tle);
    tleGradientSeq += 1;
    const gradientId = `tle-gradient-${tleGradientSeq}`;

    const g = el('g', { class: 'node top-level-event', 'data-id': tle.id });

    const defs = el('defs', {});
    const gradient = el('radialGradient', {
      id: gradientId, cx: '35%', cy: '35%', r: '70%',
    });
    gradient.appendChild(el('stop', { offset: '0%', 'stop-color': '#fca5a5' }));
    gradient.appendChild(el('stop', { offset: '100%', 'stop-color': '#ea580c' }));
    defs.appendChild(gradient);
    g.appendChild(defs);

    g.appendChild(el('circle', {
      cx: tle.x, cy: tle.y, r, class: 'shape', fill: `url(#${gradientId})`,
    }));

    // White text-backing patch, mirroring the Hazard's own (renderHazard
    // below) — the radial gradient runs from a pale highlight near the
    // center to a dark red-orange band toward the rim, and dark text
    // sitting over that darker band was hard to read.
    const textBlockHeight = (lines.length * LINE_HEIGHT) + 8;
    const textBlockWidth = r * 1.3;
    g.appendChild(el('rect', {
      x: tle.x - textBlockWidth / 2, y: tle.y - textBlockHeight / 2,
      width: textBlockWidth, height: textBlockHeight, rx: 4, ry: 4, fill: '#ffffff',
    }));

    g.appendChild(textBlock(tle.x, tle.y, null, lines));
    return { g, bounds: { r } };
  }

  let hazardPatternSeq = 0;

  // Sharp-cornered rect with a yellow/black hazard-stripe fill and a white
  // text-backing patch so black text stays legible over the stripes.
  function renderHazard(hazard, layout) {
    hazardPatternSeq += 1;
    const patternId = `hazard-stripe-${hazardPatternSeq}`;

    const g = el('g', { class: 'node hazard', 'data-id': hazard.id });

    const defs = el('defs', {});
    const pattern = el('pattern', {
      id: patternId, patternUnits: 'userSpaceOnUse', width: 20, height: 20, patternTransform: 'rotate(45)',
    });
    pattern.appendChild(el('rect', { width: 20, height: 20, fill: '#f5c518' }));
    pattern.appendChild(el('rect', { x: 0, y: 0, width: 10, height: 20, fill: '#111827' }));
    defs.appendChild(pattern);
    g.appendChild(defs);

    g.appendChild(el('rect', {
      x: layout.x - layout.w / 2, y: layout.y - layout.h / 2, width: layout.w, height: layout.h,
      class: 'shape', fill: `url(#${patternId})`,
    }));

    const textBlockHeight = (layout.lines.length * LINE_HEIGHT) + 8;
    const textBlockWidth = layout.w - 16;
    g.appendChild(el('rect', {
      x: layout.x - textBlockWidth / 2, y: layout.y - textBlockHeight / 2,
      width: textBlockWidth, height: textBlockHeight, fill: '#ffffff',
    }));

    g.appendChild(textBlock(layout.x, layout.y, null, layout.lines));
    return { g, bounds: { w: layout.w, h: layout.h } };
  }

  // `node` here is a PLACEMENT (Cause/Outcome/PreventativeBarrier/
  // MitigativeBarrier) — `stableId`/`displayId`/`displayName` are resolved
  // by the caller (CanvasView) from the placement's `nodeId` against the
  // shared library (node_library_proposal.md "Two id spaces"). Three
  // distinct strings, each doing a different job:
  //   - `stableId` (the library NODE's own id, e.g. "C_1"): the DOM
  //     `data-id` — deliberately NOT the placement's own internal id.
  //     Drag/context-menu/focus resolve elements via this, and "at most
  //     one placement per node per page" (decided) makes a node id
  //     unambiguous within any single rendered page, so PageScopedModel's
  //     findById can resolve it back to this page's one placement (see
  //     that file) without ever needing the placement's own id exposed in
  //     the DOM at all.
  //   - `displayId`: the same node's id OR its custom identifier, per the
  //     document's identifierDisplayMode — what actually renders as text.
  //   - `displayName`: the node's name, for text wrapping/the label line.
  function renderCauseOrOutcome(svgRoot, node, kind, stableId, displayId, displayName) {
    const { w, h, lines } = Bowtie.Layout.causeOutcomeBounds(svgRoot, node, displayName);
    const g = el('g', { class: `node ${kind}`, 'data-id': stableId });
    g.appendChild(el('rect', {
      x: node.x - w / 2, y: node.y - h / 2, width: w, height: h,
      rx: 10, ry: 10, class: 'shape',
    }));
    g.appendChild(textBlock(node.x, node.y, displayId, lines));
    return { g, bounds: { w, h } };
  }

  function renderControl(svgRoot, node, kind, laneYs, stableId, displayId, displayName) {
    const { w, h, cy } = Bowtie.Layout.controlBounds(node, laneYs);
    const g = el('g', { class: `node ${kind}`, 'data-id': stableId });
    g.appendChild(el('rect', {
      x: node.x - w / 2, y: cy - h / 2, width: w, height: h,
      rx: 4, ry: 4, class: 'shape',
    }));

    const labelMaxWidth = 110;
    const labelLines = Bowtie.TextWrap.wrapText(svgRoot, displayName, labelMaxWidth, FONT_SIZE);
    const labelBlockHeight = (labelLines.length + 1) * LINE_HEIGHT;
    const labelTop = cy + h / 2 + 14;
    const labelCenterY = labelTop + (labelBlockHeight / 2);
    g.appendChild(textBlock(node.x, labelCenterY, displayId, labelLines));

    // The id/description label sits below the box and isn't accounted for
    // by w/h alone — CanvasView's content-bounds tracking needs these too,
    // or exports crop the label of the lowest barrier on the canvas.
    return {
      g,
      bounds: {
        w, h, cy, labelCenterY, labelHalfWidth: labelMaxWidth / 2, labelHalfHeight: labelBlockHeight / 2,
      },
    };
  }

  Bowtie.ShapeRenderer = {
    renderTopLevelEvent,
    renderHazard,
    renderCause: (svgRoot, node, stableId, displayId, displayName) => renderCauseOrOutcome(
      svgRoot, node, 'cause', stableId, displayId, displayName,
    ),
    renderOutcome: (svgRoot, node, stableId, displayId, displayName) => renderCauseOrOutcome(
      svgRoot, node, 'outcome', stableId, displayId, displayName,
    ),
    renderPreventativeBarrier: (svgRoot, node, laneYs, stableId, displayId, displayName) => renderControl(
      svgRoot, node, 'preventative-barrier', laneYs, stableId, displayId, displayName,
    ),
    renderMitigativeBarrier: (svgRoot, node, laneYs, stableId, displayId, displayName) => renderControl(
      svgRoot, node, 'mitigative-barrier', laneYs, stableId, displayId, displayName,
    ),
  };
})(window.Bowtie = window.Bowtie || {});
