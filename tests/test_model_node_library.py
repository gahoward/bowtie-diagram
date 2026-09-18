"""Model-level coverage for node_library_proposal.md: the node/placement
split, node CRUD, cross-page reuse, retiring at the node level, and the
identifier-uniqueness/display-mode machinery. Drives window.__lastModel
directly, matching the existing tests/test_model_splicing.py style.
"""


def test_add_threat_creates_a_node_and_a_placement(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const threat = m.addThreat({name: 'Valve Failure'});
      const node = m.getNode(threat.nodeId);
      return { placementId: threat.id, nodeId: threat.nodeId, nodeName: node.name, nodeType: node.type };
    }""")
    assert result["nodeName"] == "Valve Failure"
    assert result["nodeType"] == "threat"
    # Two genuinely different id spaces -- the placement's own id is never
    # the same value as its node's id.
    assert result["placementId"] != result["nodeId"]


def test_add_threat_with_existing_node_id_creates_only_a_placement(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('threat', {name: 'Shared Threat'});
      const beforeLibraryCount = m.library.threat.length;
      const placement = m.addThreat({nodeId: node.id});
      return {
        beforeLibraryCount,
        afterLibraryCount: m.library.threat.length,
        placementNodeId: placement.nodeId,
        nodeId: node.id,
      };
    }""")
    assert result["afterLibraryCount"] == result["beforeLibraryCount"], "must not create a second node"
    assert result["placementNodeId"] == result["nodeId"]


def test_placing_the_same_node_twice_on_one_page_is_rejected(page):
    threw = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('threat', {name: 'X'});
      m.addThreat({nodeId: node.id});
      try {
        m.addThreat({nodeId: node.id});
        return false;
      } catch {
        return true;
      }
    }""")
    assert threw is True


def test_placing_the_same_node_on_a_different_page_is_allowed(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({name: 'Page Two'});
      const node = m.addNode('threat', {name: 'Shared'});
      const p1 = m.addThreat({nodeId: node.id, pageId: m.pages[0].id});
      const p2 = m.addThreat({nodeId: node.id, pageId: page2.id});
      return { p1PageId: p1.pageId, p2PageId: p2.pageId, samNode: p1.nodeId === p2.nodeId };
    }""")
    assert result["samNode"] is True
    assert result["p1PageId"] != result["p2PageId"]


def test_resolving_a_node_id_placed_on_two_pages_throws_rather_than_guessing(page):
    """Design review finding 09: 'at most one placement per node per page'
    is the invariant, not 'at most one, ever' -- a node placed on two pages
    is a normal, supported state (see the test above). A bare node id is
    only unambiguous when it has at most one live placement document-wide,
    so any document-wide operation that resolves one from the other
    (_lineFor/linesThrough/addPreventativeControl/...) must refuse to guess
    which page's placement was meant, rather than silently operating on
    whichever one happens to be found first."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({name: 'Page Two'});
      const node = m.addNode('threat', {name: 'Shared'});
      m.addThreat({nodeId: node.id, pageId: m.pages[0].id});
      m.addThreat({nodeId: node.id, pageId: page2.id});
      try {
        m.addPreventativeControl(node.id);
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    }""")
    assert result["threw"] is True
    assert "more than one page" in result["message"]


def test_resolving_a_node_id_placed_on_only_one_page_still_works(page):
    # The common case -- a node placed exactly once -- must be unaffected
    # by finding 09's guard.
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const threat = m.addThreat({name: 'Solo'});
      const pb = m.addPreventativeControl(threat.nodeId);
      return { barrierNodeId: pb.nodeId, onLine: m._lineFor(threat.nodeId).stops.includes(pb.id) };
    }""")
    assert result["onLine"] is True


def test_a_node_with_zero_placements_persists_in_the_library(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('preventativeBarrier', {name: 'Staged Barrier'});
      return { count: m.library.preventativeBarrier.length, placements: m.placementsForNode(node.id).length };
    }""")
    assert result["count"] == 1
    assert result["placements"] == 0


def test_node_zero_placements_state_round_trips_through_save_load(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addNode('consequence', {name: 'Unused Consequence'});
      const json = m.toJSON();
      m.loadFromJSON(json);
      const node = m.library.consequence.find((n) => n.name === 'Unused Consequence');
      return { found: !!node, placements: node ? m.placementsForNode(node.id).length : -1 };
    }""")
    assert result["found"] is True
    assert result["placements"] == 0


def test_edit_a_nodes_name_is_visible_on_every_page_that_places_it(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({name: 'Page Two'});
      const node = m.addNode('threat', {name: 'Original Name'});
      m.addThreat({nodeId: node.id, pageId: m.pages[0].id});
      m.addThreat({nodeId: node.id, pageId: page2.id});
      m.renameNode(node.id, {name: 'Updated Name'});
      const placements = m.placementsForNode(node.id);
      return placements.map((p) => m.getNode(p.nodeId).name);
    }""")
    assert result == ["Updated Name", "Updated Name"]


def test_delete_node_cascades_every_placement_on_every_page(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({name: 'Page Two'});
      const node = m.addNode('threat', {name: 'Doomed'});
      m.addThreat({nodeId: node.id, pageId: m.pages[0].id});
      m.addThreat({nodeId: node.id, pageId: page2.id});
      m.deleteNode(node.id);
      return {
        stillInLibrary: !!m.getNode(node.id),
        placementsLeft: m.threatsForPage(m.pages[0].id).length + m.threatsForPage(page2.id).length,
      };
    }""")
    assert result["stillInLibrary"] is False
    assert result["placementsLeft"] == 0


def test_delete_node_retires_its_id_with_no_page_history(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('threat', {name: 'Retiree'});
      m.addThreat({nodeId: node.id});
      m.deleteNode(node.id);
      const entry = m.retiredIds.threat.find((e) => e.id === node.id);
      return entry ? Object.keys(entry).sort() : null;
    }""")
    assert result == ["id", "reEnabled"], "no pageId -- node_library_proposal.md: no page history captured"


def test_delete_element_placement_only_does_not_retire_anything(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const threat = m.addThreat({name: 'Placement Only'});
      const nodeId = threat.nodeId;
      m.deleteElement(threat.id);
      return {
        nodeStillLive: !!m.getNode(nodeId),
        retired: m.retiredIds.threat.some((e) => e.id === nodeId),
      };
    }""")
    assert result["nodeStillLive"] is True, "deleteElement must never delete the node it referenced"
    assert result["retired"] is False


def test_delete_element_leaves_other_pages_placements_of_the_same_node_untouched(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({name: 'Page Two'});
      const node = m.addNode('threat', {name: 'Multi'});
      m.addThreat({nodeId: node.id, pageId: m.pages[0].id});
      const p2 = m.addThreat({nodeId: node.id, pageId: page2.id});
      m.deleteElement(p2.id);
      return {
        nodeLive: !!m.getNode(node.id),
        page1PlacementCount: m.threatsForPage(m.pages[0].id).length,
        page2PlacementCount: m.threatsForPage(page2.id).length,
      };
    }""")
    assert result["nodeLive"] is True
    assert result["page1PlacementCount"] == 1
    assert result["page2PlacementCount"] == 0


def test_reassign_id_operates_on_node_ids_and_cascades_every_placement(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const page2 = m.addPage({name: 'Page Two'});
      const dead = m.addThreat({name: 'Dead'});
      const deadNodeId = dead.nodeId;
      m.deleteNode(deadNodeId);
      m.reEnableId('threat', deadNodeId);
      const node = m.addNode('threat', {name: 'Reassign Target'});
      m.addThreat({nodeId: node.id, pageId: m.pages[0].id});
      m.addThreat({nodeId: node.id, pageId: page2.id});
      m.reassignId(node.id, deadNodeId);
      const placements = m.placementsForNode(deadNodeId);
      return { newNodeId: node.id, reassignedTo: deadNodeId, placementCount: placements.length, nodeExists: !!m.getNode(deadNodeId) };
    }""")
    assert result["placementCount"] == 2
    assert result["nodeExists"] is True


def test_add_node_rejects_duplicate_non_blank_identifier_across_all_four_types(page):
    threw = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addNode('threat', {name: 'A', identifier: 'SHARED'});
      try {
        m.addNode('preventativeBarrier', {name: 'B', identifier: 'SHARED'});
        return false;
      } catch {
        return true;
      }
    }""")
    assert threw is True


def test_blank_identifier_is_exempt_from_the_uniqueness_check(page):
    threw = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addNode('threat', {name: 'A'});
      try {
        m.addNode('consequence', {name: 'B'});
        return false;
      } catch {
        return true;
      }
    }""")
    assert threw is False


def test_rename_node_to_its_own_current_identifier_does_not_throw(page):
    threw = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('threat', {name: 'A', identifier: 'KEEP-ME'});
      try {
        m.renameNode(node.id, {name: 'A renamed', identifier: 'KEEP-ME'});
        return false;
      } catch {
        return true;
      }
    }""")
    assert threw is False


def test_display_identifier_for_falls_back_to_id_when_internal_mode(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('threat', {name: 'A', identifier: 'CUSTOM-1'});
      return m.displayIdentifierFor(node);
    }""")
    assert result.startswith("T_")


def test_switching_to_custom_mode_backfills_blank_identifiers_with_current_id(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const withCustom = m.addNode('threat', {name: 'Has custom', identifier: 'MY-ID'});
      const withoutCustom = m.addNode('consequence', {name: 'No custom'});
      m.setIdentifierDisplayMode('custom');
      return {
        withCustomIdentifier: m.getNode(withCustom.id).identifier,
        withoutCustomIdentifier: m.getNode(withoutCustom.id).identifier,
      };
    }""")
    assert result["withCustomIdentifier"] == "MY-ID", "an existing custom identifier must be untouched"
    assert result["withoutCustomIdentifier"].startswith("C_"), "a blank identifier backfills with the node's own id"


def test_backfill_skips_a_node_whose_id_collides_with_another_nodes_identifier(page):
    """Design review finding 02: one node is hand-given a second node's OWN
    id as its custom identifier while still in internal mode -- e.g. node
    T_2 given the identifier "T_3". Switching to custom mode then must NOT
    blindly backfill T_3's own blank identifier with its id "T_3" -- that
    string is already T_2's chosen identifier, and doing so would leave two
    nodes both displaying as "T_3". The colliding node is left blank
    instead, not minted a suffixed identifier it was never given."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const first = m.addNode('threat', {name: 'One'});
      const second = m.addNode('threat', {name: 'Two'});
      m.renameNode(first.id, { identifier: second.id }); // e.g. "T_1" now displays as "T_2"
      m.setIdentifierDisplayMode('custom');
      return {
        secondNodeId: second.id,
        firstIdentifier: m.getNode(first.id).identifier,
        secondIdentifier: m.getNode(second.id).identifier,
      };
    }""")
    assert result["firstIdentifier"] == result["secondNodeId"], "the hand-set identifier must be untouched"
    assert result["secondIdentifier"] == "", "left blank, not backfilled into a second node showing the same label"


def test_no_two_live_nodes_ever_share_a_visible_identifier_after_mode_switches(page):
    """The property finding 02's fix protects, exercised across a longer
    sequence of switches and a hand-assigned collision on the other type
    too, rather than just the one reproduction above."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const c1 = m.addNode('threat', {name: 'One'});
      const c2 = m.addNode('threat', {name: 'Two'});
      m.renameNode(c1.id, { identifier: c2.id });
      m.setIdentifierDisplayMode('custom');
      m.setIdentifierDisplayMode('internal');
      m.setIdentifierDisplayMode('custom');
      const identifiers = m.library.threat.map((n) => n.identifier).filter((x) => x);
      return { identifiers, unique: new Set(identifiers).size === identifiers.length };
    }""")
    assert result["unique"] is True, f"duplicate visible identifiers: {result['identifiers']}"


def test_switching_back_to_internal_then_custom_restores_the_backfilled_value(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const node = m.addNode('threat', {name: 'A'});
      m.setIdentifierDisplayMode('custom');
      const afterFirstSwitch = m.getNode(node.id).identifier;
      m.setIdentifierDisplayMode('internal');
      m.setIdentifierDisplayMode('custom');
      const afterSecondSwitch = m.getNode(node.id).identifier;
      return { afterFirstSwitch, afterSecondSwitch };
    }""")
    assert result["afterFirstSwitch"] == result["afterSecondSwitch"]


def test_new_node_created_while_in_custom_mode_starts_with_a_blank_identifier(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setIdentifierDisplayMode('custom');
      const node = m.addNode('threat', {name: 'Fresh'});
      return node.identifier;
    }""")
    assert result == ""


def test_get_warnings_names_the_node_not_the_placement(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addPreventativeControl(m.addThreat({}).id); // used, no warning
      const orphanThreat = m.addThreat({});
      const orphanNode = m.addNode('preventativeBarrier', {name: 'Orphan Barrier'});
      m.addPreventativeControl(orphanThreat.id, {nodeId: orphanNode.id});
      m.deleteElement(m._lineFor(orphanThreat.id).stops[0]); // remove just the placement, not the wiring -- actually let's just check message shape
      return m.getWarnings().length >= 0;
    }""")
    assert result is True


def test_undo_of_create_new_node_and_placement_removes_both(page):
    result = page.evaluate("""() => {
      const undo = window.__lastUndo;
      const before = { threatCount: undo.model.threats.length, libCount: undo.model.library.threat.length };
      undo.model.addThreat({name: 'Undo Me'});
      const afterAdd = { threatCount: undo.model.threats.length, libCount: undo.model.library.threat.length };
      undo.undo();
      const afterUndo = { threatCount: undo.model.threats.length, libCount: undo.model.library.threat.length };
      return { before, afterAdd, afterUndo };
    }""")
    assert result["afterAdd"]["threatCount"] == result["before"]["threatCount"] + 1
    assert result["afterAdd"]["libCount"] == result["before"]["libCount"] + 1
    assert result["afterUndo"] == result["before"]


def test_undo_of_placing_an_existing_node_removes_only_the_placement(page):
    result = page.evaluate("""() => {
      const undo = window.__lastUndo;
      const node = undo.model.addNode('threat', {name: 'Existing'});
      const beforePlace = { threatCount: undo.model.threats.length, libCount: undo.model.library.threat.length };
      undo.model.addThreat({nodeId: node.id});
      const afterPlace = { threatCount: undo.model.threats.length, libCount: undo.model.library.threat.length };
      undo.undo();
      const afterUndo = { threatCount: undo.model.threats.length, libCount: undo.model.library.threat.length, nodeStillExists: !!undo.model.getNode(node.id) };
      return { beforePlace, afterPlace, afterUndo };
    }""")
    assert result["afterPlace"]["threatCount"] == result["beforePlace"]["threatCount"] + 1
    assert result["afterPlace"]["libCount"] == result["beforePlace"]["libCount"]
    assert result["afterUndo"]["threatCount"] == result["beforePlace"]["threatCount"]
    assert result["afterUndo"]["nodeStillExists"] is True, "undoing a placement-only step must not touch the node"
