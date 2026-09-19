"""Auto-arrange with escalation factors (proposals/08).

Everything else on the canvas sits on a lane: a threat's row runs
left-to-right through its barriers to the top event. An escalation
factor hangs *off* a barrier, downward, in the one direction the layout
never used — so the only way it can work is for the barrier to push
every lane below it further down by exactly the height of its own stack.
"""


def _arrange(page):
    page.click("#menu-trigger-view")
    page.click("#btn-auto-arrange")
    page.wait_for_timeout(200)


def _positions(page):
    return page.evaluate("""() => {
      const m = window.__lastModel;
      const at = (p) => ({ id: m.getNode(p.nodeId).id, x: p.x, y: p.y, h: p.h });
      return {
        threats: m.threats.map(at),
        barriers: m.preventativeBarriers.map(at),
        factors: m.escalationFactors.map((f) => ({ ...at(f), barrierId: f.barrierId })),
        controls: m.escalationBarriers.map(at),
      };
    }""")


def test_a_factor_lands_under_its_barrier_with_its_controls_between(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const ef = m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      window.__ids = { pb: pb.id };
    }""")
    page.wait_for_timeout(120)
    _arrange(page)

    pos = _positions(page)
    barrier = pos["barriers"][0]
    factor = pos["factors"][0]
    control = pos["controls"][0]
    assert abs(factor["x"] - barrier["x"]) < 0.01, "centred on its barrier's column"
    assert abs(control["x"] - barrier["x"]) < 0.01
    assert factor["y"] > barrier["y"], "below it"
    assert barrier["y"] < control["y"] < factor["y"], "the control sits on the line between them"


def test_rows_below_a_stack_are_pushed_down_to_make_room(page):
    """Without this the next threat's lane runs straight through the
    escalation stack."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t1 = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t1.id, { name: 'Inspection' });
      m.addThreat({x: 150, y: 400, name: 'Erosion'});
      window.__ids = { pb: pb.id };
    }""")
    page.wait_for_timeout(120)
    _arrange(page)
    before = _positions(page)
    gap_before = before["threats"][1]["y"] - before["threats"][0]["y"]

    page.evaluate("""() => {
      const m = window.__lastModel;
      const ef = m.addEscalationFactor(window.__ids.pb, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
    }""")
    page.wait_for_timeout(120)
    _arrange(page)
    after = _positions(page)
    gap_after = after["threats"][1]["y"] - after["threats"][0]["y"]

    assert gap_after > gap_before, "the row below moved down"
    factor = after["factors"][0]
    second_row = after["threats"][1]["y"]
    assert factor["y"] + factor["h"] / 2 < second_row, "the stack clears the next lane entirely"


def test_two_factors_on_one_barrier_stack_without_overlapping(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const ef1 = m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef1.id, { name: 'Quarterly test regime' });
      const ef2 = m.addEscalationFactor(pb.id, { name: 'On manual' });
      m.addEscalationBarrier(ef2.id, { name: 'Start-up check' });
    }""")
    page.wait_for_timeout(150)
    _arrange(page)
    pos = _positions(page)
    factors = sorted(pos["factors"], key=lambda f: f["y"])
    assert len(factors) == 2
    top, bottom = factors
    assert top["y"] + top["h"] / 2 < bottom["y"] - bottom["h"] / 2, "no overlap between stacked factors"
    controls = sorted(pos["controls"], key=lambda c: c["y"])
    # Each control sits above its own factor, not in the other's space.
    assert controls[0]["y"] < top["y"]
    assert top["y"] < controls[1]["y"] < bottom["y"]


def test_a_barrier_with_no_factors_changes_nothing(page):
    """The whole feature has to be free when unused — this is the
    regression that would show up as "auto-arrange got looser"."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t1 = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.addPreventativeControl(t1.id, { name: 'Inspection' });
      m.addThreat({x: 150, y: 400, name: 'Erosion'});
    }""")
    page.wait_for_timeout(120)
    _arrange(page)
    first = _positions(page)
    _arrange(page)
    second = _positions(page)
    assert first == second, "arranging twice is idempotent with no factors in play"


def test_factors_on_the_mitigative_side_work_the_same_way(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Release'});
      const mb = m.addMitigativeControl(c.id, { name: 'Bunding' });
      const ef = m.addEscalationFactor(mb.id, { name: 'Drain valve open' });
      m.addEscalationBarrier(ef.id, { name: 'Valve check' });
      window.__ids = { mb: mb.id };
    }""")
    page.wait_for_timeout(120)
    _arrange(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const mb = m.mitigativeBarriers[0];
      const f = m.escalationFactors[0];
      const eb = m.escalationBarriers[0];
      return { aligned: Math.abs(f.x - mb.x) < 0.01, below: f.y > mb.y, between: eb.y > mb.y && eb.y < f.y };
    }""")
    assert result == {"aligned": True, "below": True, "between": True}
