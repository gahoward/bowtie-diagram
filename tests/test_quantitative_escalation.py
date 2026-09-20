"""Escalation factors that change the numbers (proposals/21).

`proposals/08` shipped escalation factors as structure only, and said so
plainly: a factor is drawn under the barrier it degrades, an
uncontrolled factor raises an advisory — and no computed figure
anywhere changes. That left the feature saying something the arithmetic
contradicted: a barrier with three uncontrolled factors and a barrier
with none produced identical likelihoods, identical risk classes and
identical Barrier Register rows.

Two properties matter most here and have a test each:

- **Exactness.** Every degradation composes as a `Rational` multiply or
  a clamp. The app has exactly one sanctioned rounding point
  (`convertHourYear`) and this adds none — see
  `test_degradation_is_exact_not_floating_point`.
- **Agreement.** The set of factors the arithmetic degrades by is the
  same set the advisory warning names, by construction rather than by
  two implementations that happen to match — see
  `test_the_warning_and_the_arithmetic_name_the_same_factors`.
"""
from helpers import eventually_equals

# A threat at 1/hr through one PFD barrier, so the arithmetic is easy to
# read: 1 × 1E-2 = 1E-2, and a ×10 degradation makes it 1E-1.
SETUP = """() => {
  const m = window.__lastUndo.model;
  m.setMode('quantitative');
  m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
  const t = m.addThreat({x: 150, y: 200, name: 'Overpressure'});
  m.renameNode(t.nodeId, {frequency: {value: '1'}});
  const b = m.addPreventativeControl(t.id, {name: 'Relief valve'});
  m.renameNode(b.nodeId, {protection: {measure: 'pfdavg', value: '1E-2'}});
  return {threatId: t.id, barrierId: b.id, barrierNodeId: b.nodeId};
}"""


def _setup(page):
    return page.evaluate(SETUP)


def _tle(page):
    """The TLE likelihood as an EXACT decimal string.

    `toExactDecimal()` returns null for a non-terminating quotient, which
    is itself worth catching here: every figure these tests produce must
    terminate, because every degradation is a multiply or a clamp."""
    return page.evaluate("""() => {
      const c = window.__lastModel.computeTleLikelihood(window.__lastModel.pages[0].id);
      const exact = c.value.toExactDecimal();
      return exact ? exact.toDecimalString() : null;
    }""")


def _add_factor(page, barrier_id, degradation=None, controlled=False):
    return page.evaluate(
        """([barrierId, degradation, controlled]) => {
          const m = window.__lastUndo.model;
          const ef = m.addEscalationFactor(barrierId, {name: 'Untested'});
          if (degradation) m.renameNode(ef.nodeId, {degradation});
          if (controlled) m.addEscalationBarrier(ef.id, {name: 'Quarterly test'});
          return ef.id;
        }""",
        [barrier_id, degradation, controlled],
    )


# --- The core claim -------------------------------------------------------

def test_without_a_degradation_nothing_changes(page):
    """The default is null, deliberately: an existing document's figures
    change only once an analyst STATES a degradation, which is a
    decision they make rather than one the tool makes for them."""
    ids = _setup(page)
    before = _tle(page)
    _add_factor(page, ids["barrierId"])
    assert _tle(page) == before


def test_a_factor_degradation_multiplies_the_barriers_pfd(page):
    ids = _setup(page)
    assert _tle(page) == "0.01"
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "10"})
    assert _tle(page) == "0.1", "a barrier 10x worse lets 10x through"


def test_a_floor_degradation_caps_what_the_barrier_may_claim(page):
    """What analysts more often say out loud: 'with this live I will not
    claim better than 10^-1 from that barrier, whatever the datasheet
    says.'"""
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "floor", "value": "1E-1"})
    assert _tle(page) == "0.1"


def test_a_floor_that_is_better_than_the_claim_changes_nothing(page):
    """A floor is a backstop, not a target -- it must never make a
    barrier look BETTER than its own stated measure."""
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "floor", "value": "1E-4"})
    assert _tle(page) == "0.01"


def test_unknown_and_null_degradations_are_skipped(page):
    """The same conservative skip rule every other quantity uses."""
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"unknown": True})
    _add_factor(page, ids["barrierId"], None)
    assert _tle(page) == "0.01"


# --- Which factors count --------------------------------------------------

def test_a_controlled_factor_does_not_degrade(page):
    """Open question 1, answered as proposed: 'controlled' is binary
    today, and inventing partial credit for an escalation barrier would
    mean inventing a second reliability model for controls that carry no
    measure fields at all."""
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "10"}, controlled=True)
    assert _tle(page) == "0.01"


def test_controlling_a_factor_restores_the_figure(page):
    ids = _setup(page)
    ef_id = _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "10"})
    assert _tle(page) == "0.1"
    page.evaluate("(efId) => window.__lastUndo.model.addEscalationBarrier(efId, {name: 'Test'})", ef_id)
    assert _tle(page) == "0.01", "controlling it puts the claim back"


def test_the_warning_and_the_arithmetic_name_the_same_factors(page):
    """One definition (BowtieModel.isEscalationFactorUncontrolled), called
    by both. A warning saying a barrier is degraded while the numbers say
    it is not would be two opinions about the same diagram."""
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "10"})
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "10"}, controlled=True)

    warned = page.evaluate("""() => window.__lastModel.getWarnings()
      .filter((w) => w.type === 'uncontrolled-escalation-factor').map((w) => w.id)""")
    degrading = page.evaluate("""() => window.__lastModel.escalationFactors
      .filter((f) => window.__lastModel.isEscalationFactorUncontrolled(f)).map((f) => f.id)""")
    assert sorted(warned) == sorted(degrading)
    assert len(warned) == 1


# --- Composition ----------------------------------------------------------

def test_several_factors_multiply(page):
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "10"})
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "2"})
    assert _tle(page) == "0.2", "10 x 2 = 20 times worse"


def test_the_worst_floor_wins(page):
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "floor", "value": "1E-1"})
    _add_factor(page, ids["barrierId"], {"mode": "floor", "value": "1E-3"})
    assert _tle(page) == "0.1", "the worse claim is the binding one"


def test_a_floor_backstops_the_factors(page):
    """Factors apply first and the floor is the backstop -- 'I will not
    claim better than X' is a statement about the end result."""
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "factor", "value": "2"})
    _add_factor(page, ids["barrierId"], {"mode": "floor", "value": "1E-1"})
    # 1E-2 x 2 = 2E-2, which is better than the 1E-1 floor, so the floor binds.
    assert _tle(page) == "0.1"


# --- Every op -------------------------------------------------------------

def _tle_with(page, protection, degradation):
    """One threat through one barrier, on a page cleared first.

    computeTleLikelihood is a MAX over every threat on the page, so
    leaving the previous call's threat behind would silently compare the
    wrong one -- which is exactly what it did the first time."""
    page.evaluate(
        """([protection, degradation]) => {
          const m = window.__lastUndo.model;
          m.threats.slice().forEach((t) => m.deleteElement(t.id));
          m.setMode('quantitative');
          const t = m.addThreat({x: 150, y: 200, name: 'T'});
          m.renameNode(t.nodeId, {frequency: {value: '1'}});
          const b = m.addPreventativeControl(t.id, {name: 'B'});
          m.renameNode(b.nodeId, {protection});
          if (degradation) {
            const ef = m.addEscalationFactor(b.id, {name: 'EF'});
            m.renameNode(ef.nodeId, {degradation});
          }
        }""",
        [protection, degradation],
    )
    return _tle(page)


def test_an_rrf_barrier_loses_reduction_factor(page):
    """`divide`: the operand is an RRF, so k times worse means RRF/k --
    and Decimal deliberately never divides, so this is computed as
    'divide by the RRF, then multiply by k'."""
    assert _tle_with(page, {"measure": "rrf", "value": "100"}, None) == "0.01"
    assert _tle_with(page, {"measure": "rrf", "value": "100"}, {"mode": "factor", "value": "10"}) == "0.1"


def test_an_rrf_barrier_can_be_capped(page):
    """For an RRF barrier the floor is a maximum CLAIMABLE RRF -- stated
    in the barrier's own operand units, which is the only way one number
    can mean one thing."""
    assert _tle_with(page, {"measure": "rrf", "value": "1000"}, {"mode": "floor", "value": "10"}) == "0.1"
    assert _tle_with(page, {"measure": "rrf", "value": "1000"}, {"mode": "floor", "value": "1E4"}) == "0.001", \
        "a cap above the claim binds nothing"


def test_a_limiting_barrier_lets_more_through(page):
    """`limit` (PFH): F_out = min(F_in, lambda), so degrading raises the
    rate it clamps to."""
    assert _tle_with(page, {"measure": "pfh", "value": "1E-3"}, None) == "0.001"
    assert _tle_with(page, {"measure": "pfh", "value": "1E-3"}, {"mode": "factor", "value": "10"}) == "0.01"


def test_an_unknown_barrier_stays_unknown_however_degraded(page):
    """A degradation cannot conjure a figure out of a barrier that never
    claimed one -- skipping an Unknown barrier is conservative, and
    making it worse than nothing would be arithmetic about nothing."""
    assert _tle_with(page, {"unknown": True}, {"mode": "factor", "value": "10"}) == "1"


# --- Exactness ------------------------------------------------------------

def test_degradation_is_exact_not_floating_point(page):
    """The app has one sanctioned rounding point (convertHourYear) and
    this adds none. A float would show its seams here."""
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setMode('quantitative');
      const t = m.addThreat({x: 150, y: 200, name: 'T'});
      m.renameNode(t.nodeId, {frequency: {value: '1'}});
      const b = m.addPreventativeControl(t.id, {name: 'B'});
      m.renameNode(b.nodeId, {protection: {measure: 'pfdavg', value: '1E-1'}});
      const ef = m.addEscalationFactor(b.id, {name: 'EF'});
      m.renameNode(ef.nodeId, {degradation: {mode: 'factor', value: '3'}});
    }""")
    # 0.1 * 3 is 0.30000000000000004 in binary floating point.
    assert _tle(page) == "0.3"


def test_a_long_chain_of_degradations_stays_exact(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setMode('quantitative');
      const t = m.addThreat({x: 150, y: 200, name: 'T'});
      m.renameNode(t.nodeId, {frequency: {value: '1'}});
      const b = m.addPreventativeControl(t.id, {name: 'B'});
      m.renameNode(b.nodeId, {protection: {measure: 'pfdavg', value: '1E-6'}});
      for (let i = 0; i < 6; i += 1) {
        const ef = m.addEscalationFactor(b.id, {name: `EF${i}`});
        m.renameNode(ef.nodeId, {degradation: {mode: 'factor', value: '3'}});
      }
    }""")
    # 3^6 = 729, so 1E-6 x 729 = 7.29E-4, exactly.
    assert _tle(page) == "0.000729"


# --- It reaches the rest of the document ----------------------------------

def test_a_degraded_barrier_can_move_a_consequence_risk_class(page):
    """The point of the whole proposal: the diagram said the barrier was
    degraded and every number in the document said it was not."""
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const t = m.addThreat({x: 150, y: 200, name: 'T'});
      m.renameNode(t.nodeId, {frequency: {value: '1E-8'}});
      const b = m.addPreventativeControl(t.id, {name: 'B'});
      m.renameNode(b.nodeId, {protection: {measure: 'pfdavg', value: '1E-2'}});
      const c = m.addConsequence({x: 1200, y: 200, name: 'Fire'});
      m.renameNode(c.nodeId, {severityClassId: 'catastrophic'});
      window.__before = m.assessConsequence(c.id).post.riskClass.id;
      // Seven decades: enough to cross a likelihood band in any matrix
      // whose bands are decades wide, which is what leaflet5's are.
      const ef = m.addEscalationFactor(b.id, {name: 'EF'});
      m.renameNode(ef.nodeId, {degradation: {mode: 'factor', value: '1E7'}});
      window.__after = m.assessConsequence(c.id).post.riskClass.id;
    }""")
    before = page.evaluate("() => window.__before")
    after = page.evaluate("() => window.__after")
    assert before != after, f"a 1000x degraded barrier left the risk class at {before}"


def test_it_round_trips_through_json(page):
    ids = _setup(page)
    _add_factor(page, ids["barrierId"], {"mode": "floor", "value": "1E-1"})
    degraded = _tle(page)

    reloaded = page.evaluate("""() => {
      const doc = window.__lastModel.toJSON();
      window.__lastImportExport.loadDocument(JSON.parse(JSON.stringify(doc)));
      const computed = window.__lastModel.computeTleLikelihood(window.__lastModel.pages[0].id);
      return {
        tle: computed.value.toExactDecimal().toDecimalString(),
        degradation: window.__lastModel.library.escalationFactor[0].degradation,
      };
    }""")
    assert reloaded["tle"] == degraded
    assert reloaded["degradation"] == {"mode": "floor", "value": "1E-1"}


def test_it_is_one_undo_step(page):
    ids = _setup(page)
    ef_id = _add_factor(page, ids["barrierId"])
    page.evaluate(
        "(efId) => { const m = window.__lastUndo.model; const f = m.findById(efId); "
        "m.renameNode(f.nodeId, {degradation: {mode: 'factor', value: '10'}}); }",
        ef_id,
    )
    assert _tle(page) == "0.1"
    page.evaluate("() => window.__lastUndo.undo()")
    eventually_equals(lambda: _tle(page), "0.01")
