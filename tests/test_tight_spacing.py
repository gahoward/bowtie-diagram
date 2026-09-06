"""Settings -> Visual Settings -> "Auto-arrange spacing" (Loose/Tight).
Tight mode brings columns closer together horizontally while still
respecting the same overlap-avoidance guarantees auto-arrange already
enforces vertically -- COL_SPACING_TIGHT is derived from real barrier/Cause/
TLE geometry (mirroring how GROUP_GAP was derived), not a guessed number.
"""
from helpers import auto_arrange


def _set_arrange_spacing(page, value):
    page.click("#menu-trigger-settings")
    page.click("#btn-settings")
    page.locator(".modal-checkbox-row", has_text=value).click()
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)


def _build_simple_chain(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
      m.addOutcome({x: 1200, y: 200});
      m.addMitigativeControl(m.outcomes[0].id);
    }""")


def test_settings_modal_offers_loose_and_tight_options(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-settings")
    texts = page.locator(".modal-checkbox-row").all_text_contents()
    assert any("Loose" in t for t in texts)
    assert any("Tight" in t for t in texts)
    page.get_by_role("button", name="Close", exact=True).click()


def test_tight_mode_produces_closer_columns_than_loose(page):
    _build_simple_chain(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    loose_gap = page.evaluate("""() => {
      const m = window.__lastModel;
      return m.preventativeBarriers[0].x - m.causes[0].x;
    }""")

    _set_arrange_spacing(page, "Tight")
    auto_arrange(page)
    page.wait_for_timeout(100)
    tight_gap = page.evaluate("""() => {
      const m = window.__lastModel;
      return m.preventativeBarriers[0].x - m.causes[0].x;
    }""")

    assert tight_gap < loose_gap
    assert tight_gap > 0


def test_tight_mode_still_avoids_horizontal_label_overlap(page):
    """The whole point of deriving COL_SPACING_TIGHT from real geometry
    rather than guessing a smaller number: two chained barriers (which
    commonly land on the same Y) must still not have their labels touch
    horizontally."""
    _set_arrange_spacing(page, "Tight")
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      m.insertBarrier('preventativeBarrier', 'after', 'PB_2');
    }""")
    auto_arrange(page)
    page.wait_for_timeout(100)

    xs = page.evaluate("() => window.__lastModel.preventativeBarriers.map((pb) => pb.x)")
    xs.sort()
    for i in range(len(xs) - 1):
        # Each barrier's label is wrap-capped at 110px wide, centered on its
        # own x -- two adjacent columns need >= 110px between them.
        assert xs[i + 1] - xs[i] >= 110


def test_tight_mode_still_clears_the_hazard(page):
    """Caught live: tightening the LAST barrier-column-to-TLE hop the same
    amount as the general column spacing let a connecting line's bend
    visibly slice through the Hazard box, which sits directly above the
    TLE. The bend still has the usual TLE_CLEARANCE worth of vertical drop
    to cover (unchanged -- only horizontal spacing was tightened), so
    covering that drop over a shorter horizontal run steepens the line
    enough that it can still be above the Hazard's own bottom edge by the
    time it re-enters the Hazard's x-range. Sample points along every
    connecting line's bend segment and confirm none land inside the
    Hazard's rendered bounding box."""
    _set_arrange_spacing(page, "Tight")
    _build_simple_chain(page)
    auto_arrange(page)
    page.wait_for_timeout(100)

    result = page.evaluate("""() => {
      const hazardRect = document.querySelector('.node.hazard rect.shape');
      const haz = {
        x: +hazardRect.getAttribute('x'), y: +hazardRect.getAttribute('y'),
        w: +hazardRect.getAttribute('width'), h: +hazardRect.getAttribute('height'),
      };
      // Excludes the FIXED Hazard -> TLE connector itself (no data-role,
      // unlike every barrier bend segment) -- it legitimately starts
      // exactly at the Hazard's own bottom-center edge by design, which a
      // naive "touches the box" check would otherwise flag as a false
      // positive.
      const segments = Array.from(document.querySelectorAll('#bowtie-canvas .connection.to-hazard[data-role]')).map((el) => ({
        x1: +el.getAttribute('x1'), y1: +el.getAttribute('y1'),
        x2: +el.getAttribute('x2'), y2: +el.getAttribute('y2'),
      }));
      let violations = 0;
      segments.forEach((seg) => {
        for (let i = 0; i <= 50; i += 1) {
          const t = i / 50;
          const x = seg.x1 + (seg.x2 - seg.x1) * t;
          const y = seg.y1 + (seg.y2 - seg.y1) * t;
          const inside = x >= haz.x && x <= haz.x + haz.w && y >= haz.y && y <= haz.y + haz.h;
          if (inside) violations += 1;
        }
      });
      return { violations, segmentCount: segments.length };
    }""")
    assert result["segmentCount"] > 0
    assert result["violations"] == 0, "a connecting line's bend into the TLE must not cross the Hazard box"


def test_shallower_side_no_longer_padded_to_match_the_deeper_sides_depth(page):
    """Bug fix bundled with tight/loose mode (applies to both): `tleX`/
    `outcomesX` used to both be offset using a single shared
    max(pcDepth, mcDepth), so the OUTCOME NODE ITSELF (not its barriers --
    `mcColX(d)` already only ever depended on that barrier's own depth, so
    barrier placement was never actually affected) landed padded out an
    extra, unused column's worth of gap past its own last barrier whenever
    the Cause side was deeper. Build a 3-deep Cause chain and a 1-deep
    Outcome chain: the Outcome should sit exactly one column-spacing unit
    past its own single barrier, not out at the 3-deep Cause side's
    distance."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      let anchor = m.addPreventativeControl(m.causes[0].id);
      anchor = m.insertBarrier('preventativeBarrier', 'after', anchor.id);
      anchor = m.insertBarrier('preventativeBarrier', 'after', anchor.id);
      m.addOutcome({x: 1200, y: 200});
      m.addMitigativeControl(m.outcomes[0].id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(100)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const outcomeX = m.outcomes[0].x;
      const mb1x = m.mitigativeBarriers[0].x;
      const pbXs = m.preventativeBarriers.map((pb) => pb.x).sort((a, b) => a - b);
      return {
        colSpacing: pbXs[1] - pbXs[0],
        outcomeToItsOwnBarrier: outcomeX - mb1x,
      };
    }""")
    assert abs(result["outcomeToItsOwnBarrier"] - result["colSpacing"]) < 1, (
        "the Outcome should sit exactly one column-spacing unit past its own (single) barrier, "
        "not padded out to match the 3-deep cause side"
    )
