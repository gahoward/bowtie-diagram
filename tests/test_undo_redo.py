"""Undo/redo: snapshot-based, built on BowtieModel.toJSON()/loadFromJSON()
round-tripping exactly (see test_import_export.py). `window.__lastUndo.model`
is the Proxy that auto-snapshots before a mutating call — tests that mutate
`window.__lastModel` (the raw model) directly bypass that, same as it would
in the app if a controller somehow got the raw model instead of the proxy.
"""


def _undo_redo_disabled(page):
    return page.evaluate(
        "() => ({ undo: document.getElementById('btn-undo').disabled, "
        "redo: document.getElementById('btn-redo').disabled })"
    )


def test_buttons_start_disabled(page):
    state = _undo_redo_disabled(page)
    assert state["undo"] is True
    assert state["redo"] is True


def test_undo_then_redo_round_trips_through_an_action(page):
    page.evaluate("() => { window.__lastUndo.model.addCause({x: 150, y: 200}); }")
    assert page.evaluate("() => window.__lastModel.causes.length") == 1
    assert _undo_redo_disabled(page) == {"undo": False, "redo": True}

    page.evaluate("() => window.__lastUndo.undo();")
    assert page.evaluate("() => window.__lastModel.causes.length") == 0
    assert _undo_redo_disabled(page) == {"undo": True, "redo": False}

    page.evaluate("() => window.__lastUndo.redo();")
    assert page.evaluate("() => window.__lastModel.causes.length") == 1
    assert _undo_redo_disabled(page) == {"undo": False, "redo": True}


def test_new_action_after_undo_discards_redo_history(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addCause({x: 150, y: 200});
      m.addCause({x: 150, y: 400});
    }""")
    page.evaluate("() => window.__lastUndo.undo();")  # back to 1 cause, redo has the 2nd
    assert _undo_redo_disabled(page)["redo"] is False

    page.evaluate("() => { window.__lastUndo.model.addOutcome({x: 1200, y: 200}); }")
    assert _undo_redo_disabled(page)["redo"] is True  # discarded, not just unused

    state = page.evaluate("() => ({ causes: window.__lastModel.causes.length, outcomes: window.__lastModel.outcomes.length })")
    assert state == {"causes": 1, "outcomes": 1}


def test_failed_mutation_does_not_create_a_phantom_undo_step(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.insertBarrier('preventativeBarrier', 'after', pb1.id); // PB_2
    }""")
    depth_before = page.evaluate("() => window.__lastUndo.undoStack.length")

    threw = page.evaluate("""() => {
      try {
        // Attaching PB_1 into a line that already contains it is a cycle.
        window.__lastUndo.model.attachExistingBarrier('preventativeBarrier', 'after', 'PB_2', 'PB_1');
        return false;
      } catch (e) { return true; }
    }""")
    assert threw is True
    depth_after = page.evaluate("() => window.__lastUndo.undoStack.length")
    assert depth_after == depth_before, "a caught model error must not push an undo step"


def test_stack_is_capped_at_fifty(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      for (let i = 0; i < 55; i += 1) m.addCause({ x: 150, y: 100 + i });
    }""")
    assert page.evaluate("() => window.__lastUndo.undoStack.length") == 50
    assert page.evaluate("() => window.__lastModel.causes.length") == 55

    page.evaluate("""() => {
      for (let i = 0; i < 50; i += 1) window.__lastUndo.undo();
    }""")
    # Only the last 50 additions are undoable; the first 5 Causes remain.
    assert page.evaluate("() => window.__lastModel.causes.length") == 5
    assert _undo_redo_disabled(page)["undo"] is True


def test_drag_gesture_is_one_undo_step_not_one_per_move(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addCause({x: 150, y: 200});
    }""")
    depth_after_add = page.evaluate("() => window.__lastUndo.undoStack.length")

    node = page.locator('.node.cause').first
    box = node.bounding_box()
    start_x, start_y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    for i in range(6):
        page.mouse.move(start_x, start_y + 5 * (i + 1))
    page.mouse.up()
    page.wait_for_timeout(100)

    depth_after_drag = page.evaluate("() => window.__lastUndo.undoStack.length")
    assert depth_after_drag == depth_after_add + 1, "one whole drag gesture must be exactly one undo step"

    moved_y = page.evaluate("() => window.__lastModel.causes[0].y")
    assert moved_y != 200
    page.evaluate("() => window.__lastUndo.undo();")
    assert page.evaluate("() => window.__lastModel.causes[0].y") == 200


def test_import_resets_undo_and_redo_history(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addCause({x: 150, y: 200});
      m.addCause({x: 150, y: 400});
    }""")
    page.evaluate("() => window.__lastUndo.undo();")  # leave something in both stacks
    assert page.evaluate(
        "() => window.__lastUndo.undoStack.length > 0 && window.__lastUndo.redoStack.length > 0"
    )

    page.evaluate("""() => {
      const data = window.__lastModel.toJSON();
      window.__lastModel.loadFromJSON(data);
      window.__lastUndo.reset();
    }""")
    assert page.evaluate("() => window.__lastUndo.undoStack.length") == 0
    assert page.evaluate("() => window.__lastUndo.redoStack.length") == 0
    assert _undo_redo_disabled(page) == {"undo": True, "redo": True}


def test_keyboard_shortcuts_trigger_undo_and_redo(page):
    page.evaluate("() => { window.__lastUndo.model.addCause({x: 150, y: 200}); }")
    assert page.evaluate("() => window.__lastModel.causes.length") == 1

    page.keyboard.press("Control+z")
    page.wait_for_timeout(50)
    assert page.evaluate("() => window.__lastModel.causes.length") == 0

    page.keyboard.press("Control+y")
    page.wait_for_timeout(50)
    assert page.evaluate("() => window.__lastModel.causes.length") == 1


def test_clicking_a_node_to_inspect_it_does_not_touch_undo_redo_history(page):
    """architecture review finding: DragController used to fire
    `onDragStart` (undo.snapshot()) unconditionally on pointerdown, before
    any movement was observed — so FocusController's plain "click a
    Cause/Outcome to dim unrelated elements" (explicitly non-mutating)
    silently pushed a spurious snapshot AND wiped the entire redo stack on
    every ordinary inspection click. DragController._onPointerDown now only
    promotes to an actual drag (and fires onDragStart) once movement crosses
    a small pixel threshold, so a plain click-with-no-movement must leave
    undo/redo state completely untouched."""
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addCause({x: 150, y: 200});
      m.addCause({x: 150, y: 400});
    }""")
    page.evaluate("() => window.__lastUndo.undo();")  # 1 undo-able step left, 1 redo-able step available
    before = page.evaluate(
        "() => ({ undo: window.__lastUndo.undoStack.length, redo: window.__lastUndo.redoStack.length })"
    )
    assert before["redo"] > 0, "test setup should have left something redo-able"

    # A plain click (pointerdown immediately followed by pointerup at the
    # same position, no movement) on a Cause — purely inspecting it via
    # FocusController, never intended to mutate anything.
    page.locator("#bowtie-canvas .node.cause").first.click()
    page.wait_for_timeout(80)

    after = page.evaluate(
        "() => ({ undo: window.__lastUndo.undoStack.length, redo: window.__lastUndo.redoStack.length })"
    )
    assert after == before, "a plain inspection click must not push an undo snapshot or clear redo history"
