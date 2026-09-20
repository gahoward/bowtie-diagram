"""View › Barrier Criticality (proposals/23): which barriers the whole
analysis is leaning on.

The Barrier Register answers "what state is this barrier in?" and ranks
by what needs attention. This answers a different question — "what is
the analysis resting on?" — and ranks by reach: sole protection first,
then paths, then pages, then demand.

The sole-protection column is the one that earns the table, so it gets
the most tests: a line whose only stop is one barrier has nothing behind
it, and before this that was visible only by looking at the picture and
counting.
"""

from playwright.sync_api import expect


def _rows(page, page_id="null"):
    return page.evaluate(f"() => window.__lastModel.computeBarrierCriticality({page_id})")


def _open(page):
    page.click("#menu-trigger-view")
    page.click("#btn-barrier-criticality")
    expect(page.locator(".barrier-criticality")).to_be_visible()


def _close(page):
    page.get_by_role("button", name="Close", exact=True).click()
    expect(page.locator(".modal-overlay")).to_have_count(0)


def _quantitative(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
    }""")


def _one_chain(page):
    """Two threats: the first behind two barriers, the second behind one.

    So T_2's line is a sole-protection path and T_1's is not, which is
    the distinction this whole table is built on.
    """
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t1 = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.renameNode(t1.nodeId, {frequency: {value: '1E-2'}});
      const b1 = m.addPreventativeControl(t1.id, {name: 'Inspection'});
      const b2 = m.addPreventativeControl(t1.id, {name: 'Coating'});
      const t2 = m.addThreat({x: 150, y: 400, name: 'Overpressure'});
      m.renameNode(t2.nodeId, {frequency: {value: '1E-1'}});
      const b3 = m.addPreventativeControl(t2.id, {name: 'Relief valve'});
      const c = m.addConsequence({x: 1200, y: 200, name: 'Release'});
      const b4 = m.addMitigativeControl(c.id, {name: 'Bunding'});
      window.__ids = {
        t1: t1.id, t2: t2.id, c: c.id,
        b1: b1.id, b2: b2.id, b3: b3.id, b4: b4.id,
        b1Node: b1.nodeId, b3Node: b3.nodeId,
      };
      m._emitChange();
    }""")
    page.wait_for_timeout(120)


def _by_id(rows, display_id):
    return next(r for r in rows if r["displayId"] == display_id)


# --- Sole protection ------------------------------------------------------

def test_a_lone_barrier_is_named_as_the_sole_protection_for_its_origin(page):
    _one_chain(page)
    rows = _rows(page)
    relief = next(r for r in rows if r["name"] == "Relief valve")
    assert relief["soleOnPaths"] == ["T_2"], "the only thing on T_2's line"


def test_a_barrier_sharing_its_line_is_not_sole_protection(page):
    _one_chain(page)
    rows = _rows(page)
    assert next(r for r in rows if r["name"] == "Inspection")["soleOnPaths"] == []
    assert next(r for r in rows if r["name"] == "Coating")["soleOnPaths"] == []


def test_removing_the_second_barrier_makes_the_first_sole(page):
    """The finding appears the moment the analysis actually depends on
    one barrier, not when someone remembers to re-run something."""
    _one_chain(page)
    page.evaluate("() => window.__lastModel.deleteElement(window.__ids.b2)")
    page.wait_for_timeout(120)
    assert next(r for r in _rows(page) if r["name"] == "Inspection")["soleOnPaths"] == ["T_1"]


def test_a_mitigative_barrier_names_its_consequence(page):
    """Both sides of the bowtie, and the origin is named by the display
    id a reader sees on the canvas rather than an internal placement id."""
    _one_chain(page)
    assert next(r for r in _rows(page) if r["name"] == "Bunding")["soleOnPaths"] == ["C_1"]


def test_sole_protection_on_two_paths_lists_both(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      // Empty T_1's line, then run it through the one barrier already
      // standing alone on T_2's, so that barrier alone holds up both.
      m.deleteElement(window.__ids.b1);
      m.deleteElement(window.__ids.b2);
      m.attachInputToPreventativeControl(window.__ids.t1, window.__ids.b3, false);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    relief = next(r for r in _rows(page) if r["name"] == "Relief valve")
    assert relief["soleOnPaths"] == ["T_1", "T_2"]
    assert relief["pathCount"] == 2


# --- Counts ---------------------------------------------------------------

def test_path_count_follows_the_lines_through_the_barrier(page):
    _one_chain(page)
    rows = _rows(page)
    assert next(r for r in rows if r["name"] == "Inspection")["pathCount"] == 1
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.attachInputToPreventativeControl(window.__ids.t2, window.__ids.b1, false);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    assert next(r for r in _rows(page) if r["name"] == "Inspection")["pathCount"] == 2


def test_one_row_per_node_however_many_pages_it_is_placed_on(page):
    """The whole point of aggregating per node: a barrier on three pages
    is one barrier three analyses depend on, not three rows."""
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const second = m.addPage({name: 'Subsea'}).id;
      const t = m.addThreat({x: 150, y: 200, name: 'Impact', pageId: second});
      m.addPreventativeControl(t.id, {nodeId: window.__ids.b1Node});
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    rows = _rows(page)
    inspection = [r for r in rows if r["name"] == "Inspection"]
    assert len(inspection) == 1, "one row, not one per placement"
    assert inspection[0]["pageCount"] == 2
    assert inspection[0]["pathCount"] == 2, "a line on each page"


def test_a_page_scope_narrows_the_counts(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const second = m.addPage({name: 'Subsea'}).id;
      const t = m.addThreat({x: 150, y: 200, name: 'Impact', pageId: second});
      m.addPreventativeControl(t.id, {nodeId: window.__ids.b1Node});
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    first_page = page.evaluate("() => window.__lastModel.pages[0].id")
    scoped = page.evaluate(
        "(id) => window.__lastModel.computeBarrierCriticality(id)", first_page
    )
    inspection = next(r for r in scoped if r["name"] == "Inspection")
    assert inspection["pageCount"] == 1
    assert inspection["pathCount"] == 1


# --- Ranking --------------------------------------------------------------

def test_sole_protection_outranks_a_busier_barrier(page):
    """A barrier on six paths with a second layer behind it is a smaller
    finding than the one barrier holding a path up alone."""
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      // A third threat running through Inspection AND Coating, so
      // Inspection beats Relief valve on every count except the one that
      // decides the order -- and no new sole-protection path appears.
      const t3 = m.addThreat({x: 150, y: 600, name: 'Erosion'});
      m.attachInputToPreventativeControl(t3.id, window.__ids.b1, true);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    rows = _rows(page)
    assert rows[0]["soleOnPaths"], "a sole-protection row leads"
    ranks = {r["name"]: r["rank"] for r in rows}
    assert ranks["Relief valve"] < ranks["Inspection"]


def test_within_sole_protection_the_busiest_leads(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.deleteElement(window.__ids.b2);   // Inspection is now sole on T_1
      const t3 = m.addThreat({x: 150, y: 600, name: 'Erosion'});
      m.attachInputToPreventativeControl(t3.id, window.__ids.b1, false);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    rows = [r for r in _rows(page) if r["soleOnPaths"]]
    assert rows[0]["name"] == "Inspection", "two sole paths beats one"
    assert rows[0]["pathCount"] >= rows[1]["pathCount"]


def test_rank_is_dense_and_starts_at_one(page):
    _one_chain(page)
    rows = _rows(page)
    assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1))


# --- Quantitative columns -------------------------------------------------

def test_demand_rate_is_summed_across_placements(page):
    """A barrier standing in two places takes the demand arriving at
    both — the same aggregate computeDemandRateAt already forms across
    the lines reaching one placement."""
    _quantitative(page)
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const second = m.addPage({name: 'Subsea'}).id;
      const t = m.addThreat({x: 150, y: 200, name: 'Impact', pageId: second});
      m.renameNode(t.nodeId, {frequency: {value: '1E-1'}});
      m.addPreventativeControl(t.id, {nodeId: window.__ids.b1Node});
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    total = page.evaluate("""() => {
      const rows = window.__lastModel.computeBarrierCriticality();
      const row = rows.find((r) => r.name === 'Inspection');
      return row.demandRate.toExactDecimal().toDecimalString();
    }""")
    assert total == "0.11", "1E-2 arriving on page 1 plus 1E-1 on page 2"


def test_outside_quantitative_mode_there_is_no_demand_rate(page):
    _one_chain(page)
    assert all(r["demandRate"] is None for r in _rows(page))
    assert all(r["protection"] is None for r in _rows(page))


# --- The modal ------------------------------------------------------------

def test_the_menu_item_opens_one_table_for_the_whole_document(page):
    _one_chain(page)
    _open(page)
    assert page.locator(".modal-title").text_content() == "Barrier Criticality"
    assert page.locator(".barrier-criticality-table").count() == 1, "not one per page"
    assert page.locator(".barrier-criticality-table tbody tr").count() == 4
    _close(page)


def test_columns_follow_the_mode(page):
    _one_chain(page)
    _open(page)
    assert page.locator(".barrier-criticality-table thead th").all_text_contents() == [
        "#", "Barrier", "Side", "Paths", "Pages", "Sole protection for",
        "Owner", "Effectiveness", "",
    ]
    _close(page)

    _quantitative(page)
    page.wait_for_timeout(120)
    _open(page)
    assert page.locator(".barrier-criticality-table thead th").all_text_contents() == [
        "#", "Barrier", "Side", "Paths", "Pages", "Sole protection for", "Demand",
        "Owner", "Effectiveness", "",
    ]
    _close(page)


def test_the_sole_protection_cell_names_the_origin(page):
    _one_chain(page)
    _open(page)
    row = page.locator(".barrier-criticality-table tbody tr", has_text="Relief valve")
    sole = row.locator(".barrier-criticality-sole")
    expect(sole).to_have_text("T_2")
    assert "No other barrier" in sole.get_attribute("title")
    # The mitigative side names its consequence in the same column.
    bunding = page.locator(".barrier-criticality-table tbody tr", has_text="Bunding")
    expect(bunding.locator(".barrier-criticality-sole")).to_have_text("C_1")
    _close(page)


def test_the_table_says_how_many_barriers_stand_alone(page):
    _one_chain(page)
    _open(page)
    body = page.locator(".barrier-criticality").text_content()
    assert "2 barriers are the sole protection on at least one path." in body
    _close(page)


def test_a_document_with_no_lone_barriers_says_so(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const t = m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.addPreventativeControl(t.id, {name: 'Inspection'});
      m.addPreventativeControl(t.id, {name: 'Coating'});
      m._emitChange();
    }""")
    page.wait_for_timeout(120)
    _open(page)
    assert "No barrier is the sole protection on any path." in \
        page.locator(".barrier-criticality").text_content()
    _close(page)


def test_an_empty_document_offers_no_exports(page):
    _open(page)
    assert page.locator(".summary-empty").text_content() == "No barriers yet."
    assert page.get_by_role("button", name="Export CSV…").count() == 0
    _close(page)


def test_the_table_refreshes_in_place_while_open(page):
    _one_chain(page)
    _open(page)
    assert page.locator(".barrier-criticality-table tbody tr").count() == 4
    page.evaluate("() => window.__lastModel.deleteElement(window.__ids.b4)")
    expect(page.locator(".barrier-criticality-table tbody tr")).to_have_count(3)
    assert page.locator(".modal-title").text_content() == "Barrier Criticality", "same modal"
    _close(page)


# --- Export ---------------------------------------------------------------

def test_the_export_carries_the_counts_as_bare_numbers(page):
    _quantitative(page)
    _one_chain(page)
    _open(page)
    table = page.evaluate("() => window.__lastBarrierCriticality._exportTable()")
    assert table["columns"] == [
        "id", "name", "side", "paths", "pages", "sole_for", "owner", "effectiveness",
        "demand_rate", "demand_rate_unit", "warnings",
    ]
    relief = next(r for r in table["rows"] if r[1] == "Relief valve")
    assert relief[2] == "preventative"
    assert relief[3] == 1 and relief[4] == 1, "counts, not strings with units in them"
    assert relief[5] == "T_2"
    assert relief[9] == "events/hour"
    _close(page)


def test_a_barrier_on_two_paths_exports_both_origins_space_separated(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.deleteElement(window.__ids.b1);
      m.deleteElement(window.__ids.b2);
      m.attachInputToPreventativeControl(window.__ids.t1, window.__ids.b3, false);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    _open(page)
    table = page.evaluate("() => window.__lastBarrierCriticality._exportTable()")
    relief = next(r for r in table["rows"] if r[1] == "Relief valve")
    assert relief[5] == "T_1 T_2", "the same shape `protects` uses in the register"
    _close(page)
