"""Model-level coverage for Quantitative.computeBarrierWarnings --
barrier_measures_proposal.md's two advisory checks, merged into
BowtieModel.getWarnings() alongside Warnings.js's own (blocking) orphan
checks. Driven directly against window.__lastModel, mirroring
test_model_quantitative.py.
"""


def _quant_setup(page):
    page.evaluate("() => { window.__lastModel.setMode('quantitative'); }")


def test_pfh_barrier_not_limiting_is_advisory_and_named(page):
    _quant_setup(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addCause({});
      m.renameNode(c.nodeId, { name: 'Small Leak', frequency: { value: '0.01' } });
      const pb = m.addPreventativeControl(c.id);
      // PFH of 1/hr is nowhere below the 0.01/hr demand reaching it -- the
      // clamp does nothing, so this barrier credits zero risk reduction.
      m.getNode(pb.nodeId).protection = { measure: 'pfh', value: '1' };
      return m.getWarnings();
    }""")
    matches = [w for w in result if w["type"] == "pfh-barrier-not-limiting"]
    assert len(matches) == 1
    assert matches[0]["severity"] == "advisory"
    assert "Small Leak" not in matches[0]["message"]  # names the BARRIER, not the cause


def test_pfh_barrier_that_actually_limits_raises_no_warning(page):
    _quant_setup(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addCause({});
      m.getNode(c.nodeId).frequency = { value: '10' };
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'pfh', value: '0.01' };
      return m.getWarnings();
    }""")
    assert not any(w["type"] == "pfh-barrier-not-limiting" for w in result)


def test_low_demand_measure_on_high_demand_barrier_is_advisory(page):
    _quant_setup(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addCause({});
      // 1/hr is far above IEC 61511's ~1/year low-demand boundary.
      m.getNode(c.nodeId).frequency = { value: '1' };
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
      return m.getWarnings();
    }""")
    matches = [w for w in result if w["type"] == "low-demand-measure-on-high-demand-barrier"]
    assert len(matches) == 1
    assert matches[0]["severity"] == "advisory"


def test_low_demand_measure_below_the_boundary_raises_no_warning(page):
    _quant_setup(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addCause({});
      m.getNode(c.nodeId).frequency = { value: '1E-5' }; // well under 1/year
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'rrf', value: '10' };
      return m.getWarnings();
    }""")
    assert not any(w["type"] == "low-demand-measure-on-high-demand-barrier" for w in result)


def test_barrier_warnings_are_absent_outside_quantitative_mode(page):
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('qualitative');
      const c = m.addCause({});
      m.getNode(c.nodeId).frequency = { value: '1' };
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'pfh', value: '1' };
      return m.getWarnings();
    }""")
    assert result == []


def test_advisory_warnings_never_block_export(page):
    """WarningsController disables export only on `severity !== 'advisory'`
    warnings -- verified at the model layer here (getWarnings() itself);
    test_warnings_controller.py covers the UI-level export-button wiring."""
    _quant_setup(page)
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const c = m.addCause({});
      m.getNode(c.nodeId).frequency = { value: '1' };
      const pb = m.addPreventativeControl(c.id);
      m.getNode(pb.nodeId).protection = { measure: 'pfh', value: '1' };
      return m.getWarnings();
    }""")
    assert len(result) > 0
    assert all(w["severity"] == "advisory" for w in result)
