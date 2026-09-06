"""toolbar.md: the toolbar is restructured into File/Add/View/Settings
dropdown menus (Undo/Redo stay as always-visible icon buttons), and a
context menu reachable from empty canvas or the TLE offers Add Cause/Add
Outcome — not just from an existing Cause/Outcome node."""
from helpers import click_svg_point, menu_items


def _open_menu(page, name):
    page.click(f"#menu-trigger-{name}")


def test_each_toolbar_menu_opens_with_its_expected_items(page):
    cases = {
        "file": ["Import from JSON", "Export to JSON", "Export to SVG", "Export to PNG"],
        "add": ["Add Cause", "Add Outcome"],
        "view": ["Auto-arrange", "Reset view"],
        "settings": ["Visual Settings", "Identifiers"],
    }
    for name, expected_labels in cases.items():
        _open_menu(page, name)
        dropdown = page.locator(f"#menu-dropdown-{name}")
        assert dropdown.is_visible()
        texts = dropdown.locator(".menu-dropdown-item").all_text_contents()
        for label in expected_labels:
            assert any(label in t for t in texts), f"{label!r} missing from {name!r} menu: {texts}"
        # Every other dropdown must be closed — only one menu open at a time.
        for other in cases:
            if other != name:
                assert page.locator(f"#menu-dropdown-{other}").is_hidden()


def test_clicking_outside_closes_the_open_menu(page):
    _open_menu(page, "add")
    assert page.locator("#menu-dropdown-add").is_visible()
    page.mouse.click(50, 50)
    assert page.locator("#menu-dropdown-add").is_hidden()


def test_clicking_a_menu_item_runs_its_action_and_closes_the_menu(page):
    _open_menu(page, "add")
    page.click("#btn-add-cause")
    assert page.locator("#menu-dropdown-add").is_hidden()
    count = page.evaluate("() => window.__lastModel.causes.length")
    assert count == 1


def test_undo_redo_remain_icon_buttons_outside_any_menu(page):
    # Still directly clickable without opening any dropdown — Undo/Redo are
    # deliberately NOT nested inside the menu-bar (toolbar.md).
    undo = page.locator("#btn-undo")
    redo = page.locator("#btn-redo")
    assert undo.is_visible()
    assert redo.is_visible()
    assert undo.locator("svg").count() == 1
    assert redo.locator("svg").count() == 1


def test_right_click_empty_canvas_offers_add_cause_and_add_outcome(page):
    click_svg_point(page, 150, 700)  # far from the TLE/Hazard at (700, 400)
    items = menu_items(page)
    assert "Add Cause" in items
    assert "Add Outcome" in items


def test_add_cause_from_empty_canvas_menu_places_it_at_the_clicked_point(page):
    click_svg_point(page, 150, 700)
    page.locator(".context-menu-item", has_text="Add Cause").click()
    page.wait_for_timeout(80)
    pos = page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.causes[0];
      return { x: c.x, y: c.y };
    }""")
    assert abs(pos["x"] - 150) < 1
    assert abs(pos["y"] - 700) < 1


def test_right_click_the_tle_offers_add_cause_and_add_outcome(page):
    click_svg_point(page, 700, 400)  # TLE's default position
    items = menu_items(page)
    assert "Add Cause" in items
    assert "Add Outcome" in items
    assert "Rename" in items


def test_add_cause_from_wrong_side_falls_back_to_toolbar_placement(page):
    """wishlist.md: right-clicking on the Outcome side (right of the TLE at
    x=700) and choosing "Add Cause" must not place the Cause there — it
    should land exactly where the toolbar's own Add Cause button would put
    it (BowtieModel.addCause's fixed default x=150, auto y), not at the
    wrong-side click point."""
    click_svg_point(page, 1100, 700)  # right of the TLE (700, 400) -- Outcome side
    page.locator(".context-menu-item", has_text="Add Cause").click()
    page.wait_for_timeout(80)
    pos = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return { x: c.x, y: c.y };
    }""")
    assert abs(pos["x"] - 150) < 1
    assert pos["y"] != 700  # auto-placed (findClearY), not the click's y


def test_add_outcome_from_wrong_side_falls_back_to_toolbar_placement(page):
    """Mirrors the Cause case: right-clicking the Cause side and choosing
    "Add Outcome" must not land it left of the TLE."""
    click_svg_point(page, 150, 700)  # left of the TLE (700, 400) -- Cause side
    page.locator(".context-menu-item", has_text="Add Outcome").click()
    page.wait_for_timeout(80)
    pos = page.evaluate("""() => {
      const o = window.__lastModel.outcomes[0];
      return { x: o.x, y: o.y };
    }""")
    assert pos["x"] > 700  # right of the TLE, not the wrong-side click's x=150
    assert pos["y"] != 700


def test_add_cause_from_correct_side_still_uses_the_click_point(page):
    """The existing "place it exactly where clicked" behavior must survive
    for the already-correct side."""
    click_svg_point(page, 150, 700)  # left of the TLE -- Cause side, correct
    page.locator(".context-menu-item", has_text="Add Cause").click()
    page.wait_for_timeout(80)
    pos = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return { x: c.x, y: c.y };
    }""")
    assert abs(pos["x"] - 150) < 1
    assert abs(pos["y"] - 700) < 1


def test_bowtie_name_stays_centered_regardless_of_side_group_widths(page):
    """Bug: `#toolbar`'s old `auto 1fr auto` grid centered the name button
    only within the leftover space after the two side groups, which drifts
    right whenever the left group (icon buttons + menu bar) is wider than
    the right group (just the warning badge, usually hidden). `1fr auto 1fr`
    keeps both side columns equal-width so the middle column -- and the name
    inside it -- stays on the toolbar's true center regardless."""
    toolbar_box = page.locator("#toolbar").bounding_box()
    name_box = page.locator("#bowtie-name").bounding_box()
    toolbar_center = toolbar_box["x"] + toolbar_box["width"] / 2
    name_center = name_box["x"] + name_box["width"] / 2
    assert abs(name_center - toolbar_center) < 2
