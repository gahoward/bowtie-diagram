"""UnsavedChangesController: the beforeunload confirmation that warns
before a diagram with unsaved edits is closed, and gets cleared again by a
JSON export or a fresh import/new-document start."""


def _is_dirty(page):
    return page.evaluate("() => window.__lastUnsavedChanges.dirty")


def test_fresh_document_is_not_dirty(page):
    # The `page` fixture already ran the "New Bowtie" wizard through Create.
    assert _is_dirty(page) is False


def test_editing_the_model_marks_it_dirty(page):
    page.evaluate("() => window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'A threat'})")
    assert _is_dirty(page) is True


def test_undo_of_the_only_change_leaves_it_dirty(page):
    # Undoing still changes the in-memory document relative to what was last
    # exported/imported -- it is not the same state as a clean load, so this
    # deliberately does NOT special-case "back to a prior on-disk snapshot"
    # as clean again.
    page.evaluate("() => window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'A threat'})")
    page.click("#btn-undo")
    assert _is_dirty(page) is True


def test_exporting_json_marks_it_clean_again(page):
    page.evaluate("""() => {
      window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'A threat'});
      // Force the legacy download-link fallback path -- otherwise this
      // Chromium's real File System Access API would open a native "Save
      // As" dialog nothing here drives, and neither the download nor the
      // onExported callback this test checks would ever fire.
      delete window.showSaveFilePicker;
    }""")
    assert _is_dirty(page) is True

    page.click("#menu-trigger-file")
    with page.expect_download():
        page.click("#btn-export-json")
    page.wait_for_timeout(50)
    assert _is_dirty(page) is False


def test_cancelling_the_save_dialog_leaves_it_dirty(page):
    page.evaluate("""() => {
      window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'A threat'});
      class AbortError extends Error {}
      AbortError.prototype.name = 'AbortError';
      window.showSaveFilePicker = async () => { throw new AbortError('cancelled'); };
    }""")

    page.click("#menu-trigger-file")
    page.click("#btn-export-json")
    page.wait_for_timeout(50)
    assert _is_dirty(page) is True


def test_importing_a_document_marks_it_clean(page):
    page.evaluate("() => window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'A threat'})")
    assert _is_dirty(page) is True

    # Reuse the live document itself as the "imported" file so this doesn't
    # depend on a fixture file staying schema-compatible.
    page.evaluate("""() => {
      const data = window.__lastUndo.model.toJSON();
      window.__lastImportExport.loadDocument(data);
    }""")
    assert _is_dirty(page) is False


def test_beforeunload_warns_only_when_dirty(page):
    assert page.evaluate("""() => {
      const evt = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    }""") is False

    page.evaluate("() => window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'A threat'})")

    assert page.evaluate("""() => {
      const evt = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(evt);
      return evt.defaultPrevented;
    }""") is True
