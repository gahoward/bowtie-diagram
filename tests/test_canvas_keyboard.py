"""Canvas keyboard and screen-reader access (proposals/13).

Every other surface was already operable — toolbar, menus, modals with
their `inert` focus trap. The canvas had no focusable elements at all,
so a keyboard-only user could start a bowtie and then do nothing with
it, and a screen-reader user was told nothing about what was on it.

Two ideas carry the whole feature. A **roving tabindex** means Tab
enters the canvas once and leaves once, with arrows moving inside. And
navigation follows the **diagram** rather than the DOM: left/right along
the focused node's own line, up/down between lanes in a column.
"""


from playwright.sync_api import expect
from helpers import eventually_contains, eventually_equals

def _chain(page):
    """Threat → two barriers → top event, plus a consequence with one
    mitigative barrier: enough to walk a whole row."""
    return page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb1 = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const pb2 = m.addPreventativeControl(t.id, { name: 'Coating' });
      const c = m.addConsequence({x: 1200, y: 200, name: 'Release'});
      const mb = m.addMitigativeControl(c.id, { name: 'Bunding' });
      m._emitChange();
      return { t: t.id, pb1: pb1.id, pb2: pb2.id, c: c.id, mb: mb.id };
    }""")


def _focused(page):
    return page.evaluate(
        "() => { const a = document.activeElement; const g = a && a.closest ? a.closest('.node') : null;"
        " return g ? g.getAttribute('data-id') : null; }"
    )


def _focus_node(page, data_id):
    page.evaluate(
        "(id) => document.querySelector(`#bowtie-canvas #nodes-layer .node[data-id=\"${id}\"]`).focus()", data_id
    )
    page.wait_for_timeout(60)


# --- the roving tabindex --------------------------------------------------

def test_exactly_one_node_is_tabbable(page):
    _chain(page)
    page.wait_for_timeout(150)
    counts = page.evaluate("""() => {
      const nodes = [...document.querySelectorAll('#bowtie-canvas #nodes-layer .node')];
      return {
        total: nodes.length,
        tabbable: nodes.filter((n) => n.getAttribute('tabindex') === '0').length,
        rest: nodes.filter((n) => n.getAttribute('tabindex') === '-1').length,
      };
    }""")
    assert counts["tabbable"] == 1, "Tab enters the canvas once, not once per node"
    assert counts["rest"] == counts["total"] - 1


def test_the_tabbable_node_follows_the_selection_and_survives_a_rerender(page):
    ids = _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "PB_1")
    assert _focused(page) == "PB_1"

    # Any model change re-renders the whole node layer.
    page.evaluate("() => window.__lastModel.addThreat({x: 150, y: 500, name: 'Erosion'})")
    page.wait_for_timeout(150)
    tabbable = page.evaluate(
        "() => [...document.querySelectorAll('#bowtie-canvas #nodes-layer .node')]"
        ".filter((n) => n.getAttribute('tabindex') === '0').map((n) => n.getAttribute('data-id'))"
    )
    assert tabbable == ["PB_1"], "the tabindex came back on the same node"


# --- navigation -----------------------------------------------------------

def test_right_walks_the_row_from_threat_to_top_event(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    seen = [_focused(page)]
    for _ in range(3):
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(60)
        seen.append(_focused(page))
    assert seen == ["T_1", "PB_1", "PB_2", page.evaluate("() => window.__lastModel.topLevelEvent.id")]


def test_left_walks_back_again(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "PB_2")
    page.keyboard.press("ArrowLeft")
    eventually_equals(lambda: _focused(page), "PB_1")
    page.keyboard.press("ArrowLeft")
    eventually_equals(lambda: _focused(page), "T_1")


def test_down_and_up_move_between_lanes_in_a_column(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.addThreat({x: 150, y: 400, name: 'Erosion'});
      m.addThreat({x: 150, y: 600, name: 'Fatigue'});
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    page.keyboard.press("ArrowDown")
    eventually_equals(lambda: _focused(page), "T_2")
    page.keyboard.press("ArrowDown")
    eventually_equals(lambda: _focused(page), "T_3")
    page.keyboard.press("ArrowUp")
    eventually_equals(lambda: _focused(page), "T_2")


def test_home_jumps_to_the_top_event(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    page.keyboard.press("Home")
    eventually_equals(lambda: _focused(page), page.evaluate("() => window.__lastModel.topLevelEvent.id"))


def test_down_from_a_barrier_drops_into_its_escalation_stack(page):
    """The escalation factor hangs below the barrier, so Down goes there
    rather than to the next barrier in the column (proposals/08)."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    _focus_node(page, "PB_1")
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(80)
    focused = _focused(page)
    assert focused == page.evaluate("() => window.__lastModel.escalationFactors[0].id")
    page.keyboard.press("ArrowUp")
    eventually_equals(lambda: _focused(page), "PB_1", "and back up to the barrier it degrades")


# --- actions --------------------------------------------------------------

def test_enter_opens_properties_for_the_focused_node(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "PB_1")
    page.keyboard.press("Enter")
    eventually_contains(lambda: page.locator(".modal-title").text_content(), "Preventative Barrier")
    assert page.locator(".modal-field:has-text('Name') input").first.input_value() == "Inspection"
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_shift_f10_opens_the_same_menu_a_right_click_gives(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    page.keyboard.press("Shift+F10")
    page.wait_for_timeout(120)
    keyboard_items = page.locator(".context-menu-item").all_text_contents()
    assert "Add Preventative Barrier" in keyboard_items
    page.keyboard.press("Escape")
    page.mouse.click(10, 300)
    page.wait_for_timeout(80)

    box = page.locator("#bowtie-canvas .node.threat").first.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button="right")
    eventually_equals(lambda: page.locator(".context-menu-item").all_text_contents(), keyboard_items)
    page.keyboard.press("Escape")


def test_ctrl_arrow_nudges_the_node_in_one_undo_step(page):
    _chain(page)
    page.wait_for_timeout(150)
    before = page.evaluate("() => window.__lastModel.threats[0].x")
    _focus_node(page, "T_1")
    page.keyboard.press("Control+ArrowRight")
    eventually_equals(lambda: page.evaluate("() => window.__lastModel.threats[0].x"), before + 10)
    page.click("#btn-undo")
    eventually_equals(lambda: page.evaluate("() => window.__lastModel.threats[0].x"), before)


def test_delete_removes_the_focused_node(page):
    """Delete comes from proposals/03's selection model — focus and
    selection are the same state, so focusing a node arms it."""
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "PB_2")
    page.keyboard.press("Delete")
    eventually_equals(lambda: page.evaluate("() => window.__lastModel.preventativeBarriers.length"), 1)


def test_escape_leaves_the_canvas(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    page.keyboard.press("Escape")
    page.wait_for_timeout(80)
    assert _focused(page) is None
    assert page.evaluate("() => document.activeElement.id") == "menu-trigger-file"


# --- names and announcements ---------------------------------------------

def test_every_node_is_self_describing(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const t = m.addThreat({x: 150, y: 200, name: 'Valve opened'});
      m.getNode(t.nodeId).frequency = { value: '1E-3' };
      const pb = m.addPreventativeControl(t.id, { name: 'Shutdown valve' });
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
      m._emitChange();
    }""")
    page.wait_for_timeout(200)
    labels = page.evaluate(
        "() => Object.fromEntries([...document.querySelectorAll('#bowtie-canvas #nodes-layer .node')]"
        ".map((n) => [n.getAttribute('data-id'), n.getAttribute('aria-label')]))"
    )
    assert labels["T_1"] == "Threat T_1, Valve opened, Frequency: 0.001/hr"
    assert labels["PB_1"] == "Preventative barrier PB_1, Shutdown valve, RRF: 10, on lines from T_1"
    tle = page.evaluate("() => window.__lastModel.topLevelEvent.id")
    assert labels[tle].startswith("Top event,")


def test_the_canvas_is_an_application_landmark_and_the_minimap_is_hidden(page):
    assert page.locator("#bowtie-canvas").get_attribute("role") == "application"
    assert page.locator("#bowtie-canvas").get_attribute("aria-roledescription") == "bowtie diagram"
    assert page.locator("#minimap-container").get_attribute("aria-hidden") == "true", \
        "a duplicate view would read every node twice"


def test_a_nudge_is_announced(page):
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    page.keyboard.press("Control+ArrowRight")
    eventually_contains(lambda: page.locator("#canvas-live-region").text_content(), "T_1")


# --- the context menu as a real menu -------------------------------------

def test_the_menu_is_navigable_and_returns_focus_to_the_node(page):
    """Opened from the keyboard it is a real `role=menu`: arrows move,
    Escape closes, and focus goes back where it came from rather than
    stranding the user at the top of the page."""
    _chain(page)
    page.wait_for_timeout(150)
    _focus_node(page, "T_1")
    page.keyboard.press("Shift+F10")

    eventually_equals(lambda: page.locator(".context-menu").get_attribute("role"), "menu")
    assert page.locator(".context-menu-item").first.get_attribute("role") == "menuitem"
    first = page.evaluate("() => document.activeElement.textContent")
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(60)
    assert page.evaluate("() => document.activeElement.textContent") != first, "arrows move within"

    page.keyboard.press("Escape")
    expect(page.locator(".context-menu")).to_have_count(0)
    assert _focused(page) == "T_1", "focus came back to the node"


def test_a_right_click_menu_does_not_steal_focus(page):
    """The same menu opened by pointer must not move focus — that would
    yank it out of whatever the user was typing in."""
    _chain(page)
    page.wait_for_timeout(150)
    box = page.locator("#bowtie-canvas .node.threat").first.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button="right")
    expect(page.locator(".context-menu")).to_have_count(1)
    focused_tag = page.evaluate("() => document.activeElement.className")
    assert "context-menu-item" not in str(focused_tag)
    page.keyboard.press("Escape")
