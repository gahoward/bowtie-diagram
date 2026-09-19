"""How escalation factors draw (proposals/08).

An escalation factor hangs below the barrier it degrades, joined to it
by a vertical dashed line with its escalation barriers as flat bars
across that line. Dashed and purple on purpose: it is the one edge on
the canvas that does not mean "leads to" — it means "degrades".
"""


def _build(page, controls=1):
    return page.evaluate(
        """(controls) => {
          const m = window.__lastModel;
          const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
          const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
          const ef = m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
          for (let i = 0; i < controls; i += 1) {
            m.addEscalationBarrier(ef.id, { name: `Control ${i + 1}` });
          }
          window.__ids = { t: t.id, pb: pb.id, ef: ef.id };
          m._emitChange();
          return window.__ids;
        }""",
        controls,
    )


def _canvas(page, selector):
    return page.locator(f"#bowtie-canvas {selector}")


def test_a_factor_draws_below_its_barrier_with_a_dashed_line_up_to_it(page):
    ids = _build(page)
    page.wait_for_timeout(150)

    factor = _canvas(page, ".node.escalation-factor")
    assert factor.count() == 1
    assert factor.get_attribute("data-id") == ids["ef"], "keyed by placement id, not node id"
    assert "EF_1" in factor.text_content()
    # The name wraps across tspans, so the words run together in
    # text_content -- check a fragment that survives the wrap.
    assert "proof" in factor.text_content()

    line = _canvas(page, '.connection[data-role="escalation-line"]')
    assert line.count() == 1
    geometry = page.evaluate("""() => {
      const l = document.querySelector('#bowtie-canvas .connection[data-role="escalation-line"]');
      const f = window.__lastModel.escalationFactors[0];
      const b = window.__lastModel.preventativeBarriers[0];
      return {
        vertical: l.getAttribute('x1') === l.getAttribute('x2'),
        onTheFactor: Math.abs(Number(l.getAttribute('x1')) - f.x) < 0.01,
        runsUpward: Number(l.getAttribute('y2')) < Number(l.getAttribute('y1')),
        belowBarrier: f.y > b.y,
        dashed: getComputedStyle(l).strokeDasharray !== 'none',
      };
    }""")
    assert geometry == {
        "vertical": True, "onTheFactor": True, "runsUpward": True,
        "belowBarrier": True, "dashed": True,
    }


def test_escalation_barriers_sit_on_that_line(page):
    _build(page, controls=2)
    page.wait_for_timeout(150)
    bars = _canvas(page, ".node.escalation-barrier")
    assert bars.count() == 2
    aligned = page.evaluate("""() => {
      const m = window.__lastModel;
      const f = m.escalationFactors[0];
      return m.escalationBarriers.every((b) => Math.abs(b.x - f.x) < 0.01
        && b.y < f.y && b.w > b.h);
    }""")
    assert aligned is True, "centred on the line, above the factor, lying flat"


def test_the_same_factor_on_two_barriers_draws_twice(page):
    """Each box is addressable on its own, which is why a factor is keyed
    by placement id rather than node id."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb1 = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const pb2 = m.addPreventativeControl(t.id, { name: 'Coating' });
      const ef = m.addEscalationFactor(pb1.id, { name: 'Not proof tested' });
      m.addEscalationFactor(pb2.id, { nodeId: m.getNode(ef.nodeId).id });
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    factors = _canvas(page, ".node.escalation-factor")
    assert factors.count() == 2
    ids = factors.all_text_contents()
    assert all("EF_1" in text for text in ids), "the same factor, said twice"
    dom_ids = page.evaluate(
        "() => [...document.querySelectorAll('#bowtie-canvas .node.escalation-factor')]"
        ".map((n) => n.getAttribute('data-id'))"
    )
    assert len(set(dom_ids)) == 2, "each box addressable on its own"
    assert _canvas(page, '.connection[data-role="escalation-line"]').count() == 2


def test_clicking_a_factor_focuses_its_own_line(page):
    _build(page)
    page.wait_for_timeout(150)
    box = _canvas(page, ".node.escalation-factor").bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(100)
    assert _canvas(page, ".node.selected").count() == 1
    assert "escalation-factor" in (_canvas(page, ".node.selected").get_attribute("class") or "")


def test_the_content_bounds_include_the_escalation_stack(page):
    """Or an export crops the factor off the bottom of the diagram."""
    _build(page)
    page.wait_for_timeout(150)
    fits = page.evaluate("""() => {
      const b = window.__lastView.getContentBounds();
      const f = window.__lastModel.escalationFactors[0];
      return b.maxY >= f.y + f.h / 2 && b.minX <= f.x - f.w / 2;
    }""")
    assert fits is True


def test_the_export_carries_the_escalation_styles(page):
    """Exports are self-contained, so a new colour token has to be in the
    export style block as well as the stylesheet."""
    _build(page)
    page.wait_for_timeout(150)
    svg = page.evaluate("""() => {
      const bounds = window.__lastView.getContentBounds();
      return Bowtie.ExportUtil.buildExportSvgString(document.getElementById('bowtie-canvas'), bounds).svgString;
    }""")
    assert "escalation-factor" in svg
    assert "connection.escalation" in svg
    assert "stroke-dasharray" in svg


def test_deleting_the_barrier_removes_the_whole_stack_from_the_canvas(page):
    _build(page)
    page.wait_for_timeout(150)
    page.evaluate("() => window.__lastModel.deleteElement(window.__ids.pb)")
    page.wait_for_timeout(150)
    assert _canvas(page, ".node.escalation-factor").count() == 0
    assert _canvas(page, '.connection[data-role="escalation-line"]').count() == 0
    # The control survives as an orphan -- and says so.
    assert _canvas(page, ".node.escalation-barrier").count() == 1
    assert page.locator("#btn-warnings .warning-count").text_content() == "1"
