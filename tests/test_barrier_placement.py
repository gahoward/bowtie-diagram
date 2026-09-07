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


def test_shift_toward_tle_reorders_a_preventative_barrier_past_its_neighbor(page):
    """The manual path-reorder escape hatch (see BowtieModel.
    swapBarrierWithNeighbor): with C -> PB_1 -> PB_2 -> TLE, PB_1 has no
    neighbour AWAY from the TLE (it's already the origin-adjacent stop) so
    that item must not even appear on its menu; clicking "Shift Toward
    TLE" must swap it past PB_2 in the underlying Line, an actual topology
    change, not just a temporary on-screen move."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // PB_2
    }""")
    page.wait_for_timeout(100)

    pb1_node = page.locator('#bowtie-canvas .node.preventative-barrier[data-id="PB_1"]')
    pb1_node.click(button="right")
    items = menu_items(page)
    assert "Shift Toward TLE" in items
    assert "Shift Away From TLE" not in items, "PB_1 has no neighbour behind it in this chain"

    click_menu_item(page, "Shift Toward TLE")
    state = page.evaluate("""() => {
      const m = window.__lastModel;
      const line = m._lineFor(m.causes[0].id);
      return { stops: line.stops, pb1x: m.findById('PB_1').x, pb2x: m.findById('PB_2').x };
    }""")
    assert state["stops"] == ["PB_2", "PB_1"], "the swap must reorder the line, not just move a node on screen"
    assert state["pb1x"] > state["pb2x"]


def test_shift_away_from_tle_reorders_the_other_way(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // PB_2
    }""")
    page.wait_for_timeout(100)

    pb2_node = page.locator('#bowtie-canvas .node.preventative-barrier[data-id="PB_2"]')
    pb2_node.click(button="right")
    items = menu_items(page)
    assert "Shift Away From TLE" in items
    assert "Shift Toward TLE" not in items, "PB_2 has no neighbour ahead of it in this chain"

    click_menu_item(page, "Shift Away From TLE")
    stops = page.evaluate("() => window.__lastModel._lineFor(window.__lastModel.causes[0].id).stops")
    assert stops == ["PB_2", "PB_1"]


def test_shift_toward_tle_reorders_a_mitigative_barrier_the_mirrored_way(page):
    """Mirrors the Preventative case: MB_1 (nearest the Outcome) shifted
    toward the TLE must swap past MB_2 (nearest the TLE), decreasing MB_1's
    x since Mitigative Barriers sit right of the TLE."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      m.addMitigativeControl(m.outcomes[0].id); // MB_1, nearest the outcome
      m.addMitigativeControl(m.outcomes[0].id); // MB_2, appended further toward the TLE
    }""")
    page.wait_for_timeout(100)

    mb1_node = page.locator('#bowtie-canvas .node.mitigative-barrier[data-id="MB_1"]')
    mb1_node.click(button="right")
    click_menu_item(page, "Shift Toward TLE")
    state = page.evaluate("""() => {
      const m = window.__lastModel;
      const line = m._lineFor(m.outcomes[0].id);
      return { stops: line.stops, mb1x: m.findById('MB_1').x, mb2x: m.findById('MB_2').x };
    }""")
    assert state["stops"] == ["MB_2", "MB_1"]
    assert state["mb1x"] < state["mb2x"]


def test_shift_menu_offers_no_reorder_items_for_a_lone_unchained_barrier(page):
    """A barrier that's the only stop on its only line has no neighbour in
    either direction -- neither shift item should appear at all."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
    }""")
    page.wait_for_timeout(100)

    pb_node = page.locator('#bowtie-canvas .node.preventative-barrier[data-id="PB_1"]')
    pb_node.click(button="right")
    items = menu_items(page)
    assert "Shift Toward TLE" not in items
    assert "Shift Away From TLE" not in items


def test_shift_toward_tle_on_a_shared_barrier_prompts_for_which_path(page):
    """Two Causes each have their own private first barrier, then both
    chain into one SHARED second barrier -- shifting the shared barrier
    away from the TLE has a different neighbour in each line (each
    Cause's own private barrier), so it must prompt for which path(s) to
    reorder rather than guessing. Confirming with only C_1's path checked
    must reorder that line and leave C_2's line untouched."""
    ids = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [PB_1, shared]
      m.addCause({x: 150, y: 300});
      const pb2 = m.addPreventativeControl(m.causes[1].id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb2.id, shared.id); // C_2: [PB_2, shared]
      return { pb1: pb1.id, pb2: pb2.id, shared: shared.id };
    }""")
    page.wait_for_timeout(100)

    shared_node = page.locator(f'#bowtie-canvas .node.preventative-barrier[data-id="{ids["shared"]}"]')
    shared_node.click(button="right")
    click_menu_item(page, "Shift Away From TLE")

    # The picker lists both origins ("C_1"/"C_2", per _openLineSelectModal's
    # {key: line.id, label: line.originId}); check only C_1's row.
    page.locator(".modal-checkbox-row", has_text="C_1").locator("input[type=checkbox]").check()
    page.get_by_role("button", name="Confirm", exact=True).click()
    page.wait_for_timeout(100)

    state = page.evaluate("""() => {
      const m = window.__lastModel;
      return {
        line1: m._lineFor(m.causes[0].id).stops,
        line2: m._lineFor(m.causes[1].id).stops,
      };
    }""")
    assert state["line1"] == [ids["shared"], ids["pb1"]], "C_1's path must be reordered"
    assert state["line2"] == [ids["pb2"], ids["shared"]], "C_2's path, left unchecked, must be untouched"
