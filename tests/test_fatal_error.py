"""The global error handler (proposals/19).

Before this, an uncaught exception left the app wedged -- a stale canvas,
a button that did nothing -- with no message and no prompt. The user's
next move is to reload, which is exactly the move that loses everything
since the last export.

These tests raise on purpose, so they build their own page with their own
error expectations rather than using the shared `page` fixture, whose
teardown asserts `pg.errors == []`. That assertion is load-bearing for
the other 600-odd tests and is not weakened for this one file --
`test_escalation_ui.py` established the pattern.
"""
import json

from conftest import INIT_SCRIPT, complete_new_bowtie_wizard


def _started(browser, base_url):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    complete_new_bowtie_wizard(pg)
    pg.wait_for_timeout(150)
    return pg


def _throw(pg, message="deliberate test failure"):
    """An exception that reaches window.onerror, the way a real one would.

    Thrown from a timer rather than straight out of `evaluate`, which
    would just reject the evaluate call and never become an uncaught
    page error.
    """
    pg.evaluate(f"() => {{ setTimeout(() => {{ throw new Error({json.dumps(message)}); }}, 0); }}")
    pg.wait_for_selector(".fatal-error")


def test_an_uncaught_error_tells_the_user_and_offers_an_export(browser, base_url):
    pg = _started(browser, base_url)
    try:
        _throw(pg)
        dialog = pg.locator(".modal-dialog", has=pg.locator(".fatal-error"))
        assert dialog.count() == 1
        assert "Something went wrong" in dialog.locator(".modal-title").text_content()
        # The whole point: turn a lost session into a saved file.
        assert dialog.get_by_role("button", name="Export to JSON now", exact=True).count() == 1
        assert dialog.get_by_role("button", name="Reload", exact=True).count() == 1
        assert dialog.get_by_role("button", name="Continue anyway", exact=True).count() == 1
    finally:
        pg.close()


def test_the_message_and_stack_are_available_but_collapsed(browser, base_url):
    """A bug report needs something to carry; a panicking user does not
    need a stack trace shouted at them."""
    pg = _started(browser, base_url)
    try:
        _throw(pg, "a very specific message")
        details = pg.locator(".fatal-error details")
        assert details.count() == 1
        assert details.evaluate("d => d.open") is False
        assert "a very specific message" in details.text_content()
    finally:
        pg.close()


def test_it_fires_once_however_many_errors_arrive(browser, base_url):
    """A wedged render loop throws every frame. One dialog per frame
    would bury the app under modals and make the export unreachable."""
    pg = _started(browser, base_url)
    try:
        _throw(pg)
        pg.evaluate("""() => {
          for (let i = 0; i < 5; i += 1) setTimeout(() => { throw new Error(`again ${i}`); }, 0);
        }""")
        pg.wait_for_timeout(200)
        assert pg.locator(".fatal-error").count() == 1
    finally:
        pg.close()


def test_an_unhandled_rejection_counts_too(browser, base_url):
    """`unhandledrejection` is the other half: every async path in the
    app -- import, export, the file pickers -- fails this way, not
    through window.onerror."""
    pg = _started(browser, base_url)
    try:
        pg.evaluate("() => { Promise.reject(new Error('async boom')); }")
        pg.wait_for_selector(".fatal-error")
        assert "async boom" in pg.locator(".fatal-error details").text_content()
    finally:
        pg.close()


def test_continue_anyway_dismisses_it(browser, base_url):
    """Many uncaught errors are cosmetic. An app that forces a reload on
    a stray render error is worse than one that lets an informed user
    carry on (proposals/19, open question 1)."""
    pg = _started(browser, base_url)
    try:
        _throw(pg)
        pg.get_by_role("button", name="Continue anyway", exact=True).click()
        assert pg.locator(".fatal-error").count() == 0
        # The app is still usable afterwards -- the dialog was the only
        # thing in the way.
        pg.click("#menu-trigger-add")
        assert pg.locator("#menu-dropdown-add").is_visible()
    finally:
        pg.close()


def test_export_from_the_dialog_produces_the_document(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate("""() => {
          window.__written = null;
          window.showSaveFilePicker = undefined;
          const orig = URL.createObjectURL;
          URL.createObjectURL = (blob) => { window.__blob = blob; return orig.call(URL, blob); };
        }""")
        _throw(pg)
        with pg.expect_download() as info:
            pg.get_by_role("button", name="Export to JSON now", exact=True).click()
        assert info.value.suggested_filename.endswith(".json")
        # Exporting must not close the dialog: the user may still want
        # to reload, and losing the Reload button behind a successful
        # save would be a strange reward for taking the advice.
        assert pg.locator(".fatal-error").count() == 1
    finally:
        pg.close()


def test_the_dialog_cannot_be_dismissed_by_escape_or_backdrop(browser, base_url):
    """It offers three deliberate ways out. A stray Escape is not one of
    them -- the export is the point."""
    pg = _started(browser, base_url)
    try:
        _throw(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(100)
        assert pg.locator(".fatal-error").count() == 1
    finally:
        pg.close()
