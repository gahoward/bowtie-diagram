"""axe-core over the app's main states (proposals/18).

Everything else in proposals/18 is a one-time fix. This is the part that
keeps it fixed: without it, the next modal ships without a dialog role
and nothing notices until someone with a screen reader tries to use it.

**Severity policy** (proposals/18, open question 4): `critical` and
`serious` violations fail; `moderate` and `minor` are printed and do not.
A contrast-ratio quibble should not block a release; a missing dialog
role should. Raising the bar later is a one-line change to FAIL_LEVELS.

axe ships inside the pinned `axe-core-python` wheel rather than being
fetched from a CDN, which keeps the pytest job offline and Node-free --
the two properties `.github/workflows/test.yml` is explicit about.
"""
import pytest
from axe_core_python.sync_playwright import Axe

from conftest import INIT_SCRIPT, complete_new_bowtie_wizard

FAIL_LEVELS = ("critical", "serious")

# Colour contrast is excluded deliberately, not silently: the palette is
# a design decision that predates this test, several tokens sit just
# under 4.5:1, and letting that one rule fail the build on day one would
# mean every other regression this file catches arrives in a red suite
# nobody reads. proposals/18's open question 3 puts the palette (and dark
# mode) in its own proposal; this is where it gets re-enabled when that
# lands.
SKIP_RULES = {"color-contrast"}

# Two advisories persist on the welcome states and are correct
# behaviour, not a gap: while the non-dismissible welcome gate is open,
# `ModalView` marks `#app` inert, which removes `<main>` and the `<h1>`
# from the accessibility tree -- so axe reports "no main landmark" and
# "no level-one heading" at document level. The dialog is
# `aria-modal="true"` and is genuinely the only available content at
# that moment. They are `moderate`, so they print rather than fail.
#
# `duplicate-id` (minor) is the minimap: MinimapView clones the canvas's
# node layer wholesale, `data-id` and `id` included, for visual
# fidelity. That is a documented, load-bearing property of the render
# (see reference/README.md), not something to fix here.


def _violations(page):
    """Run axe and split the findings by whether they fail the build."""
    results = Axe().run(page)
    failing, advisory = [], []
    for v in results["violations"]:
        if v["id"] in SKIP_RULES:
            continue
        (failing if v["impact"] in FAIL_LEVELS else advisory).append(v)
    return failing, advisory


def _describe(violations):
    lines = []
    for v in violations:
        targets = ", ".join(
            str(t) for node in v["nodes"][:3] for t in node["target"]
        )
        lines.append(f"  [{v['impact']}] {v['id']}: {v['help']}\n    at {targets}")
    return "\n".join(lines)


def _assert_accessible(page, state):
    failing, advisory = _violations(page)
    if advisory:
        print(f"\naxe advisory findings in {state}:\n{_describe(advisory)}")
    assert not failing, f"axe found {len(failing)} blocking violation(s) in {state}:\n{_describe(failing)}"


# The welcome gate is its own state: it is the first thing every user
# meets, it is non-dismissible, and nothing else in the app is reachable
# until it is answered -- so an unnamed dialog here is worse than an
# unnamed dialog anywhere else.
@pytest.fixture
def welcome_page(browser, base_url):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    pg.wait_for_selector(".welcome-body")
    yield pg
    assert pg.errors == [], f"uncaught page error(s) during test: {pg.errors}"
    pg.close()


def test_start_screen_is_accessible(welcome_page):
    _assert_accessible(welcome_page, "the start screen")


def test_new_bowtie_wizard_is_accessible(welcome_page):
    welcome_page.get_by_role("button", name="Start a new bowtie", exact=True).click()
    welcome_page.wait_for_selector(".welcome-names")
    _assert_accessible(welcome_page, "the new-bowtie wizard")


def test_editor_with_the_demo_loaded_is_accessible(welcome_page):
    welcome_page.get_by_role("button", name="Explore the demo", exact=True).click()
    welcome_page.wait_for_selector("#bowtie-canvas .node")
    _assert_accessible(welcome_page, "the editor with the demo loaded")


def test_an_open_toolbar_menu_is_accessible(page):
    page.click("#menu-trigger-view")
    _assert_accessible(page, "an open toolbar menu")


# One test per modal rather than one looping test: a failure names the
# modal in the test id, which is what a CI log is read for.
@pytest.mark.parametrize(
    "trigger,ready,state",
    [
        ("#btn-project-settings", ".settings-body", "Project Settings"),
        ("#btn-manage-ids", ".node-library", "the Node Library"),
        ("#btn-risk-summary", ".modal-dialog-xwide", "the Risk Summary"),
        ("#btn-barrier-register", ".modal-dialog-xwide", "the Barrier Register"),
        ("#btn-shortcuts", ".modal-dialog", "the shortcuts sheet"),
        ("#btn-preferences", ".modal-dialog", "Preferences"),
    ],
)
def test_modal_is_accessible(page, trigger, ready, state):
    menu = {
        "#btn-project-settings": "#menu-trigger-settings",
        "#btn-preferences": "#menu-trigger-settings",
        "#btn-manage-ids": "#menu-trigger-add",
    }.get(trigger, "#menu-trigger-view")
    page.click(menu)
    page.click(trigger)
    page.wait_for_selector(ready)
    _assert_accessible(page, state)
