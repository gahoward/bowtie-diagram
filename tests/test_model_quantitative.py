"""Model-level coverage for quantitative_mode_proposal.md's calculation
pipeline (TLE max, consequence multiply, Unknown exclusion) and the
qualitative/quantitative risk-class lookup, driven directly against
window.__lastModel (BowtieModel), mirroring tests/test_model_splicing.py.
"""

LEAFLET5_SETUP = """
  const m = window.__lastModel;
  m.setMode('quantitative');
  m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
"""


def run_quant(page, body):
    """Wraps `body` (statements, ending in a `return`) in the arrow function
    page.evaluate expects, with the quantitative-mode setup already run."""
    return page.evaluate("() => {" + LEAFLET5_SETUP + body + "\n}")


def test_tle_likelihood_is_max_of_known_threat_frequencies_with_no_barriers(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const c2 = m.addCause({});
      m.getNode(c2.nodeId).frequency = { value: '0.01' };
      const computed = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      return { value: computed.value.toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    assert result["value"] == "0.01"
    assert result["excluded"] == 0


def test_tle_likelihood_multiplies_through_known_barriers(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const pb = m.addPreventativeControl(c1.id);
      m.getNode(pb.nodeId).riskReductionFactor = { value: '0.1' };
      const computed = m.computeTleLikelihood(m.pages[0].id);
      return computed.value.toDecimalString();
    """)
    assert result == "0.0001"


def test_tle_likelihood_skips_unknown_barrier_from_the_product_conservatively(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const pb = m.addPreventativeControl(c1.id);
      m.getNode(pb.nodeId).riskReductionFactor = { unknown: true };
      const computed = m.computeTleLikelihood(m.pages[0].id);
      return { value: computed.value.toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    # An Unknown barrier is skipped entirely (as if not credited) -- the
    # threat's own raw frequency passes through unchanged, and this is NOT
    # counted as an excluded threat (that flag is threat-unknown only).
    assert result["value"] == "0.001"
    assert result["excluded"] == 0


def test_tle_likelihood_excludes_unknown_threat_from_max_and_flags_the_count(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const c2 = m.addCause({});
      m.getNode(c2.nodeId).frequency = { unknown: true };
      const computed = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      return { value: computed.value.toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    assert result["value"] == "0.001"
    assert result["excluded"] == 1


def test_tle_likelihood_is_null_when_every_threat_is_unknown(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { unknown: true };
      const computed = m.computeTleLikelihood(m.pages[0].id);
      return { isNull: computed.value === null, excluded: computed.excludedThreatCount };
    """)
    assert result["isNull"] is True
    assert result["excluded"] == 1


def test_tle_likelihood_with_no_causes_at_all_is_null(page):
    result = run_quant(page, """
      const computed = m.computeTleLikelihood(m.pages[0].id);
      return computed.value === null;
    """)
    assert result is True


def test_consequence_likelihood_multiplies_tle_by_its_own_mitigative_barriers(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.01' };
      const o1 = m.addOutcome({});
      const mb = m.addMitigativeControl(o1.id);
      m.getNode(mb.nodeId).riskReductionFactor = { value: '0.5' };
      const computed = m.computeConsequenceLikelihood(o1.id);
      return computed.value.toDecimalString();
    """)
    assert result == "0.005"


def test_consequence_likelihood_inherits_excluded_threat_count_from_tle(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.01' };
      const c2 = m.addCause({});
      m.getNode(c2.nodeId).frequency = { unknown: true };
      const o1 = m.addOutcome({});
      const computed = m.computeConsequenceLikelihood(o1.id, { includeBarriers: false });
      return { value: computed.value.toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    assert result["value"] == "0.01"
    assert result["excluded"] == 1


def test_inherent_vs_residual_differ_only_by_barrier_inclusion(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const pb = m.addPreventativeControl(c1.id);
      m.getNode(pb.nodeId).riskReductionFactor = { value: '0.1' };
      const residual = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: true });
      const inherent = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      return { residual: residual.value.toDecimalString(), inherent: inherent.value.toDecimalString() };
    """)
    assert result["inherent"] == "0.001"
    assert result["residual"] == "0.0001"


def test_qualitative_risk_class_uses_manual_likelihood_no_arithmetic(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const o1 = m.addOutcome({});
      m.getNode(o1.nodeId).likelihoodClassId = 'frequent';
      m.getNode(o1.nodeId).severityClassId = 'negligible';
      return m.getConsequenceRiskClass(o1.id);
    }""")
    assert result == "C"


def test_qualitative_risk_class_is_null_when_severity_unset(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const o1 = m.addOutcome({});
      m.getNode(o1.nodeId).likelihoodClassId = 'frequent';
      return m.getConsequenceRiskClass(o1.id);
    }""")
    assert result is None


def test_quantitative_risk_class_bands_the_computed_likelihood(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      // Well within the 'frequent' band (>= 0.1/year canonical hourly).
      m.getNode(c1.nodeId).frequency = { value: Bowtie.convertHourYear(Bowtie.Decimal.parse('1'), 'yearToHour').toDecimalString() };
      const o1 = m.addOutcome({});
      m.getNode(o1.nodeId).severityClassId = 'negligible';
      return m.getConsequenceRiskClass(o1.id);
    """)
    assert result == "C"


def test_quantitative_risk_class_is_null_when_all_threats_unknown(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { unknown: true };
      const o1 = m.addOutcome({});
      m.getNode(o1.nodeId).severityClassId = 'negligible';
      return m.getConsequenceRiskClass(o1.id);
    """)
    assert result is None


def test_risk_class_is_null_without_an_active_matrix(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('qualitative');
      const o1 = m.addOutcome({});
      m.getNode(o1.nodeId).likelihoodClassId = 'frequent';
      m.getNode(o1.nodeId).severityClassId = 'negligible';
      return m.getConsequenceRiskClass(o1.id);
    }""")
    assert result is None


def test_mode_defaults_to_simple_and_round_trips_through_json(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const before = m.mode;
      m.setMode('quantitative');
      const json = m.toJSON();
      m.loadFromJSON(json);
      return { before, afterReload: m.mode };
    }""")
    assert result["before"] == "simple"
    assert result["afterReload"] == "quantitative"


def test_risk_matrix_embeds_a_full_copy_not_a_reference(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const preset = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      m.setRiskMatrix(JSON.parse(JSON.stringify(preset)));
      const isSameObject = m.riskMatrix === preset;
      m.riskMatrix.name = 'Mutated locally';
      return { isSameObject, presetUnaffected: preset.name !== 'Mutated locally' };
    }""")
    assert result["isSameObject"] is False
    assert result["presetUnaffected"] is True


def test_set_mode_rejects_unknown_mode(page):
    threw = page.evaluate("""() => {
      try { window.__lastModel.setMode('nonsense'); return false; }
      catch { return true; }
    }""")
    assert threw is True
