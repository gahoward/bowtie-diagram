"""UI-level coverage for NodeLibraryController (design review finding 05,
reworked per ui_fitness_proposal.md S4): Add › Node Library… is a wide,
tabbed manager -- one tab per node type with a count, an add-to-library
row, a table of every live node (id, name, pages placed on) with Edit
(opens the shared Properties modal) and Delete (with its cascading
confirmation), and the retired-identifier controls under a collapsed
disclosure. Driven through the real modal, not by calling model methods
directly -- exactly the paths where facade bugs surface.
"""
from helpers import click_menu_item


def _open_node_library(page):
    page.click("#menu-trigger-add")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(100)


def _row(page, name):
    return page.locator(".node-library-row", has_text=name)


def test_library_is_tabbed_per_type_with_counts(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({ x: 150, y: 200, name: 'Gas Release' });
      m.addThreat({ x: 150, y: 400, name: 'Flange Leak' });
      m.addConsequence({ x: 1200, y: 200, name: 'Fire' });
    }""")
    page.wait_for_timeout(80)
    _open_node_library(page)

    assert page.locator(".modal-dialog-xwide").count() == 1
    tabs = page.locator(".node-library .settings-tab")
    assert tabs.all_text_contents() == ["Threats (2)", "Consequences (1)", "Preventative (0)", "Mitigative (0)"]
    assert page.locator(".node-library-row").count() == 2
    assert page.locator(".node-library-name").all_text_contents() == ["Gas Release", "Flange Leak"]

    tabs.nth(1).click()
    page.wait_for_timeout(80)
    assert page.locator(".node-library-name").all_text_contents() == ["Fire"]
    tabs.nth(2).click()
    page.wait_for_timeout(80)
    assert page.locator(".node-library-row").count() == 0
    assert "No preventative yet" in page.locator(".node-library-panel").text_content()


def test_edit_opens_the_shared_properties_modal_and_saves_through_rename_node(page):
    page.evaluate("() => { window.__lastModel.addThreat({x: 150, y: 200, name: 'Gas Release'}); }")
    page.wait_for_timeout(80)
    _open_node_library(page)

    _row(page, "Gas Release").get_by_role("button", name="Edit", exact=True).click()
    page.wait_for_timeout(80)
    props = page.locator(".modal-overlay").last
    assert props.locator(".modal-title").text_content() == "T_1 — Threat"
    props.locator(".modal-section:has-text('Identity') input[type=text]").fill("Gas Release (Revised)")
    props.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 1, "back to the library, which re-rendered"
    assert _row(page, "Gas Release (Revised)").locator(".node-library-name").text_content() == "Gas Release (Revised)"
    node_name = page.evaluate("() => { const m = window.__lastModel; return m.getNode(m.threats[0].nodeId).name; }")
    assert node_name == "Gas Release (Revised)"


def test_edit_works_for_a_node_with_no_placement(page):
    page.evaluate("() => { window.__lastModel.addNode('consequence', { name: 'Staged Consequence' }); }")
    page.wait_for_timeout(80)
    _open_node_library(page)
    page.locator(".node-library .settings-tab[data-type=consequence]").click()
    page.wait_for_timeout(80)

    row = _row(page, "Staged Consequence")
    assert row.locator(".node-library-tag").text_content() == "Not placed yet"
    row.get_by_role("button", name="Edit", exact=True).click()
    page.wait_for_timeout(80)
    props = page.locator(".modal-overlay").last
    assert props.locator(".modal-title").text_content() == "C_1 — Consequence"
    assert props.locator(".modal-section:has-text('Computed')").count() == 0, "nothing computed without a placement"
    props.locator(".modal-section:has-text('Identity') input[type=text]").fill("Staged (Renamed)")
    props.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)
    assert page.evaluate("() => window.__lastModel.library.consequence[0].name") == "Staged (Renamed)"


def test_delete_cascades_across_pages_and_retires_the_id(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Page A' });
      const p2 = m.addPage({ name: 'Page B' });
      const c1 = m.addThreat({ x: 150, y: 200, name: 'Shared Threat', pageId: m.pages[0].id });
      m.addThreat({ nodeId: c1.nodeId, pageId: p2.id, x: 150, y: 200 });
      return { nodeId: c1.nodeId };
    }""")
    node_id = result["nodeId"]
    page.wait_for_timeout(80)
    _open_node_library(page)

    row = _row(page, "Shared Threat")
    assert row.locator(".node-library-pages").text_content() == "Page A, Page B"

    row.get_by_role("button", name="Delete", exact=True).click()
    confirm_overlay = page.locator(".modal-overlay").last
    assert confirm_overlay.locator(".modal-title").text_content() == "Delete Node"
    assert "2 placement(s) across 2 page(s)" in confirm_overlay.text_content()
    confirm_overlay.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(80)

    remaining = page.evaluate(f"() => window.__lastModel.placementsForNode('{node_id}').length")
    assert remaining == 0
    retired_entry = page.evaluate(f"""() => {{
      const entry = window.__lastModel.retiredIds.threat.find((e) => e.id === '{node_id}');
      return entry ? {{ id: entry.id, reEnabled: entry.reEnabled }} : null;
    }}""")
    assert retired_entry == {"id": node_id, "reEnabled": False}
    # ...and the retired disclosure now counts it, still collapsed.
    retired = page.locator(".node-library-retired")
    assert retired.locator("summary").text_content() == "Retired identifiers (1)"
    assert retired.evaluate("(el) => el.open") is False


def test_add_to_library_creates_a_node_with_zero_placements(page):
    _open_node_library(page)
    page.locator(".node-library-add-row input").fill("Staged Threat")
    page.locator(".node-library-add-row input").press("Enter")
    page.wait_for_timeout(80)

    row = _row(page, "Staged Threat")
    assert row.locator(".node-library-tag").text_content() == "Not placed yet"
    assert page.locator(".node-library .settings-tab[data-type=threat]").text_content() == "Threats (1)"

    placements = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.library.threat.find((n) => n.name === 'Staged Threat');
      return m.placementsForNode(node.id).length;
    }""")
    assert placements == 0


def test_library_row_page_list_reflects_placements_as_they_are_added(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Page A' });
      m.addThreat({ x: 150, y: 200, name: 'Reused Threat' });
    }""")
    page.wait_for_timeout(80)
    _open_node_library(page)

    assert _row(page, "Reused Threat").locator(".node-library-pages").text_content() == "Page A"

    page.evaluate("""() => {
      const m = window.__lastModel;
      const p2 = m.addPage({ name: 'Page B' });
      const node = m.library.threat.find((n) => n.name === 'Reused Threat');
      m.addThreat({ nodeId: node.id, pageId: p2.id, x: 150, y: 200 });
    }""")
    page.wait_for_timeout(80)

    assert _row(page, "Reused Threat").locator(".node-library-pages").text_content() == "Page A, Page B"


def test_delete_from_library_context_menu_item_opens_straight_to_the_node(page):
    """Design review finding 04: right-clicking a node's only removal
    option used to be "Remove from Page", which reads like delete but only
    ever un-places it from the current page -- nothing pointed at where a
    real delete actually lives. "Delete from Library…" closes that gap by
    opening this exact modal on the right tab with this exact row
    highlighted."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({ x: 150, y: 200, name: 'Gas Release' });
      const o = m.addConsequence({ x: 1200, y: 200, name: 'Fire' });
      m.addMitigativeControl(o.id);
    }""")
    page.wait_for_timeout(80)

    page.locator('#bowtie-canvas .node.mitigative-barrier[data-id="MB_1"]').click(button="right")
    assert "Delete from Library…" in page.locator(".context-menu-item").all_text_contents()
    click_menu_item(page, "Delete from Library")
    page.wait_for_timeout(100)

    assert page.locator(".modal-title").text_content() == "Node Library"
    assert page.locator(".node-library .settings-tab[aria-selected=true]").text_content() == "Mitigative (1)"
    focused = page.locator(".node-library-row.focused")
    assert focused.count() == 1
    assert focused.locator(".id-manager-id").text_content() == "MB_1"
    assert focused.get_by_role("button", name="Delete", exact=True).is_visible()


def test_focused_node_does_not_leak_into_a_later_ordinary_open(page):
    page.evaluate("() => { window.__lastModel.addThreat({ x: 150, y: 200, name: 'Gas Release' }); }")
    page.wait_for_timeout(80)

    page.locator('#bowtie-canvas .node.threat[data-id="T_1"]').click(button="right")
    click_menu_item(page, "Delete from Library")
    page.wait_for_timeout(100)
    assert page.locator(".node-library-row.focused").count() == 1
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(80)

    _open_node_library(page)
    assert page.locator(".node-library-row.focused").count() == 0
