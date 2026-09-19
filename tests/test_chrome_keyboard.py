"""Roles and keyboard behaviour for the application chrome (proposals/18).

axe (test_accessibility.py) checks that the attributes are *present and
consistent*. It cannot check that pressing Down actually moves focus --
and an incomplete widget that merely looks right to a linter is the
precise defect proposals/18 raises: both settings tablists already set
`role="tab"` and `aria-selected` while implementing no arrow keys at
all, promising assistive-technology users navigation that silently did
nothing.

So these are the behavioural half, and they are the ones that would fail
if the roles were kept and the handlers deleted.
"""
from playwright.sync_api import expect


# --- Modals ---------------------------------------------------------------

def test_every_modal_is_a_named_dialog(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    dialog = page.locator(".modal-dialog")
    expect(dialog).to_have_attribute("role", "dialog")
    expect(dialog).to_have_attribute("aria-modal", "true")
    # Named by its own visible title rather than a duplicated string.
    labelled_by = dialog.get_attribute("aria-labelledby")
    assert labelled_by
    assert page.locator(f"#{labelled_by}").text_content() == "Project Settings"


def test_stacked_modals_each_carry_their_own_name(page):
    """The Node Library's delete confirmation opens on top of the Node
    Library itself, so the generated title ids must not collide."""
    page.click("#menu-trigger-add")
    page.click("#btn-manage-ids")
    page.fill(".node-library-add-row input", "Corrosion")
    page.get_by_role("button", name="+ Add to library", exact=True).click()
    page.locator(".node-library-row").first.get_by_role(
        "button", name="Delete", exact=True,
    ).click()

    ids = page.locator(".modal-dialog").evaluate_all(
        "els => els.map(e => e.getAttribute('aria-labelledby'))",
    )
    assert len(ids) == 2
    assert len(set(ids)) == 2, f"two open dialogs share a title id: {ids}"


def test_the_welcome_gate_is_a_named_dialog(browser, base_url):
    """The one modal nothing else in the app is reachable past."""
    from conftest import INIT_SCRIPT

    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    try:
        dialog = pg.locator(".modal-dialog")
        expect(dialog).to_have_attribute("role", "dialog")
        labelled_by = dialog.get_attribute("aria-labelledby")
        assert pg.locator(f"#{labelled_by}").text_content() == "Bowtie Diagram Editor"
    finally:
        assert pg.errors == []
        pg.close()


# --- Toolbar menus --------------------------------------------------------

def test_a_menu_trigger_announces_that_it_opens_a_menu(page):
    trigger = page.locator("#menu-trigger-view")
    expect(trigger).to_have_attribute("aria-haspopup", "menu")
    expect(trigger).to_have_attribute("aria-expanded", "false")
    trigger.click()
    expect(trigger).to_have_attribute("aria-expanded", "true")
    page.keyboard.press("Escape")
    expect(trigger).to_have_attribute("aria-expanded", "false")


def test_only_one_menu_reports_itself_open(page):
    page.click("#menu-trigger-view")
    page.click("#menu-trigger-add")
    expanded = page.locator(".menu-bar-trigger[aria-expanded='true']")
    expect(expanded).to_have_count(1)
    expect(expanded).to_have_id("menu-trigger-add")


def test_down_arrow_opens_a_menu_and_lands_on_its_first_item(page):
    page.focus("#menu-trigger-view")
    page.keyboard.press("ArrowDown")
    expect(page.locator("#menu-dropdown-view")).to_be_visible()
    assert page.evaluate("() => document.activeElement.id") == "btn-auto-arrange"


def test_arrows_move_through_the_menu_and_wrap(page):
    page.focus("#menu-trigger-view")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowDown")
    assert page.evaluate("() => document.activeElement.id") == "btn-reset-view"
    page.keyboard.press("End")
    assert page.evaluate("() => document.activeElement.id") == "btn-shortcuts"
    # Past the end is the beginning again -- a menu is a ring.
    page.keyboard.press("ArrowDown")
    assert page.evaluate("() => document.activeElement.id") == "btn-auto-arrange"
    page.keyboard.press("ArrowUp")
    assert page.evaluate("() => document.activeElement.id") == "btn-shortcuts"


def test_escape_closes_a_menu_and_returns_focus_to_its_trigger(page):
    page.focus("#menu-trigger-view")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Escape")
    expect(page.locator("#menu-dropdown-view")).to_be_hidden()
    assert page.evaluate("() => document.activeElement.id") == "menu-trigger-view"


def test_menu_items_are_menuitems_and_out_of_the_tab_order(page):
    page.click("#menu-trigger-view")
    items = page.locator("#menu-dropdown-view .menu-dropdown-item")
    roles = items.evaluate_all("els => els.map(e => e.getAttribute('role'))")
    assert set(roles) == {"menuitem"}
    tabindexes = items.evaluate_all("els => els.map(e => e.tabIndex)")
    assert set(tabindexes) == {-1}, "Tab should leave the menu, not walk it"


# --- Settings / Node Library tablists -------------------------------------

def test_tabs_point_at_the_panel_they_reveal(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    tab = page.locator(".settings-tab").first
    panel_id = tab.get_attribute("aria-controls")
    assert panel_id
    expect(page.locator(f"#{panel_id}")).to_have_attribute("role", "tabpanel")


def test_only_the_selected_tab_is_in_the_tab_order(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    tabindexes = page.locator(".settings-tab").evaluate_all(
        "els => els.map(e => e.tabIndex)",
    )
    assert tabindexes.count(0) == 1, f"expected one tabbable tab, got {tabindexes}"


def test_arrows_move_between_tabs_without_selecting(page):
    """Manual activation: arrowing must not rebuild the panel, because
    the rebuild would destroy the button being arrowed through."""
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    page.focus(".settings-tab[data-tab='general']")
    page.keyboard.press("ArrowRight")

    assert page.evaluate("() => document.activeElement.dataset.tab") == "risk"
    # Focus moved; selection did not.
    expect(page.locator(".settings-tab[data-tab='general']")).to_have_attribute(
        "aria-selected", "true",
    )
    expect(page.locator(".settings-panel")).to_have_attribute("data-tab", "general")


def test_enter_selects_the_focused_tab_and_keeps_focus_on_it(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    page.focus(".settings-tab[data-tab='general']")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Enter")

    expect(page.locator(".settings-panel")).to_have_attribute("data-tab", "risk")
    # The rebuild replaced the element that had focus; focus must land on
    # its replacement or every subsequent arrow press does nothing.
    assert page.evaluate("() => document.activeElement.dataset.tab") == "risk"


def test_home_and_end_reach_the_ends_of_the_node_library_tabs(page):
    page.click("#menu-trigger-add")
    page.click("#btn-manage-ids")
    page.focus(".settings-tab[data-type='threat']")
    page.keyboard.press("End")
    assert page.evaluate("() => document.activeElement.dataset.type") == "escalationBarrier"
    page.keyboard.press("Home")
    assert page.evaluate("() => document.activeElement.dataset.type") == "threat"


# --- Page tabs ------------------------------------------------------------

def test_the_active_page_is_announced_as_current(page):
    current = page.locator(".page-tab-label[aria-current='page']")
    expect(current).to_have_count(1)
    expect(current).to_have_text("Untitled Page")


def _add_page(page, name):
    """'+ Add page' opens the new-page dialog; it is not a one-click add."""
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill(name)
    page.get_by_role("button", name="Create", exact=True).click()


def test_page_icon_buttons_are_named_after_their_page(page):
    """'✎' and '×' are the entire label otherwise, so every page's
    buttons are announced identically."""
    _add_page(page, "Page Two")
    expect(page.locator(".page-tab")).to_have_count(2)
    expect(page.get_by_role("button", name="Edit page Untitled Page")).to_have_count(1)
    expect(page.get_by_role("button", name="Edit page Page Two")).to_have_count(1)
    expect(page.get_by_role("button", name="Delete page Page Two")).to_have_count(1)


def test_the_jump_dropdown_announces_its_state(page):
    """It only appears once the strip overflows, so this makes it
    overflow first."""
    for i in range(12):
        _add_page(page, f"Page {i} with a deliberately long name")
    trigger = page.locator(".page-jump-trigger")
    expect(trigger).to_be_visible()
    expect(trigger).to_have_attribute("aria-haspopup", "menu")
    expect(trigger).to_have_attribute("aria-expanded", "false")
    trigger.click()
    expect(page.locator(".page-jump-trigger")).to_have_attribute("aria-expanded", "true")


# --- Markup -------------------------------------------------------------

def test_icon_only_buttons_have_accessible_names(page):
    for button_id, name in [("btn-undo", "Undo"), ("btn-redo", "Redo")]:
        expect(page.locator(f"#{button_id}")).to_have_attribute("aria-label", name)


def test_the_page_declares_a_viewport(page):
    content = page.locator('meta[name="viewport"]').get_attribute("content")
    assert "width=device-width" in content


def test_the_app_has_landmarks_and_one_heading(page):
    expect(page.locator("main#canvas-wrapper")).to_have_count(1)
    expect(page.locator("header#toolbar")).to_have_count(1)
    expect(page.locator("footer#bottom-bar")).to_have_count(1)
    expect(page.locator("h1")).to_have_count(1)
