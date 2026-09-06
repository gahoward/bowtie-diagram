"""bugs.md: new barriers landing on the wrong side of an existing one.

Covers the click-driven path through ContextMenuController, not just the
model primitives already covered in test_model_splicing.py — the bug was
specifically that the *placement* (x/y of the newly created barrier) used a
fixed offset blind to which direction the splice was headed.
"""
from helpers import click_menu_item, menu_items


def test_first_barrier_lands_right_of_its_cause(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(100)

    line_el = page.locator('[data-role="cause-direct"]').first
    box = line_el.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button="right")
    click_menu_item(page, "Add Preventative Barrier")

    state = page.evaluate("""() => {
      const m = window.__lastModel;
      const cause = m.causes[0];
      const line = m._lineFor(cause.id);
      const pb = m.preventativeBarriers.find(p => p.id === line.stops[0]);
      return { causeX: cause.x, pbX: pb.x };
    }""")
    assert state["pbX"] > state["causeX"]


def test_barrier_inserted_before_lands_left_of_its_anchor(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id); // PB_1
    }""")
    page.wait_for_timeout(100)

    # Click just past the cause's own edge (clear of PB_1's box) to land in
    # the gap between the cause and PB_1.
    line_el = page.locator('[data-role="cause-line"]').first
    box = line_el.bounding_box()
    page.mouse.click(box["x"] + 8, box["y"] + box["height"] / 2, button="right")
    click_menu_item(page, "Add Preventative Barrier")

    state = page.evaluate("""() => {
      const m = window.__lastModel;
      const line = m._lineFor(m.causes[0].id);
      const xs = line.stops.map(id => m.findById(id).x);
      return { stops: line.stops, xs, causeX: m.causes[0].x };
    }""")
    assert state["xs"] == sorted(state["xs"]), "stops must stay in increasing-x order"
    assert all(x > state["causeX"] for x in state["xs"])


def test_menu_offers_no_barrier_wide_attach_from_a_barrier_node(page):
    """bug2: a barrier's own context menu must never offer an action that
    could silently move every Line sharing that barrier at once."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
    }""")
    page.wait_for_timeout(100)

    # Scoped to the real canvas: the minimap clones the same nodes (same
    # classes, same data-id) for visual fidelity, so an unscoped selector
    # now matches both copies.
    pb_node = page.locator('#bowtie-canvas .node.preventative-barrier[data-id="PB_1"]')
    pb_node.click(button="right")
    items = menu_items(page)
    assert not any("Attach Output" in i for i in items)
