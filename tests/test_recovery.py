"""RecoveryController (proposals/04): the document lives only in memory
until the user exports JSON, so a crash, a browser restart or a "Leave"
click used to lose everything since the last export. While the document
is dirty its `toJSON()` is kept in localStorage on a debounce, and the
start screen offers it back.

These tests drive a fresh page directly (like test_welcome.py) rather
than through the `page` fixture -- the start screen is where the card
lives, and the fixture has already driven past it.
"""
from conftest import INIT_SCRIPT, complete_new_bowtie_wizard

KEY = "bowtie-diagram.recovery"
# The controller's own debounce, plus enough slack for the timer to fire.
SETTLE_MS = 2400


def _fresh_page(browser, base_url):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    return pg


def _started(browser, base_url, title="Pipeline overpressure study"):
    pg = _fresh_page(browser, base_url)
    complete_new_bowtie_wizard(pg, title=title)
    pg.wait_for_timeout(150)
    return pg


def _snapshot(pg):
    return pg.evaluate(f"() => JSON.parse(window.localStorage.getItem('{KEY}') || 'null')")


def _seed(pg, **overrides):
    """Writes a snapshot of the CURRENT document straight to localStorage,
    so a reload lands on a start screen with a recovery card without
    waiting out the debounce."""
    pg.evaluate(
        """(overrides) => {
          const m = window.__lastModel;
          const payload = Object.assign({
            savedAt: new Date().toISOString(),
            name: m.name,
            pages: m.pages.length,
            nodes: m.causes.length + m.outcomes.length
              + m.preventativeBarriers.length + m.mitigativeBarriers.length,
            document: m.toJSON(),
          }, overrides);
          window.localStorage.setItem('%s', JSON.stringify(payload));
        }""" % KEY,
        overrides,
    )


# --- Taking the snapshot --------------------------------------------------

def test_editing_a_dirty_document_stores_a_snapshot_after_the_debounce(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate("() => window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'})")
        assert _snapshot(pg) is None, "not written on the change itself -- a drag fires dozens a second"

        pg.wait_for_timeout(SETTLE_MS)
        stored = _snapshot(pg)
        assert stored["name"] == "Pipeline overpressure study"
        assert stored["pages"] == 1 and stored["nodes"] == 1
        assert stored["document"]["version"] == pg.evaluate("() => Bowtie.BowtieModel.SCHEMA_VERSION")
        # A placement has no name of its own -- it is the library node's
        # (node_library_proposal.md "Two id spaces").
        assert any(n["name"] == "Corrosion" for n in stored["document"]["library"]["cause"])
    finally:
        assert pg.errors == []
        pg.close()


def test_a_clean_document_is_never_snapshotted(browser, base_url):
    """A fresh "New Bowtie" has nothing to recover -- it is exactly what
    the start screen would give the user back anyway."""
    pg = _started(browser, base_url)
    try:
        pg.wait_for_timeout(SETTLE_MS)
        assert _snapshot(pg) is None
    finally:
        assert pg.errors == []
        pg.close()


def test_a_completed_export_clears_the_snapshot(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate("""() => {
          window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'});
          delete window.showSaveFilePicker; // force the download fallback
        }""")
        pg.wait_for_timeout(SETTLE_MS)
        assert _snapshot(pg) is not None

        pg.click("#menu-trigger-file")
        with pg.expect_download():
            pg.click("#btn-export-json")
        pg.wait_for_timeout(100)
        assert _snapshot(pg) is None, "the document is on disk now"
    finally:
        assert pg.errors == []
        pg.close()


# --- Offering it back -----------------------------------------------------

def test_the_start_screen_offers_the_snapshot_back(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate("() => window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'})")
        _seed(pg)
        pg.reload()
        pg.wait_for_timeout(200)

        card = pg.locator(".welcome-recovery")
        assert card.is_visible()
        assert "Pipeline overpressure study" in card.locator(".welcome-recovery-meta").text_content()
        assert "1 page" in card.locator(".welcome-recovery-meta").text_content()
        assert "1 node" in card.locator(".welcome-recovery-meta").text_content()
        assert card.locator(".welcome-recovery-when").text_content().startswith("last edited today")
    finally:
        assert pg.errors == []
        pg.close()


def test_recover_restores_the_document_and_leaves_it_dirty(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate("() => window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'})")
        _seed(pg)
        pg.reload()
        pg.wait_for_timeout(200)

        pg.locator(".welcome-recovery").get_by_role("button", name="Recover", exact=True).click()
        pg.wait_for_timeout(400)

        assert pg.locator(".welcome-overlay").count() == 0, "the start screen is done with"
        assert pg.evaluate(
            "() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)"
        ) == ["Corrosion"]
        assert pg.evaluate("() => window.__lastUnsavedChanges.dirty") is True, "recovered is not saved"
        assert _snapshot(pg) is not None, "and still recoverable if this session dies too"
    finally:
        assert pg.errors == []
        pg.close()


def test_discard_removes_the_card_and_the_snapshot(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate("() => window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'})")
        _seed(pg)
        pg.reload()
        pg.wait_for_timeout(200)

        pg.locator(".welcome-recovery").get_by_role("button", name="Discard", exact=True).click()
        pg.wait_for_timeout(100)
        assert pg.locator(".welcome-recovery").count() == 0
        assert _snapshot(pg) is None
        # ...and the rest of the start screen is untouched.
        assert pg.get_by_role("button", name="Start a new bowtie", exact=True).is_visible()
    finally:
        assert pg.errors == []
        pg.close()


def test_a_corrupt_snapshot_is_ignored_rather_than_thrown_on(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.evaluate(f"() => window.localStorage.setItem('{KEY}', '{{not json')")
        pg.reload()
        pg.wait_for_timeout(200)
        assert pg.locator(".welcome-recovery").count() == 0
        assert pg.get_by_role("button", name="Start a new bowtie", exact=True).is_visible()
    finally:
        assert pg.errors == [], "a corrupt value must not break the first paint"
        pg.close()


def test_a_snapshot_from_an_older_schema_fails_the_way_a_stale_export_does(browser, base_url):
    """Recovery goes through loadDocument like any import, so there is no
    second, laxer validation path into the model."""
    pg = _started(browser, base_url)
    try:
        pg.evaluate("() => window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'})")
        _seed(pg)
        pg.evaluate(f"""() => {{
          const stored = JSON.parse(window.localStorage.getItem('{KEY}'));
          stored.document.version = 1;
          window.localStorage.setItem('{KEY}', JSON.stringify(stored));
        }}""")
        pg.reload()
        pg.wait_for_timeout(200)

        pg.locator(".welcome-recovery").get_by_role("button", name="Recover", exact=True).click()
        pg.wait_for_timeout(200)
        assert pg.locator(".modal-title").last.text_content() == "Unsupported File Version"
    finally:
        assert pg.errors == []
        pg.close()
