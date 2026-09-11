"""Referential-integrity checking on document import (design review
finding 03). A version-correct export can still be internally broken --
e.g. a placement whose nodeId no longer exists in the library, produced by
hand-editing an exported file, or a bug elsewhere that drops a node without
its placements. Before this existed that reproduced as: an uncaught page
error, no message to the user, and a half-mutated model. See
Bowtie.DocumentSerializer.validate/loadFromJSON.
"""
import json


def _sample_export_with_one_cause(page):
    return page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      return m.toJSON();
    }""")


# --- Model-level: DocumentSerializer.validate / loadFromJSON ---------------

def test_validate_rejects_a_placement_referencing_a_deleted_node(page):
    result = page.evaluate("""() => {
      const data = window.__lastModel.toJSON();
      data.causes.push({ id: 'PLACEMENT_99', nodeId: 'C_999', x: 1, y: 1, w: 1, h: 1, pageId: data.pages[0].id });
      const fresh = Bowtie.BowtieModel.fromJSON(data);
      return Bowtie.DocumentSerializer.validate(fresh);
    }""")
    assert result["ok"] is False
    assert "C_999" in result["error"]


def test_validate_rejects_a_line_stop_that_does_not_resolve(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const data = m.toJSON();
      data.lines[0].stops.push('PLACEMENT_999');
      const fresh = Bowtie.BowtieModel.fromJSON(data);
      return Bowtie.DocumentSerializer.validate(fresh);
    }""")
    assert result["ok"] is False
    assert "PLACEMENT_999" in result["error"]


def test_validate_accepts_a_well_formed_document(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
      const fresh = Bowtie.BowtieModel.fromJSON(m.toJSON());
      return Bowtie.DocumentSerializer.validate(fresh);
    }""")
    assert result == {"ok": True}


def test_load_from_json_throws_and_changes_nothing_on_a_broken_document(page):
    """The crux of finding 03's fix: loadFromJSON builds `fresh`, validates
    it, and only assigns onto the live model if that passes -- so a bad
    file must leave the live model exactly as it was, not half-updated."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const before = m.toJSON();

      const broken = m.toJSON();
      broken.name = 'Corrupted Import';
      broken.causes.push({ id: 'PLACEMENT_99', nodeId: 'C_999', x: 1, y: 1, w: 1, h: 1, pageId: broken.pages[0].id });

      let threw = false;
      try {
        m.loadFromJSON(broken);
      } catch {
        threw = true;
      }
      const after = m.toJSON();
      return { threw, unchanged: JSON.stringify(after) === JSON.stringify(before) };
    }""")
    assert result["threw"] is True
    assert result["unchanged"] is True


# --- Controller-level: the real import path shows a message, not a crash ---

def test_a_corrupt_import_shows_a_message_and_leaves_the_canvas_untouched(page):
    data = _sample_export_with_one_cause(page)
    data["outcomes"].append({
        "id": "PLACEMENT_99", "nodeId": "O_999", "x": 1200, "y": 200, "w": 140, "h": 60,
        "pageId": data["pages"][0]["id"],
    })
    data["lines"].append({
        "id": "LINE_99", "originType": "outcome", "originId": "PLACEMENT_99",
        "stops": [], "pageId": data["pages"][0]["id"],
    })

    page.evaluate(
        """(text) => {
          window.showOpenFilePicker = async () => [{
            getFile: async () => ({ text: async () => text }),
          }];
        }""",
        json.dumps(data),
    )
    page.click("#menu-trigger-file")
    page.click("#btn-import-json")
    page.wait_for_timeout(150)

    assert page.locator(".modal-title", has_text="Invalid File").count() == 1
    # Read through window.__lastUndo.rawModel, not window.__lastModel --
    # DocumentSerializer.fromJSON constructs a throwaway BowtieModel to
    # validate against, and the conftest capture trick re-stamps
    # window.__lastModel onto THAT instance too, even when it's discarded
    # a moment later for failing validation. __lastUndo.rawModel is the
    # one handle that's only ever set once, at app startup.
    state = page.evaluate("""() => ({
      causeCount: window.__lastUndo.rawModel.causes.length,
      outcomeCount: window.__lastUndo.rawModel.outcomes.length,
    })""")
    assert state["causeCount"] == 1
    assert state["outcomeCount"] == 0
