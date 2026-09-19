"""Render scale (proposals/16).

Two guards, neither of which is about milliseconds for their own sake.

`test_a_large_document_renders_within_budget` catches a regression of
KIND -- an accidental O(n^2), typically a linear scan moved back inside a
per-element loop. The budget is deliberately several times the measured
figure, because this runs on whatever shared runner CI provides and a
tight budget would fail for reasons that have nothing to do with the
code.

`test_a_burst_of_mutations_costs_one_render` guards the other half of
that proposal: renders coalesce into one animation frame, so N mutations
in a turn cost one render rather than N. Before that change, building a
document through the model API was quadratic -- 1000 placements took 148
seconds, almost all of it in renders nobody ever saw.

The measured "before" figures, for context, are in
`proposals/16-render-performance.md`.
"""

# 100 threats + 100 consequences and their barriers -- 500 placements, the
# size the proposal measured at 124.8ms before the placement index existed.
BUILD = """
(n) => {
  const m = window.__lastModel;
  for (let i = 0; i < n; i++) {
    const threat = m.addThreat({ name: 'Threat ' + i });
    const a = m.addPreventativeControl(threat.id, { name: 'PB ' + i + 'a' });
    m.insertBarrier('preventativeBarrier', 'after', a.id, { name: 'PB ' + i + 'b' });
    const c = m.addConsequence({ name: 'Consequence ' + i });
    m.addMitigativeControl(c.id, { name: 'MB ' + i + 'a' });
  }
  return m.threats.length + m.consequences.length
    + m.preventativeBarriers.length + m.mitigativeBarriers.length;
}
"""

RENDER_ONCE = """
() => {
  const m = window.__lastModel;
  const t0 = performance.now();
  m._emitChange();
  return performance.now() - t0;
}
"""

# Generous on purpose -- see the module docstring. At the time of writing
# a 500-placement render measures well under a tenth of this.
BUDGET_MS = 1000


def test_a_large_document_renders_within_budget(page):
    placements = page.evaluate(BUILD, 100)
    assert placements == 500, f"expected 500 placements, built {placements}"
    page.wait_for_timeout(300)

    # _emitChange only SCHEDULES a render now, so time the frame it lands
    # in rather than the call.
    samples = sorted(
        page.evaluate("""
        () => new Promise((resolve) => {
          const t0 = performance.now();
          window.__lastModel._emitChange();
          requestAnimationFrame(() => requestAnimationFrame(
            () => resolve(performance.now() - t0),
          ));
        })
        """)
        for _ in range(5)
    )
    median = samples[2]
    print(f"\n500-placement render: median {median:.1f}ms, samples {[round(s, 1) for s in samples]}")
    assert median < BUDGET_MS, (
        f"a 500-placement render took {median:.0f}ms (budget {BUDGET_MS}ms). "
        "This usually means a linear scan moved back inside a per-element "
        "render loop -- see proposals/16."
    )


def test_a_burst_of_mutations_costs_one_render(page):
    """Ten mutations in one turn, one render. The point of coalescing."""
    renders = page.evaluate("""
    () => new Promise((resolve) => {
      const view = window.__lastView;
      const real = view.render.bind(view);
      let count = 0;
      view.render = (...args) => { count += 1; return real(...args); };
      const m = window.__lastUndo.model;
      for (let i = 0; i < 10; i++) m.addThreat({ name: 'Burst ' + i });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        view.render = real;
        resolve(count);
      }));
    })
    """)
    assert renders == 1, f"10 mutations produced {renders} renders, expected 1"


def test_a_drag_still_renders_synchronously_on_release(page):
    """Coalescing must not leave a dropped node waiting on a frame with
    nothing left to invalidate it -- DragController's end callback flushes
    the pending render. Driven through the real pointer events rather than
    the model, since the flush lives in main.js's wiring."""
    page.evaluate("() => window.__lastUndo.model.addThreat({ name: 'Draggable' })")
    page.wait_for_timeout(200)

    box = page.locator("#bowtie-canvas #nodes-layer .node.threat").last.bounding_box()
    start_x, start_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x - 60, start_y + 40, steps=5)
    page.mouse.up()

    # No wait: the release itself must have rendered.
    moved = page.evaluate("""
    () => {
      const m = window.__lastModel;
      const t = m.threats[m.threats.length - 1];
      const g = document.querySelector(
        `#bowtie-canvas #nodes-layer .node[data-id="${t.nodeId}"]`,
      );
      const drawn = g.querySelector('rect');
      return Math.abs(Number(drawn.getAttribute('x')) + (t.w / 2) - t.x) < 2;
    }
    """)
    assert moved, "the canvas did not reflect the dropped position synchronously"
