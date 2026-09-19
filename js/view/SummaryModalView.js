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

  function exportCsv(table, documentName, suffix) {
    const name = Bowtie.ExportUtil.safeFileName(documentName, 'bowtie-diagram');
    Bowtie.ExportUtil.exportCsv(Bowtie.TableExport.toCsv(table), `${name} - ${suffix}.csv`);
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
  function open({ title, bodyEl, exportable, onCopy, onExportCsv }) {
    return Bowtie.ModalView.openModal({
      title,
      bodyEl,
      size: 'xwide',
      actions: [
        ...(exportable ? [
          { label: 'Copy as table', onClick: () => { onCopy(); return false; } },
          { label: 'Export CSV…', onClick: () => { onExportCsv(); return false; } },
          { label: 'Print…', onClick: () => { print(); return false; } },
        ] : []),
        { label: 'Close', primary: true },
      ],
    });
  }

  Bowtie.SummaryModalView = {
    open, flashAction, print, copyTable, exportCsv, refresh,
  };
})(window.Bowtie = window.Bowtie || {});
