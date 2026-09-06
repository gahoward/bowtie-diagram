"""The minimap's blue viewport overlay must reflect the TRUE visible area,
not the raw stored `viewBox`. SVG's default preserveAspectRatio="xMidYMid
meet" letterboxes whichever dimension is under-constrained relative to the
rendered element's actual aspect ratio -- and the real clip boundary is the
element's own box, not the nominal viewBox rectangle, so diagram content
sitting in that letterbox margin genuinely renders and is visible. Reported
bug: after zooming, items appeared on the canvas that the minimap's overlay
suggested were out of view, because it was computed from `viewBox` alone.
"""


def test_minimap_viewport_rect_reflects_true_visible_area_not_stale_viewbox(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 380});
      let anchor = m.addPreventativeControl(m.causes[0].id);
      for (let i = 0; i < 4; i++) anchor = m.insertBarrier('preventativeBarrier', 'after', anchor.id);
      m.addOutcome({x: 1900, y: 420});
      let mAnchor = m.addMitigativeControl(m.outcomes[0].id);
      for (let i = 0; i < 4; i++) mAnchor = m.insertBarrier('mitigativeBarrier', 'before', mAnchor.id);
    }""")
    page.click("#menu-trigger-view")
    page.click("#btn-auto-arrange")
    page.wait_for_timeout(150)

    # `fitToBounds` sets viewBox to exactly the (very wide, short) content
    # bounds, so nothing exists beyond it yet -- letterboxing alone doesn't
    # reveal extra content the instant you fit. Zooming in via a real wheel
    # gesture (PanZoomController._onWheel) shrinks the viewBox around the
    # cursor while preserving that same mismatched aspect ratio, and NOW
    # there genuinely is more diagram content around the shrunk region in
    # the letterboxed dimension -- reproducing the bug as actually seen.
    svg_box = page.query_selector("#bowtie-canvas").bounding_box()
    page.mouse.move(svg_box["x"] + svg_box["width"] / 2, svg_box["y"] + svg_box["height"] / 2)
    for _ in range(15):
        page.mouse.wheel(0, -200)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const svg = document.querySelector('#bowtie-canvas');
      const rect = svg.getBoundingClientRect();
      const ctm = svg.getScreenCTM().inverse();
      const tl = new DOMPoint(rect.left, rect.top).matrixTransform(ctm);
      const br = new DOMPoint(rect.right, rect.bottom).matrixTransform(ctm);
      const trueVisibleH = br.y - tl.y;
      const staleViewBoxH = svg.viewBox.baseVal.height; // what the old, buggy formula used instead

      const bounds = window.__lastView.getContentBounds();
      const cw = Math.max(bounds.maxX - bounds.minX, 1);
      const ch = Math.max(bounds.maxY - bounds.minY, 1);
      const scale = Math.min((220 - 20) / cw, (140 - 20) / ch);

      const r = document.querySelector('.minimap-viewport');
      return {
        expectedH: trueVisibleH * scale,
        actualH: +r.getAttribute('height'),
        staleExpectedH: staleViewBoxH * scale,
      };
    }""")
    assert abs(result["actualH"] - result["expectedH"]) < 1, (
        "minimap viewport rect height must match the TRUE visible height, not the stale viewBox one"
    )
    # The two candidate answers must actually be meaningfully different here
    # (heavy letterboxing), or this test wouldn't have caught the old bug.
    assert result["expectedH"] > result["staleExpectedH"] * 2


def test_minimap_viewport_rect_updates_on_window_resize_alone(page):
    """Second reported bug, same symptom: resizing the browser window changes
    the SVG element's rendered size/aspect ratio -- and therefore the TRUE
    visible area -- without touching `viewBox` at all, so nothing was ever
    calling `_emitChange()` to make MinimapView recompute. The rectangle just
    sat there stale from whatever size the page loaded at, understating what
    was actually visible after the window shrank or grew. Fixed via a
    `ResizeObserver` on the SVG root in PanZoomController."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 380});
      m.addOutcome({x: 1900, y: 420});
    }""")
    page.click("#menu-trigger-view")
    page.click("#btn-auto-arrange")
    page.wait_for_timeout(150)

    before = page.evaluate("""() => {
      const r = document.querySelector('.minimap-viewport');
      return { w: +r.getAttribute('width'), h: +r.getAttribute('height') };
    }""")

    page.set_viewport_size({"width": 900, "height": 1000})
    page.wait_for_timeout(200)

    after = page.evaluate("""() => {
      const svg = document.querySelector('#bowtie-canvas');
      const rect = svg.getBoundingClientRect();
      const ctm = svg.getScreenCTM().inverse();
      const tl = new DOMPoint(rect.left, rect.top).matrixTransform(ctm);
      const br = new DOMPoint(rect.right, rect.bottom).matrixTransform(ctm);
      const trueVisibleH = br.y - tl.y;

      const bounds = window.__lastView.getContentBounds();
      const cw = Math.max(bounds.maxX - bounds.minX, 1);
      const ch = Math.max(bounds.maxY - bounds.minY, 1);
      const scale = Math.min((220 - 20) / cw, (140 - 20) / ch);

      const r = document.querySelector('.minimap-viewport');
      return { actualH: +r.getAttribute('height'), expectedH: trueVisibleH * scale };
    }""")

    assert abs(after["actualH"] - after["expectedH"]) < 1, (
        "minimap viewport rect must update after a plain window resize, with no pan/zoom in between"
    )
    assert abs(after["actualH"] - before["h"]) > 1, (
        "the resize must actually have changed the true visible area, or this test wouldn't catch staleness"
    )
