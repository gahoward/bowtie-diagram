"""Unit tests for js/model/Rational.js -- the exact numerator/denominator
pair the quantitative pipeline carries a computed likelihood in.

Why it exists: a barrier's Risk Reduction Factor is >= 1 (IEC 61511:
RRF = 1/PFD) and DIVIDES the frequency, and division is the one operation
Decimal cannot always do exactly. Rather than round mid-calculation, a
contribution keeps the frequency as its numerator and multiplies each RRF
into its denominator; the two places that compare -- picking the largest
threat contribution, and banding against the risk matrix -- cross-multiply
instead of dividing. The single division happens at display.
"""


def _ev(page, body):
    return page.evaluate("() => {" + body + "\n}")


# --- Exact division where the quotient terminates -------------------------

def test_dividing_by_a_power_of_ten_is_exact(page):
    result = _ev(page, """
      const r = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('0.001'))
        .divideBy(Bowtie.Decimal.parse('10'));
      return r.toExactDecimal().toDecimalString();
    """)
    assert result == "0.0001"


def test_a_chain_of_barriers_divides_exactly(page):
    # 1E-3 through RRF 10 then RRF 100 -> 1E-6, with no rounding anywhere.
    result = _ev(page, """
      let r = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3'));
      r = r.divideBy(Bowtie.Decimal.parse('10')).divideBy(Bowtie.Decimal.parse('100'));
      return r.toExactDecimal().toDecimalString();
    """)
    assert result == "0.000001"


def test_non_power_of_ten_divisors_that_still_terminate(page):
    result = _ev(page, """
      const one = () => Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'));
      return {
        byTwo:      one().divideBy(Bowtie.Decimal.parse('2')).toExactDecimal().toDecimalString(),
        byFour:     one().divideBy(Bowtie.Decimal.parse('4')).toExactDecimal().toDecimalString(),
        byTwoFive:  one().divideBy(Bowtie.Decimal.parse('2.5')).toExactDecimal().toDecimalString(),
        byTwenty:   one().divideBy(Bowtie.Decimal.parse('20')).toExactDecimal().toDecimalString(),
      };
    """)
    assert result == {"byTwo": "0.5", "byFour": "0.25", "byTwoFive": "0.4", "byTwenty": "0.05"}


def test_non_terminating_quotient_reports_itself_as_inexact(page):
    result = _ev(page, """
      const third = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'))
        .divideBy(Bowtie.Decimal.parse('3'));
      return { exact: third.toExactDecimal(), display: third.toDisplayNumber(6) };
    """)
    assert result["exact"] is None, "1/3 does not terminate in base 10"
    assert abs(result["display"] - 0.333333) < 1e-9


# --- Exact comparison, the reason this type exists ------------------------

def test_comparison_is_exact_past_the_point_a_rounded_value_would_agree(page):
    """The crux of carrying a rational rather than dividing eagerly. 1/3 is
    strictly greater than 0.333333333333, but a calculation that divided and
    rounded to 12 significant figures would produce exactly that value and
    call the two equal."""
    result = _ev(page, """
      const third = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1'))
        .divideBy(Bowtie.Decimal.parse('3'));
      const twelveThrees = Bowtie.Decimal.parse('0.333333333333');
      return {
        exactComparison: third.compareToDecimal(twelveThrees),
        whatRoundingWouldSay: Bowtie.Decimal.parse(String(third.toDisplayNumber(12)))
          .compare(twelveThrees),
      };
    """)
    assert result["exactComparison"] == 1, "1/3 > 0.333333333333, exactly"
    assert result["whatRoundingWouldSay"] == 0, "rounded to 12 sig figs they are indistinguishable"


def test_equal_values_with_different_denominators_compare_equal(page):
    # 1/2 and 5/10 are the same number reached by different barrier chains.
    result = _ev(page, """
      const a = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1')).divideBy(Bowtie.Decimal.parse('2'));
      const b = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('5')).divideBy(Bowtie.Decimal.parse('10'));
      return { compare: a.compare(b), aGreater: a.greaterThan(b), bGreater: b.greaterThan(a) };
    """)
    assert result == {"compare": 0, "aGreater": False, "bGreater": False}


def test_max_picks_the_largest_across_different_denominators(page):
    result = _ev(page, """
      const mk = (n, d) => Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse(n))
        .divideBy(Bowtie.Decimal.parse(d));
      const values = [mk('1', '1000'), mk('1', '3'), mk('1', '10'), mk('1', '10000')];
      return Bowtie.Rational.max(values).toDisplayNumber(6);
    """)
    assert abs(result - 0.333333) < 1e-9, "1/3 is the largest of the four"


def test_max_of_an_empty_list_is_null(page):
    assert _ev(page, "return Bowtie.Rational.max([]);") is None


# --- add/sum: design review finding 11's alternative aggregation ----------

def test_add_across_different_denominators_is_exact(page):
    # 1/1000 (1E-3 / RRF 1) + 1/10 (1E-3 / RRF 100, i.e. 1E-5) -- the
    # denominators differ, so this exercises the cross-multiplied numerator
    # add() has to do, not just Decimal.add's own alignment.
    result = _ev(page, """
      const a = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3')).divideBy(Bowtie.Decimal.parse('1'));
      const b = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3')).divideBy(Bowtie.Decimal.parse('100'));
      return a.add(b).toExactDecimal().toDecimalString();
    """)
    assert result == "0.00101", "1E-3 + 1E-5 = 1.01E-3, exactly"


def test_sum_of_several_contributions_matches_repeated_add(page):
    result = _ev(page, """
      const mk = (n, d) => Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse(n))
        .divideBy(Bowtie.Decimal.parse(d));
      const values = [mk('1E-3', '1'), mk('1E-3', '10'), mk('1E-3', '100')];
      return Bowtie.Rational.sum(values).toExactDecimal().toDecimalString();
    """)
    assert result == "0.00111", "1E-3 + 1E-4 + 1E-5 = 1.11E-3, exactly"


def test_sum_of_an_empty_list_is_null(page):
    assert _ev(page, "return Bowtie.Rational.sum([]);") is None


def test_sum_of_one_value_equals_that_value(page):
    result = _ev(page, """
      const r = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3')).divideBy(Bowtie.Decimal.parse('7'));
      return Bowtie.Rational.sum([r]).compare(r);
    """)
    assert result == 0


# --- Banding: where exactness actually changes an answer ------------------

def test_a_likelihood_on_a_band_boundary_lands_in_the_upper_band(page):
    """Round-numbered LOPA inputs land exactly on band floors routinely, so
    banding compares by cross-multiplication rather than dividing first."""
    result = _ev(page, """
      const matrix = {
        likelihoodClasses: [
          { id: 'upper', ordinal: 1, label: 'Upper', minValue: '0.0001' },
          { id: 'lower', ordinal: 0, label: 'Lower', minValue: '0' },
        ],
      };
      // 1E-3 divided by an RRF of 10 is exactly the upper band's floor.
      const onTheBoundary = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3'))
        .divideBy(Bowtie.Decimal.parse('10'));
      const justBelow = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-3'))
        .divideBy(Bowtie.Decimal.parse('10.0001'));
      return {
        onBoundary: Bowtie.RiskMatrix.bandForValue(matrix, onTheBoundary).id,
        justBelow: Bowtie.RiskMatrix.bandForValue(matrix, justBelow).id,
      };
    """)
    assert result["onBoundary"] == "upper", "a value exactly on the floor belongs to that band"
    assert result["justBelow"] == "lower"


def test_band_for_value_still_accepts_a_plain_decimal(page):
    # Qualitative-mode callers and the preset tests pass Decimals directly.
    result = _ev(page, """
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      return Bowtie.RiskMatrix.bandForValue(m, Bowtie.Decimal.parse('0')).id;
    """)
    assert result == "incredible"


# --- Display ---------------------------------------------------------------

def test_scaling_the_numerator_for_year_display_is_exact(page):
    """events/hour -> events/year multiplies by an exact 8760, so this
    display direction costs no precision at all -- unlike year -> hour
    ENTRY, which divides and is irreducibly lossy."""
    result = _ev(page, """
      const perHour = Bowtie.Rational.fromDecimal(Bowtie.Decimal.parse('1E-4'))
        .divideBy(Bowtie.Decimal.parse('10'));
      const perYear = perHour.multiplyNumerator(Bowtie.Decimal.parse(String(Bowtie.HOURS_PER_YEAR)));
      return perYear.toExactDecimal().toDecimalString();
    """)
    assert result == "0.0876", "1E-5 events/hour x 8760 = 0.0876 events/year, exactly"


def test_zero_numerator_is_zero(page):
    result = _ev(page, """
      const z = Bowtie.Rational.fromDecimal(Bowtie.Decimal.zero()).divideBy(Bowtie.Decimal.parse('7'));
      return { isZero: z.isZero(), exact: z.toExactDecimal().toDecimalString() };
    """)
    assert result == {"isZero": True, "exact": "0"}
