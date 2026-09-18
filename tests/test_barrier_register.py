"""View › Barrier Register (proposals/09): the barrier owner's
counterpart to the Risk Summary.

Barriers carry more data than anything else in the document — type,
owner, effectiveness, the protection measure and its value, a computed
demand rate, and up to two advisory warnings — and before this the only
way to read any of it was to open each barrier's Properties in turn.

Model-level ranking is tested against `computeBarrierRegister` directly;
the modal is tested for what a reader actually sees (columns per mode,
one table per page, live refresh).
"""


def _rows(page, page_id="null"):
    return page.evaluate(f"() => window.__lastModel.computeBarrierRegister({page_id})")


def _open(page):
    page.click("#menu-trigger-view")
    page.click("#btn-barrier-register")
    page.wait_for_timeout(120)


def _close(page):
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)


def _quantitative(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
    }""")


def _one_chain(page):
    """A cause with two preventative barriers, and an outcome with one
    mitigative barrier."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addCause({x: 150, y: 200, name: 'Corrosion'});
      m.getNode(c.nodeId).frequency = { value: '1E-2' };
      const b1 = m.addPreventativeControl(c.id, { name: 'Inspection' });
      const b2 = m.addPreventativeControl(c.id, { name: 'Coating' });
      const o = m.addOutcome({x: 1200, y: 200, name: 'Release'});
      const b3 = m.addMitigativeControl(o.id, { name: 'Bunding' });
      window.__ids = { c: c.id, b1: b1.id, b2: b2.id, o: o.id, b3: b3.id };
      m._emitChange();
    }""")
    page.wait_for_timeout(120)


def _set_node(page, placement_key, fields):
    page.evaluate(
        """({ key, fields }) => {
          const m = window.__lastModel;
          const id = window.__ids[key];
          const placement = m.findById(id);
          Object.assign(m.getNode(placement.nodeId), fields);
          m._emitChange();
        }""",
        {"key": placement_key, "fields": fields},
    )
    page.wait_for_timeout(100)


# --- the model API --------------------------------------------------------

def test_every_barrier_placement_is_a_row_with_its_metadata(page):
    _one_chain(page)
    _set_node(page, "b1", {"barrierType": "hardware", "owner": "Ops", "effectiveness": "high"})
    rows = _rows(page)
    assert len(rows) == 3
    by_name = {r["name"]: r for r in rows}
    assert set(by_name) == {"Inspection", "Coating", "Bunding"}
    inspection = by_name["Inspection"]
    assert inspection["side"] == "preventative"
    assert inspection["barrierType"] == "hardware"
    assert inspection["owner"] == "Ops"
    assert inspection["effectiveness"] == "high"
    assert by_name["Bunding"]["side"] == "mitigative"
    assert [r["rank"] for r in rows] == [1, 2, 3]


def test_protects_names_the_causes_or_outcomes_whose_lines_run_through_it(page):
    """A shared barrier is the case that matters: it has to list every
    origin it stands in the way of, not just the first."""
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const c2 = m.addCause({x: 150, y: 400, name: 'Erosion'});
      // Route the second cause through the barrier the first already uses.
      m.attachInputToPreventativeControl(c2.id, window.__ids.b1, false);
      m._emitChange();
    }""")
    page.wait_for_timeout(120)
    rows = {r["name"]: r for r in _rows(page)}
    assert rows["Inspection"]["protects"] == ["C_1", "C_2"]
    assert rows["Bunding"]["protects"] == ["O_1"]


def test_a_warned_barrier_outranks_an_unknown_one_which_outranks_a_weak_one(page):
    _quantitative(page)
    _one_chain(page)
    # Below IEC 61511's ~1/year low/high-demand boundary, so the RRF
    # barriers below don't also pick up the "low-demand measure on a
    # high-demand barrier" advisory -- that tier is exercised on its own
    # by the orphan at the end of this test.
    _set_node(page, "c", {"frequency": {"value": "1E-6"}})
    # b1: fine and strong. b2: known measure but Low effectiveness.
    _set_node(page, "b1", {"effectiveness": "high", "protection": {"measure": "rrf", "value": "10"}})
    _set_node(page, "b2", {"effectiveness": "low", "protection": {"measure": "rrf", "value": "10"}})
    # b3: no measure entered at all -> Unknown, which outranks Low.
    _set_node(page, "b3", {"effectiveness": "high", "protection": {"unknown": True}})
    assert [r["name"] for r in _rows(page)] == ["Bunding", "Coating", "Inspection"]

    # Now orphan b1 -- a blocking warning puts it straight to the top.
    page.evaluate("""() => {
      const m = window.__lastModel;
      const line = m._lineFor(window.__ids.c);
      m.connectLineDirectlyToTle(line.id, null);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    rows = _rows(page)
    assert rows[0]["warnings"], "the orphaned barrier carries its warning"
    assert rows[0]["rank"] == 1


def test_an_unrecorded_effectiveness_sorts_after_a_recorded_low(page):
    """"Nobody has said" is a gap; an assessed Low is a live weakness, and
    the order is meant to put weaknesses at the top."""
    _one_chain(page)
    _set_node(page, "b1", {"effectiveness": None})
    _set_node(page, "b2", {"effectiveness": "low"})
    _set_node(page, "b3", {"effectiveness": "high"})
    assert [r["name"] for r in _rows(page)] == ["Coating", "Bunding", "Inspection"]


def test_scoping_to_a_page_returns_only_that_pages_barriers(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const p2 = m.addPage({ name: 'Second' });
      const c = m.addCause({x: 150, y: 200, pageId: p2.id, name: 'Other cause'});
      m.addPreventativeControl(c.id, { name: 'Second-page barrier' });
      m._emitChange();
    }""")
    page.wait_for_timeout(120)
    first, second = page.evaluate("() => window.__lastModel.pages.map((p) => p.id)")
    assert len(_rows(page, f"'{first}'")) == 3
    assert [r["name"] for r in _rows(page, f"'{second}'")] == ["Second-page barrier"]
    assert len(_rows(page)) == 4, "document-wide by default"


def test_the_register_works_in_simple_mode_without_quantitative_columns(page):
    """A barrier has an owner and an effectiveness whether or not the
    document does any arithmetic."""
    _one_chain(page)
    rows = _rows(page)
    assert len(rows) == 3
    assert all(r["protection"] is None and r["demandRate"] is None for r in rows)


def test_the_demand_rate_is_the_rate_reaching_the_barrier(page):
    _quantitative(page)
    _one_chain(page)
    rows = {r["name"]: r for r in _rows(page)}
    # The first preventative barrier sees the cause's own frequency.
    assert rows["Inspection"]["demandRate"] is not None
    assert page.evaluate(
        "() => window.__lastModel.computeDemandRateAt(window.__ids.b1).toExactDecimal().toDecimalString()"
    ) == "0.01"


# --- the modal ------------------------------------------------------------

def test_the_menu_item_opens_one_table_per_page(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Topside' });
      m.addPage({ name: 'Subsea' });
    }""")
    page.wait_for_timeout(120)
    _open(page)
    assert page.locator(".modal-title").text_content() == "Barrier Register"
    sections = page.locator(".barrier-register-page")
    assert sections.count() == 2
    assert sections.nth(0).locator(".summary-page-title").text_content() == "Topside"
    assert sections.nth(1).locator(".summary-empty").text_content() == "No barriers on this page."
    assert sections.nth(0).locator("tbody tr").count() == 3
    _close(page)


def test_columns_follow_the_mode(page):
    _one_chain(page)
    _open(page)
    simple_headers = page.locator(".barrier-register-table thead th").all_text_contents()
    assert simple_headers == ["#", "Barrier", "Side", "Type", "Owner", "Effectiveness", "Protects", ""]
    _close(page)

    _quantitative(page)
    page.wait_for_timeout(100)
    _open(page)
    quant_headers = page.locator(".barrier-register-table thead th").all_text_contents()
    assert quant_headers == [
        "#", "Barrier", "Side", "Type", "Owner", "Effectiveness", "Measure", "Demand", "Protects", "",
    ]
    _close(page)


def test_a_row_reads_the_way_the_canvas_does(page):
    _quantitative(page)
    _one_chain(page)
    _set_node(page, "b1", {
        "barrierType": "hardware", "owner": "Ops", "effectiveness": "high",
        "protection": {"measure": "rrf", "value": "10"},
    })
    _open(page)
    row = page.locator(".barrier-register-table tbody tr", has_text="Inspection").first
    cells = row.locator("td").all_text_contents()
    assert cells[1].startswith("PB_")
    assert "Inspection" in cells[1]
    assert cells[2] == "Preventative"
    assert cells[3] == "Hardware"
    assert cells[4] == "Ops"
    assert cells[5] == "High"
    assert cells[6] == "RRF: 10", "the same short form the canvas prints under the barrier"
    assert cells[8] == "C_1"
    _close(page)


def test_an_unknown_measure_is_called_out_rather_than_left_blank(page):
    _quantitative(page)
    _one_chain(page)
    _open(page)
    unknown = page.locator(".barrier-register-unknown").first
    assert unknown.text_content() == "Unknown"
    _close(page)


def test_a_warning_shows_once_with_every_message_in_its_tooltip(page):
    _one_chain(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.connectLineDirectlyToTle(m._lineFor(window.__ids.c).id, null);
      m._emitChange();
    }""")
    page.wait_for_timeout(150)
    _open(page)
    marks = page.locator(".barrier-register-blocking")
    assert marks.count() == 2, "both orphaned barriers"
    assert "Not connected" in marks.first.get_attribute("title")
    _close(page)


def test_the_table_refreshes_in_place_while_open(page):
    _one_chain(page)
    _open(page)
    assert page.locator(".barrier-register-table tbody tr").count() == 3
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addPreventativeControl(window.__ids.c, { name: 'Added while open' });
    }""")
    page.wait_for_timeout(150)
    assert page.locator(".barrier-register-table tbody tr").count() == 4
    assert page.locator(".modal-title").text_content() == "Barrier Register", "same modal, new body"
    _close(page)


def test_an_empty_document_says_so_and_offers_no_exports(page):
    _open(page)
    assert page.locator(".summary-empty").text_content() == "No barriers yet."
    labels = page.locator(".modal-actions button").all_text_contents()
    assert labels == ["Close"]
    _close(page)


def test_export_writes_one_row_per_barrier_with_its_figures(page):
    _quantitative(page)
    _one_chain(page)
    _set_node(page, "b1", {
        "barrierType": "hardware", "owner": "Ops", "effectiveness": "high",
        "protection": {"measure": "rrf", "value": "10"},
    })
    _open(page)
    table = page.evaluate("""() => {
      const controller = window.__lastBarrierRegister;
      return Bowtie.TableExport.toCsv(controller._exportTable());
    }""")
    lines = table.strip().split("\n")
    assert lines[0].startswith("page,rank,id,name,side,type,owner,effectiveness,measure,measure_value")
    inspection = [line for line in lines if "Inspection" in line][0].split(",")
    assert inspection[4] == "preventative"
    assert inspection[5] == "hardware"
    assert inspection[6] == "Ops"
    assert inspection[7] == "high"
    assert inspection[8] == "rrf"
    assert inspection[9] == "10"
    assert inspection[10] == "0.01" and inspection[11] == "events/hour"
    assert inspection[12] == "C_1"
    _close(page)
