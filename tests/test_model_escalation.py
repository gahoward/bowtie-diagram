"""Escalation factors and escalation barriers (proposals/08) at the model
level.

A bowtie's barriers fail for reasons. An escalation factor is a
condition that degrades one specific barrier ("the ESDV isn't proof
tested"), and an escalation barrier is the control on that ("a quarterly
test regime"). Before this there was nowhere to record either, so they
were written into a barrier's description where nothing could see them.

The design reuses what is already there rather than inventing a parallel
structure: EF/EB are library node types like any other, and an
escalation factor owns a `Line` whose far end is the barrier instead of
the TLE — so every splice, attach and truncate primitive in
LineTopology works on it unchanged. Quantitative mode is deliberately
untouched: an EF changes no computed figure (that is a later proposal).
"""


def _chain(page):
    """A threat with one preventative barrier, and a second barrier on
    the same line — enough to test anchoring and per-barrier scope."""
    return page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb1 = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const pb2 = m.addPreventativeControl(t.id, { name: 'Coating' });
      window.__ids = { t: t.id, pb1: pb1.id, pb2: pb2.id };
      return window.__ids;
    }""")


def _ev(page, body):
    return page.evaluate("() => { const m = window.__lastModel; " + body + " }")


def _warning_types(page):
    return _ev(page, "return m.getWarnings().map((w) => w.type);")


# --- creation -------------------------------------------------------------

def test_a_factor_is_anchored_to_its_barrier_and_owns_an_escalation_line(page):
    _chain(page)
    result = _ev(page, """
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      const line = m.lines.find((l) => l.originId === ef.id);
      return {
        nodeId: m.getNode(ef.nodeId).id,
        type: ef.type,
        barrierId: ef.barrierId,
        pageId: ef.pageId === m.pages[0].id,
        lineOriginType: line.originType,
        lineStops: line.stops,
      };
    """)
    assert result["nodeId"] == "EF_1", "escalation factors get their own id prefix"
    assert result["type"] == "escalationFactor"
    assert result["barrierId"] == page.evaluate("() => window.__ids.pb1")
    assert result["pageId"] is True
    assert result["lineOriginType"] == "escalationFactor"
    assert result["lineStops"] == [], "a new factor has nothing controlling it yet"


def test_escalation_barriers_chain_along_the_factors_line(page):
    _chain(page)
    stops = _ev(page, """
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      const eb1 = m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      const eb2 = m.addEscalationBarrier(ef.id, { name: 'Annual audit' });
      const line = m.lines.find((l) => l.originId === ef.id);
      return {
        ids: [m.getNode(eb1.nodeId).id, m.getNode(eb2.nodeId).id],
        stops: line.stops,
        order: line.stops[0] === eb1.id && line.stops[1] === eb2.id,
      };
    """)
    assert stops["ids"] == ["EB_1", "EB_2"]
    assert len(stops["stops"]) == 2
    assert stops["order"] is True, "stops run factor-first, like every other line"


def test_the_same_factor_can_degrade_several_barriers_on_one_page(page):
    """The document-wide "one placement per node per page" rule is keyed
    by (node, barrier) for factors instead: the same condition really does
    degrade more than one barrier (open question 1)."""
    _chain(page)
    result = _ev(page, """
      const ef1 = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      const node = m.getNode(ef1.nodeId);
      const ef2 = m.addEscalationFactor(window.__ids.pb2, { nodeId: node.id });
      const again = m.addEscalationFactor(window.__ids.pb1, { nodeId: node.id });
      return {
        distinct: ef1.id !== ef2.id,
        sameNode: ef1.nodeId === ef2.nodeId,
        barriers: [ef1.barrierId, ef2.barrierId],
        idempotent: again.id === ef1.id,
        count: m.escalationFactors.length,
      };
    """)
    assert result["distinct"] and result["sameNode"]
    assert result["barriers"] == page.evaluate("() => [window.__ids.pb1, window.__ids.pb2]")
    assert result["idempotent"] is True, "adding it to the same barrier twice is a no-op"
    assert result["count"] == 2


def test_an_existing_escalation_barrier_can_be_attached_to_another_factor(page):
    _chain(page)
    result = _ev(page, """
      const ef1 = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      const ef2 = m.addEscalationFactor(window.__ids.pb2, { name: 'On manual' });
      const eb = m.addEscalationBarrier(ef1.id, { name: 'Quarterly test regime' });
      m.attachExistingEscalationBarrier(ef2.id, eb.id);
      return m.lines
        .filter((l) => l.originType === 'escalationFactor')
        .map((l) => l.stops.includes(eb.id));
    """)
    assert result == [True, True], "one control, two factors"


def test_a_factor_cannot_hang_off_something_that_is_not_a_barrier(page):
    _chain(page)
    error = _ev(page, """
      try {
        m.addEscalationFactor(window.__ids.t, { name: 'Nope' });
        return null;
      } catch (e) { return e.message; }
    """)
    assert error is not None and "attach to a barrier" in error


# --- cascades -------------------------------------------------------------

def test_deleting_a_barrier_takes_its_factors_and_their_lines(page):
    _chain(page)
    after = _ev(page, """
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      m.deleteElement(window.__ids.pb1);
      return {
        factors: m.escalationFactors.length,
        lines: m.lines.filter((l) => l.originType === 'escalationFactor').length,
        // The control itself survives as an orphan, exactly like a
        // preventative barrier whose line is truncated away.
        escalationBarriers: m.escalationBarriers.length,
      };
    """)
    assert after == {"factors": 0, "lines": 0, "escalationBarriers": 1}


def test_deleting_a_factor_leaves_the_barrier_alone(page):
    _chain(page)
    after = _ev(page, """
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      m.deleteElement(ef.id);
      return {
        factors: m.escalationFactors.length,
        barriers: m.preventativeBarriers.length,
        lines: m.lines.filter((l) => l.originType === 'escalationFactor').length,
      };
    """)
    assert after == {"factors": 0, "barriers": 2, "lines": 0}


def test_deleting_a_page_takes_its_escalation_content(page):
    result = _ev(page, """
      const p2 = m.addPage({ name: 'Second' });
      const t = m.addThreat({x: 150, y: 200, pageId: p2.id, name: 'Other'});
      const pb = m.addPreventativeControl(t.id, { name: 'Other barrier' });
      const ef = m.addEscalationFactor(pb.id, { name: 'Other factor' });
      m.addEscalationBarrier(ef.id, { name: 'Other control' });
      m.deletePage(p2.id);
      return {
        factors: m.escalationFactors.length,
        barriers: m.escalationBarriers.length,
        lines: m.lines.filter((l) => l.originType === 'escalationFactor').length,
      };
    """)
    assert result == {"factors": 0, "barriers": 0, "lines": 0}


# --- warnings -------------------------------------------------------------

def test_a_factor_with_no_control_is_advisory_not_blocking(page):
    """"This barrier can be degraded and nothing is stopping that" is
    often exactly what an analyst means to record — it must not block
    export."""
    _chain(page)
    _ev(page, "m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });")
    page.wait_for_timeout(80)
    warnings = _ev(page, "return m.getWarnings();")
    assert [w["type"] for w in warnings] == ["uncontrolled-escalation-factor"]
    assert warnings[0]["severity"] == "advisory"
    assert "PB_1" in warnings[0]["message"], "it names the barrier it degrades"
    assert page.locator("#btn-export-json").is_disabled() is False


def test_an_escalation_barrier_on_no_line_blocks_export(page):
    _chain(page)
    _ev(page, """
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      m.deleteElement(ef.id);
    """)
    page.wait_for_timeout(120)
    warnings = _ev(page, "return m.getWarnings();")
    orphan = [w for w in warnings if w["type"] == "orphaned-escalation-barrier"]
    assert len(orphan) == 1
    assert orphan[0]["severity"] == "blocking"
    assert page.locator("#btn-export-json").is_disabled() is True


def test_a_controlled_factor_raises_nothing(page):
    _chain(page)
    _ev(page, """
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
    """)
    page.wait_for_timeout(80)
    assert _warning_types(page) == []


# --- serialisation --------------------------------------------------------

def test_escalation_content_round_trips_through_json(page):
    _chain(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      const json = JSON.parse(JSON.stringify(m.toJSON()));
      const restored = Bowtie.BowtieModel.fromJSON(json);
      return {
        version: json.version,
        keys: Object.keys(json).filter((k) => k.startsWith('escalation')),
        libraryKeys: Object.keys(json.library).filter((k) => k.startsWith('escalation')),
        retiredKeys: Object.keys(json.retiredIds).filter((k) => k.startsWith('escalation')),
        barrierId: json.escalationFactors[0].barrierId === window.__ids.pb1,
        restoredFactors: restored.escalationFactors.length,
        restoredAnchor: restored.escalationFactors[0].barrierId === window.__ids.pb1,
        restoredStops: restored.lines.find((l) => l.originType === 'escalationFactor').stops.length,
        restoredNodes: [
          restored.library.escalationFactor.length,
          restored.library.escalationBarrier.length,
        ],
        warnings: restored.getWarnings().length,
      };
    }""")
    assert result["version"] == 12, "escalation factors are schema v12"
    assert result["keys"] == ["escalationFactors", "escalationBarriers"]
    assert result["libraryKeys"] == ["escalationFactor", "escalationBarrier"]
    assert result["retiredKeys"] == ["escalationFactor", "escalationBarrier"]
    assert result["barrierId"] is True, "the anchor is persisted, or it loads floating under nothing"
    assert result["restoredFactors"] == 1
    assert result["restoredAnchor"] is True
    assert result["restoredStops"] == 1
    assert result["restoredNodes"] == [1, 1]
    assert result["warnings"] == 0


def test_a_page_snapshot_carries_its_escalation_content(page):
    """Undo works off per-page snapshots, so anything missing from
    getPageJSON silently disappears on the next undo."""
    _chain(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const ef = m.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      const snapshot = m.getPageJSON(m.pages[0].id);
      return {
        factors: snapshot.escalationFactors.length,
        barriers: snapshot.escalationBarriers.length,
        anchored: snapshot.escalationFactors[0].barrierId === window.__ids.pb1,
        lines: snapshot.lines.filter((l) => l.originType === 'escalationFactor').length,
      };
    }""")
    assert result == {"factors": 1, "barriers": 1, "anchored": True, "lines": 1}


def test_adding_a_factor_is_undoable(page):
    _chain(page)
    page.evaluate("""() => {
      window.__lastUndo.model.addEscalationFactor(window.__ids.pb1, { name: 'Not proof tested' });
    }""")
    page.wait_for_timeout(120)
    assert _ev(page, "return m.escalationFactors.length;") == 1
    page.click("#btn-undo")
    page.wait_for_timeout(120)
    assert _ev(page, "return m.escalationFactors.length;") == 0
    assert _ev(page, "return m.library.escalationFactor.length;") == 0, "the node goes too"


# --- referential integrity ------------------------------------------------

def test_a_factor_anchored_to_a_missing_barrier_is_rejected(page):
    """Without this the file would load a box hanging under nothing: it
    would render at a stale position, and deleting "its" barrier would
    never clean it up."""
    error = page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const ef = m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
      const json = JSON.parse(JSON.stringify(m.toJSON()));
      json.escalationFactors[0].barrierId = 'PLACEMENT_NOPE';
      try { Bowtie.BowtieModel.fromJSON(json).loadFromJSON(json); return null; }
      catch (e) { return e.message; }
    }""")
    assert error is not None
    assert "isn't attached to a barrier on its own page" in error


def test_an_escalation_line_through_a_missing_control_is_rejected(page):
    error = page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const pb = m.addPreventativeControl(t.id, { name: 'Inspection' });
      const ef = m.addEscalationFactor(pb.id, { name: 'Not proof tested' });
      m.addEscalationBarrier(ef.id, { name: 'Quarterly test regime' });
      const json = JSON.parse(JSON.stringify(m.toJSON()));
      json.escalationBarriers = [];
      try { Bowtie.BowtieModel.fromJSON(json).loadFromJSON(json); return null; }
      catch (e) { return e.message; }
    }""")
    assert error is not None
    assert "passes through a barrier that doesn't exist" in error
