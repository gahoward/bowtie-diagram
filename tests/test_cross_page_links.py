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


# --- Nothing moves --------------------------------------------------------

def test_linking_changes_no_computed_figure(page):
    """The whole point of shipping the structure first: the relationship
    is recorded, and every number is exactly what it was."""
    ids = page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.renameNode(t.nodeId, {frequency: {value: '1E-2'}});
      const c = m.addConsequence({x: 1200, y: 200, name: 'Loss of containment'});
      const second = m.addPage({name: 'Pool fire'});
      const t2 = m.addThreat({x: 150, y: 200, name: 'Ignition', pageId: second.id});
      m.renameNode(t2.nodeId, {frequency: {value: '1E-3'}});
      return {consequence: c.id, first: m.pages[0].id, second: second.id};
    }""")
    before = page.evaluate(
        "(id) => window.__lastModel.computeTleLikelihood(id).likelihood", ids["second"]
    )
    _link(page, ids["second"], ids["consequence"])
    after = page.evaluate(
        "(id) => window.__lastModel.computeTleLikelihood(id).likelihood", ids["second"]
    )
    assert after == before, "the derived page still computes from its own threats"
