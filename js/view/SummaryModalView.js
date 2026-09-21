(function (Bowtie) {
  // The shared shell behind View > Risk Summary and View > Barrier
  // Register (proposals/15).
  //
  // The proposal expected to extract a shared TABLE view. Reading the two
  // controllers properly, the tables are the part that legitimately
  // differs -- different columns, and the Risk Summary's head is two rows
  // deep with grouped pre-/post-mitigation spans. What was actually
  // duplicated, byte for byte, is everything AROUND the table: the
  // xwide modal, the Copy/CSV/Print/Close footer, the flash-the-button
  // acknowledgement, the print-the-tables-not-the-app class swap, the
  // refresh-if-still-open check, and `_copy` itself. That is what lives
  // here; `buildBody` stays with whichever controller knows its columns.
  //
  // One real inconsistency fell out of the comparison and is fixed by
  // having one implementation: the Risk Summary sanitised its CSV
  // filename with a hand-written regex while the Barrier Register called
  // `ExportUtil.safeFileName`, which also trims leading/trailing dots and
  // spaces and falls back when the name is empty. Both go through the
  // helper now.

  // Swaps a footer button's label briefly, rather than opening a dialog
  // on top of this one to say "Copied".
  function flashAction(modal, label, message) {
    if (!modal) return;
    const btn = [...modal.dialog.querySelectorAll('.modal-actions button')]
      .find((b) => b.textContent === label);
    if (!btn) return;
    btn.textContent = message;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = label;
      btn.disabled = false;
    }, 1500);
  }

  // Print the tables, not the app behind them: the class swaps the print
  // stylesheet onto the open modal (see styles.css) and is dropped again
  // once the print dialog closes, whether it printed or not.
  function print() {
    const done = () => {
      document.body.classList.remove('printing-summary');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    document.body.classList.add('printing-summary');
    window.print();
  }

  // Copy the table as TSV -- what pastes straight into a spreadsheet or
  // a Word table -- and say so on the button.
  async function copyTable(modal, table) {
    const ok = await Bowtie.TableExport.copyText(Bowtie.TableExport.toTsv(table));
    flashAction(modal, 'Copy as table', ok ? 'Copied' : "Couldn't copy");
  }

  // The document identity block, as rows above the table (proposals/20),
  // when the user has asked for it -- see `includeHeader` below.
  //
  // Only what is stated, then a blank row, then the table. The blank row
  // is what lets a reader (and most spreadsheet imports) see where the
  // preamble ends and the data begins.
  function documentHeaderRows(doc) {
    if (!doc) return [];
    const stated = [
      ['Reference', doc.reference], ['Revision', doc.revision],
      ['Status', doc.status], ['Date', doc.date],
      ['Organisation', doc.organisation], ['Prepared by', doc.author],
      ['Checked by', doc.checkedBy], ['Approved by', doc.approvedBy],
    ].filter(([, value]) => value);
    return stated.length > 0 ? [...stated, []] : [];
  }

  function exportCsv(table, documentName, suffix, doc) {
    const name = Bowtie.ExportUtil.safeFileName(documentName, 'bowtie-diagram');
    const header = documentHeaderRows(doc);
    const csv = Bowtie.TableExport.toCsv(
      header.length > 0 ? { columns: table.columns, rows: table.rows, before: header } : table,
    );
    Bowtie.ExportUtil.exportCsv(csv, `${name} - ${suffix}.csv`);
  }

  // Re-render an open modal's body in place. A no-op when the modal was
  // closed, which is why it checks the overlay is still in the document
  // rather than just that `modal` is non-null.
  function refresh(modal, buildBody) {
    if (modal && document.body.contains(modal.overlay)) modal.setBody(buildBody());
  }

  // `exportable` gates the three export actions: a table with no rows has
  // nothing to copy, and offering the buttons anyway would be a promise
  // the modal can't keep. Each returns false so the modal stays open --
  // someone exporting a CSV usually wants to keep reading the table.
  // `onExportCsv(includeHeader)` is handed the checkbox's state
  // (proposals/20). Default OFF, deliberately: a spreadsheet import
  // wants a clean header row, and prepending eight label/value rows
  // breaks the naive `read_csv` that most people reach for first.
  //
  // It exists at all because someone filing a CSV next to the PDF wants
  // the two to say the same revision. Print does not need the option --
  // it gets the full cover sheet.
  function open({ title, bodyEl, exportable, onCopy, onExportCsv }) {
    let headerToggle = null;
    const modal = Bowtie.ModalView.openModal({
      title,
      bodyEl,
      size: 'xwide',
      actions: [
        ...(exportable ? [
          { label: 'Copy as table', onClick: () => { onCopy(); return false; } },
          {
            label: 'Export CSV…',
            onClick: () => { onExportCsv(Boolean(headerToggle && headerToggle.checked)); return false; },
          },
          { label: 'Print…', onClick: () => { print(); return false; } },
        ] : []),
        { label: 'Close', primary: true },
      ],
    });

    if (exportable) {
      const row = Bowtie.Dom.el('label', 'summary-csv-header-toggle');
      headerToggle = document.createElement('input');
      headerToggle.type = 'checkbox';
      headerToggle.name = 'include-document-header';
      row.append(headerToggle, Bowtie.Dom.el('span', null, 'Include document header in CSV'));
      // Into the actions row, before the buttons, so it reads as a
      // modifier of the export rather than a fifth action.
      const actions = modal.dialog.querySelector('.modal-actions');
      actions.insertBefore(row, actions.firstChild);
    }

    return modal;
  }

  Bowtie.SummaryModalView = {
    open, flashAction, print, copyTable, exportCsv, refresh,
  };
})(window.Bowtie = window.Bowtie || {});
