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

  // The cover sheet (proposals/20). The single highest-value consumer of
  // the document identity block, and most of the reason to have built
  // it: a printed analysis that cannot say who produced it, when, at
  // what revision and who accepted it is not an audit artifact.
  //
  // Only states what is stated. A blank field is omitted rather than
  // printed as an empty row, and a document with nothing filled in gets
  // no cover sheet at all -- a page of empty labels would suggest the
  // analysis is incomplete, when a working sketch is a legitimate use of
  // this tool.
  const COVER_FIELDS = [
    ['reference', 'Reference'],
    ['revision', 'Revision'],
    ['status', 'Status'],
    ['date', 'Date'],
    ['organisation', 'Organisation'],
    ['author', 'Prepared by'],
    ['checkedBy', 'Checked by'],
    ['approvedBy', 'Approved by'],
  ];

  function hasAnything(doc) {
    if (!doc) return false;
    return COVER_FIELDS.some(([key]) => doc[key])
      || Boolean(doc.notes) || (doc.history || []).length > 0;
  }

  function coverSheet(model, doc) {
    const section = el('section', 'print-page print-cover');
    section.appendChild(el('h1', 'print-cover-title', model.name));

    const stated = COVER_FIELDS.filter(([key]) => doc[key]);
    if (stated.length > 0) {
      const dl = el('dl', 'print-cover-fields');
      stated.forEach(([key, label]) => {
        dl.appendChild(el('dt', null, label));
        dl.appendChild(el('dd', null, doc[key]));
      });
      section.appendChild(dl);
    }

    if (doc.notes) {
      section.appendChild(el('h2', 'print-cover-heading', 'Notes'));
      section.appendChild(el('p', 'print-cover-notes', doc.notes));
    }

    if (doc.history.length > 0) {
      section.appendChild(el('h2', 'print-cover-heading', 'Revision history'));
      const table = el('table', 'print-cover-history');
      const thead = document.createElement('thead');
      const head = document.createElement('tr');
      ['Revision', 'Date', 'Author', 'Summary'].forEach((t) => head.appendChild(el('th', null, t)));
      thead.appendChild(head);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      doc.history.forEach((entry) => {
        const tr = document.createElement('tr');
        [entry.revision, entry.date, entry.author, entry.summary]
          .forEach((v) => tr.appendChild(el('td', null, v)));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      section.appendChild(table);
    }

    return section;
  }

  // `reference · revision · date` for the foot of every diagram sheet
  // (proposals/20). A loose printed sheet on a desk should say what it
  // came from; without this, page 3 of an analysis is anonymous the
  // moment it leaves the stapler.
  function sheetProvenance(doc) {
    return ['reference', 'revision', 'date']
      .map((key) => doc[key])
      .filter(Boolean)
      .join(' · ');
  }

  function printDocument(model, { opts = {}, displayUnit = 'hour', riskSummaryBody } = {}) {
    const root = el('div', null);
    root.id = 'print-root';

    const doc = model.document || Bowtie.BowtieModel.emptyDocumentMetadata();
    if (hasAnything(doc)) root.appendChild(coverSheet(model, doc));
    const provenance = sheetProvenance(doc);

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

        if (provenance) {
          const footer = el('div', 'print-page-footer');
          footer.appendChild(el('span', null, provenance));
          footer.appendChild(el('span', null, page.name));
          section.appendChild(footer);
        }

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

  Bowtie.PrintView = { printDocument, sheetProvenance, hasAnything };
})(window.Bowtie = window.Bowtie || {});
