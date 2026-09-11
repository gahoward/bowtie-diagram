"""Import/export prefer a real native file-picker dialog (the File System
Access API: `showSaveFilePicker`/`showOpenFilePicker`) over the old silent
download-link / hidden-`<input>` behaviour, wherever that API exists —
falling back transparently everywhere it doesn't (Firefox, Safari, or a
file:// page). Since a real native OS dialog can't be driven from an
automated test, the "native path" tests mock the two entry points with an
in-page fake that records what was written/return a canned file, and the
"fallback" tests delete the API from the page so the legacy path — which
already had its own coverage before this feature — runs deterministically.
"""
import json


def test_export_json_uses_the_native_save_picker_when_available(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
    }""")
    page.wait_for_timeout(100)

    result = page.evaluate("""async () => {
      let savedOpts = null;
      let writtenText = null;
      window.showSaveFilePicker = async (opts) => {
        savedOpts = opts;
        return {
          createWritable: async () => ({
            write: async (blob) => { writtenText = await blob.text(); },
            close: async () => {},
          }),
        };
      };
      Bowtie.ExportUtil.exportJson(window.__lastModel, 'bowtie-diagram.json');
      await new Promise((r) => setTimeout(r, 50));
      return { suggestedName: savedOpts.suggestedName, written: JSON.parse(writtenText) };
    }""")
    assert result["suggestedName"] == "bowtie-diagram.json"
    assert result["written"]["causes"][0]["nodeId"] == "C_1"


def test_export_falls_back_to_download_when_the_api_is_unavailable(page):
    with page.expect_download() as dl_info:
        page.evaluate("""() => {
          delete window.showSaveFilePicker;
          Bowtie.ExportUtil.exportJson(window.__lastModel, 'bowtie-diagram.json');
        }""")
    download = dl_info.value
    assert download.suggested_filename == "bowtie-diagram.json"


def _sample_export_with_one_cause_named(page, name):
    """A real, structurally-valid export doc (built via the model's own
    addCause + toJSON, then renamed) rather than a hand-spliced one — a
    Cause also needs a matching entry in `lines`, which the model keeps in
    sync automatically but a hand-built fixture easily forgets."""
    return page.evaluate(
        """(name) => {
          const m = window.__lastModel;
          m.addCause({x: 150, y: 200});
          const data = m.toJSON();
          data.library.cause[0].name = name; // a placement has no name of its own -- see Node.js
          return data;
        }""",
        name,
    )


def test_import_uses_the_native_open_picker_when_available(page):
    data = _sample_export_with_one_cause_named(page, "From Picker")
    page.evaluate(
        """(text) => {
          window.showOpenFilePicker = async () => [{
            getFile: async () => ({ text: async () => text }),
          }];
        }""",
        json.dumps(data),
    )
    page.click("#menu-trigger-file")
    page.click("#btn-import-json")
    page.wait_for_timeout(100)

    causes = page.evaluate("() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)")
    assert causes == ["From Picker"]


def test_import_falls_back_to_the_hidden_input_when_the_api_is_unavailable(page, tmp_path):
    page.evaluate("() => { delete window.showOpenFilePicker; }")

    data = _sample_export_with_one_cause_named(page, "From Input")
    file_path = tmp_path / "import.json"
    file_path.write_text(json.dumps(data))

    with page.expect_file_chooser() as fc_info:
        page.click("#menu-trigger-file")
        page.click("#btn-import-json")
    fc_info.value.set_files(str(file_path))
    page.wait_for_timeout(100)

    causes = page.evaluate("() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)")
    assert causes == ["From Input"]


def test_png_export_handles_a_null_blob_without_throwing(page):
    """architecture review finding: `canvas.toBlob` hands back `null`
    instead of throwing when the canvas is too large to encode (auto-arrange
    lays out into unbounded space, so a large enough diagram at export scale
    is a real, reachable case, not a contrived one) — an unguarded
    `saveBlob(null, ...)` would eventually reach `URL.createObjectURL(null)`
    and throw uncaught in the fallback download path. The `page` fixture's
    own teardown (conftest.py) already fails this test on any uncaught page
    error, so simply completing is itself the main assertion; the shown
    alert message is checked too for good measure."""
    page.evaluate("""() => {
      HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); };
      window.__alerts = [];
      window.alert = (msg) => { window.__alerts.push(msg); };
    }""")
    page.evaluate("""() => {
      const svgRoot = document.querySelector('#bowtie-canvas');
      Bowtie.ExportUtil.exportPng(svgRoot, { minX: 0, minY: 0, maxX: 400, maxY: 400 }, 'test.png');
    }""")
    page.wait_for_timeout(200)
    alerts = page.evaluate("() => window.__alerts")
    assert len(alerts) == 1
    assert "too large" in alerts[0]


def test_cancelling_the_native_open_picker_does_nothing(page):
    page.evaluate("""() => {
      const err = new DOMException('cancelled', 'AbortError');
      window.showOpenFilePicker = async () => { throw err; };
    }""")
    page.click("#menu-trigger-file")
    page.click("#btn-import-json")
    page.wait_for_timeout(100)

    # No file chooser opened, no crash, and the diagram is untouched.
    assert page.evaluate("() => window.__lastModel.causes.length") == 0
