"""The first-load flow (landing_page_proposal.md): a start screen with one
primary action ("Start a new bowtie"), the worked demo behind a Simple/
Qualitative/Quantitative chooser, and a single Open zone where browse and
drag-and-drop are the same box -- then, for a new bowtie, a two-step wizard
(names with a live preview, then risk mode + matrix). Every file-based way
in feeds the same validated import path
(ImportExportController._processImportedText). These tests bypass the
`page` fixture (it already drives past this flow) and drive a fresh page
directly, so the modal itself is still on screen to assert against.
"""
from conftest import INIT_SCRIPT, complete_new_bowtie_wizard


def _fresh_page(browser, base_url):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    return pg


def _fill(pg, label, value):
    pg.locator(f".modal-field:has-text('{label}') input").fill(value)


def _press_ctrl_alt_d(pg):
    pg.keyboard.down("Control")
    pg.keyboard.down("Alt")
    pg.keyboard.press("D")
    pg.keyboard.up("Alt")
    pg.keyboard.up("Control")
    pg.wait_for_timeout(150)


# --- Start screen ----------------------------------------------------------

def test_start_screen_has_one_primary_action_a_demo_chooser_and_one_open_zone(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        assert pg.get_by_role("button", name="Start a new bowtie", exact=True).is_visible()
        assert pg.locator(".modal-dialog .welcome-btn-primary").count() == 1, "exactly one filled primary button"
        assert pg.locator(".welcome-illustration svg").count() == 1
        # Demo: a segmented Simple/Qualitative/Quantitative chooser, Simple
        # pressed by default, then the button -- no bare <select>.
        options = pg.locator(".welcome-segmented-option")
        assert options.all_text_contents() == ["Simple", "Qualitative", "Quantitative"]
        assert options.nth(0).get_attribute("aria-pressed") == "true"
        assert pg.locator(".modal-dialog select").count() == 0
        assert pg.get_by_role("button", name="Explore the demo", exact=True).is_visible()
        # One Open zone with Browse inside it -- not a separate column.
        zone = pg.locator(".welcome-dropzone")
        assert zone.count() == 1
        assert zone.get_by_role("button", name="Browse…", exact=True).is_visible()
        assert pg.locator(".welcome-choice-col").count() == 0
        # No developer shortcut or internal-id leak in first-run copy.
        text = pg.locator(".modal-dialog").text_content()
        assert "Ctrl+Alt+D" not in text
        assert "T_1" not in text
    finally:
        assert pg.errors == []
        pg.close()


def test_start_screen_overlay_is_not_a_flat_void(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        overlay = pg.locator(".modal-overlay")
        assert "welcome-overlay" in overlay.get_attribute("class")
        assert overlay.evaluate("(el) => getComputedStyle(el).backgroundImage") != "none"
    finally:
        assert pg.errors == []
        pg.close()


def test_browse_button_and_clicking_the_zone_open_the_native_file_chooser(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        with pg.expect_file_chooser():
            pg.get_by_role("button", name="Browse…", exact=True).click()
        with pg.expect_file_chooser():
            pg.locator(".welcome-dropzone > span").click()
    finally:
        assert pg.errors == []
        pg.close()


def test_explore_the_demo_populates_the_editor_and_dismisses_the_modal(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Explore the demo", exact=True).click()
        pg.wait_for_timeout(150)
        state = pg.evaluate("""() => {
          const m = window.__lastModel;
          return { mode: m.mode, threatCount: m.threats.length, consequenceCount: m.consequences.length, warnings: m.getWarnings().length };
        }""")
        assert state["mode"] == "simple", "the chooser's default variant"
        assert state["threatCount"] > 0
        assert state["consequenceCount"] > 0
        assert state["warnings"] == 0, "the shipped demo must not import with orphaned barriers"
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()


def test_every_demo_variant_loads_with_no_warnings(browser, base_url):
    """proposals/06: the demo is the first thing a new user sees, so it
    must not open with the warnings badge lit. The Quantitative variant's
    threat frequencies are per-year magnitudes (~0.01-0.1/yr) precisely so
    its low-demand barrier measures sit on the correct side of IEC
    61511's ~1/year boundary. `T_4 Unknown` stays: the excluded-threat
    rule is a deliberate teaching case and raises no warning."""
    pg = _fresh_page(browser, base_url)
    try:
        for variant in ("simple", "qualitative", "quantitative"):
            messages = pg.evaluate(
                """(v) => {
                  window.__lastImportExport.loadDocument(Bowtie.DEMO_DATA_VARIANTS[v]);
                  return window.__lastModel.getWarnings().map((w) => w.message);
                }""",
                variant,
            )
            assert messages == [], f"the {variant} demo must load clean, got: {messages}"
        # ...and the quantitative variant still spans several risk classes,
        # so the summary and the pre -> post badges have something to show.
        classes = pg.evaluate("""() => new Set(window.__lastModel.computeRiskSummary()
          .map((r) => r.post.riskClass && r.post.riskClass.id).filter(Boolean)).size""")
        assert classes >= 3, "the demo should show a spread of residual risk classes"
    finally:
        assert pg.errors == []
        pg.close()


def test_demo_chooser_picks_which_variant_loads(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.locator(".welcome-segmented-option[data-variant=quantitative]").click()
        assert pg.locator(".welcome-segmented-option[data-variant=quantitative]").get_attribute("aria-pressed") == "true"
        assert pg.locator(".welcome-segmented-option[data-variant=simple]").get_attribute("aria-pressed") == "false"
        pg.get_by_role("button", name="Explore the demo", exact=True).click()
        pg.wait_for_timeout(150)
        assert pg.evaluate("() => window.__lastModel.mode") == "quantitative"
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

        pg.get_by_role("button", name="Explore the demo", exact=True).click()
        pg.wait_for_timeout(150)
        assert app.evaluate("(el) => getComputedStyle(el).visibility") == "visible"
    finally:
        assert pg.errors == []
        pg.close()


def test_ctrl_alt_d_loads_the_demo_while_the_welcome_modal_is_open(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        _press_ctrl_alt_d(pg)
        assert pg.evaluate("() => window.__lastModel.threats.length") > 0
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
        complete_new_bowtie_wizard(pg)
        pg.wait_for_timeout(150)
        pg.evaluate("() => { window.__lastModel.addThreat({x: 150, y: 200, name: 'Real work'}); }")
        pg.wait_for_timeout(80)

        _press_ctrl_alt_d(pg)

        state = pg.evaluate("""() => {
          const m = window.__lastModel;
          const first = m.threats[0];
          return { threatCount: m.threats.length, firstThreatName: first ? m.getNode(first.nodeId).name : null };
        }""")
        assert state["threatCount"] == 1
        assert state["firstThreatName"] == "Real work"
    finally:
        assert pg.errors == []
        pg.close()


def test_demo_routes_through_the_same_version_validation_as_a_real_import(browser, base_url):
    """demo_json_proposal.md §2: the demo must not bypass
    ImportExportController's validation -- if a Bowtie.DEMO_DATA_VARIANTS
    entry ever goes stale relative to SCHEMA_VERSION, it should fail exactly
    like a real stale export would, not silently load. Every variant is
    staled out here regardless of which one the chooser has selected."""
    pg = _fresh_page(browser, base_url)
    try:
        pg.evaluate("""() => {
          Object.keys(window.Bowtie.DEMO_DATA_VARIANTS).forEach((key) => {
            window.Bowtie.DEMO_DATA_VARIANTS[key] = { ...window.Bowtie.DEMO_DATA_VARIANTS[key], version: -1 };
          });
          window.Bowtie.DEMO_DATA = { ...window.Bowtie.DEMO_DATA, version: -1 };
        }""")
        pg.get_by_role("button", name="Explore the demo", exact=True).click()
        pg.wait_for_timeout(150)
        assert pg.get_by_text("Unsupported File Version").count() > 0
        # The welcome modal itself must still be up -- nothing was loaded.
        assert pg.get_by_role("button", name="Explore the demo", exact=True).count() > 0
    finally:
        assert pg.errors == []
        pg.close()


_DROP_JS = """(selector) => {
  const file = new File(
    [JSON.stringify({
      version: Bowtie.BowtieModel.SCHEMA_VERSION,
      name: 'Dropped Bowtie',
      hazard: { id: 'H_1', name: 'Hazard' },
      topLevelEvent: { id: 'TLE_1', name: 'Top-Level Event' },
      threats: [], consequences: [], preventativeBarriers: [], mitigativeBarriers: [], lines: [],
    })],
    'dropped.json',
    { type: 'application/json' },
  );
  const target = document.querySelector(selector);
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } });
  target.dispatchEvent(ev);
  return true;
}"""


def test_dropping_a_json_file_on_the_dropzone_imports_it(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        assert pg.evaluate(_DROP_JS, ".welcome-dropzone") is True
        pg.wait_for_timeout(150)
        assert pg.evaluate("() => window.__lastModel.name") == "Dropped Bowtie"
        # A successful import must dismiss the (non-dismissible-by-click)
        # welcome modal, same as the wizard/browse paths do.
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()


def test_dropping_a_json_file_anywhere_on_the_start_screen_imports_it(browser, base_url):
    # "...or anywhere on this screen": a drop on the left half must not be
    # a dead drop just because the dashed box is on the right.
    pg = _fresh_page(browser, base_url)
    try:
        assert pg.evaluate(_DROP_JS, ".welcome-start-main") is True
        pg.wait_for_timeout(150)
        assert pg.evaluate("() => window.__lastModel.name") == "Dropped Bowtie"
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()


# --- Wizard step 1: names ----------------------------------------------------

def test_start_a_new_bowtie_opens_the_names_step_with_empty_fields(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
        assert pg.get_by_text("What are you analysing?", exact=True).count() == 1
        assert pg.get_by_text("Step 1 of 2").count() == 1
        for label in ["Analysis title", "Top-level event", "Hazard"]:
            assert pg.locator(f".modal-field:has-text('{label}') input").input_value() == ""
        assert pg.get_by_role("button", name="Next", exact=True).is_disabled()
        # The wide start-screen width doesn't carry over; the wizard has
        # its own.
        classes = pg.locator(".modal-dialog").get_attribute("class")
        assert "welcome-dialog-wizard" in classes and "welcome-dialog " not in f"{classes} "
        # Page/identifier settings are demoted under a closed disclosure.
        more = pg.locator(".welcome-more")
        assert more.count() == 1
        assert more.evaluate("(el) => el.open") is False
        assert pg.locator(".modal-field:has-text('Page name') input").is_hidden()
    finally:
        assert pg.errors == []
        pg.close()


def test_names_step_preview_updates_as_you_type(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
        texts = lambda: pg.locator(".welcome-preview svg text").all_text_contents()  # noqa: E731
        assert "Top event" in texts() and "Hazard" in texts()
        _fill(pg, "Top-level event", "Loss of containment")
        _fill(pg, "Hazard", "Flammable liquid")
        # A long name is truncated to what fits the shape, ellipsis and all.
        assert any(t.startswith("Loss of co") and t.endswith("…") for t in texts())
        assert "Flammable liquid" in texts()
        assert "Top event" not in texts()
    finally:
        assert pg.errors == []
        pg.close()


def test_enter_in_a_names_field_advances_when_complete(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
        _fill(pg, "Analysis title", "A")
        pg.locator(".modal-field:has-text('Analysis title') input").press("Enter")
        assert pg.get_by_text("Step 1 of 2").count() == 1, "incomplete -- Enter must not advance"
        _fill(pg, "Top-level event", "B")
        _fill(pg, "Hazard", "C")
        pg.locator(".modal-field:has-text('Hazard') input").press("Enter")
        assert pg.get_by_text("How will you assess risk?", exact=True).count() == 1
    finally:
        assert pg.errors == []
        pg.close()


def test_back_from_the_mode_step_keeps_everything_typed(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
        _fill(pg, "Analysis title", "Kept title")
        _fill(pg, "Top-level event", "Kept TLE")
        _fill(pg, "Hazard", "Kept hazard")
        pg.locator(".welcome-more summary").click()
        _fill(pg, "Page name", "Kept page")
        pg.get_by_role("button", name="Next", exact=True).click()
        pg.locator(".mode-card[data-mode=quantitative]").click()
        pg.get_by_role("button", name="Back", exact=True).click()

        assert pg.locator(".modal-field:has-text('Analysis title') input").input_value() == "Kept title"
        assert pg.locator(".modal-field:has-text('Top-level event') input").input_value() == "Kept TLE"
        assert pg.locator(".modal-field:has-text('Hazard') input").input_value() == "Kept hazard"
        assert pg.locator(".welcome-more").evaluate("(el) => el.open") is True
        assert pg.locator(".modal-field:has-text('Page name') input").input_value() == "Kept page"
        pg.get_by_role("button", name="Next", exact=True).click()
        assert "selected" in pg.locator(".mode-card[data-mode=quantitative]").get_attribute("class")
        # And Back from the names step returns to the start screen.
        pg.get_by_role("button", name="Back", exact=True).click()
        pg.get_by_role("button", name="Back", exact=True).click()
        assert pg.get_by_role("button", name="Start a new bowtie", exact=True).is_visible()
    finally:
        assert pg.errors == []
        pg.close()


# --- Wizard step 2: risk mode ------------------------------------------------

def _go_to_mode_step(pg):
    pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
    _fill(pg, "Analysis title", "T")
    _fill(pg, "Top-level event", "E")
    _fill(pg, "Hazard", "H")
    pg.get_by_role("button", name="Next", exact=True).click()


def test_mode_step_defaults_to_simple_with_the_matrix_picker_hidden(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        _go_to_mode_step(pg)
        assert pg.get_by_text("Step 2 of 2").count() == 1
        cards = pg.locator(".mode-card")
        assert cards.count() == 3
        assert "selected" in cards.nth(0).get_attribute("class")
        assert pg.locator("input[name=welcome-mode][value=simple]").is_checked()
        assert pg.locator(".welcome-matrix-field").is_hidden()
        assert "Project Settings" in pg.locator(".welcome-aside").text_content()

        pg.get_by_role("button", name="Create", exact=True).click()
        pg.wait_for_timeout(150)
        state = pg.evaluate("() => ({ mode: window.__lastModel.mode, matrix: window.__lastModel.riskMatrix })")
        assert state == {"mode": "simple", "matrix": None}
        assert pg.locator(".modal-overlay").count() == 0
    finally:
        assert pg.errors == []
        pg.close()


def test_choosing_a_risk_mode_sets_mode_and_embeds_the_chosen_matrix_preset(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        _go_to_mode_step(pg)
        pg.locator(".mode-card[data-mode=qualitative]").click()
        field = pg.locator(".welcome-matrix-field")
        assert field.is_visible()
        assert field.locator("select").input_value() == "leaflet5"
        summary = field.locator(".welcome-field-help").text_content()
        assert "severity" in summary and "A B C D" in summary

        pg.get_by_role("button", name="Create", exact=True).click()
        pg.wait_for_timeout(150)
        state = pg.evaluate("""() => {
          const m = window.__lastModel;
          return { mode: m.mode, matrixId: m.riskMatrix && m.riskMatrix.id, name: m.name, tle: m.topLevelEvent.name };
        }""")
        assert state == {"mode": "qualitative", "matrixId": "leaflet5", "name": "T", "tle": "E"}
        # A full independent copy, not a reference to the bundled preset.
        assert pg.evaluate("() => window.__lastModel.riskMatrix !== Bowtie.RISK_MATRIX_PRESETS.leaflet5") is True
        # And nothing from the wizard is undo-able back to a blank document.
        pg.wait_for_timeout(50)
        assert pg.evaluate("() => window.__lastUndo.canUndo ? window.__lastUndo.canUndo() : !window.__lastUndo.undoBtn.disabled") is False
    finally:
        assert pg.errors == []
        pg.close()
