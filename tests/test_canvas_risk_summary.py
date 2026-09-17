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


# --- Barrier: protection measure (quantitative only) ------------------------

def test_preventative_barrier_shows_risk_reduction_factor(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
    """)
    texts = _info_texts(page)
    assert any("RRF: 10" == t for t in texts)


def test_preventative_barrier_shows_pfd_measure(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'pfdavg', value: '0.01' };
    """)
    texts = _info_texts(page)
    assert any("PFD: 0.01" == t for t in texts)


def test_mitigative_barrier_shows_protection_unknown(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const o = m.addOutcome({x: 1200, y: 200});
      const mb = m.addMitigativeControl(o.id);
      m.getNode(mb.nodeId).protection = { unknown: true };
    """)
    texts = _info_texts(page)
    assert any("Barrier: Unknown" == t for t in texts)


def test_barrier_shows_no_protection_text_in_qualitative_mode(page):
    # protection is quantitative-only (qualitative mode never stores it --
    # RiskFieldsForm.js only renders that field in Quantitative mode), so a
    # barrier must never show a protection line outside it.
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.addPreventativeControl(c.id);
    """)
    assert not any("RRF" in t or "PFD" in t or "Barrier:" in t for t in _info_texts(page))


# --- Design review finding 03: Quantitative figures render emphasized -----

def _emphasized_texts(page):
    return page.evaluate("""
      () => Array.from(document.getElementById('nodes-layer')
        .querySelectorAll('.node-info-text-emphasized text'))
        .map((t) => t.textContent)
    """)


def test_quantitative_figures_render_in_the_emphasized_style(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).frequency = { value: '1E-3' };
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
    """)
    emphasized = _emphasized_texts(page)
    assert any("Frequency: 0.001/hr" == t for t in emphasized)
    assert any("RRF: 10" == t for t in emphasized)
    assert any(t.startswith("Likelihood:") for t in emphasized), "TLE badge must also be emphasized"


def test_qualitative_class_labels_stay_at_the_quieter_default_style(page):
    # A manually-picked class (Qualitative mode) is a static category, not
    # a computed result -- it keeps the original, quieter treatment.
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).likelihoodClassId = m.riskMatrix.likelihoodClasses[0].id;
    """)
    assert _emphasized_texts(page) == []
    assert any("Likelihood:" in t for t in _info_texts(page))


# --- Design review finding 02: risk-class badge hover tooltip -------------

def test_risk_class_badge_has_a_title_tooltip_naming_the_full_label(page):
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const o = m.addOutcome({x: 1200, y: 200});
      m.getNode(o.nodeId).severityClassId = m.riskMatrix.severityClasses[m.riskMatrix.severityClasses.length - 1].id;
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).frequency = { value: '1' };
    """)
    titles = page.evaluate("""
      () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.risk-class-badge title'))
        .map((t) => t.textContent)
    """)
    # Quantitative mode renders a pre-mitigation -> post-mitigation PAIR
    # (see the tests below); with no barriers both halves land on A.
    assert len(titles) == 2
    assert titles[0].startswith("Pre-mitigation (no barriers): A - Intolerable")
    assert titles[1].startswith("Post-mitigation (with barriers): A - Intolerable")
    assert all("Immediate action required" in t for t in titles)


# --- Pre-mitigation -> post-mitigation badge pair (Quantitative mode) ------

def _badge_count(page, selector):
    """Same double-counting trap as `_info_texts`: a bare "#nodes-layer …"
    CSS selector also matches the minimap's clone of that layer (id and
    all), so counts have to be scoped through getElementById."""
    return page.evaluate(
        f"() => document.getElementById('nodes-layer').querySelectorAll('{selector}').length"
    )


def _badge_letters(page, phase):
    return page.evaluate(f"""
      () => Array.from(document.getElementById('nodes-layer')
        .querySelectorAll('.risk-class-badge-{phase} text'))
        .map((t) => t.textContent)
    """)


def test_outcome_shows_pre_and_post_mitigation_badges_in_quantitative_mode(page):
    # Catastrophic outcome, frequent cause: A before any barrier. A huge
    # mitigative RRF drops the residual likelihood into the bottom band,
    # which the Leaflet 5 matrix maps to C for a catastrophic severity.
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const o = m.addOutcome({x: 1200, y: 200});
      m.getNode(o.nodeId).severityClassId = 'catastrophic';
      const c = m.addCause({x: 150, y: 200});
      m.getNode(c.nodeId).frequency = { value: '1' };
      const mb = m.addMitigativeControl(o.id);
      m.getNode(mb.nodeId).protection = { measure: 'rrf', value: '1E12' };
    """)
    assert _badge_letters(page, "pre") == ["A"]
    assert _badge_letters(page, "post") == ["C"]
    # The pre-mitigation ring is dashed (inline, so exports keep it); the
    # post-mitigation one is solid.
    dashed = page.evaluate("""
      () => [
        document.querySelector('#nodes-layer .risk-class-badge-pre circle').getAttribute('stroke-dasharray'),
        document.querySelector('#nodes-layer .risk-class-badge-post circle').getAttribute('stroke-dasharray'),
      ]
    """)
    assert dashed[0] is not None
    assert dashed[1] is None
    assert _badge_count(page, ".risk-class-badge-arrow") == 1
    texts = _info_texts(page)
    assert any(t.startswith("Pre-mitigation: 1/hr") for t in texts)
    assert any(t.startswith("Likelihood: 1e-12/hr") for t in texts)


def test_outcome_shows_a_single_unphased_badge_in_qualitative_mode(page):
    # A manual likelihood pick has no barrier arithmetic to strip out, so
    # there is no "pre-mitigation" half -- one badge, plain tooltip.
    _setup_and_emit(page, """
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const o = m.addOutcome({x: 1200, y: 200});
      const node = m.getNode(o.nodeId);
      node.severityClassId = 'catastrophic';
      node.likelihoodClassId = 'frequent';
    """)
    assert _badge_count(page, ".risk-class-badge") == 1
    assert _badge_count(page, ".risk-class-badge-pre") == 0
    assert _badge_count(page, ".risk-class-badge-arrow") == 0
    title = page.evaluate("() => document.querySelector('#nodes-layer .risk-class-badge title').textContent")
    assert title.startswith("A - Intolerable")
    assert not any("Pre-mitigation" in t for t in _info_texts(page))
