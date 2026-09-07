"""BowtieModel's core splice/attach/truncate primitives.

This is the highest-value coverage in the whole suite: the reversed-storage
convention for Outcome lines (stops stored nearest-Outcome-first, opposite
of Cause lines) makes direction/sign mistakes easy and quiet — several bugs
fixed in this project surfaced exactly this way. These tests exercise the
model directly via `window.__lastModel`, without going through any UI
click-targeting, so they stay fast and immune to rendering changes.
"""


def test_insert_after_places_new_barrier_toward_tle(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      const pb1 = m.addPreventativeControl(cause.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      return { stops: m._lineFor(cause.id).stops, pb1x: pb1.x, pb2x: pb2.x };
    }""")
    assert result["stops"] == ["PB_1", "PB_2"]
    assert result["pb2x"] > result["pb1x"], "'after' must land on the TLE side (larger x) of its anchor"


def test_insert_before_places_new_barrier_toward_origin(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      const pb1 = m.addPreventativeControl(cause.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'before', pb1.id);
      return { stops: m._lineFor(cause.id).stops, pb1x: pb1.x, pb2x: pb2.x };
    }""")
    assert result["stops"] == ["PB_2", "PB_1"], "'before' must splice ahead of the anchor in stops order"
    assert result["pb2x"] < result["pb1x"], "'before' must land on the origin side (smaller x) of its anchor"


def test_mitigative_after_before_mirror_preventative(page):
    """MB's 'after'/'before' map to the OPPOSITE splice direction from PB's
    (see SPLICE_DIRECTION in BowtieModel.js) — 'after' still means "further
    from the origin", but for an Outcome that's toward the outcome, not
    toward the TLE."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      const outcome = m.outcomes[0];
      const mb1 = m.addMitigativeControl(outcome.id);
      const mbAfter = m.insertBarrier('mitigativeBarrier', 'after', mb1.id);
      const mbBefore = m.insertBarrier('mitigativeBarrier', 'before', mb1.id);
      return {
        stops: m._lineFor(outcome.id).stops,
        mb1x: mb1.x, afterX: mbAfter.x, beforeX: mbBefore.x,
      };
    }""")
    assert result["afterX"] > result["mb1x"], "MB 'after' moves toward the Outcome (larger x)"
    assert result["beforeX"] < result["mb1x"], "MB 'before' moves toward the TLE (smaller x)"


def test_attach_existing_barrier_is_scoped_to_one_line(page):
    """Two Causes sharing a barrier as their tail, then attaching ONE of
    those lines' segment into a different existing barrier, must leave the
    other Cause's line untouched — this is the behavior bug2 fixed."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c1 = m.causes[0];
      const pb1 = m.addPreventativeControl(c1.id);
      m.addCause({x: 150, y: 400});
      const c2 = m.causes[1];
      m.attachInputToPreventativeControl(c2.id, pb1.id); // both lines now end at pb1
      m.addCause({x: 150, y: 600});
      const pbTarget = m.addPreventativeControl(m.causes[2].id);

      const line1 = m._lineFor(c1.id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb1.id, pbTarget.id, [line1.id]);

      return { line1: m._lineFor(c1.id).stops, line2: m._lineFor(c2.id).stops };
    }""")
    assert result["line1"] == ["PB_1", "PB_2"]
    assert result["line2"] == ["PB_1"], "the sibling line sharing PB_1 must be left alone"


def test_attach_existing_barrier_rejects_cycle(page):
    message = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      const pb1 = m.addPreventativeControl(c.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      try {
        m.attachExistingBarrier('preventativeBarrier', 'after', pb1.id, pb2.id);
        return null;
      } catch (e) { return e.message; }
    }""")
    assert message and "cycle" in message


def test_connect_directly_to_tle_middle_gap_keeps_origin_side(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      const pb1 = m.addPreventativeControl(c.id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // PB_2
      m.insertBarrier('preventativeBarrier', 'after', 'PB_2'); // PB_3
      m.connectLineDirectlyToTle(m._lineFor(c.id).id, 'PB_1');
      return m._lineFor(c.id).stops;
    }""")
    assert result == ["PB_1"]


def test_connect_directly_to_tle_null_drops_everything(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      m.addPreventativeControl(c.id);
      m.connectLineDirectlyToTle(m._lineFor(c.id).id, null);
      return m._lineFor(c.id).stops;
    }""")
    assert result == []


def test_connect_directly_to_tle_outcome_side_keep_through_barrier(page):
    """Outcome lines store stops nearest-Outcome-first (the opposite of
    Cause lines): repeated addMitigativeControl calls always append at the
    TLE-facing tail, so MB_1/MB_2/MB_3 end up nearest-outcome to
    nearest-TLE in that order. connectLineDirectlyToTle's `keepThroughId`
    must still mean "keep up to and including this barrier" in that
    reversed frame — keeping through MB_2 drops only MB_3."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      const o = m.outcomes[0];
      m.addMitigativeControl(o.id); // MB_1, nearest outcome
      m.addMitigativeControl(o.id); // MB_2
      m.addMitigativeControl(o.id); // MB_3, nearest TLE
      m.connectLineDirectlyToTle(m._lineFor(o.id).id, 'MB_2');
      return m._lineFor(o.id).stops;
    }""")
    assert result == ["MB_1", "MB_2"], "must drop MB_3 (nearest the TLE) and keep MB_1, MB_2"


def test_orphaned_barrier_after_truncate_is_warned(page):
    warnings = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      m.addPreventativeControl(c.id); // PB_1
      m.connectLineDirectlyToTle(m._lineFor(c.id).id, null);
      return m.getWarnings().map(w => w.id);
    }""")
    assert warnings == ["PB_1"]


def test_nudge_barrier_column_moves_preventative_barrier_toward_and_away_from_tle(page):
    """Manual per-barrier column shunt (the escape hatch for whatever rare
    case auto-arrange's own depth heuristic still gets wrong): a
    PreventativeBarrier sits left of the TLE (Causes -> TLE, ascending x),
    so "toward the TLE" must increase x and "away from the TLE" must
    decrease it, by exactly `colSpacing`."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb = m.addPreventativeControl(m.causes[0].id);
      const before = pb.x;
      m.nudgeBarrierColumn('preventativeBarrier', pb.id, true, 320);
      const towardTle = pb.x;
      m.nudgeBarrierColumn('preventativeBarrier', pb.id, false, 320);
      const away = pb.x;
      return { before, towardTle, away };
    }""")
    assert result["towardTle"] == result["before"] + 320
    assert result["away"] == result["before"]


def test_nudge_barrier_column_moves_mitigative_barrier_the_opposite_direction(page):
    """Mirrors the Preventative case: a MitigativeBarrier sits right of the
    TLE (TLE -> Outcomes, ascending x), so "toward the TLE" must DECREASE x
    instead."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 200});
      const mb = m.addMitigativeControl(m.outcomes[0].id);
      const before = mb.x;
      m.nudgeBarrierColumn('mitigativeBarrier', mb.id, true, 320);
      const towardTle = mb.x;
      m.nudgeBarrierColumn('mitigativeBarrier', mb.id, false, 320);
      const away = mb.x;
      return { before, towardTle, away };
    }""")
    assert result["towardTle"] == result["before"] - 320
    assert result["away"] == result["before"]


def test_nudge_barrier_column_is_undoable(page):
    result = page.evaluate("""() => {
      const undo = window.__lastUndo;
      const m = undo.model;
      m.addCause({x: 150, y: 200});
      const pb = m.addPreventativeControl(m.causes[0].id);
      const before = pb.x;
      m.nudgeBarrierColumn('preventativeBarrier', pb.id, true, 320);
      const nudged = window.__lastModel.findById(pb.id).x;
      undo.undo();
      const restored = window.__lastModel.findById(pb.id).x;
      return { before, nudged, restored };
    }""")
    assert result["nudged"] == result["before"] + 320
    assert result["restored"] == result["before"]
