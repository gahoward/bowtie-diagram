"""Unit tests for js/model/BarrierMeasures.js -- the measure-tagged
registry barrier_measures_proposal.md adds in place of the old bare RRF
field. Driven via page.evaluate against window.Bowtie.BarrierMeasures, the
same way test_decimal.py/test_rational.py drive their own modules.
"""


def _ev(page, body):
    return page.evaluate("() => {" + body + "\n}")


DEFAULTS = "{ dangerousFraction: '1', proofTestIntervalH: '8760' }"


# --- apply(): the three composition ops ------------------------------------

def test_rrf_divides_the_frequency(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3'));
      const out = Bowtie.BarrierMeasures.apply(f, {{ measure: 'rrf', value: '10' }}, {DEFAULTS});
      return out.toExactDecimal().toDecimalString();
    """)
    assert result == "0.0001"


def test_pfdavg_attenuates_the_frequency(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3'));
      const out = Bowtie.BarrierMeasures.apply(f, {{ measure: 'pfdavg', value: '0.1' }}, {DEFAULTS});
      return out.toExactDecimal().toDecimalString();
    """)
    assert result == "0.0001"


def test_pfh_limits_the_frequency_to_the_lower_of_the_two(page):
    result = _ev(page, f"""
      const high = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      const low = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('0.01'));
      return {{
        clampsDownToPfh: Bowtie.BarrierMeasures.apply(high, {{ measure: 'pfh', value: '0.5' }}, {DEFAULTS})
          .toExactDecimal().toDecimalString(),
        leavesLowerFrequencyAlone: Bowtie.BarrierMeasures.apply(low, {{ measure: 'pfh', value: '0.5' }}, {DEFAULTS})
          .toExactDecimal().toDecimalString(),
      }};
    """)
    assert result["clampsDownToPfh"] == "0.5"
    assert result["leavesLowerFrequencyAlone"] == "0.01"


def test_unknown_and_null_protection_are_skipped_unchanged(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3'));
      return {{
        unknown: Bowtie.BarrierMeasures.apply(f, {{ unknown: true }}, {DEFAULTS}).toExactDecimal().toDecimalString(),
        nullProtection: Bowtie.BarrierMeasures.apply(f, null, {DEFAULTS}).toExactDecimal().toDecimalString(),
      }};
    """)
    assert result == {"unknown": "0.001", "nullProtection": "0.001"}


# --- Rate-based measures: exact even through an MTBF-derived reciprocal ----

def test_rate_running_limits_using_a_direct_per_hour_rate(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      const protection = {{ measure: 'rateRunning', value: '0.1', rateUnit: 'perHour' }};
      return Bowtie.BarrierMeasures.apply(f, protection, {DEFAULTS}).toExactDecimal().toDecimalString();
    """)
    assert result == "0.1"


def test_rate_running_from_mtbf_hours_is_exact_with_no_reciprocal_rounding(page):
    # MTBF of 3 hours -> lambda = 1/3, which does NOT terminate in decimal.
    # The clamp must still be exact (carried as a Rational, never computed
    # as a Decimal reciprocal) -- min(1, 1/3) = 1/3.
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      const protection = {{ measure: 'rateRunning', value: '3', rateUnit: 'mtbfH' }};
      const out = Bowtie.BarrierMeasures.apply(f, protection, {DEFAULTS});
      return {{ exact: out.toExactDecimal(), display: out.toDisplayNumber(6) }};
    """)
    assert result["exact"] is None, "1/3 does not terminate in base 10"
    assert abs(result["display"] - (1 / 3)) < 1e-6


def test_rate_standby_pfd_avg_is_lambda_times_t_over_two(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      const protection = {{ measure: 'rateStandby', value: '1E-4', rateUnit: 'perHour', testIntervalH: '100' }};
      return Bowtie.BarrierMeasures.apply(f, protection, {DEFAULTS}).toExactDecimal().toDecimalString();
    """)
    # lambda_D * T / 2 = 1E-4 * 100 / 2 = 0.005, exact.
    assert result == "0.005"


def test_dangerous_fraction_override_beats_the_project_default(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      const protection = {{
        measure: 'rateRunning', value: '1', rateUnit: 'perHour', dangerousFraction: '0.25',
      }};
      return Bowtie.BarrierMeasures.apply(f, protection, {DEFAULTS}).toExactDecimal().toDecimalString();
    """)
    assert result == "0.25"


def test_rate_running_repairable_computes_mttr_over_mtbf_plus_mttr_exactly(page):
    # lambda_D = 1/2 per hour (MTBF 2h), MTTR = 1h -> MTBF_D = 2h ->
    # U = MTTR / (MTBF_D + MTTR) = 1/3, again never rounded mid-pipeline.
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      const protection = {{ measure: 'rateRunningRepairable', value: '2', rateUnit: 'mtbfH', mttrH: '1' }};
      const out = Bowtie.BarrierMeasures.apply(f, protection, {DEFAULTS});
      return {{ exact: out.toExactDecimal(), display: out.toDisplayNumber(6) }};
    """)
    assert result["exact"] is None
    assert abs(result["display"] - (1 / 3)) < 1e-6


def test_sil_band_uses_worst_case_pfd(page):
    result = _ev(page, f"""
      const f = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      return Bowtie.BarrierMeasures.apply(f, {{ measure: 'sil', value: '2' }}, {DEFAULTS})
        .toExactDecimal().toDecimalString();
    """)
    assert result == "0.01", "SIL 2 low-demand band is 1E-3..1E-2; worst case is the upper bound"


# --- validate(): domain checks -----------------------------------------------

def test_validate_accepts_null_and_unknown(page):
    result = _ev(page, """
      return [Bowtie.BarrierMeasures.validate(null).ok, Bowtie.BarrierMeasures.validate({ unknown: true }).ok];
    """)
    assert result == [True, True]


def test_validate_rejects_rrf_below_one(page):
    result = page.evaluate("() => Bowtie.BarrierMeasures.validate({ measure: 'rrf', value: '0.5' })")
    assert result["ok"] is False


def test_validate_rejects_pfd_above_one(page):
    result = page.evaluate("() => Bowtie.BarrierMeasures.validate({ measure: 'pfdavg', value: '1.5' })")
    assert result["ok"] is False


def test_validate_requires_a_rate_unit_for_rate_measures(page):
    result = page.evaluate("() => Bowtie.BarrierMeasures.validate({ measure: 'rateRunning', value: '1' })")
    assert result["ok"] is False


def test_validate_requires_mttr_for_the_repairable_measure(page):
    result = page.evaluate("""() => Bowtie.BarrierMeasures.validate(
      { measure: 'rateRunningRepairable', value: '1', rateUnit: 'perHour' }
    )""")
    assert result["ok"] is False


def test_validate_accepts_a_fully_specified_rate_measure(page):
    result = page.evaluate("""() => Bowtie.BarrierMeasures.validate(
      { measure: 'rateStandby', value: '1E-5', rateUnit: 'perHour', testIntervalH: '4380' }
    )""")
    assert result["ok"] is True


# --- isLimiting / isLowDemand: what Warnings.js's two checks key off of ----

def test_is_limiting_true_only_for_limit_ops(page):
    result = page.evaluate("""() => ({
      pfh: Bowtie.BarrierMeasures.isLimiting({ measure: 'pfh', value: '1E-6' }),
      rateRunning: Bowtie.BarrierMeasures.isLimiting({ measure: 'rateRunning', value: '1', rateUnit: 'perHour' }),
      rrf: Bowtie.BarrierMeasures.isLimiting({ measure: 'rrf', value: '10' }),
      unknown: Bowtie.BarrierMeasures.isLimiting({ unknown: true }),
    })""")
    assert result == {"pfh": True, "rateRunning": True, "rrf": False, "unknown": False}


def test_is_low_demand_true_for_everything_except_limit_ops(page):
    result = page.evaluate("""() => ({
      rrf: Bowtie.BarrierMeasures.isLowDemand({ measure: 'rrf', value: '10' }),
      pfh: Bowtie.BarrierMeasures.isLowDemand({ measure: 'pfh', value: '1E-6' }),
      standby: Bowtie.BarrierMeasures.isLowDemand(
        { measure: 'rateStandby', value: '1E-5', rateUnit: 'perHour' },
      ),
    })""")
    assert result == {"rrf": True, "pfh": False, "standby": True}
