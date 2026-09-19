(function (Bowtie) {
  const el = Bowtie.Dom.el;

  // File > "Print…": builds a whole-document print surface -- every page's
  // diagram, one per sheet, then the Risk Summary tables -- so a browser's
  // print-to-PDF produces the entire analysis in one file, with no new
  // dependency. Hidden on screen (`#print-root` is `display: none` except
  // under `@media print`), rebuilt on every print and torn down on
  // `afterprint`, so nothing stale is ever printed and the DOM carries no
  // second copy of the diagram between prints.
  //
  // Each page's diagram is rendered through ExportUtil.createPageRenderer
  // -- the same off-screen surface the all-pages export uses -- and
  // inlined as the finished export SVG (self-contained styles, white
  // background, full content bounds), so the sheet matches the file a
  // user would have exported.
  function printDocument(model, { opts = {}, displayUnit = 'hour', riskSummaryBody } = {}) {
    const root = el('div', null);
    root.id = 'print-root';

    const matrixName = model.riskMatrix ? model.riskMatrix.name : null;
    const MODE_LABELS = { simple: 'Simple', qualitative: 'Qualitative', quantitative: 'Quantitative' };
    const context = [MODE_LABELS[model.mode] || model.mode, matrixName,
      model.mode === 'quantitative' ? (displayUnit === 'year' ? 'events/year' : 'events/hour') : null]
      .filter(Boolean).join(' · ');
    const printedOn = new Date().toLocaleDateString();

    const renderer = Bowtie.ExportUtil.createPageRenderer(model, opts);
    try {
      model.pages.forEach((page) => {
        const section = el('section', 'print-page');
        section.dataset.pageId = page.id;
        const header = el('div', 'print-page-header');
        header.appendChild(el('span', 'print-page-title', `${model.name} — ${page.name}`));
        header.appendChild(el('span', 'print-page-meta', `${context} · ${printedOn}`));
        section.appendChild(header);
        if (page.description) section.appendChild(el('p', 'print-page-description', page.description));

        const { svgRoot, bounds } = renderer.render(page.id);
        const { svgString } = Bowtie.ExportUtil.buildExportSvgString(svgRoot, bounds);
        const figure = el('div', 'print-page-figure');
        // The export SVG carries its own width/height; let the sheet
        // decide instead, so a wide diagram scales down to fit.
        figure.innerHTML = svgString.replace(/(<svg[^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, '$1');
        section.appendChild(figure);
        root.appendChild(section);
      });
    } finally {
      renderer.destroy();
    }

    // The Risk Summary, when there is one -- the same body the modal
    // builds, so the printed tables can never drift from the on-screen
    // ones. Its own print styles hide the modal chrome; here it's plain
    // content, so it needs none of that.
    if (riskSummaryBody) {
      const summary = el('section', 'print-page print-summary');
      summary.appendChild(riskSummaryBody);
      root.appendChild(summary);
    }

    const previous = document.getElementById('print-root');
    if (previous) previous.remove();
    document.body.appendChild(root);

    const cleanUp = () => {
      root.remove();
      document.body.classList.remove('printing-document');
      window.removeEventListener('afterprint', cleanUp);
    };
    window.addEventListener('afterprint', cleanUp);
    document.body.classList.add('printing-document');
    window.print();
  }

  Bowtie.PrintView = { printDocument };
})(window.Bowtie = window.Bowtie || {});
