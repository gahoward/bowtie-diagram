"""Shared fixtures for the bowtie-editor Playwright test suite.

A session-scoped static file server serves the project root (no build step,
so this is literally just `index.html` and its `js`/`css` next to it), and a
`page` fixture hands each test a fresh browser tab that has already been
through the "New Bowtie" welcome flow, ready to drive.

The `window.__lastModel` / `window.__lastView` / `window.__lastUndo` /
`window.__lastUnsavedChanges` / `window.__lastImportExport` /
`window.__lastRecovery` / `window.__lastRecentFiles` capture trick
(see INIT_SCRIPT) lets tests reach into `BowtieModel`/`CanvasView`/
`UndoController`/`UnsavedChangesController`/`ImportExportController`
directly via `page.evaluate`, without the app needing to expose them itself — it wraps each with a subclass that stashes
`this` on `window` the moment `main.js` constructs one, then gets out of the
way. Note that `window.__lastModel` is the RAW model — mutating it directly
bypasses UndoController's snapshotting, same as calling `rawModel` methods in
the app itself would. Tests that need the same auto-snapshotting behavior the
UI gets should call mutating methods through `window.__lastUndo.model`
instead.
"""
import functools
import http.server
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INIT_SCRIPT = """
window.Bowtie = new Proxy({}, {
  set(target, prop, value) {
    if (prop === 'BowtieModel') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastModel = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'CanvasView') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastView = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'UndoController') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastUndo = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'UnsavedChangesController') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastUnsavedChanges = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'BarrierRegisterController') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastBarrierRegister = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'RecoveryController') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastRecovery = this; }
      }
      Wrapped.describeTime = Orig.describeTime;
      Wrapped.STORAGE_KEY = Orig.STORAGE_KEY;
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'RecentFilesController') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastRecentFiles = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    if (prop === 'ImportExportController') {
      const Orig = value;
      class Wrapped extends Orig {
        constructor(...a) { super(...a); window.__lastImportExport = this; }
      }
      target[prop] = Wrapped;
      return true;
    }
    target[prop] = value;
    return true;
  },
  get(target, prop) { return target[prop]; },
});
"""


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: A002 - matches base signature
        pass


@pytest.fixture(scope="session")
def base_url():
    handler = functools.partial(_QuietHandler, directory=str(PROJECT_ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def complete_new_bowtie_wizard(
    pg, title="Untitled Bowtie", tle="Top-Level Event", hazard="Hazard", page_name="Untitled Page",
):
    """Drives the welcome flow's "Start a new bowtie" wizard through both
    steps (names, then risk mode -- left at its Simple default). The wizard
    deliberately starts with EMPTY fields (landing_page_proposal.md: a
    placeholder must never become a name), so this types the names a fresh
    BowtieModel used to pre-fill -- every test that asserts "Untitled Page"
    / "Top-Level Event" / "Hazard" keeps working unchanged. `page_name=None`
    leaves More options closed, so the page takes the TLE's name."""
    pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
    pg.locator(".modal-field:has-text('Analysis title') input").fill(title)
    pg.locator(".modal-field:has-text('Top-level event') input").fill(tle)
    pg.locator(".modal-field:has-text('Hazard') input").fill(hazard)
    if page_name is not None:
        pg.locator(".welcome-more summary").click()
        pg.locator(".modal-field:has-text('Page name') input").fill(page_name)
    pg.get_by_role("button", name="Next", exact=True).click()
    pg.get_by_role("button", name="Create", exact=True).click()


@pytest.fixture
def page(browser, base_url):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    complete_new_bowtie_wizard(pg)
    pg.wait_for_timeout(150)
    yield pg
    assert pg.errors == [], f"uncaught page error(s) during test: {pg.errors}"
    pg.close()


@pytest.fixture(scope="session")
def _blank_page(browser, base_url):
    """One page per session for tests of PURE functions (proposals/17).

    `Decimal`, `Rational`, `TableExport`, `Geometry`, `Dom` and `Svg` all
    attach to `window.Bowtie` at load and hold no state, so a test of one
    needs a loaded page and nothing else -- not a fresh tab, and
    certainly not a drive through the new-bowtie wizard, which is what
    the `page` fixture below spends most of its time doing.

    Deliberately NOT a substitute for `page`: anything that touches the
    model, the canvas or a modal wants a fresh document, and sharing one
    across tests would make them order-dependent.
    """
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    yield pg
    pg.close()


@pytest.fixture
def blank_page(_blank_page):
    """`_blank_page`, with each test's own page errors attributed to it.

    The session-scoped fixture can't assert on errors per test, so this
    records the error count on the way in and checks only what the test
    itself added -- the same guarantee `page` gives, without the
    per-test setup cost.
    """
    before = len(_blank_page.errors)
    yield _blank_page
    added = _blank_page.errors[before:]
    assert added == [], f"uncaught page error(s) during test: {added}"
