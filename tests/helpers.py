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


def create_via_modal(page, name):
    """Fills the "Create New" section of an open create-or-choose node
    modal (node_library_proposal.md ask 3 -- every "Add ..." entry point
    opens this modal now instead of creating immediately) and submits it.
    Assumes the modal is already open (e.g. right after clicking "Add
    Threat"/"Add Preventative Barrier"/etc.)."""
    dialog = page.locator(".modal-dialog", has=page.locator(".create-or-choose-modal"))
    dialog.locator(".create-or-choose-section .modal-field:has-text('Name') input").first.fill(name)
    dialog.get_by_role("button", name="Create", exact=False).click()
    page.wait_for_timeout(80)


# --- Waiting without sleeping (proposals/17) -------------------------------
#
# Playwright's `expect()` auto-retries, and is the right tool for any
# assertion about a LOCATOR -- use it directly:
#
#     expect(page.locator(".page-tab")).to_have_count(2)
#
# It does not cover `page.evaluate`, which is how this suite asserts model
# state, button disabled-ness, and anything computed in the page. These
# helpers are the equivalent for those: poll the same expression the test
# always asserted, and fail with the same comparison if it never settles.
#
# A fixed `wait_for_timeout` before an assertion is a bet that the machine
# is fast enough -- it wastes time when it wins and produces a failure
# indistinguishable from a real regression when it loses. The only sleeps
# worth keeping are the ones waiting for a specific DEBOUNCE to elapse (the
# minimap's 120ms reclone, the recovery snapshot's 2s), and those should
# say which one in a comment.

_SETTLE_TIMEOUT_MS = 4000
_SETTLE_INTERVAL_MS = 25


def _poll(produce, done):
    import time
    deadline = time.monotonic() + _SETTLE_TIMEOUT_MS / 1000
    value = produce()
    while not done(value):
        if time.monotonic() >= deadline:
            return value
        time.sleep(_SETTLE_INTERVAL_MS / 1000)
        value = produce()
    return value


def eventually_equals(produce, expected, message=None):
    """Poll until `produce()` equals `expected`, then assert it."""
    value = _poll(produce, lambda v: v == expected)
    assert value == expected, message or f"expected {expected!r}, last saw {value!r}"
    return value


def eventually_contains(produce, needle, message=None):
    """Poll until `needle` appears in `produce()`, then assert it."""
    value = _poll(produce, lambda v: v is not None and needle in v)
    assert needle in value, message or f"expected {needle!r} in {value!r}"
    return value


def eventually_excludes(produce, needle, message=None):
    """Poll until `needle` is absent from `produce()`, then assert it."""
    value = _poll(produce, lambda v: v is not None and needle not in v)
    assert needle not in value, message or f"expected {needle!r} to be gone from {value!r}"
    return value
