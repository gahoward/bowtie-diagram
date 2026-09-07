"""Auto-arrange's layout guarantees: the topmost Cause/Outcome must clear
the TLE, and no two unrelated barriers' grown boxes may overlap vertically
(baseline5: "barriers... not drawn in such a way that they intercept lines
they are not associated with").
"""
from helpers import auto_arrange

RANDOM_TOPOLOGY_SEEDS = range(30)

# A seeded PRNG (mulberry32) plus a generator that builds a random chain of
# Causes/PreventativeBarriers and Outcomes/MitigativeBarriers, mixing three
# ways a barrier can end up shared: a fresh node attaching straight into an
# existing barrier ("inherit downstream" true or false, both exercised), and
# a node extending its own line further with brand-new, unshared barriers
# after that point. Every previous hand-written regression test in this file
# was written AFTER a specific real topology broke the layout; this is the
# generalization of that pattern -- instead of re-encoding one more reported
# shape by hand each time, it throws many random shapes at the same
# invariant every one of those bugs actually violated: a barrier's rendered
# box must only ever span rows whose line actually passes through it. `seed`
# makes each run fully deterministic and reproducible on its own.
_BUILD_RANDOM_TOPOLOGY_JS = """(seed) => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(seed);

  const m = window.__lastModel;
  m.loadFromJSON(window.__emptyDoc);

  function buildSide(addNode, addBarrier, attach, baseX) {
    const count = 2 + Math.floor(rng() * 4); // 2..5 nodes
    const barrierIds = [];
    for (let i = 0; i < count; i++) {
      const node = addNode({ x: baseX, y: 90 + i * 220 });

      // Maybe fan this node's line straight into an already-existing
      // barrier from an earlier node, before adding any of its own.
      if (barrierIds.length > 0 && rng() < 0.5) {
        const target = barrierIds[Math.floor(rng() * barrierIds.length)];
        attach(target, node.id, rng() < 0.5);
      }

      // Maybe extend further with 0-2 brand-new barriers of its own.
      const extra = Math.floor(rng() * 3); // 0..2
      for (let k = 0; k < extra; k++) {
        barrierIds.push(addBarrier(node.id).id);
      }
    }
  }

  buildSide(
    (opts) => m.addCause(opts),
    (causeId) => m.addPreventativeControl(causeId),
    (pcId, causeId, inherit) => m.attachInputToPreventativeControl(causeId, pcId, inherit),
    150,
  );
  buildSide(
    (opts) => m.addOutcome(opts),
    (outcomeId) => m.addMitigativeControl(outcomeId),
    (mcId, outcomeId, inherit) => m.attachOutputToMitigativeControl(mcId, outcomeId, inherit),
    1200,
  );
}"""

_CHECK_NO_FOREIGN_ROW_IN_ANY_BOX_JS = """() => {
  const m = window.__lastModel;
  const view = window.__lastView;
  const pageId = m.pages[0].id;

  const causes = m.causesForPage(pageId).map((c) => ({ id: c.id, y: c.y }));
  const outcomes = m.outcomesForPage(pageId).map((o) => ({ id: o.id, y: o.y }));

  const violations = [];
  function check(barrier, rows) {
    const b = view.boundsById[barrier.id];
    if (!b) return;
    const top = b.cy - b.h / 2;
    const bottom = b.cy + b.h / 2;
    const through = new Set(m.linesThrough(barrier.id).map((l) => l.originId));
    rows.forEach((row) => {
      if (through.has(row.id)) return;
      if (top < row.y && row.y < bottom) {
        violations.push({ barrierId: barrier.id, rowId: row.id, top, bottom, rowY: row.y });
      }
    });
  }
  m.preventativeBarriersForPage(pageId).forEach((pb) => check(pb, causes));
  m.mitigativeBarriersForPage(pageId).forEach((mb) => check(mb, outcomes));
  return violations;
}"""


def test_random_topologies_keep_every_barriers_box_scoped_to_its_own_rows(page):
    """Generative counterpart to the hand-written regression tests above:
    each of those was added only after one specific real topology broke
    auto-arrange's core promise (baseline5). Rather than trust that the
    handful of shapes captured so far are exhaustive, this throws many
    random Cause/Outcome + barrier-sharing topologies at the same
    underlying invariant and fails fast (with the seed and a full JSON
    dump of the offending topology, replayable via loadFromJSON) the
    moment any one of them violates it."""
    page.evaluate("() => { window.__emptyDoc = window.__lastModel.toJSON(); }")

    for seed in RANDOM_TOPOLOGY_SEEDS:
        page.evaluate(_BUILD_RANDOM_TOPOLOGY_JS, seed)
        auto_arrange(page)
        page.wait_for_timeout(150)

        violations = page.evaluate(_CHECK_NO_FOREIGN_ROW_IN_ANY_BOX_JS)
        if violations:
            doc = page.evaluate("() => window.__lastModel.toJSON()")
            raise AssertionError(
                f"seed={seed} produced a barrier whose box swallows a row its line "
                f"never passes through: {violations}\n"
                f"Reproduce directly via window.__lastModel.loadFromJSON(<doc>) with:\n{doc}"
            )


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
        causeYs: Object.fromEntries(m.causes.map((c) => [c.nodeId, c.y])),
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
        outcomeYs: Object.fromEntries(m.outcomes.map((o) => [o.nodeId, o.y])),
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
        causeYs: Object.fromEntries(m.causes.map((c) => [c.nodeId, c.y])),
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
        outcomeYs: Object.fromEntries(m.outcomes.map((o) => [o.nodeId, o.y])),
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


def test_lone_barrier_lands_in_the_tle_adjacent_column_not_the_cause_adjacent_one(page):
    """Regression test: a Cause with its own single, unchained Preventative
    Barrier (nothing further before the TLE) must land in the SAME column as
    another chain's TLE-adjacent barrier, not the column nearest the Causes
    -- even though, counted from ITS OWN Cause, it's only one hop deep. Depth
    must be measured from the TLE for both barrier types (mirroring how
    Mitigative Barrier depth already works), or a lone barrier ends up a full
    column short of the TLE, alongside chains' FIRST barriers instead of
    their LAST -- exactly the bug reported against the demo diagram: adding
    a Preventative Barrier to a bare Cause (like C_4) landed it next to
    PB_1/PB_2 instead of alongside PB_3, the column both of those chains
    that instead feed the TLE, real screenshot."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      // A two-deep chain: two Causes each with their own first barrier,
      // both chaining into one shared second (TLE-adjacent) barrier.
      m.addCause({x: 150, y: 90});
      const pbA = m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 300});
      const pbB = m.addPreventativeControl(m.causes[1].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', pbA.id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pbB.id, shared.id);
      // A separate, unrelated Cause with a single unchained barrier of its
      // own -- nothing feeds it, and nothing follows it before the TLE.
      m.addCause({x: 150, y: 600});
      m.addPreventativeControl(m.causes[2].id);
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    positions = page.evaluate("""() => {
      const m = window.__lastModel;
      const [pbA, pbB, shared, lone] = m.preventativeBarriers;
      return { sharedX: shared.x, loneX: lone.x, pbAX: pbA.x };
    }""")
    assert positions["loneX"] == positions["sharedX"], (
        "a lone, unchained barrier must sit in the same (TLE-adjacent) column "
        "as another chain's final barrier"
    )
    assert positions["loneX"] != positions["pbAX"], (
        "the lone barrier's column must differ from the cause-adjacent "
        "first-barrier column it used to be wrongly placed in"
    )


def test_shared_barrier_with_a_divergent_downstream_chain_gets_its_own_column(page):
    """Regression test: a barrier shared by two lines whose continuations
    toward the TLE have DIFFERENT lengths must be depth-ranked by the
    LONGEST of them, not whichever line's continuation happens to be found
    first.

    Repro (matches the reported bug exactly: load the demo, then connect
    C_2 to PB_1 by inserting it in front of C_2's own existing PB_2 --
    i.e. "Attach to Existing Preventative Barrier" on the C_2-PB_2 line
    segment, picking PB_1, not the Cause-node menu's replace-the-chain
    version):

      C_1 -> PB_1 -> PB_3        (PB_1's line to C_1 ends at PB_3)
      C_2 -> PB_1 -> PB_2 -> PB_3 (PB_1's line to C_2 continues through PB_2)

    PB_1 is shared by both lines. Depth-from-the-TLE used to be computed
    from whichever line's continuation was found first when scanning
    `model.lines` (C_1's, here) -- giving PB_1 depth 2 (1 + PB_3's depth of
    1), the SAME depth as PB_2 (also 1 + PB_3's depth of 1). Auto-arrange
    then placed both PB_1 and PB_2 in the exact same column, and since
    PB_1's only leafward neighbours are C_1 and C_2 while PB_2's only
    leafward neighbour is PB_1 itself (already positioned), they landed at
    the IDENTICAL y too -- a hard, total overlap, not just a shared column.
    Depth must instead be the DEEPEST continuation through a shared barrier
    (here, via PB_2: 1 + (1 + PB_3's depth of 1) = 3), so PB_1, PB_2, and
    PB_3 each land in their own column."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const pb3 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      m.addCause({x: 150, y: 300});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id);
      const c2Line = m.lines.find((l) => l.originId === m.causes[1].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id, {}, [c2Line.id]);
      window.__pb1 = pb1.id;
      window.__pb3 = pb3.id;
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    positions = page.evaluate("""() => {
      const m = window.__lastModel;
      const pb1 = m.findById(window.__pb1);
      const pb3 = m.findById(window.__pb3);
      const middle = m.preventativeBarriers.find((p) => p.id !== pb1.id && p.id !== pb3.id);
      return {
        pb1: { x: pb1.x, y: pb1.y },
        middle: { x: middle.x, y: middle.y },
        pb3: { x: pb3.x, y: pb3.y },
      };
    }""")
    assert positions["pb1"]["x"] < positions["middle"]["x"] < positions["pb3"]["x"], (
        "PB_1 (depth 3, feeds the longer chain), the middle barrier "
        "(depth 2), and PB_3 (depth 1) must each land in their own column, "
        "in that order from the causes side toward the TLE"
    )
    assert positions["pb1"] != positions["middle"], (
        "PB_1 and the barrier it feeds through its longer chain must never "
        "land on the exact same spot"
    )


def test_two_mutually_bare_causes_use_row_spacing_not_group_gap(page):
    """Reported bug: with several Causes/Outcomes and few barriers, the
    vertical spacing looked huge -- GROUP_GAP (sized for two LONE
    BARRIERS' boxes+labels) was being charged even between two adjacent
    Causes that have no barrier at all between them to protect. Two fully
    bare Causes next to each other in the order have nothing barrier-shaped
    to collide, so they should get the same compact ROW_SPACING two
    barrier-sharing siblings get, not the full worst-case gap."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      m.addCause({x: 150, y: 90}); // both bare -- _findClearY nudges this one down
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    ys = page.evaluate("() => window.__lastModel.causes.map((c) => c.y).sort((a, b) => a - b)")
    assert ys[1] - ys[0] == 110, "two mutually bare Causes must be exactly ROW_SPACING apart"


def test_a_bare_cause_next_to_a_barrier_bearing_one_still_gets_full_group_gap(page):
    """Regression guard for the fix above: the compaction must be scoped
    strictly to BOTH sides being bare. A bare Cause sitting next to one
    that has its own barrier must still get the full GROUP_GAP -- that
    barrier's box and label are real geometry the bare row's gap must stay
    clear of, unchanged from before this fix."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 90}); // bare, nudged below C_1 by _findClearY
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    ys = page.evaluate("() => window.__lastModel.causes.map((c) => c.y).sort((a, b) => a - b)")
    assert ys[1] - ys[0] == 220, "a bare Cause beside a barrier-bearing one must keep the full GROUP_GAP"


def test_mixed_bare_and_barrier_rows_never_overlap_in_either_spacing_mode(page):
    """Stress check for the compaction fix: five Causes with only two
    barriers between them (the exact shape of the reported bug) must
    still produce zero box overlaps and zero bare-line/barrier-box
    crossings, in both Loose and Tight mode -- shrinking the bare-bare
    gaps must never let a bare row's line clip a barrier it isn't
    associated with (baseline5)."""
    def build(page):
        page.evaluate("""() => {
          const m = window.__lastModel;
          for (let i = 0; i < 5; i += 1) m.addCause({x: 150, y: 90 + i * 50});
          m.addPreventativeControl(m.causes[0].id);
          m.addPreventativeControl(m.causes[2].id);
        }""")

    def violations(page):
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
          let count = 0;
          bareSegments.forEach((seg) => {
            for (let i = 0; i <= 100; i += 1) {
              const t = i / 100;
              const x = seg.x1 + (seg.x2 - seg.x1) * t;
              const y = seg.y1 + (seg.y2 - seg.y1) * t;
              barrierRects.forEach((b) => {
                if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) count += 1;
              });
            }
          });
          // boundsById entries carry `w`/`h` always, but `cx` never (a
          // barrier's own x IS its model x; a Cause/Outcome's bounds don't
          // even carry `cy` -- it's always just its model y) -- build cx/cy
          // from the model directly rather than assuming the bounds object
          // has them, or every comparison below silently compares
          // `undefined` and never reports an overlap.
          const view = window.__lastView;
          const m = window.__lastModel;
          const allIds = [
            ...m.causes, ...m.outcomes, ...m.preventativeBarriers, ...m.mitigativeBarriers,
          ].map((n) => n.id);
          const boxes = allIds.map((id) => {
            const node = m.findById(id);
            const b = view.boundsById[id];
            return { id, cx: node.x, cy: b.cy !== undefined ? b.cy : node.y, w: b.w, h: b.h };
          });
          let overlapCount = 0;
          for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
              const a = boxes[i];
              const b = boxes[j];
              const overlapsX = Math.abs(a.cx - b.cx) < (a.w + b.w) / 2;
              const overlapsY = Math.abs(a.cy - b.cy) < (a.h + b.h) / 2;
              if (overlapsX && overlapsY) overlapCount += 1;
            }
          }
          return { lineViolations: count, boxOverlaps: overlapCount };
        }""")

    build(page)
    auto_arrange(page)
    page.wait_for_timeout(150)
    loose = violations(page)
    assert loose["lineViolations"] == 0
    assert loose["boxOverlaps"] == 0

    page.click("#menu-trigger-settings")
    page.click("#btn-settings")
    page.locator(".modal-checkbox-row", has_text="Tight").click()
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)
    auto_arrange(page)
    page.wait_for_timeout(150)
    tight = violations(page)
    assert tight["lineViolations"] == 0
    assert tight["boxOverlaps"] == 0


def test_diverging_after_a_shared_barrier_keeps_full_clearance_between_rows(page):
    """Reported bug: two Causes merge into one shared barrier, then each
    continues through its OWN separate further barrier before the TLE (the
    manual path-reorder feature's "Shift Away From TLE", applied to a
    shared barrier across two of its lines at once, produces exactly this
    shape). assignLeafYs used to grant these two Causes only ROW_SPACING
    because they share their FIRST stop, ignoring that their chains
    diverge again right after -- concretely reproduced: one barrier's
    label overlapped the very next row's barrier box after Auto-arrange.
    Built directly via the model (mirrors what the reorder feature
    produces) rather than by driving the context menu, since this is
    fundamentally an Auto-arrange/layout correctness property, not a
    reorder-UI one -- test_barrier_placement.py separately covers the
    context-menu flow end-to-end."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const ownA = m.addPreventativeControl(m.causes[0].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', ownA.id); // C_1: [ownA, shared]
      m.addCause({x: 150, y: 300});
      const ownB = m.addPreventativeControl(m.causes[1].id);
      m.attachExistingBarrier('preventativeBarrier', 'after', ownB.id, shared.id); // C_2: [ownB, shared]
      // Now reorder `shared` away from the TLE on BOTH lines, exactly like
      // ticking both Causes in the "Shift Away From TLE" picker:
      const line1 = m._lineFor(m.causes[0].id).id;
      const line2 = m._lineFor(m.causes[1].id).id;
      m.swapBarrierWithNeighbor([line1, line2], shared.id, false);
      // Lines are now C_1: [shared, ownA], C_2: [shared, ownB] -- shared,
      // sharing stops[0], but diverging at stops[1] into two separate boxes.
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


def test_a_tighter_shared_barrier_clusters_correctly_within_a_broader_shared_group(page):
    """Reported bug, reproduced with the demo's own topology: load the
    demo (C_1 -> PB_1 -> PB_3, C_2 -> PB_2 -> PB_3, C_3 -> PB_3 directly,
    C_4 bare), then attach C_4 to PB_2. C_2 and C_4 now privately share
    PB_2 (just the two of them), while C_1, C_2, C_3, and C_4 ALL
    separately share the later PB_3. orderByAdjacency used to sort a
    node's unvisited neighbours by original array index alone, which
    doesn't distinguish "this pair must be strictly adjacent" (PB_2, two
    participants) from "these four just need to be in the same general
    region" (PB_3, four participants) -- C_3 (index 2) got visited before
    C_4 (index 3) purely because of array order, landing between C_2 and
    C_4 and making PB_2's grown box balloon to cover C_3's own row even
    though C_3 was never attached to PB_2 at all. The tighter (fewer-
    participant) relationship must now win: C_2 and C_4 end up strictly
    adjacent, and PB_2's box must not reach C_3's row."""
    page.evaluate("""() => {
      window.__lastModel.loadFromJSON(Bowtie.DEMO_DATA);
      window.__lastModel.attachInputToPreventativeControl('C_4', 'PB_2');
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      const causeYs = Object.fromEntries(m.causes.map((c) => [c.nodeId, c.y]));
      const b = view.boundsById['PB_2'];
      return { causeYs, pb2Top: b.cy - b.h / 2, pb2Bottom: b.cy + b.h / 2 };
    }""")
    c3y = result["causeYs"]["C_3"]
    assert not (result["pb2Top"] < c3y < result["pb2Bottom"]), (
        "C_3's row must not fall inside PB_2's grown box -- C_3 was never attached to PB_2"
    )
    c2y, c4y = result["causeYs"]["C_2"], result["causeYs"]["C_4"]
    other_ys = [y for cid, y in result["causeYs"].items() if cid not in ("C_2", "C_4")]
    assert not any(min(c2y, c4y) < y < max(c2y, c4y) for y in other_ys), (
        "C_2 and C_4 (sharing PB_2 privately) must end up strictly adjacent, "
        "with no other Cause's row landing between them"
    )


def test_a_lone_barrier_shared_only_by_one_member_of_a_broader_group_stays_out_of_its_box(page):
    """Reported bug/regression, same demo topology as the test above but
    C_4 declines to inherit PB_2's continuation to PB_3 (chooses "Stop
    Here"), so C_4 ends up sharing ONLY PB_2 with C_2 -- unlike the test
    above, C_4 is NOT a member of PB_3's shared group at all here. The
    first fix for this bug (buildConsecutiveOrder) only merged hyperedges
    at the top level, so once PB_3's 3-way group (C_1, C_2, C_3) had
    already been built into one block, a smaller hyperedge fully NESTED
    inside that block (PB_2: just C_2 and C_4) was never revisited -- C_4
    stayed wherever plain array order put it, sandwiched inside PB_3's own
    grown box despite never being attached to PB_3. Every barrier's
    rendered box must only ever span rows that actually pass through it."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.loadFromJSON(Bowtie.DEMO_DATA);
      m.attachInputToPreventativeControl('C_4', 'PB_2', false); // "Stop Here"
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const view = window.__lastView;
      // Scoped to the active page only -- the demo is multi-page, and a
      // barrier's box on one page has no relationship to a Cause's row on
      // another page (they aren't even rendered together).
      const pageCauses = m.causes.filter((c) => c.pageId === 'PAGE_1');
      const pagePbs = m.preventativeBarriers.filter((pb) => pb.pageId === 'PAGE_1');
      const causeYs = Object.fromEntries(pageCauses.map((c) => [c.id, c.y]));
      const throughIds = Object.fromEntries(
        pagePbs.map((pb) => [pb.id, new Set(m.linesThrough(pb.id).map((l) => l.originId))])
      );
      const boundsById = {};
      for (const pb of pagePbs) boundsById[pb.id] = view.boundsById[pb.id];
      return { causeYs, throughIds: Object.fromEntries(
        Object.entries(throughIds).map(([id, s]) => [id, Array.from(s)])
      ), boundsById };
    }""")
    for pb_id, bounds in result["boundsById"].items():
        top = bounds["cy"] - bounds["h"] / 2
        bottom = bounds["cy"] + bounds["h"] / 2
        through = set(result["throughIds"][pb_id])
        for cause_id, y in result["causeYs"].items():
            if cause_id in through:
                continue
            assert not (top < y < bottom), (
                f"{cause_id}'s row must not fall inside {pb_id}'s grown box -- "
                f"{cause_id}'s line never passes through {pb_id}"
            )


def test_a_chain_of_overlapping_pairs_keeps_every_barriers_box_disjoint(page):
    """Reported bug: a barrier shared by a pair on one side of a chain, and
    that same shared barrier's two lines then diverge into two DIFFERENT
    further barriers, each of which is itself shared by a second member --
    O_1 and O_3 share MB_1, then O_1 continues to MB_2 (also shared with
    O_2) while O_3 continues to MB_3 (also shared with O_4). That's three
    overlapping pairs chained together: {O_1,O_3} via MB_1, {O_1,O_2} via
    MB_2, {O_3,O_4} via MB_3. buildConsecutiveOrder's promoteToEdge used to
    move a matching CHILD BLOCK to the merge edge as a whole without also
    promoting the actual shared member to that block's own edge -- so
    merging MB_3's pair repositioned MB_1's block next to O_4 without
    pushing O_3 (not O_1) to the boundary touching it, leaving the row
    order O_2, O_3, O_1, O_4 instead of a valid O_2, O_1, O_3, O_4 (or its
    mirror). That breaks BOTH MB_2 (O_1/O_2, no longer contiguous) and
    MB_3 (O_3/O_4) at once, and their grown boxes end up overlapping each
    other despite sharing no outcome at all."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200}); // O_1
      m.addMitigativeControl(m.outcomes[0].id); // MB_1 -- O_1: [MB_1]
      m.addMitigativeControl(m.outcomes[0].id); // MB_2 -- O_1: [MB_1, MB_2]

      m.addOutcome({x: 1200, y: 400}); // O_2
      m.attachOutputToMitigativeControl('MB_2', m.outcomes[1].id); // O_2: [MB_2]

      m.addOutcome({x: 1200, y: 600}); // O_3
      m.attachOutputToMitigativeControl('MB_1', m.outcomes[2].id, false); // "Stop Here" -- O_3: [MB_1]
      m.addMitigativeControl(m.outcomes[2].id); // MB_3 -- O_3: [MB_1, MB_3]

      m.addOutcome({x: 1200, y: 800}); // O_4
      m.attachOutputToMitigativeControl('MB_3', m.outcomes[3].id); // O_4: [MB_3]
    }""")
    auto_arrange(page)
    page.wait_for_timeout(150)

    result = page.evaluate("""() => {
      const view = window.__lastView;
      return { mb2: view.boundsById['MB_2'], mb3: view.boundsById['MB_3'] };
    }""")

    def spans(b):
        return b["cy"] - b["h"] / 2, b["cy"] + b["h"] / 2

    mb2_top, mb2_bot = spans(result["mb2"])
    mb3_top, mb3_bot = spans(result["mb3"])
    assert mb2_bot <= mb3_top or mb3_bot <= mb2_top, (
        f"MB_2 (O_1/O_2) and MB_3 (O_3/O_4) share no outcome and must not overlap: "
        f"MB_2 spans {(mb2_top, mb2_bot)}, MB_3 spans {(mb3_top, mb3_bot)}"
    )
