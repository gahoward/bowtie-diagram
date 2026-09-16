"""Pre-mitigation vs post-mitigation risk (quantitative_mode_proposal.md's
"computed twice -- inherent and residual" ALARP pair), at the model level
(BowtieModel.assessConsequence / computeRiskSummary) and in the View >
"Risk Summary..." modal (RiskSummaryController) that tabulates it.

Leaflet 5 facts these tests lean on: a catastrophic outcome fed by a
frequent (>= ~0.1/year) cause is class A; the same outcome pushed down into
the bottom likelihood band (cells[0]) is class C.
"""

LEAFLET5 = "JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5))"


def _class_id(x):
    return x["id"] if x else None


# --- Model: assessConsequence ----------------------------------------------

def test_assess_consequence_reports_pre_and_post_mitigation_classes(page):
    result = page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c = m.addCause({{}});
      m.getNode(c.nodeId).frequency = {{ value: '1' }};
      const o = m.addOutcome({{}});
      m.getNode(o.nodeId).severityClassId = 'catastrophic';
      const mb = m.addMitigativeControl(o.id);
      m.getNode(mb.nodeId).protection = {{ measure: 'rrf', value: '1E12' }};
      const a = m.assessConsequence(o.id);
      return {{
        severity: a.severity.id,
        pre: {{ risk: a.pre.riskClass.id, band: a.pre.likelihoodClass.id,
                value: a.pre.likelihood.value.toExactDecimal().toDecimalString() }},
        post: {{ risk: a.post.riskClass.id, band: a.post.likelihoodClass.id,
                 value: a.post.likelihood.value.toExactDecimal().toDecimalString() }},
      }};
    }}""")
    assert result["severity"] == "catastrophic"
    assert result["pre"] == {"risk": "A", "band": "frequent", "value": "1"}
    assert result["post"]["risk"] == "C"
    assert result["post"]["value"] == "0.000000000001"
    assert result["post"]["band"] != "frequent"


def test_assess_consequence_pre_mitigation_ignores_preventative_barriers_too(page):
    # "Removing all barriers" means both sides of the bowtie.
    result = page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c = m.addCause({{}});
      m.getNode(c.nodeId).frequency = {{ value: '0.01' }};
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = {{ measure: 'rrf', value: '10' }};
      const o = m.addOutcome({{}});
      m.getNode(o.nodeId).severityClassId = 'major';
      const mb = m.addMitigativeControl(o.id);
      m.getNode(mb.nodeId).protection = {{ measure: 'rrf', value: '2' }};
      const a = m.assessConsequence(o.id);
      return {{
        pre: a.pre.likelihood.value.toExactDecimal().toDecimalString(),
        post: a.post.likelihood.value.toExactDecimal().toDecimalString(),
      }};
    }}""")
    assert result == {"pre": "0.01", "post": "0.0005"}


def test_assess_consequence_has_no_pre_mitigation_half_in_qualitative_mode(page):
    result = page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix({LEAFLET5});
      const o = m.addOutcome({{}});
      const node = m.getNode(o.nodeId);
      node.severityClassId = 'catastrophic';
      node.likelihoodClassId = 'frequent';
      const a = m.assessConsequence(o.id);
      return {{ pre: a.pre, postRisk: a.post.riskClass.id, postLikelihood: a.post.likelihood,
                postBand: a.post.likelihoodClass.id }};
    }}""")
    assert result["pre"] is None
    assert result["postRisk"] == "A"
    assert result["postLikelihood"] is None
    assert result["postBand"] == "frequent"


def test_assess_consequence_is_null_in_simple_mode_or_without_a_matrix(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const o = m.addOutcome({});
      const simple = m.assessConsequence(o.id);
      m.setMode('quantitative');
      const noMatrix = m.assessConsequence(o.id);
      return { simple, noMatrix };
    }""")
    assert result == {"simple": None, "noMatrix": None}


def test_assess_consequence_leaves_classes_null_until_determinable(page):
    result = page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c = m.addCause({{}});
      m.getNode(c.nodeId).frequency = {{ value: '1' }};
      const o = m.addOutcome({{}}); // no severity picked yet
      const a = m.assessConsequence(o.id);
      return {{ severity: a.severity, preRisk: a.pre.riskClass, postRisk: a.post.riskClass,
                preBand: a.pre.likelihoodClass.id, hasLikelihood: a.post.likelihood !== null }};
    }}""")
    assert result["severity"] is None
    assert result["preRisk"] is None and result["postRisk"] is None
    # The likelihood axis alone is still known -- only the cell lookup isn't.
    assert result["preBand"] == "frequent"
    assert result["hasLikelihood"] is True


# --- Model: computeRiskSummary ranking --------------------------------------

def _build_ranked_scenario(page):
    """Three outcomes on page one plus one on a second page:
      O_1 catastrophic, no barrier          -> A / A
      O_2 catastrophic, RRF 1E12 barrier    -> A / C
      O_3 no severity                        -> undetermined
      O_4 (page 2) marginal, own cause 1/hr -> A / A (Leaflet 5: frequent x
                                               marginal is A)
    """
    page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c = m.addCause({{}});
      m.getNode(c.nodeId).frequency = {{ value: '1' }};
      const o1 = m.addOutcome({{ name: 'Worst' }});
      m.getNode(o1.nodeId).severityClassId = 'catastrophic';
      const o2 = m.addOutcome({{ name: 'Mitigated' }});
      m.getNode(o2.nodeId).severityClassId = 'catastrophic';
      const mb = m.addMitigativeControl(o2.id);
      m.getNode(mb.nodeId).protection = {{ measure: 'rrf', value: '1E12' }};
      m.addOutcome({{ name: 'Unrated' }});
      const p2 = m.addPage({{ name: 'Second' }});
      const c2 = m.addCause({{ pageId: p2.id }});
      m.getNode(c2.nodeId).frequency = {{ value: '1' }};
      const o4 = m.addOutcome({{ pageId: p2.id, name: 'Elsewhere' }});
      m.getNode(o4.nodeId).severityClassId = 'marginal';
      m._emitChange();
    }}""")
    page.wait_for_timeout(100)


def test_risk_summary_ranks_every_outcome_worst_first_across_pages(page):
    _build_ranked_scenario(page)
    rows = page.evaluate("""() => window.__lastModel.computeRiskSummary().map((r) => ({
      rank: r.rank, name: r.name, page: r.pageName,
      pre: r.pre.riskClass && r.pre.riskClass.id, post: r.post.riskClass && r.post.riskClass.id,
    }))""")
    assert [r["rank"] for r in rows] == [1, 2, 3, 4]
    # Post-mitigation class leads; within the two residual-A outcomes the
    # worse severity (catastrophic over marginal) wins; the A -> C outcome
    # comes after both; an undetermined outcome always sorts last.
    assert [r["name"] for r in rows] == ["Worst", "Elsewhere", "Mitigated", "Unrated"]
    assert [(r["pre"], r["post"]) for r in rows] == [("A", "A"), ("A", "A"), ("A", "C"), (None, None)]
    assert rows[1]["page"] == "Second"


def test_risk_summary_can_be_scoped_to_one_page_with_ranks_restarting(page):
    _build_ranked_scenario(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const per = (pageId) => m.computeRiskSummary(pageId).map((r) => [r.rank, r.name, r.pageName]);
      return { first: per(m.pages[0].id), second: per(m.pages[1].id) };
    }""")
    assert result["first"] == [[1, "Worst", "Untitled Page"], [2, "Mitigated", "Untitled Page"], [3, "Unrated", "Untitled Page"]]
    assert result["second"] == [[1, "Elsewhere", "Second"]]


def test_risk_summary_tie_breaks_equal_residual_class_by_pre_mitigation_class(page):
    # Two catastrophic outcomes both residual C: the one that got there
    # from A (relying on a barrier) is more fragile than one that started
    # lower, so it ranks first.
    rows = page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c = m.addCause({{}});
      m.getNode(c.nodeId).frequency = {{ value: '1' }};
      const fragile = m.addOutcome({{ name: 'Fragile' }});
      m.getNode(fragile.nodeId).severityClassId = 'catastrophic';
      const mb = m.addMitigativeControl(fragile.id);
      m.getNode(mb.nodeId).protection = {{ measure: 'rrf', value: '1E12' }};
      // Same residual band via a cause that is already negligible on page 2.
      const p2 = m.addPage({{ name: 'Second' }});
      const c2 = m.addCause({{ pageId: p2.id }});
      m.getNode(c2.nodeId).frequency = {{ value: '1E-12' }};
      const inherent = m.addOutcome({{ pageId: p2.id, name: 'Inherently low' }});
      m.getNode(inherent.nodeId).severityClassId = 'catastrophic';
      return m.computeRiskSummary().map((r) => [r.name, r.pre.riskClass.id, r.post.riskClass.id]);
    }}""")
    assert rows == [["Fragile", "A", "C"], ["Inherently low", "C", "C"]]


def test_risk_summary_is_null_in_simple_mode(page):
    assert page.evaluate("() => window.__lastModel.computeRiskSummary()") is None


# --- UI: View > Risk Summary... modal ---------------------------------------

def _open_summary(page):
    page.click("#menu-trigger-view")
    page.click("#btn-risk-summary")
    page.wait_for_timeout(100)


def _table_rows(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('.risk-summary-table tbody tr'))
      .map((tr) => ({
        rank: tr.dataset.rank,
        cells: Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
      }))""")


def test_risk_summary_menu_item_lives_in_the_view_menu(page):
    page.click("#menu-trigger-view")
    labels = page.locator("#menu-dropdown-view .menu-dropdown-item").all_text_contents()
    assert any("Risk Summary" in t for t in labels)


def test_risk_summary_modal_explains_it_needs_a_risk_mode(page):
    _open_summary(page)
    body = page.locator(".modal-dialog").text_content()
    assert "Qualitative or Quantitative mode" in body
    assert page.locator(".risk-summary-table").count() == 0
    page.get_by_role("button", name="Close", exact=True).click()


def test_risk_summary_modal_tabulates_ranked_outcomes(page):
    _build_ranked_scenario(page)
    _open_summary(page)
    rows = _table_rows(page)
    # One table per page: page one's three outcomes ranked 1-3, then page
    # two's single outcome starting again at 1.
    assert [r["rank"] for r in rows] == ["1", "2", "3", "1"]
    # rank, outcome, severity, then the two (likelihood, risk class) pairs.
    assert len(rows[0]["cells"]) == 7
    first = rows[0]["cells"]
    assert first[1].startswith("O_1") and "Worst" in first[1]
    assert first[2] == "Catastrophic"
    assert first[3].startswith("1/hr") and "Frequent" in first[3]
    assert "A - Intolerable" in first[4]
    assert "A - Intolerable" in first[6]
    mitigated = rows[1]["cells"]
    assert "Mitigated" in mitigated[1]
    assert "A - Intolerable" in mitigated[4]
    assert mitigated[5].startswith("1e-12/hr")
    assert "C - Tolerable" in mitigated[6]
    unrated = rows[2]["cells"]
    assert unrated[2] == "—" and unrated[4] == "—" and unrated[6] == "—"
    assert "Elsewhere" in rows[3]["cells"][1]
    # Header groups name the two phases.
    head = page.locator(".risk-summary-table thead").first.text_content()
    assert "Pre-mitigation" in head and "Post-mitigation" in head
    page.get_by_role("button", name="Close", exact=True).click()


def test_risk_summary_modal_has_one_section_per_page_in_page_order(page):
    _build_ranked_scenario(page)
    page.evaluate("() => { window.__lastModel.addPage({ name: 'Empty' }); }")
    page.wait_for_timeout(80)
    _open_summary(page)
    sections = page.evaluate("""() => Array.from(document.querySelectorAll('.risk-summary-page')).map((s) => ({
      title: s.querySelector('.risk-summary-page-title').textContent,
      tables: s.querySelectorAll('.risk-summary-table').length,
      rows: s.querySelectorAll('tbody tr').length,
      empty: s.querySelector('.risk-summary-empty') ? s.querySelector('.risk-summary-empty').textContent : null,
    }))""")
    assert [s["title"] for s in sections] == ["Untitled Page", "Second", "Empty"]
    assert [s["rows"] for s in sections] == [3, 1, 0]
    assert sections[2]["tables"] == 0
    assert sections[2]["empty"] == "No outcomes on this page."
    page.get_by_role("button", name="Close", exact=True).click()


def test_risk_summary_modal_shows_dashes_for_pre_mitigation_in_qualitative_mode(page):
    page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix({LEAFLET5});
      const o = m.addOutcome({{ name: 'Picked' }});
      const node = m.getNode(o.nodeId);
      node.severityClassId = 'catastrophic';
      node.likelihoodClassId = 'frequent';
      m._emitChange();
    }}""")
    page.wait_for_timeout(80)
    _open_summary(page)
    cells = _table_rows(page)[0]["cells"]
    assert cells[3] == "—" and cells[4] == "—"  # pre-mitigation likelihood / class
    assert cells[5] == "Frequent"
    assert "A - Intolerable" in cells[6]
    assert "need Quantitative mode" in page.locator(".risk-summary-intro").text_content()
    page.get_by_role("button", name="Close", exact=True).click()


def test_risk_summary_modal_flags_excluded_unknown_causes(page):
    page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c1 = m.addCause({{}});
      m.getNode(c1.nodeId).frequency = {{ value: '1' }};
      const c2 = m.addCause({{}});
      m.getNode(c2.nodeId).frequency = {{ unknown: true }};
      const o = m.addOutcome({{}});
      m.getNode(o.nodeId).severityClassId = 'major';
      m._emitChange();
    }}""")
    page.wait_for_timeout(80)
    _open_summary(page)
    cells = _table_rows(page)[0]["cells"]
    assert cells[3].startswith("1/hr*")
    assert "excluded" in page.locator(".risk-summary-note").text_content()
    page.get_by_role("button", name="Close", exact=True).click()


def test_risk_summary_modal_refreshes_while_open(page):
    page.evaluate(f"""() => {{
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix({LEAFLET5});
      const c = m.addCause({{}});
      m.getNode(c.nodeId).frequency = {{ value: '1' }};
      m.addOutcome({{ name: 'First' }});
    }}""")
    page.wait_for_timeout(80)
    _open_summary(page)
    assert len(_table_rows(page)) == 1
    page.evaluate("() => { window.__lastUndo.model.addOutcome({ name: 'Second' }); }")
    page.wait_for_timeout(80)
    assert len(_table_rows(page)) == 2
    page.get_by_role("button", name="Close", exact=True).click()
