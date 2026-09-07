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
      return { stops: m._lineFor(cause.id).stops, pb1x: pb1.x, pb2x: pb2.x, pb1: pb1.id, pb2: pb2.id };
    }""")
    assert result["stops"] == [result["pb1"], result["pb2"]]
    assert result["pb2x"] > result["pb1x"], "'after' must land on the TLE side (larger x) of its anchor"


def test_insert_before_places_new_barrier_toward_origin(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      const pb1 = m.addPreventativeControl(cause.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'before', pb1.id);
      return { stops: m._lineFor(cause.id).stops, pb1x: pb1.x, pb2x: pb2.x, pb1: pb1.id, pb2: pb2.id };
    }""")
    assert result["stops"] == [result["pb2"], result["pb1"]], "'before' must splice ahead of the anchor in stops order"
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

      return {
        line1: m._lineFor(c1.id).stops, line2: m._lineFor(c2.id).stops,
        pb1: pb1.id, pbTarget: pbTarget.id,
      };
    }""")
    assert result["line1"] == [result["pb1"], result["pbTarget"]]
    assert result["line2"] == [result["pb1"]], "the sibling line sharing PB_1 must be left alone"


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


def test_attach_input_defaults_to_inheriting_downstream(page):
    """Original, always-on-before-this-option behavior: attaching a bare
    Cause to a barrier that already continues further (for another Cause)
    follows that same continuation when `inheritDownstream` is omitted."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [PB_1, PB_2]
      m.addCause({x: 150, y: 300});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id); // no third arg
      return { stops: m._lineFor(m.causes[1].id).stops, pb1: pb1.id, pb2: pb2.id };
    }""")
    assert result["stops"] == [result["pb1"], result["pb2"]]


def test_attach_input_declining_inherit_stops_at_the_target_barrier(page):
    """Reported bug: attaching a bare Cause to a barrier that already
    continues further for another Cause must NOT be forced to also adopt
    that continuation -- passing inheritDownstream=false keeps the new
    line's own (in this case empty) continuation, ending at the target
    barrier and going straight to the TLE from there."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [PB_1, PB_2]
      m.addCause({x: 150, y: 300});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id, false);
      return { stops: m._lineFor(m.causes[1].id).stops, pb1: pb1.id };
    }""")
    assert result["stops"] == [result["pb1"]], "declining inherit must end the line at the target barrier, not adopt PB_2 too"


def test_attach_input_declining_inherit_keeps_the_lines_own_prior_chain(page):
    """A Cause that already had its own further barriers before this
    attach keeps THOSE when declining to inherit the target's -- not just
    a bare dead-end at the target. Re-pointing C_2's existing chain
    (currently through its own barrier) at C_1's first barrier (which
    continues further, for C_1) while declining that continuation must
    keep C_2's own further barrier, not adopt C_1's."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const pb1Continuation = m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [pb1, pb1Continuation]
      m.addCause({x: 150, y: 300});
      const ownPb = m.addPreventativeControl(m.causes[1].id); // C_2: [ownPb]
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id, false);
      return { stops: m._lineFor(m.causes[1].id).stops, pb1: pb1.id, ownPb: ownPb.id, pb1Continuation: pb1Continuation.id };
    }""")
    assert result["stops"] == [result["pb1"], result["ownPb"]]
    assert result["pb1Continuation"] not in result["stops"], "must not adopt PB_1's own continuation"


def test_attach_output_inherits_downstream_by_default(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 90});
      const mb1 = m.addMitigativeControl(m.outcomes[0].id);
      const mb2 = m.addMitigativeControl(m.outcomes[0].id); // O_1: [mb1, mb2]
      m.addOutcome({x: 1200, y: 300});
      m.attachOutputToMitigativeControl(mb1.id, m.outcomes[1].id);
      return { stops: m._lineFor(m.outcomes[1].id).stops, mb1: mb1.id, mb2: mb2.id };
    }""")
    assert result["stops"] == [result["mb1"], result["mb2"]]


def test_attach_output_declining_inherit_stops_at_the_target_barrier(page):
    """Mirrors the Cause-side declined case for Outcomes/MBs."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addOutcome({x: 1200, y: 90});
      const mb1 = m.addMitigativeControl(m.outcomes[0].id);
      m.addMitigativeControl(m.outcomes[0].id); // O_1: [mb1, mb2]
      m.addOutcome({x: 1200, y: 300});
      m.attachOutputToMitigativeControl(mb1.id, m.outcomes[1].id, false);
      return { stops: m._lineFor(m.outcomes[1].id).stops, mb1: mb1.id };
    }""")
    assert result["stops"] == [result["mb1"]]


def test_donor_continuation_is_empty_when_the_target_has_no_further_barrier(page):
    """The read-only lookup ContextMenuController uses to decide whether
    to even ask the user must return empty when the target barrier is
    already a terminal stop for every line through it -- there's nothing
    to inherit either way."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id); // C_1: [PB_1], nothing further
      return m._donorContinuation(pb1.id, 'not-a-real-line-id');
    }""")
    assert result == []


def test_connect_directly_to_tle_middle_gap_keeps_origin_side(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      const pb1 = m.addPreventativeControl(c.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      m.insertBarrier('preventativeBarrier', 'after', pb2.id);
      m.connectLineDirectlyToTle(m._lineFor(c.id).id, pb1.id);
      return { stops: m._lineFor(c.id).stops, pb1: pb1.id };
    }""")
    assert result["stops"] == [result["pb1"]]


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
      const mb1 = m.addMitigativeControl(o.id); // nearest outcome
      const mb2 = m.addMitigativeControl(o.id);
      m.addMitigativeControl(o.id); // nearest TLE
      m.connectLineDirectlyToTle(m._lineFor(o.id).id, mb2.id);
      return { stops: m._lineFor(o.id).stops, mb1: mb1.id, mb2: mb2.id };
    }""")
    assert result["stops"] == [result["mb1"], result["mb2"]], "must drop the TLE-nearest barrier and keep the other two"


def test_orphaned_barrier_after_truncate_is_warned(page):
    warnings = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const c = m.causes[0];
      const pb = m.addPreventativeControl(c.id);
      m.connectLineDirectlyToTle(m._lineFor(c.id).id, null);
      return { warningIds: m.getWarnings().map(w => w.id), pb: pb.id };
    }""")
    assert warnings["warningIds"] == [warnings["pb"]]


def test_swap_barrier_with_neighbor_reorders_the_line_toward_the_tle(page):
    """Manual per-barrier path reorder (the escape hatch for whatever rare
    case auto-arrange's own depth heuristic still gets wrong, and the
    literal thing "shift toward/away from the TLE" should do): swapping
    PB_1 toward the TLE in a C -> PB_1 -> PB_2 -> TLE chain must swap it
    with PB_2 in the Line's own `stops` -- an actual topology change that
    survives a future Auto-arrange, not a cosmetic position nudge a future
    Auto-arrange would immediately undo."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      const pb1 = m.addPreventativeControl(cause.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      const line = m._lineFor(cause.id);
      m.swapBarrierWithNeighbor(line.id, pb1.id, true);
      return { stops: line.stops, pb1x: pb1.x, pb2x: pb2.x, pb1: pb1.id, pb2: pb2.id };
    }""")
    assert result["stops"] == [result["pb2"], result["pb1"]], "the swap must actually reorder the line's stops"
    assert result["pb1x"] > result["pb2x"], (
        "the two barriers' x should swap too, for immediate visual feedback consistent with the new order"
    )


def test_swap_barrier_with_neighbor_away_from_tle_is_the_mirror(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      const pb1 = m.addPreventativeControl(cause.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      const line = m._lineFor(cause.id);
      m.swapBarrierWithNeighbor(line.id, pb2.id, false);
      return { stops: line.stops, pb1: pb1.id, pb2: pb2.id };
    }""")
    assert result["stops"] == [result["pb2"], result["pb1"]]


def test_swap_barrier_with_neighbor_is_a_noop_at_the_end_of_the_chain(page):
    """A barrier already at the TLE-adjacent end of a line has no neighbour
    further toward the TLE to swap with -- must do nothing, not throw or
    corrupt the line."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb = m.addPreventativeControl(m.causes[0].id);
      const line = m._lineFor(m.causes[0].id);
      const before = { stops: line.stops.slice(), x: pb.x };
      m.swapBarrierWithNeighbor(line.id, pb.id, true); // already the only/last stop
      return { before, after: { stops: line.stops.slice(), x: pb.x } };
    }""")
    assert result["after"] == result["before"]


def test_swap_barrier_with_neighbor_only_touches_the_named_line(page):
    """Two Causes sharing a downstream barrier each have their own private
    first barrier. Reordering the shared barrier within C_1's own line
    must not perturb C_2's line, even though both lines pass through it."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [PB_1, shared]
      m.addCause({x: 150, y: 300});
      const pb2 = m.addPreventativeControl(m.causes[1].id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb2.id, shared.id); // C_2: [PB_2, shared]
      const line1 = m._lineFor(m.causes[0].id);
      const line2 = m._lineFor(m.causes[1].id);
      const before2 = line2.stops.slice();
      m.swapBarrierWithNeighbor(line1.id, shared.id, false); // shift shared away from the TLE, within C_1's line only
      return { stops1: line1.stops, stops2: line2.stops, before2, pb1: pb1.id, pb2: pb2.id, shared: shared.id };
    }""")
    assert result["stops1"] == [result["shared"], result["pb1"]], "C_1's line must be reordered"
    assert result["stops2"] == result["before2"], "the other line sharing this barrier must be untouched"


def test_swap_barrier_with_neighbor_is_undoable(page):
    # undo() replaces window.__lastModel.lines wholesale (loadFromJSON), so
    # the Line must be re-fetched after undo rather than reusing a
    # reference captured before it -- that reference would still point at
    # the old (pre-undo) Line object and silently show stale data.
    result = page.evaluate("""() => {
      const undo = window.__lastUndo;
      const m = undo.model;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      const pb1 = m.addPreventativeControl(cause.id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      const before = window.__lastModel._lineFor(cause.id).stops.slice();
      const lineId = window.__lastModel._lineFor(cause.id).id;
      m.swapBarrierWithNeighbor(lineId, pb1.id, true);
      const swapped = window.__lastModel._lineFor(cause.id).stops.slice();
      undo.undo();
      const restored = window.__lastModel._lineFor(cause.id).stops.slice();
      return { before, swapped, restored, pb1: pb1.id, pb2: pb2.id };
    }""")
    assert result["swapped"] == [result["pb2"], result["pb1"]]
    assert result["restored"] == result["before"]


def test_swap_barrier_with_neighbor_batches_multiple_lines_in_one_call(page):
    """Reported bug: reordering a shared barrier against two DIFFERENT
    neighbours (one per line) by calling swapBarrierWithNeighbor once per
    selected line let each call's "swap x with my neighbour" step corrupt
    the previous call's result -- the barrier ended up landing exactly on
    top of an unrelated third barrier. Passing every line to ONE call must
    reorder each line correctly and, since the two neighbours differ,
    leave `x` on all three barriers untouched (no single unambiguous new
    position exists) rather than guessing wrong."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [PB_1, shared]
      m.addCause({x: 150, y: 300});
      const pb2 = m.addPreventativeControl(m.causes[1].id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb2.id, shared.id); // C_2: [PB_2, shared]
      const line1 = m._lineFor(m.causes[0].id);
      const line2 = m._lineFor(m.causes[1].id);
      const xBefore = { pb1: pb1.x, pb2: pb2.x, shared: shared.x };
      m.swapBarrierWithNeighbor([line1.id, line2.id], shared.id, false);
      return {
        stops1: line1.stops, stops2: line2.stops,
        pb1: pb1.id, pb2: pb2.id, shared: shared.id,
        xBefore, xAfter: { pb1: pb1.x, pb2: pb2.x, shared: shared.x },
      };
    }""")
    assert result["stops1"] == [result["shared"], result["pb1"]]
    assert result["stops2"] == [result["shared"], result["pb2"]]
    assert result["xAfter"] == result["xBefore"], (
        "with two different neighbours in the same batch, no position is well-defined -- "
        "x must be left exactly as it was, not guessed (and definitely not corrupted)"
    )


def test_swap_barrier_with_neighbor_batch_still_swaps_x_when_all_lines_agree(page):
    """Mirrors the case above: when every line in the batch shares the
    SAME neighbour, that neighbour is unambiguous, so the immediate
    visual x-swap should still apply -- the ambiguity guard must not
    become overly conservative and silently stop doing this in the common
    case."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const pb2 = m.insertBarrier('preventativeBarrier', 'after', pb1.id); // C_1: [PB_1, PB_2]
      m.addCause({x: 150, y: 300});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id); // C_2 also: [PB_1, PB_2]
      const line1 = m._lineFor(m.causes[0].id);
      const line2 = m._lineFor(m.causes[1].id);
      const before = { pb1: pb1.x, pb2: pb2.x };
      m.swapBarrierWithNeighbor([line1.id, line2.id], pb1.id, true);
      return { before, after: { pb1: pb1.x, pb2: pb2.x } };
    }""")
    assert result["after"]["pb1"] == result["before"]["pb2"]
    assert result["after"]["pb2"] == result["before"]["pb1"]


def test_swap_barrier_with_neighbor_batch_is_one_undo_step(page):
    result = page.evaluate("""() => {
      const undo = window.__lastUndo;
      const m = undo.model;
      m.addCause({x: 150, y: 90});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      const shared = m.insertBarrier('preventativeBarrier', 'after', pb1.id);
      m.addCause({x: 150, y: 300});
      const pb2 = m.addPreventativeControl(m.causes[1].id);
      m.attachExistingBarrier('preventativeBarrier', 'after', pb2.id, shared.id);
      const before = {
        stops1: window.__lastModel._lineFor(window.__lastModel.causes[0].id).stops.slice(),
        stops2: window.__lastModel._lineFor(window.__lastModel.causes[1].id).stops.slice(),
      };
      const line1Id = window.__lastModel._lineFor(window.__lastModel.causes[0].id).id;
      const line2Id = window.__lastModel._lineFor(window.__lastModel.causes[1].id).id;
      m.swapBarrierWithNeighbor([line1Id, line2Id], shared.id, false);
      undo.undo(); // must revert BOTH lines' reordering in a single undo
      return {
        before,
        restored: {
          stops1: window.__lastModel._lineFor(window.__lastModel.causes[0].id).stops.slice(),
          stops2: window.__lastModel._lineFor(window.__lastModel.causes[1].id).stops.slice(),
        },
      };
    }""")
    assert result["restored"] == result["before"]
