"""Structural review finding 02: every model mutation used to trigger a
synchronous CanvasView.render() + MinimapView clone, and DragController's
moveElement fires on every pointermove -- measured at up to 11 full
teardown-and-rebuild passes over both SVG layers for one drag gesture. Drag-
driven renders now collapse into at most one per animation frame (main.js's
isDragging-gated scheduling); everything else (a single click-driven
mutation, an import) still renders synchronously, exactly as before, so
ImportExportController's "loading modal stays up until the first page has
rendered" guarantee (test_import_loading_modal.py) keeps holding.
"""


def _count_renders_during(page, body):
    page.evaluate("""() => {
      window.__renderCount = 0;
      const proto = Object.getPrototypeOf(window.__lastView);
      if (!proto.__origRender) proto.__origRender = proto.render;
      proto.render = function (...args) {
        window.__renderCount += 1;
        return proto.__origRender.apply(this, args);
      };
    }""")
    try:
        body()
    finally:
        pass
    count = page.evaluate("() => window.__renderCount")
    page.evaluate("""() => {
      const proto = Object.getPrototypeOf(window.__lastView);
      proto.render = proto.__origRender;
    }""")
    return count


def test_dragging_coalesces_many_pointermoves_into_a_handful_of_renders(page):
    """Playwright's `mouse.move(..., steps=N)` paces each step onto its own
    task (effectively its own animation frame), which defeats the very
    coalescing under test -- real high-frequency pointer input (and the
    live-session probe the structural review itself used) delivers a burst
    of pointermove events faster than the browser can paint between them.
    Dispatching synthetic PointerEvents directly, all within one synchronous
    script, reproduces that burst: DragController.moveElement fires 30
    times before the event loop gets anywhere near a paint."""
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(100)

    def do_drag():
        page.evaluate("""() => {
          const nodeEl = document.querySelector('#bowtie-canvas .node.cause');
          const rect = nodeEl.getBoundingClientRect();
          const startX = rect.left + rect.width / 2;
          const startY = rect.top + rect.height / 2;
          const fire = (type, target, x, y) => target.dispatchEvent(new PointerEvent(type, {
            clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true,
          }));
          fire('pointerdown', nodeEl, startX, startY);
          for (let i = 1; i <= 30; i += 1) {
            fire('pointermove', window, startX + i * (200 / 30), startY + i * (40 / 30));
          }
          fire('pointerup', window, startX + 200, startY + 40);
        }""")
        page.wait_for_timeout(80)

    render_count = _count_renders_during(page, do_drag)
    assert render_count < 5, (
        f"expected a 30-move synchronous drag burst to coalesce to a handful of renders, got {render_count}"
    )
    assert render_count >= 1, "the drag must still render at least once (the final drop position)"

    final_x = page.evaluate("() => window.__lastModel.causes[0].x")
    assert final_x > 150  # sanity: the drag actually moved it

    node = page.locator("#bowtie-canvas .node.cause")
    rendered_box = node.bounding_box()
    svg_x = page.evaluate("""() => {
      const svg = document.querySelector('#bowtie-canvas');
      const pt = svg.createSVGPoint();
      pt.x = %f; pt.y = %f;
      return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
    }""" % (rendered_box["x"] + rendered_box["width"] / 2, rendered_box["y"] + rendered_box["height"] / 2))
    # The last render must reflect the actual dropped position -- coalescing
    # must never leave the canvas showing a stale, pre-drop location.
    assert abs(svg_x - final_x) < 2


def test_minimap_reclone_is_debounced_across_a_mutation_burst(page):
    """The second half of finding 02: MinimapView's own expensive step (deep-
    cloning the live nodes/connections layers) is decoupled from the render
    loop via a trailing debounce, so a burst of mutations settles into one
    reclone instead of one per mutation -- verified directly against
    MinimapView.prototype._renderContent rather than the drag path above,
    since the debounce applies to every render, not just drag-driven ones."""
    page.evaluate("""() => {
      window.__minimapRenderCount = 0;
      const proto = window.Bowtie.MinimapView.prototype;
      if (!proto.__origRenderContent) proto.__origRenderContent = proto._renderContent;
      proto._renderContent = function (...args) {
        window.__minimapRenderCount += 1;
        return proto.__origRenderContent.apply(this, args);
      };
    }""")
    try:
        page.evaluate("""() => {
          const m = window.__lastModel;
          for (let i = 0; i < 5; i += 1) m.addCause({x: 150 + i * 10, y: 200});
        }""")
        immediately_after = page.evaluate("() => window.__minimapRenderCount")
        page.wait_for_timeout(200)  # past CONTENT_DEBOUNCE_MS
        after_settling = page.evaluate("() => window.__minimapRenderCount")
    finally:
        page.evaluate("""() => {
          const proto = window.Bowtie.MinimapView.prototype;
          proto._renderContent = proto.__origRenderContent;
        }""")

    assert immediately_after == 0, "the reclone must wait for the debounce, not fire on every mutation"
    assert after_settling == 1, "five mutations in a burst must settle into exactly one reclone"


def test_a_single_non_drag_mutation_still_renders_synchronously(page):
    """Only drag-driven renders coalesce -- an ordinary click-driven action
    (Add Cause) must still paint on the very next microtask/frame boundary
    with no artificial delay, matching every other test in this suite that
    asserts DOM state right after a short wait."""
    render_count = _count_renders_during(page, lambda: page.evaluate(
        "() => { window.__lastModel.addCause({x: 150, y: 200}); }"
    ))
    assert render_count == 1
