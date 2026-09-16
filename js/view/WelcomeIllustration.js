(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let patternSeq = 0;

  // The two small "what a bowtie is" pictures the welcome flow shows --
  // the full causes -> barriers -> top event -> barriers -> outcomes
  // strip on the start screen, and just the hazard-over-TLE centre with
  // live labels on the wizard's names step. Built from the same CSS
  // colour tokens ExportUtil.buildExportStyle reads (and the Hazard's own
  // stripe treatment from ShapeRenderer) so the picture can never drift
  // from the shapes the canvas actually draws. Purely illustrative: no
  // model, no interaction.
  function tokens() {
    const root = getComputedStyle(document.documentElement);
    const v = (name) => root.getPropertyValue(`--${name}`).trim() || '#888';
    return {
      causeFill: v('cause-fill'), causeStroke: v('cause-stroke'),
      outcomeFill: v('outcome-fill'), outcomeStroke: v('outcome-stroke'),
      tleFill: v('tle-fill'), tleStroke: v('tle-stroke'),
      controlFill: v('control-fill'), controlStroke: v('control-stroke'),
      connection: v('connection'), text: v('node-text'), label: v('connection-label'),
    };
  }

  function el(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, val]) => node.setAttribute(k, String(val)));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Mirrors ShapeRenderer.renderHazard's stripes, scaled down for a small
  // box. A fresh id per call: several illustrations can be on screen at
  // once (start screen, then the names step) and ids are document-global.
  function hazardStripes(svg) {
    patternSeq += 1;
    const id = `welcome-hazard-stripe-${patternSeq}`;
    const defs = el('defs');
    const pattern = el('pattern', {
      id, patternUnits: 'userSpaceOnUse', width: 8, height: 8, patternTransform: 'rotate(45)',
    });
    pattern.appendChild(el('rect', { width: 8, height: 8, fill: '#f5c518' }));
    pattern.appendChild(el('rect', { x: 0, y: 0, width: 4, height: 8, fill: '#111827' }));
    defs.appendChild(pattern);
    svg.appendChild(defs);
    return `url(#${id})`;
  }

  // A hazard box: striped frame with a white label plate inside, the same
  // reading as the canvas's own (stripes around the edge, name on white).
  function hazardBox(svg, t, x, y, w, h, labelText) {
    const g = el('g');
    g.appendChild(el('rect', { x, y, width: w, height: h, rx: 2, fill: hazardStripes(svg), stroke: t.text, 'stroke-width': 1.2 }));
    g.appendChild(el('rect', { x: x + 5, y: y + 5, width: w - 10, height: h - 10, fill: '#ffffff' }));
    const label = el('text', {
      x: x + w / 2, y: y + h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': 8, 'font-weight': 600, fill: t.text,
    }, labelText);
    g.appendChild(label);
    return { g, label };
  }

  function tleCircle(t, cx, cy, r, labelText) {
    const g = el('g');
    g.appendChild(el('circle', { cx, cy, r, fill: t.tleFill, stroke: t.tleStroke, 'stroke-width': 1.6 }));
    const label = el('text', {
      x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': 8, 'font-weight': 600, fill: t.text,
    }, labelText);
    g.appendChild(label);
    return { g, label };
  }

  function node(t, kind, x, y, w, h, labelText) {
    const g = el('g');
    const fill = kind === 'cause' ? t.causeFill : t.outcomeFill;
    const stroke = kind === 'cause' ? t.causeStroke : t.outcomeStroke;
    g.appendChild(el('rect', { x, y, width: w, height: h, rx: 4, fill, stroke, 'stroke-width': 1.4 }));
    g.appendChild(el('text', {
      x: x + w / 2, y: y + h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 8, fill: t.text,
    }, labelText));
    return g;
  }

  function columnLabel(t, x, y, text) {
    return el('text', {
      x, y, 'text-anchor': 'middle', 'font-size': 8, 'letter-spacing': '0.08em', fill: t.label,
    }, text);
  }

  // The start screen's strip. Labelled so it doubles as the legend for the
  // wizard's field names (Top event, Hazard).
  function full() {
    const t = tokens();
    const svg = el('svg', { viewBox: '0 0 420 150', role: 'img', class: 'welcome-illustration-svg' });
    svg.appendChild(el('title', {}, 'A bowtie: causes on the left pass through preventative barriers to the top event, '
      + 'which sits under its hazard; from there mitigative barriers lead to the outcomes on the right.'));

    const lines = el('g', { stroke: t.connection, 'stroke-width': 1.4, fill: 'none' });
    lines.appendChild(el('path', { d: 'M62 52 H126 M62 98 H126 M136 52 L192 72 M136 98 L192 78' }));
    lines.appendChild(el('path', { d: 'M228 72 L290 52 M228 78 L290 98 M300 52 H358 M300 98 H358' }));
    svg.appendChild(lines);

    [126, 290].forEach((x) => {
      svg.appendChild(el('rect', { x, y: 30, width: 10, height: 90, rx: 2, fill: t.controlFill, stroke: t.controlStroke, 'stroke-width': 1.4 }));
    });
    svg.appendChild(node(t, 'cause', 14, 40, 48, 24, 'Cause'));
    svg.appendChild(node(t, 'cause', 14, 86, 48, 24, 'Cause'));
    svg.appendChild(node(t, 'outcome', 358, 40, 48, 24, 'Outcome'));
    svg.appendChild(node(t, 'outcome', 358, 86, 48, 24, 'Outcome'));

    svg.appendChild(hazardBox(svg, t, 182, 8, 56, 24, 'Hazard').g);
    svg.appendChild(el('line', { x1: 210, y1: 32, x2: 210, y2: 54, stroke: t.connection, 'stroke-width': 1.4 }));
    const tle = tleCircle(t, 210, 75, 21, 'Top event');
    tle.label.setAttribute('font-size', 7);
    svg.appendChild(tle.g);

    svg.appendChild(columnLabel(t, 38, 140, 'CAUSES'));
    svg.appendChild(columnLabel(t, 131, 140, 'PREVENT'));
    svg.appendChild(columnLabel(t, 210, 140, 'TOP EVENT'));
    svg.appendChild(columnLabel(t, 295, 140, 'MITIGATE'));
    svg.appendChild(columnLabel(t, 382, 140, 'OUTCOMES'));
    return svg;
  }

  const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  // The names step's preview: hazard box over the TLE circle, each label
  // bound to an input via the returned setters. Empty input shows the
  // field's own name, muted, so the picture still explains itself before
  // anything is typed.
  function centre() {
    const t = tokens();
    const svg = el('svg', { viewBox: '0 0 220 120', role: 'img', class: 'welcome-illustration-svg' });
    svg.appendChild(el('title', {}, 'Preview: the hazard sits above the top-level event.'));
    svg.appendChild(el('path', {
      d: 'M10 68 H82 M138 68 H210', stroke: t.connection, 'stroke-width': 1.4, 'stroke-dasharray': '4 4', fill: 'none',
    }));
    const hazard = hazardBox(svg, t, 45, 6, 130, 26, 'Hazard');
    svg.appendChild(hazard.g);
    svg.appendChild(el('line', { x1: 110, y1: 32, x2: 110, y2: 42, stroke: t.connection, 'stroke-width': 1.4 }));
    const tle = tleCircle(t, 110, 68, 26, 'Top event');
    tle.label.setAttribute('font-size', 7.5);
    svg.appendChild(tle.g);
    svg.appendChild(columnLabel(t, 110, 112, 'UPDATES AS YOU TYPE'));

    // Clip lengths are what fits each shape at its font size -- a longer
    // name is truncated with an ellipsis rather than spilling past the
    // box, since this is a preview of the label, not the label itself.
    const bind = (label, fallback, max) => (value) => {
      const text = value.trim();
      label.textContent = text ? clip(text, max) : fallback;
      label.setAttribute('fill', text ? t.text : t.label);
    };
    return {
      svg,
      setHazard: bind(hazard.label, 'Hazard', 24),
      setTle: bind(tle.label, 'Top event', 11),
    };
  }

  Bowtie.WelcomeIllustration = { full, centre };
})(window.Bowtie = window.Bowtie || {});
