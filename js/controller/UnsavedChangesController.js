(function (Bowtie) {
  // Warns before the tab/window actually closes if the document has
  // mutations since the last JSON export/import, or since the "New Bowtie"
  // welcome flow finished setting up a fresh document -- so a diagram that
  // was never saved doesn't disappear silently.
  //
  // Every browser that still honors `beforeunload` shows its own fixed,
  // non-customizable text ("Changes you made may not be saved.", or
  // similar) -- no site has been able to set a custom message for years,
  // and the dialog itself offers only Leave/Cancel, no third button. So
  // this can't put an "Export to JSON" action IN that native dialog; the
  // opportunity to export instead comes from choosing Cancel -- that just
  // stays on the page, with the Export JSON button one click away, same as
  // it always was.
  class UnsavedChangesController {
    constructor(rawModel) {
      this.dirty = false;
      rawModel.onChange(() => { this.dirty = true; });

      window.addEventListener('beforeunload', (e) => {
        if (!this.dirty) return;
        e.preventDefault();
        e.returnValue = '';
      });
    }

    markClean() {
      this.dirty = false;
    }
  }

  Bowtie.UnsavedChangesController = UnsavedChangesController;
})(window.Bowtie = window.Bowtie || {});
