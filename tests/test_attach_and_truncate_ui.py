"""UI-level coverage for bug2 (attach must be line-scoped, reachable from
the specific line segment) and bug3 ("Connect Directly to TLE" reachable
from any non-terminal gap along a line, both sides).
"""
from helpers import click_bend_segment, click_menu_item, click_svg_point, menu_items, pick_attach_target


def test_attach_from_a_line_segment_only_moves_that_line(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c1 = m.causes[0];
      const pb1 = m.addPreventativeControl(c1.id);
      m.addCause({x: 150, y: 400});
      const c2 = m.causes[1];
      m.attachInputToPreventativeControl(c2.id, pb1.id); // both lines now end at PB_1
      m.addCause({x: 150, y: 600});
      m.addPreventativeControl(m.causes[2].id); // PB_2, the attach target
    }""")
    page.wait_for_timeout(150)

    line1_id = page.evaluate("() => window.__lastModel._lineFor(window.__lastModel.causes[0].id).id")
    click_bend_segment(page, line1_id, "cause-line")
    click_menu_item(page, "Attach to Existing Preventative Barrier")
    pick_attach_target(page, "PB_2")

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      return { line1: m._lineFor(m.causes[0].id).stops, line2: m._lineFor(m.causes[1].id).stops };
    }""")
    assert result["line1"] == ["PB_1", "PB_2"]
    assert result["line2"] == ["PB_1"], "the sibling line sharing PB_1 must be untouched"


def test_connect_directly_to_tle_at_a_middle_gap(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      m.addPreventativeControl(c.id); // PB_1
      m.addPreventativeControl(c.id); // PB_2
    }""")
    page.wait_for_timeout(150)

    info = page.evaluate("""() => {
      const m = window.__lastModel;
      const cause = m.causes[0];
      const line = m._lineFor(cause.id);
      const pb1 = m.preventativeBarriers.find((p) => p.id === line.stops[0]);
      const pb2 = m.preventativeBarriers.find((p) => p.id === line.stops[1]);
      return { x: (pb1.x + pb1.w / 2 + pb2.x - pb2.w / 2) / 2, y: cause.y };
    }""")
    click_svg_point(page, info["x"], info["y"])
    assert any("Connect Directly to TLE" in i for i in menu_items(page))
    click_menu_item(page, "Connect Directly to TLE")

    stops = page.evaluate("() => window.__lastModel._lineFor(window.__lastModel.causes[0].id).stops")
    assert stops == ["PB_1"]


def test_connect_directly_to_tle_not_offered_at_the_tle_adjacent_gap(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
    }""")
    page.wait_for_timeout(150)

    line_id = page.evaluate("() => window.__lastModel._lineFor(window.__lastModel.causes[0].id).id")
    click_bend_segment(page, line_id, "cause-line")
    assert not any("Connect Directly to TLE" in i for i in menu_items(page))


def test_connect_directly_to_tle_outcome_adjacent_gap_drops_everything(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      m.addMitigativeControl(m.outcomes[0].id);
      m.addMitigativeControl(m.outcomes[0].id);
    }""")
    page.wait_for_timeout(150)

    info = page.evaluate("""() => {
      const m = window.__lastModel;
      const outcome = m.outcomes[0];
      const line = m._lineFor(outcome.id);
      const mb = m.mitigativeBarriers.find((p) => p.id === line.stops[0]); // nearest outcome
      return { x: (outcome.x - outcome.w / 2 + mb.x + mb.w / 2) / 2, y: outcome.y };
    }""")
    click_svg_point(page, info["x"], info["y"])
    assert any("Connect Directly to TLE" in i for i in menu_items(page))
    click_menu_item(page, "Connect Directly to TLE")

    stops = page.evaluate("() => window.__lastModel._lineFor(window.__lastModel.outcomes[0].id).stops")
    assert stops == []
