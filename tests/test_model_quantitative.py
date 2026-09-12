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
      return { value: computed.value.toExactDecimal().toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    assert result["value"] == "0.01"
    assert result["excluded"] == 0


def test_tle_likelihood_multiplies_through_known_barriers(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const pb = m.addPreventativeControl(c1.id);
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
      const computed = m.computeTleLikelihood(m.pages[0].id);
      return computed.value.toExactDecimal().toDecimalString();
    """)
    assert result == "0.0001"


def test_tle_likelihood_skips_unknown_barrier_from_the_product_conservatively(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const pb = m.addPreventativeControl(c1.id);
      m.getNode(pb.nodeId).protection = { unknown: true };
      const computed = m.computeTleLikelihood(m.pages[0].id);
      return { value: computed.value.toExactDecimal().toDecimalString(), excluded: computed.excludedThreatCount };
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
      return { value: computed.value.toExactDecimal().toDecimalString(), excluded: computed.excludedThreatCount };
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
      m.getNode(mb.nodeId).protection = { measure: 'rrf', value: '2' };
      const computed = m.computeConsequenceLikelihood(o1.id);
      return computed.value.toExactDecimal().toDecimalString();
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
      return { value: computed.value.toExactDecimal().toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    assert result["value"] == "0.01"
    assert result["excluded"] == 1


def test_inherent_vs_residual_differ_only_by_barrier_inclusion(page):
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const pb = m.addPreventativeControl(c1.id);
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
      const residual = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: true });
      const inherent = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      return { residual: residual.value.toExactDecimal().toDecimalString(), inherent: inherent.value.toExactDecimal().toDecimalString() };
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


# --- tleAggregation: design review finding 11's max/sum choice ------------

def test_tle_aggregation_defaults_to_max(page):
    assert page.evaluate("() => window.__lastModel.tleAggregation") == "max"


def test_sum_aggregation_adds_every_known_threat_on_the_same_topology(page):
    """Same two-cause topology test_tle_likelihood_is_max_of_known_threat_
    frequencies_with_no_barriers uses (0.001 and 0.01) -- 'max' picks 0.01;
    'sum' must instead answer 0.011, visibly different from either input."""
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '0.001' };
      const c2 = m.addCause({});
      m.getNode(c2.nodeId).frequency = { value: '0.01' };
      const max = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      m.setTleAggregation('sum');
      const sum = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      return {
        max: max.value.toExactDecimal().toDecimalString(),
        sum: sum.value.toExactDecimal().toDecimalString(),
      };
    """)
    assert result["max"] == "0.01"
    assert result["sum"] == "0.011"


def test_sum_aggregation_still_excludes_unknown_threats(page):
    result = run_quant(page, """
      m.setTleAggregation('sum');
      const known = m.addCause({});
      m.getNode(known.nodeId).frequency = { value: '0.001' };
      m.addCause({}); // frequency left null -- Unknown
      const computed = m.computeTleLikelihood(m.pages[0].id, { includeBarriers: false });
      return { value: computed.value.toExactDecimal().toDecimalString(), excluded: computed.excludedThreatCount };
    """)
    assert result["value"] == "0.001"
    assert result["excluded"] == 1


def test_tle_aggregation_round_trips_through_json(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setTleAggregation('sum');
      const json = m.toJSON();
      m.setTleAggregation('max');
      m.loadFromJSON(json);
      return m.tleAggregation;
    }""")
    assert result == "sum"


def test_an_older_document_missing_tle_aggregation_defaults_to_max(page):
    # Purely additive field (see BowtieModel's constructor comment) -- a
    # document exported before this existed simply lacks the key.
    result = page.evaluate("""() => {
      const data = window.__lastModel.toJSON();
      delete data.tleAggregation;
      const restored = Bowtie.BowtieModel.fromJSON(data);
      return restored.tleAggregation;
    }""")
    assert result == "max"


def test_set_tle_aggregation_rejects_unknown_policy(page):
    threw = page.evaluate("""() => {
      try { window.__lastModel.setTleAggregation('average'); return false; }
      catch { return true; }
    }""")
    assert threw is True


# --- barrier_measures_proposal.md: measure equivalence and order ----------

def test_rrf_and_equivalent_pfd_avg_compute_bit_identical_results(page):
    """The property that makes the whole normalisation trustworthy: a
    document using rrf: 10 and one using pfdavg: 0.1 must agree exactly."""
    result = run_quant(page, """
      const mk = (protection) => {
        const c = m.addCause({});
        m.getNode(c.nodeId).frequency = { value: '1E-3' };
        const pb = m.addPreventativeControl(c.id);
        m.getNode(pb.nodeId).protection = protection;
        return m.computeTleLikelihood(m.pages[0].id).value;
      };
      const viaRrf = mk({ measure: 'rrf', value: '10' });
      const viaPfd = mk({ measure: 'pfdavg', value: '0.1' });
      return viaRrf.compare(viaPfd);
    """)
    assert result == 0


def test_barrier_order_affects_the_result_once_a_limiting_measure_is_mixed_in(page):
    """barrier_measures_proposal.md's worked example, pinned exactly: f_in
    = 1/hr through a PFD-0.1 barrier then a PFH-0.5/hr barrier gives
    1 * 0.1 = 0.1, then min(0.1, 0.5) = 0.1 (the clamp does nothing, PFH
    isn't limiting here); the OTHER order clamps FIRST (min(1, 0.5) = 0.5)
    and only then attenuates (0.5 * 0.1 = 0.05) -- a factor of two
    different, pinning that the fold is no longer order-independent once
    `limit` is mixed with `attenuate`/`divide`. Each ordering gets its own
    page (rather than two causes on one page) so `computeTleLikelihood`'s
    own max-of-causes doesn't obscure either individual number."""
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');

      const pfdThenPfhPage = m.pages[0];
      const c1 = m.addCause({ pageId: pfdThenPfhPage.id });
      m.getNode(c1.nodeId).frequency = { value: '1' };
      const pfd = m.addPreventativeControl(c1.id);
      m.getNode(pfd.nodeId).protection = { measure: 'pfdavg', value: '0.1' };
      const pfh = m.addPreventativeControl(c1.id); // appends toward the TLE, i.e. AFTER pfd
      m.getNode(pfh.nodeId).protection = { measure: 'pfh', value: '0.5' };
      const pfdThenPfh = m.computeTleLikelihood(pfdThenPfhPage.id).value.toDisplayNumber(6);

      const pfhThenPfdPage = m.addPage({ name: 'Reversed order' });
      const c2 = m.addCause({ pageId: pfhThenPfdPage.id });
      m.getNode(c2.nodeId).frequency = { value: '1' };
      const pfh2 = m.addPreventativeControl(c2.id);
      m.getNode(pfh2.nodeId).protection = { measure: 'pfh', value: '0.5' };
      const pfd2 = m.addPreventativeControl(c2.id); // appends toward the TLE, i.e. AFTER pfh2
      m.getNode(pfd2.nodeId).protection = { measure: 'pfdavg', value: '0.1' };
      const pfhThenPfd = m.computeTleLikelihood(pfhThenPfdPage.id).value.toDisplayNumber(6);

      return { pfdThenPfh, pfhThenPfd };
    }""")
    assert abs(result["pfdThenPfh"] - 0.1) < 1e-9
    assert abs(result["pfhThenPfd"] - 0.05) < 1e-9


def test_mitigative_barriers_fold_tle_first_not_outcome_first(page):
    """The reversed-storage-convention fix (DESIGN_NOTES.md gotcha #1):
    an Outcome's Line stores stops nearest-Outcome-first, but a demand
    physically reaches the TLE-nearest mitigative barrier FIRST. Order a
    PFH barrier nearest the Outcome and a PFD barrier nearest the TLE --
    walking stops as stored (Outcome-first) would apply PFD first then
    clamp with PFH; walking TLE-first (correct) clamps first, then
    attenuates -- a different, and cross-checkable, number."""
    result = run_quant(page, """
      const c1 = m.addCause({});
      m.getNode(c1.nodeId).frequency = { value: '1' };
      const o1 = m.addOutcome({});
      // First mitigative control chained off the Outcome sits nearest the
      // Outcome (stops[0]); the next one chained sits further toward the
      // TLE (stops[1]) -- addMitigativeControl always appends toward the
      // TLE, same convention as the preventative side.
      const nearOutcome = m.addMitigativeControl(o1.id);
      m.getNode(nearOutcome.nodeId).protection = { measure: 'pfdavg', value: '0.1' };
      const nearTle = m.addMitigativeControl(o1.id);
      m.getNode(nearTle.nodeId).protection = { measure: 'pfh', value: '0.5' };
      return m.computeConsequenceLikelihood(o1.id).value.toDisplayNumber(6);
    """)
    # TLE-first (correct): min(1, 0.5) = 0.5, then * 0.1 = 0.05.
    # Outcome-first (the old bug): 1 * 0.1 = 0.1, then min(0.1, 0.5) = 0.1.
    assert abs(result - 0.05) < 1e-9
