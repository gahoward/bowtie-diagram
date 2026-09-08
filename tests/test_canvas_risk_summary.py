"""Canvas "at a glance" risk summaries (quantitative_mode_proposal.md
"Canvas badges"): a short read-only text block under each Outcome
(severity/likelihood) and under the TLE (computed likelihood), rendered by
CanvasView._renderInfoText -- distinct from the small colour-coded risk-
class badge, which stays a compact chip rather than the actual figures.
"""


def _info_texts(page):
    # MinimapView clones the whole live #nodes-layer <g> -- id and all --
    # into #minimap-container (see test_multi_page.py's `_node_count`), so
    # scope through getElementById first to avoid double-counting.
    return page.evaluate("""
      () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.node-info-text text'))
        .map((t) => t.textContent)
    """)


def _setup_and_emit(page, body):
    """Mutating window.__lastModel's node objects directly (as the
    quantitative-mode model tests already do) bypasses _emitChange, which
    is what actually triggers a re-render -- an explicit m._emitChange()
    at the end makes the canvas pick the new values up, mirroring what a
    real renameNode-driven save (Properties modal, Node Library) does for
    free."""
    page.evaluate("() => {" + body + "\n  window.__lastModel._emitChange();\n}")
    page.wait_for_timeout(100)


def test_no_info_text_in_simple_mode(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addOutcome({x: 1200, y: 200});
    }""")
    page.wait_for_timeout(100)
    assert _info_texts(page) == []


def test_tle_shows_computed_likelihood_in_quantitative_mode_only(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      m.addCause({x: 150, y: 200});
    """)
    assert not any("Likelihood" in t for t in _info_texts(page)), \
        "qualitative mode has no arithmetic combination defined for the TLE"

    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.causes[0];
      m.getNode(c.nodeId).frequency = { value: '1E-3' };
    """)
    texts = _info_texts(page)
    assert any("Likelihood: 0.001/hr" in t for t in texts)


def test_tle_computed_likelihood_shows_excluded_threat_count(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c1 = m.addCause({x: 150, y: 200});
      m.getNode(c1.nodeId).frequency = { value: '1E-3' };
      const c2 = m.addCause({x: 150, y: 400});
      m.getNode(c2.nodeId).frequency = { unknown: true };
    """)
    texts = _info_texts(page)
    assert any("1 excluded" in t for t in texts)


def test_outcome_shows_severity_and_likelihood_text_in_qualitative_mode(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const o = m.addOutcome({x: 1200, y: 200});
      const node = m.getNode(o.nodeId);
      node.severityClassId = m.riskMatrix.severityClasses[2].id;
      node.likelihoodClassId = m.riskMatrix.likelihoodClasses[0].id;
    """)
    texts = _info_texts(page)
    severity_label = page.evaluate("() => window.__lastModel.riskMatrix.severityClasses[2].label")
    likelihood_label = page.evaluate("() => window.__lastModel.riskMatrix.likelihoodClasses[0].label")
    assert any(f"Severity: {severity_label}" == t for t in texts)
    assert any(f"Likelihood: {likelihood_label}" == t for t in texts)


def test_outcome_shows_computed_likelihood_text_in_quantitative_mode(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).frequency = { value: '1E-3' };
      const o = m.addOutcome({x: 1200, y: 200});
      m.getNode(o.nodeId).severityClassId = m.riskMatrix.severityClasses[3].id;
    """)
    texts = _info_texts(page)
    assert any("Likelihood: 0.001/hr" in t for t in texts)


def test_outcome_shows_nothing_when_no_risk_fields_are_set(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      m.addOutcome({x: 1200, y: 200});
    """)
    assert _info_texts(page) == []


# --- Cause: likelihood (qualitative) / frequency (quantitative) -----------

def test_cause_shows_likelihood_text_in_qualitative_mode(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).likelihoodClassId = m.riskMatrix.likelihoodClasses[1].id;
    """)
    texts = _info_texts(page)
    likelihood_label = page.evaluate("() => window.__lastModel.riskMatrix.likelihoodClasses[1].label")
    assert any(f"Likelihood: {likelihood_label}" == t for t in texts)


def test_cause_shows_frequency_text_in_quantitative_mode(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).frequency = { value: '1E-3' };
    """)
    texts = _info_texts(page)
    assert any("Frequency: 0.001/hr" == t for t in texts)


def test_cause_shows_frequency_unknown_explicitly(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).frequency = { unknown: true };
    """)
    texts = _info_texts(page)
    assert any("Frequency: Unknown" == t for t in texts)


def test_cause_shows_nothing_when_no_risk_fields_are_set(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.addCause({x: 150, y: 200});
    """)
    assert _info_texts(page) == []


# --- Barrier: risk reduction factor (quantitative only) --------------------

def test_preventative_barrier_shows_risk_reduction_factor(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).riskReductionFactor = { value: '10' };
    """)
    texts = _info_texts(page)
    assert any("RRF: 10" == t for t in texts)


def test_mitigative_barrier_shows_risk_reduction_factor_unknown(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const o = m.addOutcome({x: 1200, y: 200});
      const mb = m.addMitigativeControl(o.id);
      m.getNode(mb.nodeId).riskReductionFactor = { unknown: true };
    """)
    texts = _info_texts(page)
    assert any("RRF: Unknown" == t for t in texts)


def test_barrier_shows_no_rrf_text_in_qualitative_mode(page):
    # riskReductionFactor is quantitative-only (qualitative mode never
    # stores it -- RiskFieldsForm.js only renders that field in Quantitative
    # mode), so a barrier must never show an RRF line outside it.
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.addPreventativeControl(c.id);
    """)
    assert not any("RRF" in t for t in _info_texts(page))
