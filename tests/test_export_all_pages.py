"""File › "Export all pages as SVG/PNG…" and "Print…" (proposals/02).

Exporting used to mean the ACTIVE page only, so a multi-page document had
to be exported a tab at a time and there was no way to get the diagrams
and the Risk Summary into one shareable document. Both now render each
page through ExportUtil.createPageRenderer -- an off-screen surface, so
the live canvas is never disturbed and the user never has to switch tabs.
"""


def _two_pages(page):
    """Page one keeps the wizard's C_1; page two gets its own cause, so
    each exported file can be told apart by its own node's name."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Topside' });
      m.addCause({ x: 150, y: 200, name: 'Topside Leak' });
      const p2 = m.addPage({ name: 'Subsea' });
      m.addCause({ x: 150, y: 200, pageId: p2.id, name: 'Subsea Leak' });
    }""")
    page.wait_for_timeout(100)


def _mock_directory_picker(page):
    page.evaluate("""() => {
      window.__files = {};
      window.showDirectoryPicker = async () => ({
        getFileHandle: async (name) => ({ createWritable: async () => ({
          write: async (blob) => { window.__files[name] = await blob.text(); },
          close: async () => {},
        }) }),
      });
    }""")


def _export_all(page, which="svg"):
    page.click("#menu-trigger-file")
    page.click(f"#btn-export-all-{which}")
    page.wait_for_timeout(900)


def test_export_all_pages_writes_one_correctly_scoped_file_per_page(page):
    _two_pages(page)
    _mock_directory_picker(page)
    _export_all(page)

    files = page.evaluate("() => window.__files")
    assert len(files) == 2
    names = sorted(files)
    assert names[0].endswith(" - Subsea.svg") and names[1].endswith(" - Topside.svg")
    assert all(n.startswith("Untitled Bowtie - ") for n in names), "named after the analysis"

    topside = files[[n for n in names if "Topside" in n][0]]
    subsea = files[[n for n in names if "Subsea" in n][0]]
    assert "Topside Leak" in topside and "Subsea Leak" not in topside
    assert "Subsea Leak" in subsea and "Topside Leak" not in subsea


def test_export_all_pages_leaves_the_live_canvas_and_active_page_alone(page):
    _two_pages(page)
    before = page.evaluate("() => document.getElementById('nodes-layer').innerHTML")
    active_before = page.locator(".page-tab.active .page-tab-label").text_content()
    _mock_directory_picker(page)
    _export_all(page)

    assert page.locator(".page-tab.active .page-tab-label").text_content() == active_before, \
        "exporting must not switch pages"
    assert page.evaluate("() => document.getElementById('nodes-layer').innerHTML") == before
    assert page.evaluate("() => document.querySelectorAll('body > svg').length") == 0, \
        "the off-screen render surface is torn down"


def test_export_all_pages_falls_back_to_downloads_without_the_directory_api(page):
    _two_pages(page)
    page.evaluate("() => { delete window.showDirectoryPicker; }")

    downloads = []
    page.on("download", lambda d: downloads.append(d.suggested_filename))
    _export_all(page)
    page.wait_for_timeout(700)

    assert len(downloads) == 2
    assert any("Topside" in n for n in downloads) and any("Subsea" in n for n in downloads)


def test_cancelling_the_folder_picker_writes_nothing(page):
    _two_pages(page)
    page.evaluate("""() => {
      window.__files = {};
      window.showDirectoryPicker = async () => {
        const err = new Error('cancelled');
        err.name = 'AbortError';
        throw err;
      };
    }""")
    _export_all(page)

    assert page.evaluate("() => Object.keys(window.__files).length") == 0
    assert page.locator(".modal-overlay").count() == 0, "the loading modal closes again"


def test_export_all_pages_as_png_writes_png_files(page):
    _two_pages(page)
    page.evaluate("""() => {
      window.__types = {};
      window.showDirectoryPicker = async () => ({
        getFileHandle: async (name) => ({ createWritable: async () => ({
          write: async (blob) => { window.__types[name] = blob.type; },
          close: async () => {},
        }) }),
      });
    }""")
    _export_all(page, "png")
    page.wait_for_timeout(600)

    types = page.evaluate("() => window.__types")
    assert len(types) == 2
    assert all(name.endswith(".png") for name in types)
    assert all(mime == "image/png" for mime in types.values())


def test_all_page_exports_are_blocked_by_a_blocking_warning(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
      m.connectLineDirectlyToTle(m._lineFor(m.causes[0].id).id, null);
    }""")
    page.wait_for_timeout(100)
    for btn in ("btn-export-all-svg", "btn-export-all-png", "btn-print"):
        assert page.locator(f"#{btn}").is_disabled(), f"{btn} must be blocked like every other export"


# --- Print… -----------------------------------------------------------------

def test_print_builds_a_sheet_per_page_plus_the_risk_summary(page):
    _two_pages(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      m.renameNode(m.causes[0].nodeId, { frequency: { value: '1E-5' } });
      const o = m.addOutcome({ x: 1200, y: 200, name: 'Fire' });
      m.renameNode(o.nodeId, { severityClassId: 'major' });
      window.__printed = 0;
      window.print = () => { window.__printed += 1; };
    }""")
    page.wait_for_timeout(100)

    page.click("#menu-trigger-file")
    page.click("#btn-print")
    page.wait_for_timeout(500)

    assert page.evaluate("() => window.__printed") == 1
    assert page.evaluate("() => document.body.classList.contains('printing-document')") is True
    root = page.locator("#print-root")
    assert root.locator(".print-page").count() == 3, "two diagram sheets plus the summary"
    assert root.locator(".print-page-figure svg").count() == 2
    assert root.locator(".risk-summary-table").count() >= 1
    # Each sheet names the analysis, its page, and the mode/matrix context.
    headers = root.locator(".print-page-header").all_text_contents()
    assert any("Topside" in h for h in headers) and any("Subsea" in h for h in headers)
    assert all("Quantitative" in h and "Leaflet 5" in h for h in headers)
    # The inlined SVGs are sized by the sheet, not by their own attributes.
    assert page.evaluate("""() => {
      const svg = document.querySelector('#print-root .print-page-figure svg');
      return svg.hasAttribute('width') || svg.hasAttribute('height');
    }""") is False

    page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
    page.wait_for_timeout(80)
    assert page.locator("#print-root").count() == 0, "torn down again, so nothing stale is reprinted"
    assert page.evaluate("() => document.body.classList.contains('printing-document')") is False


def test_print_without_a_risk_matrix_still_prints_the_diagrams(page):
    _two_pages(page)
    page.evaluate("() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }")
    page.click("#menu-trigger-file")
    page.click("#btn-print")
    page.wait_for_timeout(400)

    root = page.locator("#print-root")
    assert root.locator(".print-page").count() == 2, "no summary section in Simple mode"
    assert root.locator(".print-page-figure svg").count() == 2
    page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")


def test_single_page_export_and_json_are_named_after_the_analysis(page):
    page.evaluate("""() => {
      window.__lastModel.setName('Pipeline Study');
      window.__suggested = [];
      window.showSaveFilePicker = async (opts) => {
        window.__suggested.push(opts.suggestedName);
        return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
      };
    }""")
    page.wait_for_timeout(80)
    page.click("#menu-trigger-file")
    page.click("#btn-export-svg")
    page.wait_for_timeout(200)
    page.click("#menu-trigger-file")
    page.click("#btn-export-json")
    page.wait_for_timeout(200)

    assert page.evaluate("() => window.__suggested") == ["Pipeline Study.svg", "Pipeline Study.json"]
