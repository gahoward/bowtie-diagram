(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Greedy word-wrap using real SVG text measurement (getComputedTextLength),
  // so wrapping is accurate for the actual font in use rather than an estimate.
  function wrapText(svgRoot, text, maxWidth, fontSize) {
    const measurer = document.createElementNS(SVG_NS, 'text');
    measurer.setAttribute('font-size', fontSize);
    measurer.setAttribute('visibility', 'hidden');
    svgRoot.appendChild(measurer);

    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      measurer.textContent = candidate;
      const width = measurer.getComputedTextLength();
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);

    svgRoot.removeChild(measurer);
    return lines.length ? lines : [''];
  }

  Bowtie.TextWrap = { wrapText };
})(window.Bowtie = window.Bowtie || {});
