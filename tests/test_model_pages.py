"""BowtieModel's multi-page primitives: pages array, page CRUD, the
per-page filter helpers, id-uniqueness and findById across pages, and the
per-page getPageJSON()/loadPageFromJSON() snapshot pair the undo redesign
is built on. Exercises the model directly via `window.__lastModel`, the
same style as test_model_splicing.py, so this stays fast and immune to
rendering changes.

The `page` fixture already has exactly one page (BowtieModel's
constructor auto-creates it — see docs/multi_page_progress.md's Phase 1
notes) before any of these tests add more.
"""


def test_add_page_creates_own_tle_and_hazard_with_no_id_collision(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const firstPage = m.pages[0];
      const second = m.addPage({ name: 'Second Page', description: 'a desc' });
      return {
        pageCount: m.pages.length,
        name: second.name,
        description: second.description,
        tleId: second.topLevelEvent.id,
        hazardId: second.hazard.id,
        firstTleId: firstPage.topLevelEvent.id,
        firstHazardId: firstPage.hazard.id,
      };
    }""")
    assert result["pageCount"] == 2
    assert result["name"] == "Second Page"
    assert result["description"] == "a desc"
    assert result["tleId"] != result["firstTleId"]
    assert result["hazardId"] != result["firstHazardId"]


def test_rename_page_updates_metadata_only(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const before = m.pages[0];
      const tleName = before.topLevelEvent.name;
      const hazardName = before.hazard.name;
      m.addCause({x: 150, y: 200, pageId: before.id});

      m.renamePage(before.id, { name: 'Renamed', description: 'New desc' });

      const after = m.getPage(before.id);
      return {
        name: after.name,
        description: after.description,
        tleNameUnchanged: after.topLevelEvent.name === tleName,
        hazardNameUnchanged: after.hazard.name === hazardName,
        causeCount: m.causesForPage(before.id).length,
      };
    }""")
    assert result["name"] == "Renamed"
    assert result["description"] == "New desc"
    assert result["tleNameUnchanged"] is True
    assert result["hazardNameUnchanged"] is True
    assert result["causeCount"] == 1


def test_delete_page_cascades_and_leaves_other_pages_untouched(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page1Id = m.pages[0].id;
      const page2Id = m.addPage({ name: 'Page Two' }).id;
      m.addCause({x: 150, y: 200, pageId: page1Id});
      m.addCause({x: 150, y: 200, pageId: page2Id});
      m.addOutcome({x: 1200, y: 200, pageId: page2Id});

      m.deletePage(page2Id);

      return {
        page1Id,
        remainingPageIds: m.pages.map((p) => p.id),
        causePages: m.causes.map((c) => c.pageId),
        outcomeCount: m.outcomes.length,
        lineCount: m.lines.length,
      };
    }""")
    assert result["remainingPageIds"] == [result["page1Id"]]
    assert result["causePages"] == [result["page1Id"]], "page two's cause must be gone, page one's must survive"
    assert result["outcomeCount"] == 0, "page two's only outcome must be gone"
    assert result["lineCount"] == 1, "only page one's cause's own line should remain"


def test_delete_page_throws_on_last_remaining_page(page):
    threw = page.evaluate("""() => {
      const m = window.__lastModel;
      try {
        m.deletePage(m.pages[0].id);
        return false;
      } catch (e) { return true; }
    }""")
    assert threw is True


def test_for_page_filters_return_only_that_pages_elements(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page1Id = m.pages[0].id;
      const page2Id = m.addPage({ name: 'Page Two' }).id;
      m.addCause({x: 150, y: 200, pageId: page1Id});
      m.addCause({x: 150, y: 200, pageId: page2Id});
      m.addOutcome({x: 1200, y: 200, pageId: page1Id});
      m.addOutcome({x: 1200, y: 200, pageId: page2Id});
      m.addPreventativeControl(m.causesForPage(page1Id)[0].id);
      m.addPreventativeControl(m.causesForPage(page2Id)[0].id);
      m.addMitigativeControl(m.outcomesForPage(page1Id)[0].id);
      m.addMitigativeControl(m.outcomesForPage(page2Id)[0].id);

      return {
        p1Causes: m.causesForPage(page1Id).length,
        p2Causes: m.causesForPage(page2Id).length,
        p1Outcomes: m.outcomesForPage(page1Id).length,
        p2Outcomes: m.outcomesForPage(page2Id).length,
        p1PBs: m.preventativeBarriersForPage(page1Id).map((b) => b.id),
        p2PBs: m.preventativeBarriersForPage(page2Id).map((b) => b.id),
        p1MBs: m.mitigativeBarriersForPage(page1Id).map((b) => b.id),
        p2MBs: m.mitigativeBarriersForPage(page2Id).map((b) => b.id),
        p1Lines: m.linesForPage(page1Id).length,
        p2Lines: m.linesForPage(page2Id).length,
      };
    }""")
    assert result["p1Causes"] == 1 and result["p2Causes"] == 1
    assert result["p1Outcomes"] == 1 and result["p2Outcomes"] == 1
    assert len(result["p1PBs"]) == 1 and len(result["p2PBs"]) == 1
    assert result["p1PBs"][0] != result["p2PBs"][0]
    assert len(result["p1MBs"]) == 1 and len(result["p2MBs"]) == 1
    assert result["p1MBs"][0] != result["p2MBs"][0]
    # 2 each: one line for the page's own cause, one for its own outcome.
    assert result["p1Lines"] == 2 and result["p2Lines"] == 2


def test_find_clear_y_collision_avoidance_is_scoped_per_page(page):
    """Two pages can each place an element at the same x with no explicit y
    and land at the same computed y — proof _findClearY only ever looks at
    its OWN page's elements plus its OWN page's TLE. If it scanned the
    whole document instead, the second placement would collide with the
    first and get nudged down a row."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page1Id = m.pages[0].id;
      const page2Id = m.addPage({ name: 'Page Two' }).id;
      const c1 = m.addCause({x: 150, pageId: page1Id});
      const c2 = m.addCause({x: 150, pageId: page2Id});
      return { y1: c1.y, y2: c2.y };
    }""")
    assert result["y1"] == result["y2"], "each page's placement search must be independent"


def test_find_by_id_resolves_elements_from_any_page(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({ name: 'Page Two' });
      const cause = m.addCause({x: 150, y: 200, pageId: page2.id});
      return {
        tle: m.findById(page2.topLevelEvent.id) === page2.topLevelEvent,
        hazard: m.findById(page2.hazard.id) === page2.hazard,
        cause: m.findById(cause.id) === cause,
      };
    }""")
    assert result == {"tle": True, "hazard": True, "cause": True}


def test_find_by_id_page_id_resolves_correctly_for_non_first_page(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({ name: 'Page Two' });
      return {
        tlePageId: m.findById(page2.topLevelEvent.id).pageId,
        hazardPageId: m.findById(page2.hazard.id).pageId,
        expected: page2.id,
      };
    }""")
    assert result["tlePageId"] == result["expected"]
    assert result["hazardPageId"] == result["expected"]


def test_ids_stay_globally_unique_across_pages(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2Id = m.addPage({ name: 'Page Two' }).id;
      const c1 = m.addCause({x: 150, y: 200});
      const c2 = m.addCause({x: 150, y: 200, pageId: page2Id});
      return { c1: c1.id, c2: c2.id };
    }""")
    assert result["c1"] != result["c2"]


def test_to_json_from_json_round_trips_three_pages(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addPage({ name: 'Page Two', description: 'second' });
      m.addPage({ name: 'Page Three', description: 'third' });
      m.addCause({x: 150, y: 200, pageId: m.pages[0].id});
      m.addCause({x: 150, y: 200, pageId: m.pages[1].id});
      m.addOutcome({x: 1200, y: 200, pageId: m.pages[2].id});

      const before = m.toJSON();
      const restored = Bowtie.BowtieModel.fromJSON(before);
      return JSON.stringify(restored.toJSON()) === JSON.stringify(before);
    }""")
    assert result is True


def test_delete_element_stamps_retired_id_with_page_and_reassign_carries_it(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2Id = m.addPage({ name: 'Page Two' }).id;
      const c1 = m.addCause({x: 150, y: 200, pageId: page2Id});
      m.deleteElement(c1.id);
      const retired = m.retiredIds.cause.find((e) => e.id === c1.id);

      m.reEnableId('cause', c1.id);
      const c2 = m.addCause({x: 150, y: 400, pageId: page2Id});
      const c2OldId = c2.id; // reassignId mutates c2.id in place below
      m.reassignId(c2.id, c1.id); // c2's element takes back the retired id
      const newlyRetired = m.retiredIds.cause.find((e) => e.id === c2OldId);

      return {
        retiredPageId: retired.pageId,
        newlyRetiredPageId: newlyRetired ? newlyRetired.pageId : null,
        expected: page2Id,
      };
    }""")
    assert result["retiredPageId"] == result["expected"]
    assert result["newlyRetiredPageId"] == result["expected"]


def test_get_page_json_load_page_from_json_round_trips_and_isolates_other_state(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page1Id = m.pages[0].id;
      const page2Id = m.addPage({ name: 'Page Two', description: 'd2' }).id;
      m.addCause({x: 150, y: 200, pageId: page1Id});
      m.addCause({x: 150, y: 200, pageId: page2Id});
      m.setName('My Document');

      const page2Snapshot = m.getPageJSON(page2Id);
      m.addOutcome({x: 1200, y: 200, pageId: page2Id}); // mutate page 2 further

      // Captured immediately before the loadPageFromJSON call under test --
      // NOT before the addOutcome above, which legitimately bumps
      // idCounters; this isolates what the load call itself should and
      // should not touch.
      const idCountersBefore = JSON.stringify(m.idCounters);
      const retiredIdsBefore = JSON.stringify(m.retiredIds);
      const nameBefore = m.name;
      const page1JsonBefore = JSON.stringify(m.getPageJSON(page1Id));

      m.loadPageFromJSON(page2Id, page2Snapshot); // restore page 2 to before the outcome

      return {
        page2RestoredExactly: JSON.stringify(m.getPageJSON(page2Id)) === JSON.stringify(page2Snapshot),
        idCountersUntouched: JSON.stringify(m.idCounters) === idCountersBefore,
        retiredIdsUntouched: JSON.stringify(m.retiredIds) === retiredIdsBefore,
        nameUntouched: m.name === nameBefore,
        page1Untouched: JSON.stringify(m.getPageJSON(page1Id)) === page1JsonBefore,
      };
    }""")
    assert result == {
        "page2RestoredExactly": True,
        "idCountersUntouched": True,
        "retiredIdsUntouched": True,
        "nameUntouched": True,
        "page1Untouched": True,
    }
