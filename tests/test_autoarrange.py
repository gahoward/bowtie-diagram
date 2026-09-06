"""Auto-arrange's layout guarantees: the topmost Cause/Outcome must clear
the TLE, and no two unrelated barriers' grown boxes may overlap vertically
(baseline5: "barriers... not drawn in such a way that they intercept lines
they are not associated with").
"""
from helpers import auto_arrange


def test_topmost_cause_and_outcome_clear_the_tle(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      m.addPreventativeControl(m.causes[0].id);
      m.addOutcome({x: 1200, y: 90});
      m.addMitigativeControl(m.outcomes[0].id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    positions = page.evaluate("""() => {
      const m = window.__lastModel;
      return { tleY: m.topLevelEvent.y, causeY: m.causes[0].y, outcomeY: m.outcomes[0].y };
    }""")
    assert positions["causeY"] < positions["tleY"]
    assert positions["outcomeY"] < positions["tleY"]
    assert positions["tleY"] - positions["causeY"] >= 150
    assert positions["tleY"] - positions["outcomeY"] >= 150


def test_unrelated_barriers_never_overlap_vertically_after_arrange(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      // A merge group: two causes sharing one PB.
      m.addCause({x: 150, y: 90});
      const a = m.causes[0];
      const pb = m.addPreventativeControl(a.id);
      m.addCause({x: 150, y: 300});
      const b = m.causes[1];
      m.attachInputToPreventativeControl(b.id, pb.id);
      // An unrelated third cause with its own separate PB.
      m.addCause({x: 150, y: 600});
      m.addPreventativeControl(m.causes[2].id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    boxes = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      return m.preventativeBarriers.map((pb) => {
        const b = view.boundsById[pb.id];
        return { id: pb.id, cy: b.cy, h: b.h, lines: m.linesThrough(pb.id).map((l) => l.id) };
      });
    }""")

    def overlaps(a, b):
        a_top, a_bot = a["cy"] - a["h"] / 2, a["cy"] + a["h"] / 2
        b_top, b_bot = b["cy"] - b["h"] / 2, b["cy"] + b["h"] / 2
        return a_top < b_bot and b_top < a_bot

    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            shares_a_line = set(a["lines"]) & set(b["lines"])
            if not shares_a_line:
                assert not overlaps(a, b), f"unrelated barriers {a['id']} and {b['id']} overlap after arrange"


def test_merged_barriers_label_does_not_overlap_an_unrelated_barriers_box(page):
    """A barrier's id/name label renders below its box (ShapeRenderer), and a
    merged barrier's box hugs its own lanes far more tightly than a lone
    barrier's default half-height does — so even when two unrelated
    barriers' BOXES clear each other (as the box-only test above checks),
    the merged one's LABEL can still bleed into the next barrier's box.
    Reproduces a real screenshot: two Causes merged into one PB, plus an
    unrelated third Cause's own separate PB positioned right after it."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const a = m.causes[0];
      const pb = m.addPreventativeControl(a.id);
      m.addCause({x: 150, y: 300});
      m.attachInputToPreventativeControl(m.causes[1].id, pb.id);
      m.addCause({x: 150, y: 600});
      m.addPreventativeControl(m.causes[2].id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    boxes = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      return m.preventativeBarriers.map((pb) => {
        const b = view.boundsById[pb.id];
        return {
          id: pb.id, cy: b.cy, h: b.h,
          labelCenterY: b.labelCenterY, labelHalfHeight: b.labelHalfHeight,
          lines: m.linesThrough(pb.id).map((l) => l.id),
        };
      });
    }""")

    def box_span(b):
        return b["cy"] - b["h"] / 2, b["cy"] + b["h"] / 2

    def label_span(b):
        return b["labelCenterY"] - b["labelHalfHeight"], b["labelCenterY"] + b["labelHalfHeight"]

    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            if set(a["lines"]) & set(b["lines"]):
                continue
            a_label_top, a_label_bot = label_span(a)
            b_top, b_bot = box_span(b)
            assert not (a_label_top < b_bot and b_top < a_label_bot), (
                f"{a['id']}'s label must not overlap unrelated {b['id']}'s box"
            )
            b_label_top, b_label_bot = label_span(b)
            a_top, a_bot = box_span(a)
            assert not (b_label_top < a_bot and a_top < b_label_bot), (
                f"{b['id']}'s label must not overlap unrelated {a['id']}'s box"
            )


def test_two_unrelated_lone_barriers_labels_and_boxes_never_overlap(page):
    """The worst case, and the one actually reported live: two ORDINARY,
    unrelated Causes each with their own single-lane barrier (no sharing at
    all). A lone barrier's box reaches a full default half-height (55px)
    into the gap toward its neighbour, and its own label reaches further
    still — GROUP_GAP has to cover this even though neither side ever
    merges, which the old merge-only EXTRA_GROUP_GAP never did (it left
    this boundary on the too-small plain ROW_SPACING, giving zero real
    clearance)."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 300});
      m.addPreventativeControl(m.causes[1].id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    boxes = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      return m.preventativeBarriers.map((pb) => {
        const b = view.boundsById[pb.id];
        return { id: pb.id, cy: b.cy, h: b.h, labelCenterY: b.labelCenterY, labelHalfHeight: b.labelHalfHeight };
      });
    }""")
    assert len(boxes) == 2
    a, b = sorted(boxes, key=lambda x: x["cy"])

    a_box_bottom = a["cy"] + a["h"] / 2
    a_label_bottom = a["labelCenterY"] + a["labelHalfHeight"]
    b_box_top = b["cy"] - b["h"] / 2

    assert a_box_bottom <= b_box_top, "PB boxes must not overlap"
    assert a_label_bottom <= b_box_top, "the upper PB's label must not overlap the lower PB's box"


def test_causes_that_only_merge_two_hops_downstream_keep_their_own_first_barriers_clear(page):
    """Real screenshot: C_1 -> PB_A -> PB_C -> TLE, C_2 -> PB_B -> PB_C -> TLE.
    C_1 and C_2 only share a barrier at PB_C (two hops downstream of their
    OWN distinct first barriers PB_A/PB_B) — orderByAdjacency correctly
    places them adjacent for ordering purposes (they DO need to end up next
    to each other, or a later-merge scenario like this one risks an
    unrelated node sandwiched between them), but that must not be read as
    license to use the compact within-group ROW_SPACING between them: PB_A
    and PB_B are two entirely separate boxes sharing the very first depth
    column, and need GROUP_GAP's full clearance just like any other two
    unrelated lone barriers would."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90}); // C_1
      const pbA = m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 300}); // C_2
      const pbB = m.addPreventativeControl(m.causes[1].id);
      const pbC = m.insertBarrier('preventativeBarrier', 'after', pbA.id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pbB.id, pbC.id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    boxes = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const depth1 = m.preventativeBarriers.filter((pb) => m.linesThrough(pb.id).length === 1);
      return depth1.map((pb) => {
        const b = view.boundsById[pb.id];
        return { id: pb.id, cy: b.cy, h: b.h, labelCenterY: b.labelCenterY, labelHalfHeight: b.labelHalfHeight };
      });
    }""")
    assert len(boxes) == 2, "PB_A and PB_B should each be a lone, single-lane depth-1 barrier"
    a, b = sorted(boxes, key=lambda x: x["cy"])

    a_box_bottom = a["cy"] + a["h"] / 2
    a_label_bottom = a["labelCenterY"] + a["labelHalfHeight"]
    b_box_top = b["cy"] - b["h"] / 2

    assert a_box_bottom <= b_box_top, "PB_A and PB_B's boxes must not overlap even though they later merge"
    assert a_label_bottom <= b_box_top, "the upper barrier's label must not overlap the lower barrier's box"


def test_sharing_two_hops_downstream_still_clusters_causes_together(page):
    """Two Causes can share a barrier without sharing their immediate next
    barrier: C_1 -> PB_1 -> PB_3 -> TLE, C_3 -> PB_4 -> PB_3 -> TLE — they
    only converge at PB_3, one hop after their own distinct first barrier.
    An unrelated C_2 (direct to the TLE) must not be laid out between them,
    or PB_3's grown box (spanning C_1's and C_3's lanes) visually
    intercepts C_2's own unrelated line."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200}); // C_1
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const pb3 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);

      m.addCause({x: 150, y: 400}); // C_2, unrelated, direct to the TLE

      m.addCause({x: 150, y: 600}); // C_3
      const pb4 = m.addPreventativeControl(m.causes[2].id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb4.id, pb3.id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const bounds = view.boundsById['PB_3'];
      return {
        causeYs: Object.fromEntries(m.causes.map((c) => [c.id, c.y])),
        pb3Top: bounds.cy - bounds.h / 2,
        pb3Bottom: bounds.cy + bounds.h / 2,
      };
    }""")
    c2y = result["causeYs"]["C_2"]
    assert not (result["pb3Top"] < c2y < result["pb3Bottom"]), (
        "C_2's unrelated line must not pass through PB_3's grown box"
    )


def test_sharing_two_hops_downstream_still_clusters_outcomes_together(page):
    """Mirrors the Cause-side case above for Outcomes/MBs."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      const mb1 = m.addMitigativeControl(m.outcomes[0].id);
      const mb3 = m.insertBarrier('mitigativeBarrier', 'after', mb1.id);

      m.addOutcome({x: 1200, y: 400}); // unrelated, direct to the TLE

      m.addOutcome({x: 1200, y: 600});
      const mb4 = m.addMitigativeControl(m.outcomes[2].id);
      m.attachExistingBarrier('mitigativeBarrier', 'after', mb4.id, mb3.id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const bounds = view.boundsById['MB_3'];
      return {
        outcomeYs: Object.fromEntries(m.outcomes.map((o) => [o.id, o.y])),
        mb3Top: bounds.cy - bounds.h / 2,
        mb3Bottom: bounds.cy + bounds.h / 2,
      };
    }""")
    o2y = result["outcomeYs"]["O_2"]
    assert not (result["mb3Top"] < o2y < result["mb3Bottom"]), (
        "O_2's unrelated line must not pass through MB_3's grown box"
    )


def test_two_bridged_merge_columns_keep_each_others_unrelated_cause_clear(page):
    """A Cause can bridge two otherwise-unconnected merge groups: C_1 shares
    PB_1 with C_3, and (separately) C_2 shares PB_2 with C_3. Grouping by a
    single shared key isn't enough here — C_1 and C_2 don't share anything
    directly, only via C_3 — so this needs the two groups to actually be
    ordered (not just clustered) as C_1, C_3, C_2 (or its mirror image), or
    whichever cause ends up in the middle has an unrelated barrier's grown
    box cutting through its own line."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200}); // C_1
      m.addPreventativeControl(m.causes[0].id); // PB_1

      m.addCause({x: 150, y: 400}); // C_2
      m.addPreventativeControl(m.causes[1].id); // PB_2

      m.addCause({x: 150, y: 600}); // C_3 - bridges both
      const c3 = m.causes[2];
      m.attachInputToPreventativeControl(c3.id, 'PB_1'); // C_3: [PB_1]
      m.attachExistingBarrier('preventativeBarrier', 'after', 'PB_1', 'PB_2', [m._lineFor(c3.id).id]); // -> [PB_1, PB_2]
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      return {
        causeYs: Object.fromEntries(m.causes.map((c) => [c.id, c.y])),
        pb1: view.boundsById['PB_1'],
        pb2: view.boundsById['PB_2'],
      };
    }""")

    def spans(b):
        return b["cy"] - b["h"] / 2, b["cy"] + b["h"] / 2

    pb1_top, pb1_bot = spans(result["pb1"])
    pb2_top, pb2_bot = spans(result["pb2"])
    c1y, c2y = result["causeYs"]["C_1"], result["causeYs"]["C_2"]

    assert not (pb1_top < c2y < pb1_bot), "C_2 (no connection to PB_1) must not fall inside PB_1's grown span"
    assert not (pb2_top < c1y < pb2_bot), "C_1 (no connection to PB_2) must not fall inside PB_2's grown span"


def test_two_bridged_merge_columns_outcome_side(page):
    """Mirrors the bridged-Cause case above for Outcomes/MBs."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200}); // O_1
      m.addMitigativeControl(m.outcomes[0].id); // MB_1

      m.addOutcome({x: 1200, y: 400}); // O_2
      m.addMitigativeControl(m.outcomes[1].id); // MB_2

      m.addOutcome({x: 1200, y: 600}); // O_3 - bridges both
      const o3 = m.outcomes[2];
      m.attachOutputToMitigativeControl('MB_1', o3.id); // O_3: [MB_1]
      m.attachExistingBarrier('mitigativeBarrier', 'before', 'MB_1', 'MB_2', [m._lineFor(o3.id).id]); // -> [MB_1, MB_2]
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      return {
        outcomeYs: Object.fromEntries(m.outcomes.map((o) => [o.id, o.y])),
        mb1: view.boundsById['MB_1'],
        mb2: view.boundsById['MB_2'],
      };
    }""")

    def spans(b):
        return b["cy"] - b["h"] / 2, b["cy"] + b["h"] / 2

    mb1_top, mb1_bot = spans(result["mb1"])
    mb2_top, mb2_bot = spans(result["mb2"])
    o1y, o2y = result["outcomeYs"]["O_1"], result["outcomeYs"]["O_2"]

    assert not (mb1_top < o2y < mb1_bot), "O_2 (no connection to MB_1) must not fall inside MB_1's grown span"
    assert not (mb2_top < o1y < mb2_bot), "O_1 (no connection to MB_2) must not fall inside MB_2's grown span"


def test_auto_arrange_leaves_room_for_a_long_wrapped_cause_name(page):
    """architecture review finding: ROW_SPACING/GROUP_GAP were derived only
    from fixed barrier geometry and never referenced a Cause/Outcome's OWN
    rendered box height — which, unlike a barrier's (label renders outside
    the box, so the box itself never grows), genuinely grows unbounded as
    Layout.causeOutcomeBounds wraps a long name to more lines. Two Causes
    sharing an immediate barrier only got the plain ROW_SPACING (110px)
    between their rows; give one a long, realistic multi-sentence
    description that wraps to several lines and its box height alone can
    exceed that gap. assignLeafYs now also measures each row's ACTUAL
    rendered height (the same Layout.causeOutcomeBounds call the live
    render uses) and only ever grows the gap to fit, never shrinks it."""
    long_name = (
        "This cause has a long, realistic multi-sentence description of exactly the kind a real "
        "risk register entry would actually contain, wrapping across quite a few lines when rendered"
    )
    page.evaluate(
        """(longName) => {
          const m = window.__lastModel;
          m.addCause({x: 150, y: 200});
          const pb = m.addPreventativeControl(m.causes[0].id);
          m.addCause({x: 150, y: 400});
          m.attachInputToPreventativeControl(m.causes[1].id, pb.id);
          m.renameElement(m.causes[1].id, longName);
        }""",
        long_name,
    )
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      return m.causes.map((c) => ({ y: c.y, h: view.boundsById[c.id].h }));
    }""")
    a, b = result
    a_top, a_bot = a["y"] - a["h"] / 2, a["y"] + a["h"] / 2
    b_top, b_bot = b["y"] - b["h"] / 2, b["y"] + b["h"] / 2
    assert not (a_top < b_bot and b_top < a_bot), "the long-named Cause's own box must not overlap its sibling's"
