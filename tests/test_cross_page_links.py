"""Linking a consequence to another page's top event (proposals/22).

Standard bowtie practice escalates: a consequence on one analysis is the
top event of another. "Loss of containment" is a consequence of the
pipework bowtie and the top event of the pool-fire one, and until now
the document could hold both diagrams with no way to say they were the
same event.

This step records the relationship and **changes no figure**, in any
mode. Propagating the source consequence's post-mitigation likelihood
into the derived page's top event is a separate step; most of the tests
here exist to pin the structure and its defences so that step lands on
something already solid.

The cycle tests are the point of the file. A cycle is refused at
creation AND refused at load, because once the arithmetic reads these
links a cycle is not a wrong number — it is a recursion with no base
case, and a file can carry one that no UI ever created.
"""

from playwright.sync_api import expect

from helpers import eventually_equals


def _two_pages(page):
    """A consequence on page one, and a second page to escalate it to."""
    return page.evaluate("""() => {
      const m = window.__lastUndo.model;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      const c = m.addConsequence({x: 1200, y: 200, name: 'Loss of containment'});
      const second = m.addPage({name: 'Pool fire'});
      window.__ids = {threat: t.id, consequence: c.id, first: m.pages[0].id, second: second.id};
      m._emitChange();
      return window.__ids;
    }""")


def _pages(page):
    return page.evaluate("""() => window.__lastModel.pages.map(
      (p) => ({id: p.id, name: p.name, derivedFrom: p.derivedFrom})
    )""")


def _link(page, page_id, consequence_id):
    return page.evaluate(
        """([pageId, consequenceId]) => {
          try {
            window.__lastUndo.model.linkPageToConsequence(pageId, consequenceId);
            return {ok: true};
          } catch (err) {
            return {ok: false, error: err.message};
          }
        }""",
        [page_id, consequence_id],
    )


# --- The link -------------------------------------------------------------

def test_a_page_records_the_consequence_its_top_event_is(page):
    ids = _two_pages(page)
    assert _link(page, ids["second"], ids["consequence"])["ok"] is True
    second = next(p for p in _pages(page) if p["id"] == ids["second"])
    assert second["derivedFrom"] == {"consequenceId": ids["consequence"], "pageId": ids["first"]}


def test_an_ordinary_page_is_derived_from_nothing(page):
    ids = _two_pages(page)
    assert all(p["derivedFrom"] is None for p in _pages(page)), \
        "every page starts ordinary -- which is what every upgraded page is too"
    assert page.evaluate("(id) => window.__lastModel.derivedSourceFor(id)", ids["second"]) is None


def test_unlinking_puts_the_page_back_to_ordinary(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastUndo.model.unlinkPage(id)", ids["second"])
    second = next(p for p in _pages(page) if p["id"] == ids["second"])
    assert second["derivedFrom"] is None


def test_escalating_creates_the_page_names_it_and_links_it_in_one_step(page):
    ids = _two_pages(page)
    created = page.evaluate(
        "(id) => window.__lastUndo.model.escalateConsequenceToNewPage(id).id",
        ids["consequence"],
    )
    made = next(p for p in _pages(page) if p["id"] == created)
    assert made["name"] == "Loss of containment", "the same event, so the same name"
    assert made["derivedFrom"]["consequenceId"] == ids["consequence"]
    assert page.evaluate(
        "(id) => window.__lastModel.getPage(id).topLevelEvent.name", created
    ) == "Loss of containment"


def test_the_source_resolves_to_the_page_and_the_display_id(page):
    """One producer for what the chrome says, so the canvas marker and the
    status strip cannot word the same link differently."""
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    source = page.evaluate("(id) => window.__lastModel.derivedSourceFor(id)", ids["second"])
    assert source["displayId"] == "C_1"
    assert source["page"]["id"] == ids["first"]


# --- Cycles ---------------------------------------------------------------

def test_a_page_cannot_be_derived_from_a_consequence_on_itself(page):
    ids = _two_pages(page)
    result = _link(page, ids["first"], ids["consequence"])
    assert result["ok"] is False
    assert "on itself" in result["error"]


def test_a_direct_cycle_is_refused_at_creation(page):
    """A -> B is fine; B -> A closes the loop and is refused. Refused at
    creation rather than detected later, because a half-formed cycle is
    worse than a rejected link."""
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    back = page.evaluate("""(pageId) => {
      const m = window.__lastUndo.model;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Escalated', pageId});
      try {
        m.linkPageToConsequence(m.pages[0].id, c.id);
        return {ok: true};
      } catch (err) {
        return {ok: false, error: err.message};
      }
    }""", ids["second"])
    assert back["ok"] is False
    assert "cycle" in back["error"]


def test_a_cycle_through_a_chain_is_refused_too(page):
    """A -> B -> C is a legitimate escalation chain; C -> A is not, and
    the check has to walk the chain to know that."""
    result = page.evaluate("""() => {
      const m = window.__lastUndo.model;
      const cA = m.addConsequence({x: 1200, y: 200, name: 'A out'});
      const b = m.addPage({name: 'B'});
      const cB = m.addConsequence({x: 1200, y: 200, name: 'B out', pageId: b.id});
      const c = m.addPage({name: 'C'});
      const cC = m.addConsequence({x: 1200, y: 200, name: 'C out', pageId: c.id});
      m.linkPageToConsequence(b.id, cA.id);
      m.linkPageToConsequence(c.id, cB.id);
      try {
        m.linkPageToConsequence(m.pages[0].id, cC.id);
        return {ok: true};
      } catch (err) {
        return {ok: false, error: err.message, chain: m.pages.map((p) => Boolean(p.derivedFrom))};
      }
    }""")
    assert result["ok"] is False
    assert "cycle" in result["error"]
    assert result["chain"] == [False, True, True], "the legitimate chain survives the refusal"


def test_a_cyclic_file_is_refused_at_load(page):
    """The UI will not create one, so this is about a file that arrived
    carrying it -- hand-edited, or merged badly. Once the arithmetic
    reads these links, loading one would hang the tab rather than show a
    wrong figure."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addConsequence({x: 1200, y: 200, name: 'A out'});
      const b = m.addPage({name: 'B'});
      m.addConsequence({x: 1200, y: 200, name: 'B out', pageId: b.id});
      const doc = m.toJSON();
      // Hand-build the cycle the UI refuses to make.
      doc.pages[0].derivedFrom = {consequenceId: doc.consequences[1].id, pageId: doc.pages[1].id};
      doc.pages[1].derivedFrom = {consequenceId: doc.consequences[0].id, pageId: doc.pages[0].id};
      try {
        window.__lastModel.loadFromJSON(doc);
        return {loaded: true};
      } catch (err) {
        return {loaded: false, error: err.message};
      }
    }""")
    assert result["loaded"] is False
    assert "derived from each other" in result["error"]


def test_a_link_to_a_consequence_that_is_not_there_is_refused_at_load(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addConsequence({x: 1200, y: 200, name: 'A out'});
      const b = m.addPage({name: 'B'});
      const doc = m.toJSON();
      doc.pages[1].derivedFrom = {consequenceId: 'PLACEMENT_NOPE', pageId: doc.pages[0].id};
      try {
        window.__lastModel.loadFromJSON(doc);
        return {loaded: true};
      } catch (err) {
        return {loaded: false, error: err.message};
      }
    }""")
    assert result["loaded"] is False
    assert "isn't on page" in result["error"]


# --- Cascades -------------------------------------------------------------

def test_deleting_the_source_consequence_clears_the_link(page):
    """The dependent page keeps existing; it just stops pointing at a
    ghost -- the same cascade rule deleting a barrier follows."""
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastUndo.model.deleteElement(id)", ids["consequence"])
    second = next(p for p in _pages(page) if p["id"] == ids["second"])
    assert second["derivedFrom"] is None


def test_deleting_the_source_page_clears_the_link(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastUndo.model.deletePage(id)", ids["first"])
    second = next(p for p in _pages(page) if p["id"] == ids["second"])
    assert second["derivedFrom"] is None


def test_a_document_with_a_link_round_trips(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    round_tripped = page.evaluate("""() => {
      const doc = window.__lastModel.toJSON();
      window.__lastModel.loadFromJSON(JSON.parse(JSON.stringify(doc)));
      return window.__lastModel.pages.map((p) => p.derivedFrom);
    }""")
    assert round_tripped[0] is None
    assert round_tripped[1]["consequenceId"] == ids["consequence"]


def test_an_unlinked_document_writes_no_link_field_at_all(page):
    """A document that uses no cross-page links looks exactly as it did
    before this feature existed."""
    _two_pages(page)
    pages = page.evaluate("() => window.__lastModel.toJSON().pages")
    assert all("derivedFrom" not in p for p in pages)


# --- Undo -----------------------------------------------------------------

def test_escalating_is_one_undo_step_that_takes_the_page_with_it(page):
    """Undoing an escalation has to remove the page it created -- being
    left with an empty page nobody asked for is not what undo means."""
    ids = _two_pages(page)
    page.evaluate("(id) => window.__lastUndo.model.escalateConsequenceToNewPage(id)", ids["consequence"])
    eventually_equals(lambda: page.evaluate("() => window.__lastModel.pages.length"), 3)
    page.evaluate("() => window.__lastUndo.undo()")
    eventually_equals(lambda: page.evaluate("() => window.__lastModel.pages.length"), 2)
    assert all(p["derivedFrom"] is None for p in _pages(page))


def test_linking_undoes_as_one_step(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("() => window.__lastUndo.undo()")
    eventually_equals(
        lambda: page.evaluate(
            "(id) => Boolean(window.__lastModel.getPage(id).derivedFrom)", ids["second"]
        ),
        False,
    )


# --- The chrome -----------------------------------------------------------

def test_the_status_strip_names_the_source_page_on_a_derived_page(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastPageTabs.select(id)", ids["second"])
    segment = page.locator(".status-derived")
    expect(segment).to_be_visible()
    expect(segment).to_contain_text("C_1")
    assert "top event" in segment.get_attribute("title")


def test_the_status_strip_says_nothing_on_an_ordinary_page(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastPageTabs.select(id)", ids["first"])
    expect(page.locator(".status-derived")).to_have_count(0)


def test_the_strip_segment_goes_to_the_source_page(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastPageTabs.select(id)", ids["second"])
    page.locator(".status-derived").click()
    eventually_equals(lambda: page.evaluate("() => window.__lastPageTabs.getActivePageId()"), ids["first"])


def test_the_canvas_says_where_a_derived_top_event_came_from(page):
    """The printed sheet and the exported SVG go through this same
    renderer, so a derived page should never be read without it."""
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("(id) => window.__lastPageTabs.select(id)", ids["second"])
    eventually_equals(
        lambda: any(
            'C_1 on "Untitled Page"' in t
            for t in page.locator("#bowtie-canvas text").all_text_contents()
        ),
        True,
    )


def test_the_consequence_menu_offers_escalation(page):
    _two_pages(page)
    page.locator("#bowtie-canvas .node.consequence").first.click(button="right")
    labels = page.locator(".context-menu-item").all_text_contents()
    assert "Escalate to a New Page…" in labels
    assert "Link to an Existing Page…" in labels
    page.keyboard.press("Escape")


def test_an_already_escalated_consequence_offers_the_way_there_instead(page):
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    page.locator("#bowtie-canvas .node.consequence").first.click(button="right")
    labels = page.locator(".context-menu-item").all_text_contents()
    assert 'Go to "Pool fire"' in labels
    assert "Escalate to a New Page…" not in labels, "it already has a page"
    page.keyboard.press("Escape")


# --- The arithmetic -------------------------------------------------------
#
# `computeTleLikelihood` returns `{value, excludedThreatCount,
# excludedLink}` -- there is no `.likelihood` on it, and reading one
# compares undefined to undefined. These all read `value` properly.

_QUANT_SETUP = """() => {
  const m = window.__lastUndo.model;
  m.setMode('quantitative');
  m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
  // Page one: a threat at 1/hr through a PFD 1E-2 barrier, so the top
  // event runs at 1E-2 and the consequence, behind a PFD 1E-1 mitigative
  // barrier, occurs at 1E-3.
  const t = m.addThreat({x: 150, y: 200, name: 'Overpressure'});
  m.renameNode(t.nodeId, {frequency: {value: '1'}});
  const pb = m.addPreventativeControl(t.id, {name: 'Relief valve'});
  m.renameNode(pb.nodeId, {protection: {measure: 'pfdavg', value: '1E-2'}});
  const c = m.addConsequence({x: 1200, y: 200, name: 'Loss of containment'});
  const mb = m.addMitigativeControl(c.id, {name: 'Bunding'});
  m.renameNode(mb.nodeId, {protection: {measure: 'pfdavg', value: '1E-1'}});
  const second = m.addPage({name: 'Pool fire'});
  window.__ids = {
    threat: t.id, consequence: c.id, mitigative: mb.id,
    mitigativeNode: mb.nodeId, preventativeNode: pb.nodeId,
    first: m.pages[0].id, second: second.id,
  };
  m._emitChange();
  return window.__ids;
}"""


def _quant(page):
    ids = page.evaluate(_QUANT_SETUP)
    page.evaluate("""() => {
      window._tleString = (pageId) => {
        const c = window.__lastModel.computeTleLikelihood(pageId);
        if (!c.value) return null;
        const exact = c.value.toExactDecimal();
        return exact ? exact.toDecimalString() : c.value.toDisplayNumber(6);
      };
    }""")
    return ids


def _tle(page, page_id):
    return page.evaluate("(id) => window._tleString(id)", page_id)


def test_a_derived_top_event_takes_the_source_consequence_post_mitigation(page):
    """Post, not pre: the escalated event happens at the rate the
    consequence actually occurs, which is after its own barriers."""
    ids = _quant(page)
    assert _tle(page, ids["second"]) is None, "nothing of its own yet"
    _link(page, ids["second"], ids["consequence"])
    assert _tle(page, ids["second"]) == "0.001", "1 x 1E-2 x 1E-1, the consequence's own rate"


def test_removing_a_barrier_upstream_moves_the_derived_page(page):
    """The whole point: page 2 no longer goes stale when page 1 changes."""
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    assert _tle(page, ids["second"]) == "0.001"
    page.evaluate("(id) => window.__lastUndo.model.deleteElement(id)", ids["mitigative"])
    assert _tle(page, ids["second"]) == "0.01", "the mitigative barrier is gone, so more gets through"


def test_the_link_combines_with_the_pages_own_threats_by_the_aggregation_policy(page):
    """An escalated event usually has other causes too. The link is one
    more contribution, under whichever rule the document already uses --
    which is why the status strip shows that rule."""
    ids = _quant(page)
    page.evaluate("""(pageId) => {
      const m = window.__lastUndo.model;
      const t = m.addThreat({x: 150, y: 200, name: 'Ignition', pageId});
      m.renameNode(t.nodeId, {frequency: {value: '4E-3'}});
    }""", ids["second"])
    _link(page, ids["second"], ids["consequence"])

    assert _tle(page, ids["second"]) == "0.004", "max: the bigger of 4E-3 and 1E-3"
    page.evaluate("() => window.__lastUndo.model.setTleAggregation('sum')")
    assert _tle(page, ids["second"]) == "0.005", "sum: 4E-3 + 1E-3"


def test_a_chain_of_three_pages_computes_through(page):
    ids = _quant(page)
    third = page.evaluate("""(secondId) => {
      const m = window.__lastUndo.model;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Escalated', pageId: secondId});
      const mb = m.addMitigativeControl(c.id, {name: 'Deluge'});
      m.renameNode(mb.nodeId, {protection: {measure: 'pfdavg', value: '1E-2'}});
      const p = m.addPage({name: 'Escalation'});
      m.linkPageToConsequence(p.id, c.id);
      return p.id;
    }""", ids["second"])
    _link(page, ids["second"], ids["consequence"])
    assert _tle(page, ids["second"]) == "0.001"
    assert _tle(page, third) == "0.00001", "1E-3 through the second page's own 1E-2 barrier"


def test_an_unknown_source_is_said_out_loud_rather_than_quietly_dropped(page):
    """A derived page whose source is Unknown would otherwise report a
    figure computed from its own threats alone -- less conservative than
    the truth, and looking complete. Same rule as an excluded threat."""
    ids = _quant(page)
    page.evaluate("""(pageId) => {
      const m = window.__lastUndo.model;
      const t = m.addThreat({x: 150, y: 200, name: 'Ignition', pageId});
      m.renameNode(t.nodeId, {frequency: {value: '4E-3'}});
    }""", ids["second"])
    _link(page, ids["second"], ids["consequence"])
    # Take the source's frequency away, so its consequence is unknown.
    page.evaluate("""(threatId) => {
      const m = window.__lastUndo.model;
      const t = m.findById(threatId);
      m.renameNode(t.nodeId, {frequency: null});
    }""", ids["threat"])
    result = page.evaluate(
        "(id) => window.__lastModel.computeTleLikelihood(id)", ids["second"]
    )
    assert result["excludedLink"] is True
    assert _tle(page, ids["second"]) == "0.004", "its own threat still counts"


def test_the_canvas_says_when_the_source_is_unknown(page):
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("""(threatId) => {
      const m = window.__lastUndo.model;
      m.renameNode(m.findById(threatId).nodeId, {frequency: null});
    }""", ids["threat"])
    page.evaluate("(id) => window.__lastPageTabs.select(id)", ids["second"])
    eventually_equals(
        lambda: any(
            "source unknown" in t for t in page.locator("#bowtie-canvas text").all_text_contents()
        ),
        True,
    )


def test_a_consequence_on_a_derived_page_carries_the_inherited_rate(page):
    """The link feeds the top event, so everything downstream of it on
    the derived page moves with it -- which is what "nothing propagates"
    used to mean and no longer does."""
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    downstream = page.evaluate("""(pageId) => {
      const m = window.__lastUndo.model;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Escalated', pageId});
      return c.id;
    }""", ids["second"])
    value = page.evaluate("""(id) => {
      const c = window.__lastModel.computeConsequenceLikelihood(id);
      return c.value ? c.value.toExactDecimal().toDecimalString() : null;
    }""", downstream)
    assert value == "0.001"


# --- Double counting ------------------------------------------------------

def test_a_barrier_counted_on_both_sides_of_a_link_is_flagged(page):
    """Post-mitigation at the link means the source page's barriers are
    already in the figure. Re-modelling one on the derived page counts it
    twice -- easy to do by accident, and invisible without this."""
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    # The same mitigative barrier, re-applied downstream of the link.
    page.evaluate("""([pageId, nodeId]) => {
      const m = window.__lastUndo.model;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Escalated', pageId});
      m.addMitigativeControl(c.id, {nodeId});
    }""", [ids["second"], ids["mitigativeNode"]])
    warnings = page.evaluate("() => window.__lastModel.getWarnings()")
    double = [w for w in warnings if w["type"] == "double-counted-barrier"]
    assert len(double) == 1
    assert double[0]["severity"] == "advisory", "legitimate models do this; blocking would overreach"
    assert "Pool fire" in double[0]["message"] and "counted twice" in double[0]["detail"]


def test_a_barrier_on_only_one_side_is_not_flagged(page):
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("""(pageId) => {
      const m = window.__lastUndo.model;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Escalated', pageId});
      m.addMitigativeControl(c.id, {name: 'Deluge'});
    }""", ids["second"])
    warnings = page.evaluate("() => window.__lastModel.getWarnings()")
    assert [w for w in warnings if w["type"] == "double-counted-barrier"] == []


def test_the_same_preventative_barrier_on_two_pages_is_not_flagged(page):
    """A shared barrier on two pages' threat lines is the ordinary case
    the node library exists to support -- two different chains, each
    legitimately crediting it. Only the mitigative side of a derived page
    is downstream of the link."""
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("""([pageId, nodeId]) => {
      const m = window.__lastUndo.model;
      const t = m.addThreat({x: 150, y: 200, name: 'Ignition', pageId});
      m.addPreventativeControl(t.id, {nodeId});
    }""", [ids["second"], ids["preventativeNode"]])
    warnings = page.evaluate("() => window.__lastModel.getWarnings()")
    assert [w for w in warnings if w["type"] == "double-counted-barrier"] == []


def test_the_flag_goes_away_with_the_link(page):
    ids = _quant(page)
    _link(page, ids["second"], ids["consequence"])
    page.evaluate("""([pageId, nodeId]) => {
      const m = window.__lastUndo.model;
      const c = m.addConsequence({x: 1200, y: 200, name: 'Escalated', pageId});
      m.addMitigativeControl(c.id, {nodeId});
    }""", [ids["second"], ids["mitigativeNode"]])
    page.evaluate("(id) => window.__lastUndo.model.unlinkPage(id)", ids["second"])
    warnings = page.evaluate("() => window.__lastModel.getWarnings()")
    assert [w for w in warnings if w["type"] == "double-counted-barrier"] == [], \
        "without a link there is nothing being counted twice"


# --- The cycle hole that page-scoped undo could have opened ---------------

def test_a_page_scoped_undo_cannot_restore_a_stale_link(page):
    """`derivedFrom` is document-scoped state that happens to live on a
    page record. If a page-scoped snapshot carried it, this sequence
    would put a cycle into the model without either defence seeing it:
    unlink A->B, link B->A (legal), then undo an edit on A."""
    ids = _two_pages(page)
    _link(page, ids["second"], ids["consequence"])
    result = page.evaluate("""(ids) => {
      const m = window.__lastUndo.model;
      // A page-scoped edit on the DERIVED page, snapshotted while linked.
      m.addThreat({x: 150, y: 400, name: 'Local', pageId: ids.second});
      m.unlinkPage(ids.second);
      // Now the other direction, which is legal once the first is gone.
      const c = m.addConsequence({x: 1200, y: 400, name: 'Back', pageId: ids.second});
      m.linkPageToConsequence(ids.first, c.id);
      window.__lastUndo.undo();
      window.__lastUndo.undo();
      return window.__lastModel.pages.map((p) => (p.derivedFrom ? p.derivedFrom.pageId : null));
    }""", ids)
    linked = [p for p in result if p is not None]
    assert len(linked) <= 1, f"a cycle would mean both pages point somewhere: {result}"
    # And the figures still compute rather than hanging.
    assert page.evaluate("(id) => window.__lastModel.computeTleLikelihood(id) !== null", ids["first"])
