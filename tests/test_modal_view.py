"""Coverage for js/view/ModalView.js's shared modal component.

Structural review finding 03: an open modal painted an overlay but never
took focus, trapped it, or restored it -- Tab walked straight into #app
behind the backdrop, and those controls were still focusable AND clickable.
These tests drive the Node Library modal (any ModalView.openModal caller
would do) to check the shared behavior: #app goes inert while a modal is
open, focus lands inside the dialog on open and is restored to the trigger
on close, and the Escape-key listener doesn't leak past a non-Escape close.
"""


def _open_node_library(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(100)


def test_app_is_inert_while_a_modal_is_open_and_not_after_close(page):
    app = page.locator("#app")
    assert app.evaluate("(el) => el.inert") is False

    _open_node_library(page)
    assert app.evaluate("(el) => el.inert") is True

    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)
    assert app.evaluate("(el) => el.inert") is False


def test_opening_a_modal_focuses_something_inside_the_dialog(page):
    _open_node_library(page)
    focused_in_dialog = page.evaluate(
        "() => document.activeElement.closest('.modal-dialog') !== null"
    )
    assert focused_in_dialog
    page.get_by_role("button", name="Close", exact=True).click()


def test_closing_a_modal_restores_focus_to_its_trigger(page):
    # #btn-warnings isn't behind a dropdown -- unlike the Node Library
    # trigger, it stays in the DOM and visible after the click that opens
    # its modal, so it's a clean check that focus restoration itself works
    # (a dropdown item's own post-click hide is a separate concern).
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      m.addPreventativeControl(cause.id);
      const line = m._lineFor(cause.id);
      m.connectLineDirectlyToTle(line.id, null);
    }""")
    page.wait_for_timeout(80)

    trigger = page.locator("#btn-warnings")
    trigger.focus()
    trigger.click()
    page.wait_for_timeout(100)

    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)
    assert page.evaluate("() => document.activeElement.id") == "btn-warnings"


def test_escape_listener_does_not_leak_after_closing_via_button_click(page):
    """The Escape keydown listener used to only ever get torn down from
    inside its own branch -- closing via a button click (the far more common
    path) left it registered on `document` forever. Opening and closing a
    modal via its Close button, then pressing Escape, must not reopen or
    otherwise affect anything -- there's nothing listening anymore."""
    _open_node_library(page)
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)
    assert page.locator(".modal-overlay").count() == 0

    page.keyboard.press("Escape")
    page.wait_for_timeout(80)
    assert page.locator(".modal-overlay").count() == 0
    assert page.errors == []
