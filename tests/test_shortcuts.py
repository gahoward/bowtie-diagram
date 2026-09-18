"""ShortcutsController (proposals/03): keys for what the menus already
do, plus a selection model so Delete has something to remove.

Every shortcut but Delete/Escape/? activates an existing menu button by
id, so the interesting cases are the guards -- Ctrl+S inside a text
field, or while a blocking warning has disabled every export, must do
nothing -- and the selection Delete acts on.
"""


def _mod(page):
    """The modifier the controller listens for on this platform."""
    return "Meta" if page.evaluate("() => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)") else "Control"


def _no_save_picker(page):
    """Force the download-link fallback -- the real File System Access
    API would open a native dialog nothing here drives."""
    page.evaluate("() => { delete window.showSaveFilePicker; }")


def _add_threat(page, name="A threat"):
    page.evaluate(f"() => {{ window.__lastModel.addThreat({{x: 150, y: 200, name: '{name}'}}); }}")
    page.wait_for_timeout(100)


def _orphan_a_barrier(page):
    """The same blocking warning test_warnings_controller.py uses -- it
    disables every export button, and so must disable their keys."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200});
      m.addPreventativeControl(m.threats[0].id);
      m.connectLineDirectlyToTle(m._lineFor(m.threats[0].id).id, null);
    }""")
    page.wait_for_timeout(80)


# --- The export/import keys ----------------------------------------------

def test_ctrl_s_exports_json_and_clears_the_unsaved_flag(page):
    _add_threat(page)
    _no_save_picker(page)
    assert page.evaluate("() => window.__lastUnsavedChanges.dirty") is True

    with page.expect_download():
        page.keyboard.press(f"{_mod(page)}+s")
    page.wait_for_timeout(80)
    assert page.evaluate("() => window.__lastUnsavedChanges.dirty") is False


def test_ctrl_s_inside_a_text_field_does_not_export(page):
    """Typing a node name and reaching for Ctrl+S is the browser's own
    save-page shortcut, not ours -- and must not fire an export either."""
    _add_threat(page)
    _no_save_picker(page)
    box = page.locator("#bowtie-canvas .node.threat").first.bounding_box()
    page.mouse.dblclick(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(100)

    name = page.locator(".modal-field:has-text('Name') input[type=text]").first
    name.click()
    name.press(f"{_mod(page)}+s")
    page.wait_for_timeout(150)
    assert page.evaluate("() => window.__lastUnsavedChanges.dirty") is True, "no export fired"


def test_a_blocking_warning_disables_the_export_keys_too(page):
    _orphan_a_barrier(page)
    _no_save_picker(page)
    assert page.locator("#btn-export-json").is_disabled()

    page.keyboard.press(f"{_mod(page)}+s")
    page.wait_for_timeout(200)
    assert page.evaluate("() => window.__lastUnsavedChanges.dirty") is True, "no export fired"


def test_shortcuts_are_inert_while_a_modal_is_open(page):
    _add_threat(page)
    _no_save_picker(page)
    page.click("#menu-trigger-view")
    page.click("#btn-risk-summary")
    page.wait_for_timeout(120)
    assert page.locator(".modal-title").text_content() == "Risk Summary"

    page.keyboard.press(f"{_mod(page)}+s")
    page.wait_for_timeout(200)
    assert page.evaluate("() => window.__lastUnsavedChanges.dirty") is True, "no export fired"
    assert page.locator(".modal-title").text_content() == "Risk Summary", "and nothing else opened"


# --- Selection and Delete -------------------------------------------------

def test_clicking_a_node_selects_it_and_delete_removes_it_undoably(page):
    _add_threat(page)
    node = page.locator("#bowtie-canvas .node.threat").first
    box = node.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(80)
    assert page.locator("#bowtie-canvas .node.selected").count() == 1

    page.keyboard.press("Delete")
    page.wait_for_timeout(120)
    assert page.evaluate("() => window.__lastModel.threats.length") == 0
    assert page.locator("#bowtie-canvas .node.threat").count() == 0

    page.click("#btn-undo")
    page.wait_for_timeout(120)
    assert page.evaluate("() => window.__lastModel.threats.length") == 1
    assert page.locator("#bowtie-canvas .node.selected").count() == 0, "the restored node is not re-selected"


def test_clicking_a_barrier_selects_it_and_escape_clears_the_selection(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200});
      m.addPreventativeControl(m.threats[0].id);
    }""")
    page.wait_for_timeout(120)

    box = page.locator("#bowtie-canvas .node.preventative-barrier").first.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(80)
    selected = page.locator("#bowtie-canvas .node.selected")
    assert selected.count() == 1
    assert "preventative-barrier" in (selected.first.get_attribute("class") or "")

    page.keyboard.press("Escape")
    page.wait_for_timeout(80)
    assert page.locator("#bowtie-canvas .node.selected").count() == 0


def test_the_top_event_and_hazard_are_never_selected(page):
    """Neither can be removed from a page, so neither is a Delete target."""
    box = page.locator("#bowtie-canvas .node.top-level-event").first.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(80)
    assert page.locator("#bowtie-canvas .node.selected").count() == 0


def test_delete_with_nothing_selected_changes_nothing(page):
    _add_threat(page)
    page.keyboard.press("Delete")
    page.wait_for_timeout(120)
    assert page.evaluate("() => window.__lastModel.threats.length") == 1


def test_clicking_empty_canvas_clears_the_selection(page):
    _add_threat(page)
    box = page.locator("#bowtie-canvas .node.threat").first.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(80)
    assert page.locator("#bowtie-canvas .node.selected").count() == 1

    canvas = page.locator("#bowtie-canvas").bounding_box()
    page.mouse.click(canvas["x"] + canvas["width"] / 2, canvas["y"] + canvas["height"] - 20)
    page.wait_for_timeout(80)
    assert page.locator("#bowtie-canvas .node.selected").count() == 0


# --- The sheet ------------------------------------------------------------

def test_question_mark_opens_the_sheet_and_the_menu_item_opens_the_same_one(page):
    page.keyboard.press("Shift+/")
    page.wait_for_timeout(120)
    assert page.locator(".modal-title").text_content() == "Keyboard shortcuts"
    rows = page.locator(".shortcut-list dt").all_text_contents()
    assert len(rows) == page.evaluate("() => Bowtie.SHORTCUTS.length")
    assert any(r in ("Ctrl+S", "⌘S") for r in rows)
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)

    page.click("#menu-trigger-view")
    page.click("#btn-shortcuts")
    page.wait_for_timeout(120)
    assert page.locator(".modal-title").text_content() == "Keyboard shortcuts"
    page.get_by_role("button", name="Close", exact=True).click()


def test_the_sheet_describes_the_button_each_shortcut_actually_drives(page):
    """The table maps to real menu button ids -- a renamed or removed
    menu item would otherwise leave a shortcut pointing at nothing."""
    missing = page.evaluate("""() => Bowtie.SHORTCUTS
      .filter((s) => s.buttonId && !document.getElementById(s.buttonId))
      .map((s) => s.buttonId)""")
    assert missing == []


def test_menu_items_advertise_their_key_in_the_tooltip(page):
    title = page.locator("#btn-export-json").get_attribute("title")
    assert title in ("Export to JSON (Ctrl+S)", "Export to JSON (⌘S)")
