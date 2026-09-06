"""Shared click/geometry helpers for driving the bowtie canvas from tests.

The app renders each Line as up to two <line> elements (a flat run plus the
diagonal bend into the TLE) with no DOM element per gap, so "right-click the
segment between these two barriers" has to be computed from real SVG
coordinates rather than guessed from a DOM element's bounding box — a
bounding box includes the space a taller barrier's own box occupies on top
of the line, and a naive point on the diagonal bend drifts off it entirely
if you don't follow its actual slope. Every helper here goes through the
live SVG's own screen<->user-space transform for that reason.
"""


def svg_point_to_screen(page, x, y):
    return page.evaluate(
        f"""() => {{
          const svg = document.querySelector('#bowtie-canvas');
          const p = svg.createSVGPoint();
          p.x = {x}; p.y = {y};
          const s = p.matrixTransform(svg.getScreenCTM());
          return {{x: s.x, y: s.y}};
        }}"""
    )


def click_svg_point(page, x, y, button="right"):
    """Clicks the screen position corresponding to SVG user-space (x, y)."""
    pt = svg_point_to_screen(page, x, y)
    page.mouse.click(pt["x"], pt["y"], button=button)


def click_bend_segment(page, line_id, role, t=0.08, button="right"):
    """Clicks a point along a Line's diagonal bend-into-the-TLE segment
    (the one with y1 != y2, to distinguish it from the flat run), `t`
    fraction of the way from the segment's start — small values stay close
    to the flat run's end, avoiding the barrier box that sits there."""
    pt = page.evaluate(
        f"""() => {{
          const segs = Array.from(document.querySelectorAll(
            `[data-line-id="{line_id}"][data-role="{role}"]`
          ));
          const bend = segs.find((s) => s.getAttribute('y1') !== s.getAttribute('y2'));
          const x1 = parseFloat(bend.getAttribute('x1'));
          const y1 = parseFloat(bend.getAttribute('y1'));
          const x2 = parseFloat(bend.getAttribute('x2'));
          const y2 = parseFloat(bend.getAttribute('y2'));
          const svg = document.querySelector('#bowtie-canvas');
          const p = svg.createSVGPoint();
          p.x = x1 + (x2 - x1) * {t};
          p.y = y1 + (y2 - y1) * {t};
          const s = p.matrixTransform(svg.getScreenCTM());
          return {{x: s.x, y: s.y}};
        }}"""
    )
    page.mouse.click(pt["x"], pt["y"], button=button)


def auto_arrange(page):
    """Auto-arrange now lives inside the toolbar's View dropdown
    (toolbar.md) rather than a directly-clickable top-level button."""
    page.click("#menu-trigger-view")
    page.click("#btn-auto-arrange")


def menu_items(page):
    return page.locator(".context-menu-item").all_text_contents()


def click_menu_item(page, text_substr):
    page.locator(".context-menu-item", has_text=text_substr).click()
    page.wait_for_timeout(80)


def pick_attach_target(page, barrier_id):
    """Clicks the row for `barrier_id` in an open attach-picker modal —
    scoped to the modal's own list, since the same id also appears as a
    node label on the canvas underneath it."""
    page.locator(".attach-list-item", has=page.locator(".attach-list-id", has_text=barrier_id)).click()
    page.wait_for_timeout(80)
