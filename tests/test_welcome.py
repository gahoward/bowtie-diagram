"""The first-load welcome modal offers three side-by-side ways to start:
a "New Bowtie Wizard" button, an "Upload a .json file" button, and a drag-
and-drop zone — all three feeding the same validated import path
(ImportExportController._processImportedText) for the two file-based
options. These tests bypass the `page` fixture (it already drives past this
modal via "New Bowtie Wizard" -> "Create") and drive a fresh page directly,
so the modal itself is still on screen to assert against.
"""
from conftest import INIT_SCRIPT


def _fresh_page(browser, base_url):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    return pg


def test_choice_step_shows_three_side_by_side_options(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        cols = pg.locator(".welcome-choice-col")
        assert cols.count() == 3
        assert pg.get_by_role("button", name="New Bowtie Wizard", exact=True).is_visible()
        assert pg.get_by_role("button", name="Upload a .json file", exact=True).is_visible()
        assert pg.locator(".welcome-dropzone").is_visible()
        # Left-to-right order matters (matches the requested layout).
        texts = cols.all_text_contents()
        assert "New Bowtie Wizard" in texts[0]
        assert "Upload a .json file" in texts[1]
        assert "Drag and drop" in texts[2]
    finally:
        assert pg.errors == []
        pg.close()


def test_new_bowtie_wizard_button_opens_the_setup_step(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="New Bowtie Wizard", exact=True).click()
        assert pg.get_by_role("button", name="Create", exact=True).is_visible()
        # The setup step is a plain single-column form -- the wide
        # three-column dialog width shouldn't carry over.
        assert "welcome-dialog" not in pg.locator(".modal-dialog").get_attribute("class")
    finally:
        assert pg.errors == []
        pg.close()


def test_upload_button_opens_the_native_file_chooser(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        with pg.expect_file_chooser():
            pg.get_by_role("button", name="Upload a .json file", exact=True).click()
    finally:
        assert pg.errors == []
        pg.close()


def test_load_demo_button_sits_below_the_wizard_button_in_its_column(browser, base_url):
    """demo_json_proposal.md §3: the demo button lives inside the existing
    wizard column, stacked below "New Bowtie Wizard" -- not a fourth
    column."""
    pg = _fresh_page(browser, base_url)
    try:
        cols = pg.locator(".welcome-choice-col")
        assert cols.count() == 3, "still three columns -- the demo button must not add a fourth"
        first_col_text = cols.nth(0).text_content()
        assert "New Bowtie Wizard" in first_col_text
        assert "Load Demo" in first_col_text
    finally:
        assert pg.errors == []
        pg.close()


def test_load_demo_button_populates_the_editor_and_dismisses_the_modal(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Load Demo", exact=True).click()
        pg.wait_for_timeout(150)
        state = pg.evaluate("""() => {
          const m = window.__lastModel;
          return {
            name: m.name,
            causeCount: m.causes.length,
            outcomeCount: m.outcomes.length,
            warnings: m.getWarnings().length,
          };
        }""")
        assert state["causeCount"] > 0
        assert state["outcomeCount"] > 0
        assert state["warnings"] == 0, "the shipped demo must not import with orphaned barriers"
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()


def test_app_chrome_stays_hidden_until_the_welcome_flow_completes(browser, base_url):
    """Design review finding 05: BowtieModel's constructor always creates
    one bridging-default page (TLE + Hazard) so every pre-multi-page call
    site has something to read -- the visible side effect was the toolbar,
    an "Untitled Page" tab, and a populated minimap all painting behind the
    welcome modal before New/Import/Demo was even chosen. `#app` now stays
    `visibility: hidden` (present for layout, absent from paint) until the
    flow completes."""
    pg = _fresh_page(browser, base_url)
    try:
        app = pg.locator("#app")
        assert app.evaluate("(el) => getComputedStyle(el).visibility") == "hidden"
        # Layout must still be intact underneath -- only painting is
        # suppressed, so the canvas isn't zero-sized when it becomes visible.
        box = app.bounding_box()
        assert box["width"] > 0 and box["height"] > 0

        pg.get_by_role("button", name="Load Demo", exact=True).click()
        pg.wait_for_timeout(150)
        assert app.evaluate("(el) => getComputedStyle(el).visibility") == "visible"
    finally:
        assert pg.errors == []
        pg.close()


def test_ctrl_alt_d_loads_the_demo_while_the_welcome_modal_is_open(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.keyboard.down("Control")
        pg.keyboard.down("Alt")
        pg.keyboard.press("D")
        pg.keyboard.up("Alt")
        pg.keyboard.up("Control")
        pg.wait_for_timeout(150)
        cause_count = pg.evaluate("() => window.__lastModel.causes.length")
        assert cause_count > 0
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()


def test_ctrl_alt_d_does_nothing_once_the_welcome_modal_has_closed(browser, base_url):
    """Deliberately scoped to the welcome modal only (demo_json_proposal.md
    §4) -- once real work could exist, the shortcut must not silently wipe
    it."""
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="New Bowtie Wizard", exact=True).click()
        pg.get_by_role("button", name="Create", exact=True).click()
        pg.wait_for_timeout(150)
        pg.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200, name: 'Real work'}); }")
        pg.wait_for_timeout(80)

        pg.keyboard.down("Control")
        pg.keyboard.down("Alt")
        pg.keyboard.press("D")
        pg.keyboard.up("Alt")
        pg.keyboard.up("Control")
        pg.wait_for_timeout(150)

        state = pg.evaluate("""() => {
          const m = window.__lastModel;
          const first = m.causes[0];
          return { causeCount: m.causes.length, firstCauseName: first ? m.getNode(first.nodeId).name : null };
        }""")
        assert state["causeCount"] == 1
        assert state["firstCauseName"] == "Real work"
    finally:
        assert pg.errors == []
        pg.close()


def test_load_demo_routes_through_the_same_version_validation_as_a_real_import(browser, base_url):
    """demo_json_proposal.md §2: the demo must not bypass
    ImportExportController's validation -- if a Bowtie.DEMO_DATA_VARIANTS
    entry ever goes stale relative to SCHEMA_VERSION, it should fail exactly
    like a real stale export would, not silently load. The welcome wizard's
    "Load Demo" button loads whichever variant its own <select> defaults to
    (WelcomeController._demoVariant, 'simple') via DEMO_DATA_VARIANTS -- not
    the standalone Bowtie.DEMO_DATA back-compat alias -- so every variant is
    staled out here regardless of which one is actually selected."""
    pg = _fresh_page(browser, base_url)
    try:
        pg.evaluate("""() => {
          Object.keys(window.Bowtie.DEMO_DATA_VARIANTS).forEach((key) => {
            window.Bowtie.DEMO_DATA_VARIANTS[key] = { ...window.Bowtie.DEMO_DATA_VARIANTS[key], version: -1 };
          });
          window.Bowtie.DEMO_DATA = { ...window.Bowtie.DEMO_DATA, version: -1 };
        }""")
        pg.get_by_role("button", name="Load Demo", exact=True).click()
        pg.wait_for_timeout(150)
        assert pg.get_by_text("Unsupported File Version").count() > 0
        # The welcome modal itself must still be up -- nothing was loaded.
        assert pg.get_by_role("button", name="Load Demo", exact=True).count() > 0
    finally:
        assert pg.errors == []
        pg.close()


def test_dropping_a_json_file_on_the_dropzone_imports_it(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        result = pg.evaluate("""() => {
          const file = new File(
            [JSON.stringify({
              version: Bowtie.BowtieModel.SCHEMA_VERSION,
              name: 'Dropped Bowtie',
              hazard: { id: 'H_1', name: 'Hazard' },
              topLevelEvent: { id: 'TLE_1', name: 'Top-Level Event' },
              causes: [], outcomes: [], preventativeBarriers: [], mitigativeBarriers: [], lines: [],
            })],
            'dropped.json',
            { type: 'application/json' },
          );
          const zone = document.querySelector('.welcome-dropzone');
          const ev = new Event('drop', { bubbles: true, cancelable: true });
          Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } });
          zone.dispatchEvent(ev);
          return true;
        }""")
        assert result is True
        pg.wait_for_timeout(150)
        name = pg.evaluate("() => window.__lastModel.name")
        assert name == "Dropped Bowtie"
        # A successful import must dismiss the (non-dismissible-by-click)
        # welcome modal, same as the wizard/upload paths do.
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()
