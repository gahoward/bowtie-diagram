"""UI-level coverage for NodeLibraryController (design review finding 05).
Before this file, nothing drove the modal itself: editing a node in place,
deleting one with its cascading confirmation, adding straight to the
library, and the "placed on which pages" display were all untested at the
controller level -- an entire control was once removed from this modal in
a session and the full (model-level-only) suite stayed green. These are
exactly the paths where the facade bugs test_properties_modal.py guards
against would have surfaced: driven through the real modal, not by calling
model methods directly.
"""


def _open_node_library(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(100)


def test_edit_in_place_saves_through_rename_node(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200, name: 'Gas Release'}); }")
    page.wait_for_timeout(80)
    _open_node_library(page)

    container = page.locator(".node-library-list > div", has_text="Gas Release")
    container.get_by_role("button", name="Edit", exact=True).click()
    form = container.locator(".node-library-edit-form")
    assert form.is_visible()
    form.locator(".modal-field:has-text('Name') input").fill("Gas Release (Revised)")
    form.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    container = page.locator(".node-library-list > div", has_text="Gas Release (Revised)")
    assert container.locator(".node-library-name").text_content() == "Gas Release (Revised)"

    node_name = page.evaluate("""() => {
      const m = window.__lastModel;
      return m.getNode(m.causes[0].nodeId).name;
    }""")
    assert node_name == "Gas Release (Revised)"


def test_delete_cascades_across_pages_and_retires_the_id(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Page A' });
      const p2 = m.addPage({ name: 'Page B' });
      const c1 = m.addCause({ x: 150, y: 200, name: 'Shared Threat', pageId: m.pages[0].id });
      m.addCause({ nodeId: c1.nodeId, pageId: p2.id, x: 150, y: 200 });
      return { nodeId: c1.nodeId };
    }""")
    node_id = result["nodeId"]
    page.wait_for_timeout(80)
    _open_node_library(page)

    container = page.locator(".node-library-list > div", has_text="Shared Threat")
    pages_text = container.locator(".node-library-pages").text_content()
    assert "Page A" in pages_text and "Page B" in pages_text

    container.get_by_role("button", name="Delete", exact=True).click()
    confirm_overlay = page.locator(".modal-overlay").last
    assert confirm_overlay.locator(".modal-title").text_content() == "Delete Node"
    confirm_overlay.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(80)

    remaining = page.evaluate(f"() => window.__lastModel.placementsForNode('{node_id}').length")
    assert remaining == 0
    retired_entry = page.evaluate(f"""() => {{
      const entry = window.__lastModel.retiredIds.cause.find((e) => e.id === '{node_id}');
      return entry ? {{ id: entry.id, reEnabled: entry.reEnabled }} : null;
    }}""")
    assert retired_entry == {"id": node_id, "reEnabled": False}


def test_add_to_library_creates_a_node_with_zero_placements(page):
    _open_node_library(page)
    section = page.locator(".id-manager-section", has_text="Causes")
    section.locator(".node-library-add-row input").fill("Staged Threat")
    section.locator(".node-library-add-row").get_by_role("button", name="Add to Library").click()
    page.wait_for_timeout(80)

    row = section.locator(".node-library-row", has_text="Staged Threat")
    assert "Not placed on any page yet" in row.locator(".node-library-pages").text_content()

    placements = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.library.cause.find((n) => n.name === 'Staged Threat');
      return m.placementsForNode(node.id).length;
    }""")
    assert placements == 0


def test_library_row_page_list_reflects_placements_as_they_are_added(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Page A' });
      m.addCause({ x: 150, y: 200, name: 'Reused Threat' });
    }""")
    page.wait_for_timeout(80)
    _open_node_library(page)

    row = page.locator(".node-library-row", has_text="Reused Threat")
    assert row.locator(".node-library-pages").text_content() == "Placed on: Page A"

    page.evaluate("""() => {
      const m = window.__lastModel;
      const p2 = m.addPage({ name: 'Page B' });
      const node = m.library.cause.find((n) => n.name === 'Reused Threat');
      m.addCause({ nodeId: node.id, pageId: p2.id, x: 150, y: 200 });
    }""")
    page.wait_for_timeout(80)

    row = page.locator(".node-library-row", has_text="Reused Threat")
    text = row.locator(".node-library-pages").text_content()
    assert "Page A" in text and "Page B" in text
