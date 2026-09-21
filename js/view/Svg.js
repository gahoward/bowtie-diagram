(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // The SVG element helper (proposals/15) -- the createElementNS
  // counterpart to Dom.js. See that file's header for why the two are
  // separate modules with separate names rather than one `el`.
  //
  // There were three shapes of this function in the tree, not the two the
  // proposal expected: ShapeRenderer and MinimapView used
  // `el(tag, attrs)`, and WelcomeIllustration used
  // `el(tag, attrs = {}, text)`, which also set textContent and coerced
  // attribute values with String(). This signature is a superset of all
  // three -- `setAttribute` coerces its value anyway, and an omitted
  // `text` leaves textContent alone -- so every existing call site means
  // exactly what it meant before.
  function el(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  Bowtie.Svg = { NS: SVG_NS, el };
})(window.Bowtie = window.Bowtie || {});
