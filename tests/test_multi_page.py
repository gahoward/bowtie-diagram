"""End-to-end multi-page coverage: the page-tabs UI (PageTabsView/
PageTabsController), cross-page isolation driven through real UI actions,
the per-page + document-level undo redesign, and import/export/demo-data
behavior across more than one page. Model-level primitives (pages array,
getPageJSON/loadPageFromJSON, id uniqueness, etc.) are covered directly in
test_model_pages.py; this file exercises the same features through the
real UI the way a user actually reaches them.
"""
from conftest import INIT_SCRIPT


def _fresh_page(browser, base_url):
    """A brand-new tab still on the welcome modal's choice step -- the
    shared `page` fixture already drives past this (see conftest.py), but
    several tests below need to fill in the wizard's own fields."""
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    return pg


def _open_wizard(pg):
    pg.get_by_role("button", name="New Bowtie Wizard", exact=True).click()


def _fill_field(pg, label, value):
    pg.locator(f".modal-field:has-text('{label}') input").fill(value)


def _active_tab_text(pg):
    return pg.locator(".page-tab.active").text_content()


def _active_tab_name(pg):
    return pg.locator(".page-tab.active .page-tab-label").text_content()


def _node_count(pg, css_selector):
    """MinimapView clones the whole live #nodes-layer <g> -- id and all --
    into #minimap-container (deliberately, see MinimapView.js), so a plain
    `#nodes-layer ...` CSS selector matches both copies. Scope through
    getElementById first to count only the real one."""
    return pg.evaluate(
        f"() => document.getElementById('nodes-layer').querySelectorAll('{css_selector}').length"
    )


# --- Wizard: page fields, validation, naming ---------------------------

def test_wizard_create_produces_one_correctly_named_described_page(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        _open_wizard(pg)
        _fill_field(pg, "Analysis title", "My Analysis")
        _fill_field(pg, "Page name", "First Failure")
        _fill_field(pg, "Page description", "A description")
        _fill_field(pg, "Top-level event name", "The TLE")
        _fill_field(pg, "Hazard name", "The Hazard")
        pg.get_by_role("button", name="Create", exact=True).click()
        pg.wait_for_timeout(150)

        assert pg.locator(".modal-overlay").count() == 0
        pages = pg.evaluate("() => window.__lastModel.pages.map((p) => ({name: p.name, description: p.description}))")
        assert pages == [{"name": "First Failure", "description": "A description"}]
        assert pg.locator(".page-tab").count() == 1
        assert "First Failure" in pg.locator(".page-tab").text_content()
    finally:
        assert pg.errors == []
        pg.close()


def test_wizard_create_disabled_until_all_required_fields_are_non_blank(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        _open_wizard(pg)
        create_btn = pg.get_by_role("button", name="Create", exact=True)
        assert create_btn.is_enabled(), "defaults pre-fill every required field"

        for label in ["Analysis title", "Page name", "Top-level event name", "Hazard name"]:
            _fill_field(pg, label, "   ")  # whitespace-only must count as blank
            assert create_btn.is_disabled(), f"Create must disable once {label} is blank"
            _fill_field(pg, label, "Something")
            assert create_btn.is_enabled(), f"Create must re-enable once {label} is filled back in"

        # Page description may stay blank.
        _fill_field(pg, "Page description", "")
        assert create_btn.is_enabled()
    finally:
        assert pg.errors == []
        pg.close()


def test_toolbar_rename_modal_and_button_say_analysis_not_bowtie(page):
    # The button's accessible name is its own text (the analysis title,
    # e.g. "Untitled Bowtie"), not its `title` attribute -- check that
    # attribute directly instead of via get_by_role.
    assert page.locator("#bowtie-name").get_attribute("title") == "Rename this analysis"
    page.locator("#bowtie-name").click()
    assert page.get_by_text("Rename Analysis", exact=True).count() == 1
    assert page.get_by_text("Analysis title", exact=True).count() == 1


# --- "+ Add page" / edit / delete ---------------------------------------

def test_add_page_button_opens_modal_cancel_adds_nothing(page):
    before = page.locator(".page-tab").count()
    page.locator(".page-tab-add").click()
    assert page.get_by_role("button", name="Create", exact=True).is_disabled(), "name starts blank"
    page.get_by_role("button", name="Cancel", exact=True).click()
    assert page.locator(".modal-overlay").count() == 0
    assert page.locator(".page-tab").count() == before


def test_add_page_creates_and_switches_to_it(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)

    assert page.locator(".page-tab").count() == 2
    assert "Page Two" in _active_tab_text(page)


def test_editing_a_page_name_description_persists_and_reflects_in_its_tab(page):
    tab = page.locator(".page-tab").first
    tab.locator(".page-tab-edit").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Renamed Page")
    page.locator(".modal-field:has-text('Page description') input").fill("New description")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(150)

    assert "Renamed Page" in page.locator(".page-tab").first.text_content()
    state = page.evaluate("() => ({name: window.__lastModel.pages[0].name, description: window.__lastModel.pages[0].description})")
    assert state == {"name": "Renamed Page", "description": "New description"}


def test_delete_is_hidden_on_the_last_remaining_page(page):
    assert page.locator(".page-tab").count() == 1
    assert page.locator(".page-tab-close").count() == 0


def test_deleting_a_page_removes_it_and_its_content(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)
    page.evaluate("""() => {
      const p2 = window.__lastModel.pages[1].id;
      window.__lastModel.addCause({x: 150, y: 200, pageId: p2});
    }""")
    page.wait_for_timeout(100)

    page.locator(".page-tab", has_text="Page Two").locator(".page-tab-close").click()
    page.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(150)

    assert page.locator(".page-tab").count() == 1
    assert page.evaluate("() => window.__lastModel.causes.length") == 0


def test_deleting_the_active_page_switches_to_a_valid_remaining_page(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)
    assert "Page Two" in _active_tab_text(page)  # newly added page is active

    page.locator(".page-tab", has_text="Page Two").locator(".page-tab-close").click()
    page.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(150)

    # No crash, no blank canvas: the one remaining page is now active and
    # its own TLE/Hazard render on the very next frame.
    assert page.locator(".page-tab").count() == 1
    assert page.locator(".page-tab.active").count() == 1
    assert _node_count(page, ".node.top-level-event") == 1


def test_deleting_a_non_active_page_leaves_the_active_page_untouched(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)
    # Switch back to the first page (by index, not by guessing its default
    # label text).
    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(150)
    active_before = _active_tab_name(page)

    page.locator(".page-tab").nth(1).locator(".page-tab-close").click()
    page.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(150)

    assert page.locator(".page-tab").count() == 1
    assert _active_tab_name(page) == active_before


# --- Cross-page isolation, driven through the real UI -------------------

def test_cross_page_isolation_both_directions(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)
    page.locator(".page-tab").first.locator(".page-tab-label").click()  # back to page one
    page.wait_for_timeout(120)

    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200, name: 'P1 Cause'}); }")
    page.wait_for_timeout(100)
    assert _node_count(page, ".node.cause") == 1

    page.locator(".page-tab").nth(1).locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    assert _node_count(page, ".node.cause") == 0, "page two must not show page one's cause"

    page.evaluate("""() => {
      const p2 = window.__lastModel.pages[1].id;
      window.__lastModel.addCause({x: 150, y: 200, name: 'P2 Cause', pageId: p2});
    }""")
    page.wait_for_timeout(100)
    assert _node_count(page, ".node.cause") == 1

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    names = page.evaluate("""
      () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.node.cause tspan.node-name-text'))
        .map((n) => n.textContent)
    """)
    assert names == ["P1 Cause"], "page one must still show only its own cause"


def test_auto_arrange_on_one_page_never_moves_another_pages_elements(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)

    page.evaluate("""() => {
      const m = window.__lastModel;
      const p1 = m.pages[0].id;
      const p2 = m.pages[1].id;
      m.addCause({x: 150, y: 90, pageId: p1});
      m.addCause({x: 150, y: 90, pageId: p2});
    }""")
    page.wait_for_timeout(100)
    before = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id).map((c) => ({x: c.x, y: c.y}))")

    # Auto-arrange runs against whichever page is active -- page two here.
    page.click("#menu-trigger-view")
    page.click("#btn-auto-arrange")
    page.wait_for_timeout(150)

    after = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id).map((c) => ({x: c.x, y: c.y}))")
    assert after == before, "auto-arranging the active page must not move the other page's elements"


def test_dragging_a_node_never_moves_another_pages_elements(page):
    page.locator(".page-tab-add").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Page Two")
    page.get_by_role("button", name="Create", exact=True).click()
    page.wait_for_timeout(150)

    page.evaluate("""() => {
      const m = window.__lastModel;
      const p1 = m.pages[0].id;
      const p2 = m.pages[1].id;
      m.addCause({x: 150, y: 200, pageId: p1});
      m.addCause({x: 150, y: 200, pageId: p2});
    }""")
    page.wait_for_timeout(100)
    p1_before = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id)[0].y")

    node = page.locator(".node.cause").first  # page two's own cause, since it's active
    box = node.bounding_box()
    start_x, start_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x, start_y + 60)
    page.mouse.up()
    page.wait_for_timeout(100)

    p1_after = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id)[0].y")
    assert p1_after == p1_before, "dragging on the active page must not move the other page's element"


# --- Many pages: scrollable strip + "Jump to page ▾" -------------------

def test_many_pages_tab_strip_scrollable_and_jump_dropdown_reaches_all(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      for (let i = 2; i <= 12; i += 1) m.addPage({ name: `A Somewhat Long Page Name ${i}` });
    }""")
    page.wait_for_timeout(150)
    assert page.locator(".page-tab").count() == 12

    strip = page.locator(".page-tabs-scroll")
    assert strip.evaluate("(el) => getComputedStyle(el).overflowX") == "auto"
    assert strip.evaluate("(el) => el.scrollWidth > el.clientWidth"), \
        "12 pages with long names must actually overflow, or this test proves nothing"

    page.locator(".page-jump-trigger").click()
    items = page.locator(".page-jump-item")
    assert items.count() == 12

    last_label = "A Somewhat Long Page Name 12"
    items.last.click()
    page.wait_for_timeout(150)

    assert last_label in _active_tab_name(page)
    assert page.locator(".page-jump-dropdown[hidden]").count() == 1, "picking an item closes the dropdown"

    # Scrolled into view: the active tab's box now horizontally overlaps
    # the scroll container's own visible box (it wasn't necessarily so
    # before the click, since it was the last of 12 overflowing tabs).
    strip_box = strip.bounding_box()
    tab_box = page.locator(".page-tab.active").bounding_box()
    assert tab_box["x"] >= strip_box["x"] - 1
    assert tab_box["x"] + tab_box["width"] <= strip_box["x"] + strip_box["width"] + 1


# --- Per-page + document-level undo -------------------------------------

def _cause_names(pg):
    return pg.evaluate(
        "() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)"
    )


def _add_second_page(pg, name="Page Two"):
    pg.locator(".page-tab-add").click()
    pg.locator(".modal-field:has-text('Page name') input").fill(name)
    pg.get_by_role("button", name="Create", exact=True).click()
    pg.wait_for_timeout(150)


def test_per_page_undo_isolation_both_directions(page):
    """addCause/addOutcome/etc. creating a brand-new node are document-tier
    steps (node_library_proposal.md "Undo tier" — a shared library node's
    identity isn't page-scoped), so this test exercises the tier that
    genuinely stays per-page: placement-only mutations, e.g. moveElement.
    See test_undo_redo.py's `_document_undo_depth`/`_page_undo_depth` split
    for the same distinction at the model level."""
    _add_second_page(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const p1 = m.pages[0].id;
      const p2 = m.pages[1].id;
      m.addCause({x: 150, y: 200, name: 'P1 Cause', pageId: p1});
      m.addCause({x: 150, y: 200, name: 'P2 Cause', pageId: p2});
    }""")
    page.wait_for_timeout(100)
    page.evaluate("() => window.__lastUndo.reset();")  # discard the two document-tier creations

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const pageId = m.pages[0].id;
      const c = m.causesForPage(pageId)[0];
      window.__lastUndo.snapshot(pageId); // moveElement itself is excluded from
      m.moveElement(c.id, 150, 260);      // the proxy's generic hook -- see UndoController.js
    }""")
    page.wait_for_timeout(80)

    page.locator(".page-tab").nth(1).locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const pageId = m.pages[1].id;
      const c = m.causesForPage(pageId)[0];
      window.__lastUndo.snapshot(pageId);
      m.moveElement(c.id, 150, 260);
    }""")
    page.wait_for_timeout(80)

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)

    p1_y = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id)[0].y")
    assert p1_y == 200, "undo on page one must only revert page one's own edit"
    p2_y = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[1].id)[0].y")
    assert p2_y == 260, "page two's own move must be untouched"

    page.keyboard.press("Control+y")
    page.wait_for_timeout(120)
    p1_y = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id)[0].y")
    assert p1_y == 260


def test_redo_scoping_a_new_edit_clears_only_its_own_pages_redo(page):
    """Same tier caveat as test_per_page_undo_isolation_both_directions:
    addCause creates a brand-new document-tier node, so the page-scoped
    mutation exercised here is moveElement instead."""
    _add_second_page(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const p1 = m.pages[0].id;
      const p2 = m.pages[1].id;
      m.addCause({x: 150, y: 200, pageId: p1});
      m.addCause({x: 150, y: 200, pageId: p2});
    }""")
    page.wait_for_timeout(100)
    page.evaluate("() => window.__lastUndo.reset();")  # discard the two document-tier creations

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const pageId = m.pages[0].id;
      const c = m.causesForPage(pageId)[0];
      window.__lastUndo.snapshot(pageId); // moveElement itself is excluded from
      m.moveElement(c.id, 150, 260);      // the proxy's generic hook -- see UndoController.js
    }""")
    page.wait_for_timeout(80)
    page.keyboard.press("Control+z")  # leaves page one's own redo available
    page.wait_for_timeout(80)

    page.locator(".page-tab").nth(1).locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const pageId = m.pages[1].id;
      const c = m.causesForPage(pageId)[0];
      window.__lastUndo.snapshot(pageId);
      m.moveElement(c.id, 150, 260);
    }""")
    page.wait_for_timeout(80)
    page.keyboard.press("Control+z")  # leaves page two's own redo available too
    page.wait_for_timeout(80)

    # A fresh edit on page two must clear ONLY page two's redo.
    page.evaluate("""() => {
      const m = window.__lastModel;
      const pageId = m.pages[1].id;
      const c = m.causesForPage(pageId)[0];
      window.__lastUndo.snapshot(pageId);
      m.moveElement(c.id, 320, 260);
    }""")
    page.wait_for_timeout(80)
    assert page.evaluate("() => document.getElementById('btn-redo').disabled") is True

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    assert page.evaluate("() => document.getElementById('btn-redo').disabled") is False, \
        "page one's redo must survive page two's unrelated edit"


def test_undo_picks_the_more_recent_document_tier_rename_over_an_older_page_edit(page):
    """Same tier caveat as the isolation tests above: the "older page-tier
    edit" here has to be a placement-only mutation (moveElement), since
    creating a brand-new node is itself document-tier now."""
    _add_second_page(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200, name: 'P1 Cause', pageId: m.pages[0].id});
    }""")
    page.wait_for_timeout(100)
    page.evaluate("() => window.__lastUndo.reset();")  # discard the document-tier creation

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)

    page.evaluate("""() => {
      const m = window.__lastModel;
      const pageId = m.pages[0].id;
      const c = m.causesForPage(pageId)[0];
      window.__lastUndo.snapshot(pageId); // moveElement itself is excluded from
      m.moveElement(c.id, 150, 260);      // the proxy's generic hook -- see UndoController.js
    }""")
    page.wait_for_timeout(80)

    page.locator(".page-tab").first.locator(".page-tab-edit").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Renamed")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(120)
    assert "Renamed" in _active_tab_name(page)

    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)
    assert "Renamed" not in _active_tab_name(page), "the more recent rename must undo first"
    y = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id)[0].y")
    assert y == 260, "the older page-tier edit must still be intact"

    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)
    y = page.evaluate("() => window.__lastModel.causesForPage(window.__lastModel.pages[0].id)[0].y")
    assert y == 200, "the next undo falls through to the page-tier edit"


def test_undo_picks_the_more_recent_page_edit_over_an_older_document_tier_rename(page):
    _add_second_page(page)
    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)

    page.locator(".page-tab").first.locator(".page-tab-edit").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Renamed")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(120)

    page.evaluate("() => { window.__lastUndo.model.addCause({x: 150, y: 200, name: 'P1 Cause'}); }")
    page.wait_for_timeout(80)

    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)
    assert _cause_names(page) == [], "the more recent page-tier edit must undo first"
    assert "Renamed" in _active_tab_name(page), "the older rename must still be intact"


def test_switching_tabs_is_never_an_undo_step(page):
    _add_second_page(page)
    page.evaluate("() => window.__lastUndo.reset();")  # discard the addPage step itself
    page.wait_for_timeout(80)
    assert page.evaluate("() => document.getElementById('btn-undo').disabled") is True

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(100)
    page.locator(".page-tab").nth(1).locator(".page-tab-label").click()
    page.wait_for_timeout(100)

    assert page.evaluate("() => document.getElementById('btn-undo').disabled") is True, \
        "switching tabs back and forth must never itself become undoable"


def test_drag_gesture_undo_is_attributed_to_the_dragged_pages_own_stack(page):
    _add_second_page(page)
    page.evaluate("() => window.__lastUndo.reset();")
    page.evaluate("""() => {
      const p2 = window.__lastModel.pages[1].id;
      window.__lastUndo.model.addCause({x: 150, y: 200, pageId: p2});
    }""")
    page.wait_for_timeout(100)
    original_y = page.evaluate("() => window.__lastModel.causes[0].y")
    # No per-page viewport memory (see the multi-page proposal): the new
    # page's viewport was fit to its (then-empty) content before this
    # cause existed, so it can render outside the current pan/zoom -- fit
    # again now that there's something to fit to, same as clicking
    # "Reset view" would.
    page.click("#menu-trigger-view")
    page.click("#btn-reset-view")
    page.wait_for_timeout(100)

    node = page.locator("#bowtie-canvas .node.cause").first  # page two is active
    box = node.bounding_box()
    start_x, start_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    for i in range(4):
        page.mouse.move(start_x, start_y + 8 * (i + 1))
    page.mouse.up()
    page.wait_for_timeout(100)
    moved_y = page.evaluate("() => window.__lastModel.causes[0].y")
    assert moved_y != original_y

    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)
    assert page.evaluate("() => window.__lastModel.causes[0].y") == original_y


def test_undo_after_add_page_removes_it(page):
    _add_second_page(page)
    assert page.locator(".page-tab").count() == 2

    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)
    assert page.locator(".page-tab").count() == 1


def test_undo_after_delete_page_fully_restores_page_and_content(page):
    _add_second_page(page)
    page.evaluate("""() => {
      const p2 = window.__lastModel.pages[1].id;
      window.__lastModel.addCause({x: 150, y: 200, name: 'P2 Cause', pageId: p2});
    }""")
    page.wait_for_timeout(100)

    page.locator(".page-tab", has_text="Page Two").locator(".page-tab-close").click()
    page.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(150)
    assert page.locator(".page-tab").count() == 1

    page.keyboard.press("Control+z")
    page.wait_for_timeout(150)
    assert page.locator(".page-tab").count() == 2
    names = page.evaluate("() => window.__lastModel.pages.map((p) => p.name)")
    assert "Page Two" in names
    assert "P2 Cause" in _cause_names(page)


def test_undo_after_rename_page_reverts_name_and_description(page):
    original = page.evaluate(
        "() => ({name: window.__lastModel.pages[0].name, description: window.__lastModel.pages[0].description})"
    )
    page.locator(".page-tab").first.locator(".page-tab-edit").click()
    page.locator(".modal-field:has-text('Page name') input").fill("Renamed")
    page.locator(".modal-field:has-text('Page description') input").fill("New desc")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(120)
    assert "Renamed" in _active_tab_name(page)

    page.keyboard.press("Control+z")
    page.wait_for_timeout(120)
    reverted = page.evaluate(
        "() => ({name: window.__lastModel.pages[0].name, description: window.__lastModel.pages[0].description})"
    )
    assert reverted == original


# --- Import/export/demo across multiple pages ---------------------------

def test_export_then_reimport_via_ui_round_trips_multiple_pages(page):
    _add_second_page(page)
    page.evaluate("""() => {
      const p2 = window.__lastModel.pages[1].id;
      window.__lastModel.addCause({x: 150, y: 200, name: 'P2 Cause', pageId: p2});
    }""")
    page.wait_for_timeout(100)

    exported = page.evaluate("() => JSON.stringify(window.__lastModel.toJSON())")

    page.evaluate(
        """(text) => {
          window.showOpenFilePicker = async () => [{
            getFile: async () => ({ text: async () => text }),
          }];
        }""",
        exported,
    )
    page.click("#menu-trigger-file")
    page.click("#btn-import-json")
    page.wait_for_timeout(150)

    state = page.evaluate("""() => {
      const m = window.__lastModel;
      return { pages: m.pages.map((p) => p.name), causes: m.causes.map((c) => m.getNode(c.nodeId).name) };
    }""")
    assert state["pages"] == ["Untitled Page", "Page Two"]
    assert state["causes"] == ["P2 Cause"]
    assert page.locator(".page-tab").count() == 2


def test_load_demo_shows_both_of_its_pages(browser, base_url):
    pg = _fresh_page(browser, base_url)
    try:
        pg.get_by_role("button", name="Load Demo", exact=True).click()
        pg.wait_for_timeout(250)

        assert pg.locator(".page-tab").count() == 2
        names = pg.evaluate("() => window.__lastModel.pages.map((p) => p.name)")
        assert names == ["Pipeline Release", "Bund Containment Failure"]
        assert pg.evaluate("() => window.__lastModel.getWarnings().length") == 0
    finally:
        assert pg.errors == []
        pg.close()


def test_svg_export_reflects_only_the_active_page(page):
    _add_second_page(page)
    page.evaluate("""() => {
      const p2 = window.__lastModel.pages[1].id;
      window.__lastModel.addCause({x: 150, y: 200, name: 'P2 Cause', pageId: p2});
      // Force the legacy download-link fallback path, same as
      // test_file_handlers.py -- otherwise this Chromium's real File
      // System Access API would open a native "Save As" dialog that
      // nothing in this test drives, and the download event never fires.
      delete window.showSaveFilePicker;
    }""")
    page.wait_for_timeout(100)

    def export_active_page_svg():
        page.click("#menu-trigger-file")
        with page.expect_download() as dl_info:
            page.click("#btn-export-svg")
        return dl_info.value.path().read_text()

    svg_page_two = export_active_page_svg()  # page two is active after adding it
    assert "P2 Cause" in svg_page_two

    page.locator(".page-tab").first.locator(".page-tab-label").click()
    page.wait_for_timeout(120)
    svg_page_one = export_active_page_svg()

    assert svg_page_one != svg_page_two
    assert "P2 Cause" not in svg_page_one


# --- Warnings / identifier manager page-context -------------------------

def test_orphan_warning_names_the_correct_page_for_a_non_active_barrier(page):
    _add_second_page(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const p2 = m.pages[1].id;
      const cause = m.addCause({x: 150, y: 200, pageId: p2});
      m.addPreventativeControl(cause.id);
      m.connectLineDirectlyToTle(m._lineFor(cause.id).id, null); // orphans the barrier
    }""")
    page.wait_for_timeout(100)
    page.locator(".page-tab").first.locator(".page-tab-label").click()  # switch away from it
    page.wait_for_timeout(120)

    warnings = page.evaluate("() => window.__lastModel.getWarnings().map((w) => w.message)")
    assert len(warnings) == 1
    assert 'on page "Page Two"' in warnings[0]


def test_node_library_retired_row_shows_no_page_info(page):
    """node_library_proposal.md: retiring now happens at the NODE level
    (deleteNode), not the placement level -- deleteElement (removing just
    this page's placement) no longer retires anything at all -- and "no
    page history is captured" for a retired node, since it may have had
    placements across several pages. NodeLibraryController's retired rows
    (see _buildRetiredRow) carry only the id and its enabled/disabled
    status -- no `.id-manager-page` element at all any more."""
    _add_second_page(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const p2 = m.pages[1].id;
      const cause = m.addCause({x: 150, y: 200, pageId: p2});
      m.deleteNode(cause.nodeId);
    }""")
    page.wait_for_timeout(100)

    page.click("#menu-trigger-settings")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(100)
    row = page.locator(".id-manager-row").first
    assert "Retired" in row.locator(".id-manager-status").text_content()
    assert row.locator(".id-manager-page").count() == 0, "no per-page info is captured any more"


def test_node_library_reassign_dropdown_lists_live_nodes_without_page_info(page):
    """Mirrors the old identifier-manager reassign dropdown test, updated
    for NodeLibraryController's `_buildReassignRow`: it now iterates
    `this.model.library[type]` (live NODES, not placements), so a node
    with several -- or zero -- placements has no single page to show; each
    option is just `${node.id} — ${node.name}`."""
    _add_second_page(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const p1 = m.pages[0].id;
      const p2 = m.pages[1].id;
      const dead = m.addCause({x: 150, y: 200, pageId: p1});
      m.deleteNode(dead.nodeId);
      m.reEnableId('cause', dead.nodeId);
      m.addCause({x: 150, y: 400, name: 'Live On P1', pageId: p1});
      m.addCause({x: 150, y: 200, name: 'Live On P2', pageId: p2});
    }""")
    page.wait_for_timeout(100)

    page.click("#menu-trigger-settings")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(100)

    options = page.locator(".id-manager-reassign select").first.locator("option").all_text_contents()
    assert any("Live On P1" in o for o in options)
    assert any("Live On P2" in o for o in options)
    assert not any("Page" in o for o in options), "reassign options must not show any per-page info"
