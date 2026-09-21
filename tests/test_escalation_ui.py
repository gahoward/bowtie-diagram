"""The escalation-factor UI (proposals/08): menus, the node library, the
Properties modal, and the worked demo.

Everything here is reached the way a user reaches it — right-click a
barrier, create a factor, right-click the factor, add a control — rather
than by calling model methods, because the point of this stage is that
the existing UI machinery (create-or-choose, attach, library tabs,
Properties) took the new types without needing parallel versions of
itself.
"""

from playwright.sync_api import expect


# Through the locator rather than a measured `page.mouse.click`:
# CanvasView replaces the whole node layer on every render, so a box
# measured just after a model change can describe an element that has
# already been detached. A locator re-resolves at click time.
def _right_click(page, selector):
    page.locator(f"#bowtie-canvas {selector}").first.click(button="right")
    expect(page.locator(".context-menu")).to_be_visible()


def _menu_labels(page):
    return page.locator(".context-menu-item").all_text_contents()


def _a_barrier(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.addPreventativeControl(t.id, { name: 'Inspection' });
    }""")


def test_a_barrier_offers_add_escalation_factor(page):
    _a_barrier(page)
    _right_click(page, ".node.preventative-barrier")
    labels = _menu_labels(page)
    assert "Add Escalation Factor…" in labels
    page.keyboard.press("Escape")


def test_creating_one_through_the_menu_puts_it_on_the_canvas(page):
    _a_barrier(page)
    _right_click(page, ".node.preventative-barrier")
    page.locator(".context-menu-item", has_text="Add Escalation Factor").click()
    expect(page.locator(".modal-title")).to_have_text("Add Escalation Factor")
    page.locator(".modal-dialog .modal-field:has-text('Name') input").first.fill("Not proof tested")
    page.get_by_role("button", name="Create Escalation Factor", exact=True).click()
    expect(page.locator("#bowtie-canvas .node.escalation-factor")).to_have_count(1)

    assert page.evaluate("() => window.__lastModel.escalationFactors.length") == 1
    assert page.evaluate("() => window.__lastModel.getNode(window.__lastModel.escalationFactors[0].nodeId).name") \
        == "Not proof tested"


def test_a_factor_offers_its_own_control_items(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
    }""")
    _right_click(page, ".node.escalation-factor")
    labels = _menu_labels(page)
    assert "Add Escalation Barrier" in labels
    assert "Properties" in labels
    assert "Remove from Page" in labels
    page.keyboard.press("Escape")


def test_an_existing_control_can_be_attached_from_the_menu(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb1 = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const pb2 = m.addPreventativeControl(t.id, { name: 'Coating' });
      const ef1 = m.addEscalationFactor(pb1.id, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef1.id, { name: 'Quarterly test regime' });
      m.addEscalationFactor(pb2.id, { name: 'On manual' });
    }""")
    factors = page.locator("#bowtie-canvas .node.escalation-factor")
    factors.nth(1).click(button="right")
    expect(page.locator(".context-menu")).to_be_visible()
    page.locator(".context-menu-item", has_text="Attach to Existing Escalation Barrier").click()
    page.locator(".attach-list-item").first.click()
    page.wait_for_timeout(150)

    shared = page.evaluate("""() => window.__lastModel.lines
      .filter((l) => l.originType === 'escalationFactor')
      .map((l) => l.stops.length)""")
    assert shared == [1, 1], "one control now answers both factors"


def test_the_node_library_gained_two_tabs(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const ef = m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
    }""")
    page.click("#menu-trigger-add")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(150)
    tabs = page.locator(".modal-dialog .settings-tab, .modal-dialog .library-tab").all_text_contents()
    assert any("Escalation" in t for t in tabs), tabs
    page.locator(".modal-dialog .settings-tab, .modal-dialog .library-tab").filter(
        has_text="Escalation"
    ).first.click()
    expect(page.locator(".modal-dialog")).to_contain_text("EF_1")
    page.get_by_role("button", name="Done", exact=True).click()


def test_properties_shows_a_factor_as_an_escalation_factor(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
    }""")
    page.locator("#bowtie-canvas .node.escalation-factor").dblclick()
    expect(page.locator(".modal-dialog")).to_be_visible()
    title = page.locator(".modal-title").text_content()
    assert "Escalation Factor" in title
    body = page.locator(".modal-body").text_content()
    assert "Owner" in body, "a factor has an owner, like a barrier"
    assert "Barrier measure" not in body, "but no protection: it is outside the quantitative fold"
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_the_demo_ships_with_a_worked_escalation_factor(browser, base_url):
    """"Explore the demo" is where the feature is discovered at all."""
    from conftest import INIT_SCRIPT

    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    try:
        pg.get_by_role("button", name="Explore the demo", exact=True).click()
        expect(pg.locator("#bowtie-canvas .node.escalation-factor")).to_have_count(1)
        assert pg.locator("#bowtie-canvas .node.escalation-barrier").count() == 1
        assert pg.locator('#bowtie-canvas .connection[data-role="escalation-line"]').count() == 1
        assert pg.evaluate("() => window.__lastModel.getWarnings().length") == 0, \
            "the demo must still load clean"
    finally:
        assert pg.errors == []
        pg.close()


def test_a_factors_owner_saves(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
    }""")
    page.locator("#bowtie-canvas .node.escalation-factor").dblclick()
    expect(page.locator(".modal-dialog")).to_be_visible()
    page.locator(".modal-field:has-text('Owner') input").fill("Maintenance")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".modal-overlay")).to_have_count(0)
    assert page.evaluate(
        "() => window.__lastModel.getNode(window.__lastModel.escalationFactors[0].nodeId).owner"
    ) == "Maintenance"
