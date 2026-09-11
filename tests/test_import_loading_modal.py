"""Importing JSON now shows a non-dismissible loading modal for the
duration of the import: opened before the (synchronous) parse/validate/
load/render work runs, and only closed once that work has finished --
successfully or not -- so the user always has feedback that an import is
in progress rather than the editor appearing to do nothing.

A real import is fast enough in this test fixture that catching the modal
by wall-clock timing (e.g. asserting it's visible mid-click) would be
flaky. Instead these spy on `Bowtie.ModalView.openModal` to record every
modal opened during the click -- proving the loading modal was actually
raised, with the right options, without racing the browser's paint.
"""
import json


def _spy_on_modals(page):
    page.evaluate("""() => {
      window.__openedModals = [];
      const orig = Bowtie.ModalView.openModal;
      Bowtie.ModalView.openModal = (opts) => {
        window.__openedModals.push({
          title: opts.title,
          dismissible: opts.dismissible !== false,
          actionCount: (opts.actions || []).length,
        });
        return orig(opts);
      };
    }""")


def _sample_export_with_one_cause(page):
    return page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200, name: 'Imported Cause'});
      return m.toJSON();
    }""")


def _mock_native_picker(page, data):
    page.evaluate(
        """(text) => {
          window.showOpenFilePicker = async () => [{
            getFile: async () => ({ text: async () => text }),
          }];
        }""",
        json.dumps(data),
    )


def _import_via_menu(page):
    page.click("#menu-trigger-file")
    page.click("#btn-import-json")


def test_importing_shows_a_non_dismissible_loading_modal_then_clears_it(page):
    data = _sample_export_with_one_cause(page)
    _spy_on_modals(page)
    _mock_native_picker(page, data)
    _import_via_menu(page)
    page.wait_for_timeout(150)

    loading_calls = [m for m in page.evaluate("() => window.__openedModals") if m["title"] == "Importing"]
    assert len(loading_calls) == 1, "the loading modal must be shown exactly once per import"
    assert loading_calls[0]["dismissible"] is False, "an in-flight import must not be dismissible"
    assert loading_calls[0]["actionCount"] == 0, "no buttons -- there's nothing for the user to do but wait"

    # Gone by the time the import has settled...
    assert page.locator(".modal-overlay", has_text="Importing your diagram").count() == 0
    # ...and the diagram it was importing is actually on screen -- the
    # loading modal must not have closed before the first page rendered.
    causes = page.evaluate("() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)")
    assert causes == ["Imported Cause"]
    assert page.locator("#bowtie-canvas .node.cause").count() == 1


def test_loading_modal_clears_even_when_the_import_fails_leaving_only_the_error_dialog(page):
    """A stale/invalid file must not leave the loading modal stuck on
    screen forever -- it has to close (the `finally` in
    ImportExportController._processImportedText) even though loadDocument
    itself only shows an error dialog and never throws."""
    data = _sample_export_with_one_cause(page)
    data["version"] = 3  # deliberately stale -- see test_import_export.py's version-mismatch guard
    _spy_on_modals(page)
    _mock_native_picker(page, data)
    _import_via_menu(page)
    page.wait_for_timeout(150)

    loading_calls = [m for m in page.evaluate("() => window.__openedModals") if m["title"] == "Importing"]
    assert len(loading_calls) == 1

    assert page.locator(".modal-overlay", has_text="Importing your diagram").count() == 0
    assert page.locator(".modal-title", has_text="Unsupported File Version").count() == 1
    page.get_by_role("button", name="OK", exact=True).click()

    # The failed import must not have touched the live model.
    assert page.evaluate("() => window.__lastModel.causes.length") == 1


def test_loading_modal_also_appears_on_the_legacy_hidden_input_path(page, tmp_path):
    page.evaluate("() => { delete window.showOpenFilePicker; }")
    data = _sample_export_with_one_cause(page)
    _spy_on_modals(page)
    file_path = tmp_path / "import.json"
    file_path.write_text(json.dumps(data))

    with page.expect_file_chooser() as fc_info:
        _import_via_menu(page)
    fc_info.value.set_files(str(file_path))
    page.wait_for_timeout(150)

    loading_calls = [m for m in page.evaluate("() => window.__openedModals") if m["title"] == "Importing"]
    assert len(loading_calls) == 1
    assert page.locator(".modal-overlay", has_text="Importing your diagram").count() == 0
    causes = page.evaluate("() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)")
    assert causes == ["Imported Cause"]
