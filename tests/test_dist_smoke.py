"""deployment_proposal.md §5: the release-time smoke test.

Points a Playwright page directly at dist/bowtie-diagram.html via file://
-- not through conftest.py's HTTP server -- since file:// is the actual
real-world condition the single-file build exists to support, and is the
one thing the rest of the suite (which always runs over HTTP) never
exercises. Re-runs a small slice of the existing suite's scenarios against
that file.

Skipped entirely when dist/bowtie-diagram.html doesn't exist -- building it
is a deliberate `npm run build` step, not part of the normal edit/test loop
(see deployment_proposal.md §4), so a contributor running `pytest tests/`
without having built dist/ first should not see a failure here.
"""
import pathlib

import pytest

DIST_HTML = pathlib.Path(__file__).resolve().parent.parent / "dist" / "bowtie-diagram.html"

pytestmark = pytest.mark.skipif(
    not DIST_HTML.exists(),
    reason="dist/bowtie-diagram.html not built -- run `npm run build` first",
)


@pytest.fixture
def dist_page(browser):
    # Reuses conftest.py's session-scoped `browser` fixture rather than
    # starting a second sync_playwright() -- Playwright's sync API only
    # tolerates one live manager per process, and the rest of the suite
    # already has one running via the `page`/`browser` fixtures.
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.errors = []
    page.on("pageerror", lambda exc: page.errors.append(str(exc)))
    page.goto(DIST_HTML.resolve().as_uri())
    page.get_by_role("button", name="New Bowtie Wizard", exact=True).click()
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)
    yield page
    assert page.errors == [], f"uncaught page error(s) on the built dist file: {page.errors}"
    page.close()


def test_dist_file_has_no_external_references(dist_page):
    """The whole point of the build: nothing left to fetch from disk/network."""
    external = dist_page.evaluate("""() => ({
      scripts: Array.from(document.querySelectorAll('script[src]')).length,
      links: Array.from(document.querySelectorAll('link[rel=stylesheet]')).length,
    })""")
    assert external["scripts"] == 0
    assert external["links"] == 0


def test_create_chain_autoarrange_and_export_import_round_trip(dist_page):
    dist_page.evaluate("""() => {
      const m = window.__debugModel;
      m.addCause({ name: 'Smoke Cause' });
      m.addPreventativeControl(m.causes[0].id);
      m.addOutcome({ name: 'Smoke Outcome' });
      m.addMitigativeControl(m.outcomes[0].id);
    }""")
    dist_page.click("#menu-trigger-view")
    dist_page.click("#btn-auto-arrange")
    dist_page.wait_for_timeout(150)

    warnings = dist_page.evaluate("() => window.__debugModel.getWarnings().length")
    assert warnings == 0

    # File System Access API doesn't exist on file:// -- this exercises the
    # legacy download-link/hidden-<input> fallback path specifically.
    exported = dist_page.evaluate("() => JSON.stringify(window.__debugModel.toJSON())")
    dist_page.evaluate(
        "(json) => window.__debugModel.loadFromJSON(JSON.parse(json))",
        exported,
    )
    dist_page.wait_for_timeout(80)
    state = dist_page.evaluate("""() => {
      const m = window.__debugModel;
      return { causes: m.causes.length, outcomes: m.outcomes.length, warnings: m.getWarnings().length };
    }""")
    assert state["causes"] == 1
    assert state["outcomes"] == 1
    assert state["warnings"] == 0


def test_load_demo_works_on_the_built_file(dist_page):
    dist_page.evaluate("() => { window.__debugModel.loadFromJSON(window.Bowtie.DEMO_DATA); }")
    dist_page.wait_for_timeout(150)
    state = dist_page.evaluate("""() => {
      const m = window.__debugModel;
      return { causes: m.causes.length, outcomes: m.outcomes.length, warnings: m.getWarnings().length };
    }""")
    assert state["causes"] > 0
    assert state["outcomes"] > 0
    assert state["warnings"] == 0
