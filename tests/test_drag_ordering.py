"""bugs.md: dragging could visually resequence a barrier (or the Cause/
Outcome feeding it) past a neighbour that Line.stops says comes
immediately before/after it, contradicting the model's own order.
DragController._sequenceBounds now clamps every drag to the tightest such
constraint, on top of the pre-existing "stay on your own side of the TLE"
rule.
"""


def _drag_node_to(page, selector, to_x, to_y, nth=None):
    # Scoped to the real canvas, not just `selector` alone: the minimap is a
    # live clone of the same nodes (same classes, same data-id) for visual
    # fidelity, so an unscoped selector now matches both copies.
    node = page.locator(f"#bowtie-canvas {selector}")
    if nth is not None:
        node = node.nth(nth)
    box = node.bounding_box()
    start_x, start_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pt = page.evaluate(
        f"""() => {{
          const svg = document.querySelector('#bowtie-canvas');
          const p = svg.createSVGPoint();
          p.x = {to_x}; p.y = {to_y};
          const s = p.matrixTransform(svg.getScreenCTM());
          return {{x: s.x, y: s.y}};
        }}"""
    )
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(pt["x"], pt["y"], steps=5)
    page.mouse.up()
    page.wait_for_timeout(80)


def test_cause_cannot_be_dragged_past_its_first_barrier(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
    }""")
    page.wait_for_timeout(100)
    pb1x = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")

    _drag_node_to(page, ".node.cause", pb1x + 300, 200)

    causeX = page.evaluate("() => window.__lastModel.causes[0].x")
    assert causeX <= pb1x


def test_outcome_cannot_be_dragged_past_its_first_barrier(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      m.addMitigativeControl(m.outcomes[0].id);
    }""")
    page.wait_for_timeout(100)
    mb1x = page.evaluate("() => window.__lastModel.mitigativeBarriers[0].x")

    _drag_node_to(page, ".node.outcome", mb1x - 300, 200)

    outcomeX = page.evaluate("() => window.__lastModel.outcomes[0].x")
    assert outcomeX >= mb1x


def test_barrier_cannot_be_dragged_past_its_successor_or_predecessor(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // PB_2
    }""")
    page.wait_for_timeout(100)
    pb1x, pb2x = page.evaluate(
        "() => [window.__lastModel.preventativeBarriers[0].x, window.__lastModel.preventativeBarriers[1].x]"
    )

    _drag_node_to(page, '.node.preventative-barrier[data-id="PB_1"]', pb2x + 300, 200)
    pb1x_after = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")
    assert pb1x_after <= pb2x, "PB_1 must not be draggable past its successor PB_2"

    _drag_node_to(page, '.node.preventative-barrier[data-id="PB_2"]', 0, 200)
    pb1x_now = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")
    pb2x_after = page.evaluate("() => window.__lastModel.preventativeBarriers[1].x")
    assert pb2x_after >= pb1x_now, "PB_2 must not be draggable past its predecessor PB_1"


def test_mitigative_barrier_ordering_mirrors_preventative_side(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      const mb1 = m.addMitigativeControl(m.outcomes[0].id); // nearest outcome
      m.insertBarrier('mitigativeBarrier', 'before', mb1.id); // MB_2, nearest TLE
    }""")
    page.wait_for_timeout(100)
    mb1x = page.evaluate("() => window.__lastModel.mitigativeBarriers[0].x")

    _drag_node_to(page, '.node.mitigative-barrier[data-id="MB_2"]', mb1x + 300, 200)
    mb2x_after = page.evaluate("() => window.__lastModel.mitigativeBarriers[1].x")
    assert mb2x_after <= mb1x, "MB_2 (nearest TLE) must not be draggable past MB_1 (nearest Outcome)"


def test_barrier_cannot_be_dragged_to_overlap_its_predecessor(page):
    """Clamping to a neighbour's raw x (a point) still lets two boxes'
    centers coincide, fully overlapping — bounds must account for both
    elements' actual widths, not just their position."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // PB_2
    }""")
    page.wait_for_timeout(100)
    pb1x = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")

    _drag_node_to(page, '.node.preventative-barrier[data-id="PB_2"]', pb1x, 200)

    pb1x_after, pb2x_after = page.evaluate(
        "() => [window.__lastModel.preventativeBarriers[0].x, window.__lastModel.preventativeBarriers[1].x]"
    )
    assert pb2x_after - pb1x_after >= 36, "PB_2 must keep at least its own width clear of PB_1, not just its center"


def test_cause_cannot_be_dragged_to_overlap_its_first_barrier(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
    }""")
    page.wait_for_timeout(100)
    pb1x = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")

    _drag_node_to(page, ".node.cause", pb1x, 200)

    causeX = page.evaluate("() => window.__lastModel.causes[0].x")
    assert pb1x - causeX >= (140 / 2) + (36 / 2), "Cause's box must not overlap PB_1's box"


def test_shared_barrier_respects_the_tightest_of_its_feeding_lines(page):
    """PB_1 is fed by two Causes; dragging one Cause closer to PB_1 tightens
    PB_1's own left bound to whichever Cause is now further right."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 400});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 600});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id);
    }""")
    page.wait_for_timeout(100)
    pb1x = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")

    _drag_node_to(page, ".node.cause", pb1x - 10, 600, nth=1)
    tightest = page.evaluate(
        "() => Math.max(window.__lastModel.causes[0].x, window.__lastModel.causes[1].x)"
    )

    _drag_node_to(page, '.node.preventative-barrier[data-id="PB_1"]', 0, 500)
    pb1x_after = page.evaluate("() => window.__lastModel.preventativeBarriers[0].x")
    assert pb1x_after >= tightest
