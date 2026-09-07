"""auto-arrange-fix.md.

§4: an unattached (bare, zero-stop) Cause/Outcome's connecting line must
never cross an unrelated barrier's box. The old single-diagonal rendering
for a zero-stop line spanned the entire causes-to-TLE horizontal distance,
unconditionally crossing the x-range of every barrier column in between --
including a shared barrier several rows away. The fix draws the same
flat-run-then-bend shape every other line already uses, staying at the
origin's own lane-y (already guaranteed clear by GROUP_GAP/ROW_SPACING)
until close to the TLE, with a Hazard-clearance-aware bend length for lanes
above the TLE's own y.

§7: an opt-in Settings toggle ("Pull causes/outcomes closer to their first
real stop") that positions an origin one gap before its own chain's first
real stop, instead of always starting at the fixed causesX/outcomesX column
-- covering both the fully-bare case and the "first stop forced deeper by a
merge elsewhere" case. Off by default; must reproduce today's exact
positions when off.
"""
from helpers import auto_arrange


def _set_arrange_spacing(page, value):
    page.click("#menu-trigger-settings")
    page.click("#btn-settings")
    page.locator(".modal-checkbox-row", has_text=value).click()
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)


def _set_pull_chains_closer(page, checked):
    page.click("#menu-trigger-settings")
    page.click("#btn-settings")
    row = page.locator(".modal-checkbox-row", has_text="Pull causes/outcomes closer")
    box = row.locator("input[type=checkbox]")
    if box.is_checked() != checked:
        row.click()
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)


def _build_shared_barrier_with_bare_cause(page):
    """C_1 -> PB_1 -> PB_3(shared), C_2 -> PB_2 -> PB_3(shared), C_3 -> PB_3
    directly, C_4 bare (straight to the TLE) -- the exact repro topology
    from auto-arrange-fix.md. C_3's only stop (PB_3) sits at depth 2, not
    its own natural minimum of 1, because PB_1 (feeding PB_3 from C_1's
    longer chain) forces it there -- the "shallow-but-nonzero" §7 case."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      m.addCause({x: 150, y: 310});
      m.addCause({x: 150, y: 530});
      m.addCause({x: 150, y: 750});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const pb2 = m.addPreventativeControl(m.causes[1].id);
      const pb3 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb2.id, pb3.id);
      m.attachInputToPreventativeControl(m.causes[2].id, pb3.id);
    }""")


def _bare_line_barrier_violations(page):
    return page.evaluate("""() => {
      const barrierRects = Array.from(
        document.querySelectorAll('#bowtie-canvas .node.preventative-barrier rect.shape')
      ).map((r) => ({
        x: +r.getAttribute('x'), y: +r.getAttribute('y'),
        w: +r.getAttribute('width'), h: +r.getAttribute('height'),
      }));
      const bareSegments = Array.from(
        document.querySelectorAll('#bowtie-canvas .connection[data-role="cause-direct"]')
      ).map((el) => ({
        x1: +el.getAttribute('x1'), y1: +el.getAttribute('y1'),
        x2: +el.getAttribute('x2'), y2: +el.getAttribute('y2'),
      }));
      let violations = 0;
      bareSegments.forEach((seg) => {
        for (let i = 0; i <= 100; i += 1) {
          const t = i / 100;
          const x = seg.x1 + (seg.x2 - seg.x1) * t;
          const y = seg.y1 + (seg.y2 - seg.y1) * t;
          barrierRects.forEach((b) => {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) violations += 1;
          });
        }
      });
      return { violations, segmentCount: bareSegments.length };
    }""")


def test_bare_cause_line_does_not_cross_a_shared_barrier_loose_mode(page):
    _build_shared_barrier_with_bare_cause(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    result = _bare_line_barrier_violations(page)
    assert result["segmentCount"] > 0
    assert result["violations"] == 0


def test_bare_cause_line_does_not_cross_a_shared_barrier_tight_mode(page):
    """Tight mode makes the original bug geometrically worse, not better
    (tighter columns leave less room for the old single diagonal to clear
    an intermediate column) -- confirm the fix holds here too."""
    _set_arrange_spacing(page, "Tight")
    _build_shared_barrier_with_bare_cause(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    result = _bare_line_barrier_violations(page)
    assert result["segmentCount"] > 0
    assert result["violations"] == 0


def test_bare_cause_bend_also_clears_the_hazard(page):
    """The bare-line fix's own Hazard-clearance derivation (mirroring
    TLE_ADJACENT_GAP_TIGHT, but from this line's real laneY/tleR/hazard
    geometry) must hold, not just the pre-existing barrier-fed-line case
    already covered by test_tight_spacing.py."""
    _build_shared_barrier_with_bare_cause(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    result = page.evaluate("""() => {
      const hazardRect = document.querySelector('.node.hazard rect.shape');
      const haz = {
        x: +hazardRect.getAttribute('x'), y: +hazardRect.getAttribute('y'),
        w: +hazardRect.getAttribute('width'), h: +hazardRect.getAttribute('height'),
      };
      const segments = Array.from(
        document.querySelectorAll('#bowtie-canvas .connection[data-role="cause-direct"]')
      ).map((el) => ({
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
    assert result["violations"] == 0


def test_settings_modal_offers_the_pull_chains_closer_toggle(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-settings")
    texts = page.locator(".modal-checkbox-row").all_text_contents()
    assert any("Pull causes/outcomes closer" in t for t in texts)
    page.get_by_role("button", name="Close", exact=True).click()


def test_pull_chains_closer_off_matches_todays_fixed_column_behavior(page):
    _build_shared_barrier_with_bare_cause(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    xs = page.evaluate("""() => {
      const m = window.__lastModel;
      return { c1: m.causes[0].x, c3: m.causes[2].x, c4: m.causes[3].x };
    }""")
    # C_1 (natural depth-1), C_3 (forced-deep), C_4 (bare) all start at the
    # same fixed causesX column when the toggle is off, exactly as before
    # this feature existed.
    assert abs(xs["c1"] - xs["c3"]) < 1
    assert abs(xs["c1"] - xs["c4"]) < 1


def test_pull_chains_closer_on_moves_forced_deep_and_bare_origins_nearer_the_tle(page):
    _set_pull_chains_closer(page, True)
    _build_shared_barrier_with_bare_cause(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      return {
        c1: m.causes[0].x,             // natural depth-1: unaffected
        c3: m.causes[2].x,             // forced-deep (only stop PB_3, depth 2)
        c4: m.causes[3].x,             // fully bare
        pb1: m.preventativeBarriers.find((p) => p.nodeId === 'PB_1').x, // depth 1
        pb3: m.preventativeBarriers.find((p) => p.nodeId === 'PB_3').x, // depth 2 (deepest)
        c3y: m.causes[2].y,
      };
    }""")
    # Unmerged/natural case: formula resolves to exactly the same causesX
    # as before -- no change for a cause whose first stop is already at its
    # own natural minimum depth (1).
    assert abs(result["c1"] - 150) < 1
    # Forced-deep case: one gap before PB_3's real column == exactly PB_1's
    # own column (both are "depth 1's worth of columns" from causesX).
    assert abs(result["c3"] - result["pb1"]) < 1
    assert result["c3"] > 150  # moved closer to the TLE than the old fixed causesX
    # Fully bare case: one gap before the TLE == exactly the deepest
    # barrier's own column (PB_3 sits exactly one tleAdjacentGap before the
    # TLE too, since it's the TLE-adjacent-most column in this diagram).
    assert abs(result["c4"] - result["pb3"]) < 1
    assert result["c4"] > result["c3"]  # bare origin ends up nearer the TLE than the forced-deep one


def test_pull_chains_closer_never_moves_a_barrier_or_any_y_position(page):
    """§7.2: only an origin's x ever moves under this toggle -- barrier
    positions and every y position are untouched, since PB_3's position is
    fixed regardless of which of its lines' origins asked to sit closer."""
    _build_shared_barrier_with_bare_cause(page)
    auto_arrange(page)
    page.wait_for_timeout(100)
    before = page.evaluate("""() => {
      const m = window.__lastModel;
      return {
        pb3: { x: m.preventativeBarriers.find((p) => p.nodeId === 'PB_3').x, y: m.preventativeBarriers.find((p) => p.nodeId === 'PB_3').y },
        c3y: m.causes[2].y, c4y: m.causes[3].y,
      };
    }""")
    _set_pull_chains_closer(page, True)
    auto_arrange(page)
    page.wait_for_timeout(100)
    after = page.evaluate("""() => {
      const m = window.__lastModel;
      return {
        pb3: { x: m.preventativeBarriers.find((p) => p.nodeId === 'PB_3').x, y: m.preventativeBarriers.find((p) => p.nodeId === 'PB_3').y },
        c3y: m.causes[2].y, c4y: m.causes[3].y,
      };
    }""")
    assert abs(before["pb3"]["x"] - after["pb3"]["x"]) < 1
    assert abs(before["pb3"]["y"] - after["pb3"]["y"]) < 1
    assert abs(before["c3y"] - after["c3y"]) < 1
    assert abs(before["c4y"] - after["c4y"]) < 1


def test_pull_chains_closer_mirrors_onto_outcomes(page):
    """§7's rule applies symmetrically to Outcomes/Mitigative Barriers --
    build the mirror-image topology (MB depth counted from the TLE, so the
    "forced shallow" analogue is a first stop with depth < maxMcDepth) and
    confirm the same closer-to-TLE pull happens on that side too."""
    _set_pull_chains_closer(page, True)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 90});
      m.addOutcome({x: 1200, y: 750});
      const mb1 = m.addMitigativeControl(m.outcomes[0].id); // depth 1 (TLE-adjacent)
      m.insertBarrier('mitigativeBarrier', 'before', mb1.id); // pushes MB_1's own chain deeper toward the outcome
    }""")
    auto_arrange(page);
    page.wait_for_timeout(100)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      return {
        bareOutcomeX: m.outcomes[1].x,
        outcomesRightmostBarrierX: Math.max(...m.mitigativeBarriers.map((b) => b.x)),
        tleX: m.topLevelEvent.x,
      };
    }""")
    # The bare Outcome (no barriers at all) must land closer to the TLE
    # than the diagram's own rightmost (outcome-adjacent) barrier column --
    # i.e. it no longer sits out at the old fixed outcomesX regardless of
    # how deep the rest of the diagram's chains are.
    assert result["bareOutcomeX"] < result["outcomesRightmostBarrierX"]
    assert result["bareOutcomeX"] > result["tleX"]


def test_truncated_cause_line_still_extends_to_the_shallowest_barrier_column(page):
    """Reported bug: C_1 has its own barrier that continues on to a second,
    shared barrier (PB_B) before the TLE; C_2 attaches to that first
    barrier (inheriting the continuation through PB_B), then the user
    truncates C_2's own line back to just the first barrier via "Connect
    Directly to TLE". C_2's line now ends at PB_A, which sits a whole
    column short of the true TLE-adjacent column (PB_B, still used by
    C_1). The rendered line used to bend immediately off PB_A's own edge,
    cutting across PB_B's column at a sharp angle; it must instead stay
    flat all the way to PB_B's edge -- the same column every other line on
    this side already bends from -- and only then turn."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const ownA = m.addPreventativeControl(m.causes[0].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', ownA.id); // C_1: [ownA, shared]
      m.addCause({x: 150, y: 300});
      m.attachInputToPreventativeControl(m.causes[1].id, ownA.id, true); // C_2: [ownA, shared]
      const line2 = m._lineFor(m.causes[1].id);
      m.connectLineDirectlyToTle(line2.id, ownA.id); // C_2: [ownA] only
      window.__ownA = ownA.id;
      window.__shared = shared.id;
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const sharedEdge = m.findById(window.__shared).x + view.boundsById[window.__shared].w / 2;
      const line2 = m._lineFor(m.causes[1].id);
      // Both the flat ('to-control') and bend ('to-hazard') segments
      // share the data-role "cause-line" -- distinguish by CSS class, not
      // by checking which one happens to render horizontal (a lane whose
      // TLE-edge point lands close to its own y can make the bend segment
      // horizontal too in a small enough diagram).
      const flatSeg = Array.from(document.querySelectorAll('[data-role="cause-line"].to-control'))
        .filter((el) => el.getAttribute('data-line-id') === line2.id)
        .map((el) => ({ x2: +el.getAttribute('x2') }))[0];
      return { sharedEdge, flatEndX: flatSeg.x2 };
    }""")
    assert result["flatEndX"] == result["sharedEdge"], (
        "the truncated line's flat run must extend to the shared (shallowest) barrier's column, "
        "not stop short at its own last stop"
    )


def test_truncated_outcome_line_mirrors_extending_to_the_shallowest_column(page):
    """Mirrors the Cause-side case above for Outcomes/MBs."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 90});
      const ownA = m.addMitigativeControl(m.outcomes[0].id); // nearest O_1
      // addMitigativeControl (not insertBarrier's generic 'after', which
      // splices TOWARD THE OUTCOME for MBs) appends further toward the
      // TLE each time -- O_1: [ownA, shared].
      const shared = m.addMitigativeControl(m.outcomes[0].id);
      m.addOutcome({x: 1200, y: 300});
      m.attachOutputToMitigativeControl(ownA.id, m.outcomes[1].id, true);
      const line2 = m._lineFor(m.outcomes[1].id);
      m.connectLineDirectlyToTle(line2.id, ownA.id);
      window.__ownA = ownA.id;
      window.__shared = shared.id;
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const sharedEdge = m.findById(window.__shared).x - view.boundsById[window.__shared].w / 2;
      const line2 = m._lineFor(m.outcomes[1].id);
      // Both the bend ('from-hazard') and flat ('to-outcome') segments
      // share the data-role "outcome-line" -- distinguish by CSS class,
      // not by checking which one happens to render horizontal (a lane
      // whose TLE-edge point lands close to its own y can make the bend
      // segment horizontal too in a small enough diagram, as this minimal
      // 2-outcome scenario does).
      const flatSeg = Array.from(document.querySelectorAll('[data-role="outcome-line"].to-outcome'))
        .filter((el) => el.getAttribute('data-line-id') === line2.id)
        .map((el) => ({ x1: +el.getAttribute('x1'), x2: +el.getAttribute('x2') }))[0];
      return { sharedEdge, flatStartX: flatSeg.x1 };
    }""")
    assert result["flatStartX"] == result["sharedEdge"], (
        "the truncated line's flat run must extend to the shared (shallowest) barrier's column"
    )


def test_bare_cause_and_outcome_extend_to_the_shallowest_barrier_column(page):
    """Reported alongside the bug above: even a fully bare (zero-stop)
    origin's flat run should reach the diagram's actual shallowest barrier
    column when that's further out than the fixed Hazard-clearance margin
    alone would require -- not stop short of it. Reproduced directly with
    the unmodified demo (C_4 and O_4 are both bare there already)."""
    page.evaluate("() => { window.__lastModel.loadFromJSON(Bowtie.DEMO_DATA); }")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const pb3Edge = m.findById('PB_3').x + view.boundsById['PB_3'].w / 2;
      const mb3Edge = m.findById('MB_3').x - view.boundsById['MB_3'].w / 2;
      // Distinguish the flat run from the bend by CSS class ('to-control'
      // / 'to-outcome'), not by which happens to render horizontal.
      const causeFlat = Array.from(document.querySelectorAll('[data-role="cause-direct"].to-control'))
        .map((el) => ({ x2: +el.getAttribute('x2') }))[0];
      const outcomeFlat = Array.from(document.querySelectorAll('[data-role="outcome-direct"].to-outcome'))
        .map((el) => ({ x1: +el.getAttribute('x1') }))[0];
      return {
        pb3Edge, mb3Edge,
        causeFlatEndX: causeFlat ? causeFlat.x2 : null,
        outcomeFlatStartX: outcomeFlat ? outcomeFlat.x1 : null,
      };
    }""")
    assert result["causeFlatEndX"] == result["pb3Edge"], "bare Cause's flat run must reach PB_3's column"
    assert result["outcomeFlatStartX"] == result["mb3Edge"], "bare Outcome's flat run must reach MB_3's column"
