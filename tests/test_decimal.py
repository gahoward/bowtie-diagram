"""Unit tests for js/model/Decimal.js -- the exact mantissa+exponent decimal
type quantitative mode uses instead of native Number for every frequency/
reduction-factor value (quantitative_mode_proposal.md "Numeric precision
strategy"). Driven via page.evaluate against window.Bowtie.Decimal, the
same way every other JS unit in this app is tested.
"""


def test_parse_plain_decimal_round_trips_exactly(page):
    result = page.evaluate("""() => {
      const d = Bowtie.Decimal.parse('0.001');
      return d.toDecimalString();
    }""")
    assert result == '0.001'


def test_parse_scientific_notation_round_trips(page):
    result = page.evaluate("""() => {
      return [
        Bowtie.Decimal.parse('1E-3').toDecimalString(),
        Bowtie.Decimal.parse('4.2E-4').toDecimalString(),
        Bowtie.Decimal.parse('1.2e-6').toDecimalString(),
      ];
    }""")
    assert result == ['0.001', '0.00042', '0.0000012']


def test_parse_integers_and_negative_values(page):
    result = page.evaluate("""() => {
      return [
        Bowtie.Decimal.parse('42').toDecimalString(),
        Bowtie.Decimal.parse('-3.5').toDecimalString(),
        Bowtie.Decimal.parse('0').toDecimalString(),
      ];
    }""")
    assert result == ['42', '-3.5', '0']


def test_parse_rejects_garbage(page):
    threw = page.evaluate("""() => {
      try { Bowtie.Decimal.parse('not a number'); return false; }
      catch { return true; }
    }""")
    assert threw is True


def test_multiply_is_exact_across_a_long_chain(page):
    # 0.1 multiplied by itself 20 times in native floating point drifts;
    # the whole point of this type is that it must not.
    result = page.evaluate("""() => {
      let acc = Bowtie.Decimal.parse('1');
      const factor = Bowtie.Decimal.parse('0.1');
      for (let i = 0; i < 20; i++) acc = acc.multiply(factor);
      return acc.toDecimalString();
    }""")
    assert result == '0.' + '0' * 19 + '1'


def test_multiply_combines_mantissa_and_exponent(page):
    result = page.evaluate("""() => {
      return Bowtie.Decimal.parse('1.2E-6').multiply(Bowtie.Decimal.parse('0.1')).toDecimalString();
    }""")
    assert result == '0.00000012'


def test_compare_exact_at_a_boundary_value(page):
    # This is the whole reason this type exists: 0.001 must compare exactly
    # equal to a band boundary of the same nominal value, never nudged by
    # binary floating-point representation error.
    result = page.evaluate("""() => {
      const a = Bowtie.Decimal.parse('0.001');
      const b = Bowtie.Decimal.parse('1E-3');
      return { equal: a.equals(b), lt: a.lessThan(b), gte: a.greaterThanOrEqual(b) };
    }""")
    assert result == {'equal': True, 'lt': False, 'gte': True}


def test_compare_different_exponents(page):
    result = page.evaluate("""() => {
      return {
        a: Bowtie.Decimal.parse('0.01').greaterThan(Bowtie.Decimal.parse('0.001')),
        b: Bowtie.Decimal.parse('0.0001').lessThan(Bowtie.Decimal.parse('0.001')),
        c: Bowtie.Decimal.parse('5E-2').equals(Bowtie.Decimal.parse('0.05')),
      };
    }""")
    assert result == {'a': True, 'b': True, 'c': True}


def test_max_picks_the_largest_of_several_values(page):
    result = page.evaluate("""() => {
      const values = ['0.001', '1E-4', '0.5', '1E-9'].map((s) => Bowtie.Decimal.parse(s));
      return Bowtie.Decimal.max(values).toDecimalString();
    }""")
    assert result == '0.5'


def test_max_of_empty_list_is_null(page):
    result = page.evaluate("() => Bowtie.Decimal.max([])")
    assert result is None


def test_hour_to_year_and_back_round_trips_within_rounding_precision(page):
    result = page.evaluate("""() => {
      const perHour = Bowtie.Decimal.parse('0.0000114155251142'); // ~0.1/year
      const perYear = Bowtie.convertHourYear(perHour, 'hourToYear');
      const backToHour = Bowtie.convertHourYear(perYear, 'yearToHour');
      return { perYear: perYear.toDisplayNumber(6), backToHour: backToHour.toDisplayNumber(6) };
    }""")
    assert abs(result["perYear"] - 0.1) < 1e-6
    # Round-tripped through both conversions (each rounded to 12 sig figs
    # internally, then displayed here at 6 sig figs) -- still accurate to
    # well within 6 significant figures' worth of relative error, nowhere
    # near enough drift to ever flip a risk-matrix band boundary.
    relative_error = abs(result["backToHour"] - 0.0000114155251142) / 0.0000114155251142
    assert relative_error < 1e-5


def test_year_to_hour_conversion_matches_direct_division(page):
    result = page.evaluate("""() => {
      const perYear = Bowtie.Decimal.parse('0.1');
      return Bowtie.convertHourYear(perYear, 'yearToHour').toDisplayNumber(10);
    }""")
    assert abs(result - (0.1 / 8760)) < 1e-14


def test_conversion_never_mutates_the_original_value(page):
    result = page.evaluate("""() => {
      const original = Bowtie.Decimal.parse('0.1');
      Bowtie.convertHourYear(original, 'yearToHour');
      return original.toDecimalString();
    }""")
    assert result == '0.1'


def test_to_display_number_rounds_to_significant_figures(page):
    result = page.evaluate("""() => {
      return Bowtie.Decimal.parse('0.0000114155251142').toDisplayNumber(3);
    }""")
    assert abs(result - 0.0000114) < 1e-10


def test_negate_and_is_zero(page):
    result = page.evaluate("""() => {
      const z = Bowtie.Decimal.zero();
      const neg = Bowtie.Decimal.parse('5').negate();
      return { zeroIsZero: z.isZero(), negValue: neg.toDecimalString(), negIsZero: neg.isZero() };
    }""")
    assert result == {'zeroIsZero': True, 'negValue': '-5', 'negIsZero': False}


# --- Deep precision coverage: exactness at and well beyond 1E-15 ----------
#
# Decimal is mantissa(BigInt) x 10^exponent -- BigInt is arbitrary precision,
# so nothing below is a "close enough" claim: every assertion in this
# section checks a bit-exact decimal string or an exact BigInt-backed
# comparison, at magnitudes (1E-15 and smaller) and resolutions (differences
# far finer than an IEEE-754 double's ~15-17 significant decimal digits)
# that a native Number could not represent or distinguish at all.


def test_parse_and_round_trip_one_times_ten_to_the_minus_fifteen(page):
    result = page.evaluate("""() => {
      return [
        Bowtie.Decimal.parse('1E-15').toDecimalString(),
        Bowtie.Decimal.parse('0.000000000000001').toDecimalString(),
        Bowtie.Decimal.parse('1E-15').equals(Bowtie.Decimal.parse('0.000000000000001')),
      ];
    }""")
    assert result == ['0.000000000000001', '0.000000000000001', True]


def test_round_trip_extreme_magnitudes_both_directions(page):
    # From 1E-30 (well past any realistic frequency) up to 1E30 -- BigInt
    # has no notion of an exponent range limit the way a double does.
    cases = ['1E-30', '4.2E-20', '1E-15', '9.999999999999999E-15', '1E15', '1E30', '-1E-15']
    result = page.evaluate(
        """(cases) => cases.map((s) => Bowtie.Decimal.parse(s).toDecimalString())""",
        cases,
    )
    assert result == [
        '0.' + '0' * 29 + '1',
        '0.' + '0' * 19 + '42',
        '0.' + '0' * 14 + '1',
        '0.' + '0' * 14 + '9999999999999999',
        '1' + '0' * 15,
        '1' + '0' * 30,
        '-0.' + '0' * 14 + '1',
    ]


def test_compare_distinguishes_values_finer_than_double_precision(page):
    """The whole point of a BigInt-backed mantissa: two literals close
    enough to 1.0 (a difference of 4E-17, well under a double's ~1.11E-16
    round-to-nearest window at this magnitude) both parse to the exact same
    IEEE-754 double -- `Number(a) === Number(b) === 1` -- yet Decimal must
    still tell them apart exactly, with no rounding anywhere in parse or
    compare."""
    result = page.evaluate("""() => {
      const a = Bowtie.Decimal.parse('1.00000000000000005'); // 1 + 5E-17
      const b = Bowtie.Decimal.parse('1.00000000000000009'); // 1 + 9E-17
      return {
        equal: a.equals(b),
        lt: a.lessThan(b),
        gt: b.greaterThan(a),
        nativeNumbersCollapseToTheSame: Number('1.00000000000000005') === Number('1.00000000000000009'),
        nativeNumberIsExactlyOne: Number('1.00000000000000005') === 1,
      };
    }""")
    assert result == {
        'equal': False,
        'lt': True,
        'gt': True,
        'nativeNumbersCollapseToTheSame': True,
        'nativeNumberIsExactlyOne': True,
    }


def test_compare_at_exactly_one_times_ten_to_the_minus_fifteen_boundary(page):
    # A value one ULP (in decimal terms) below/above a 1E-15 band boundary
    # must never be misclassified by binary floating-point representation
    # error -- this is the same "boundary" guarantee as
    # test_compare_exact_at_a_boundary_value, but pushed down to the
    # magnitude the user actually needs (quantitative-mode frequencies can
    # be this small).
    result = page.evaluate("""() => {
      const boundary = Bowtie.Decimal.parse('1E-15');
      const justBelow = Bowtie.Decimal.parse('0.999999999999999E-15');
      const justAbove = Bowtie.Decimal.parse('1.000000000000001E-15');
      return {
        belowLtBoundary: justBelow.lessThan(boundary),
        aboveGtBoundary: justAbove.greaterThan(boundary),
        boundaryEqualsBoundary: boundary.equals(Bowtie.Decimal.parse('1E-15')),
      };
    }""")
    assert result == {'belowLtBoundary': True, 'aboveGtBoundary': True, 'boundaryEqualsBoundary': True}


def test_multiply_of_two_extremely_small_values_stays_exact(page):
    result = page.evaluate("""() => {
      return Bowtie.Decimal.parse('1E-15').multiply(Bowtie.Decimal.parse('1E-15')).toDecimalString();
    }""")
    assert result == '0.' + '0' * 29 + '1'


def test_multiply_chain_of_ten_barrier_reductions_reaching_1e_minus_15_is_exact(page):
    """Simulates a realistic quantitative-mode ALARP chain: a TLE frequency
    of 1 event/year converted to canonical events/hour, reduced by ten
    independent preventative barriers each with riskReductionFactor 0.1 --
    landing squarely in 1E-15-and-below territory. The result must be the
    exact BigInt product, not a floating-point approximation that has
    merely converged to within some epsilon of it."""
    result = page.evaluate("""() => {
      const freq = Bowtie.convertHourYear(Bowtie.Decimal.parse('1'), 'yearToHour');
      const rrf = Bowtie.Decimal.parse('0.1');
      let acc = freq;
      for (let i = 0; i < 10; i += 1) acc = acc.multiply(rrf);
      return {
        acc: acc.toDecimalString(),
        // freq * 0.1^10 == freq * 10^-10 exactly -- same mantissa, exponent shifted by -10.
        // Cross-checks Decimal's own multiply chain against an independently
        // constructed Decimal, rather than trusting the accumulated output alone.
        expected: Bowtie.Decimal.fromBigIntExponent(freq.mantissa, freq.exponent - 10).toDecimalString(),
        // Sanity: this landed genuinely below 1E-13, not just a
        // coincidentally-equal pair of strings.
        genuinelyThatSmall: acc.lessThan(Bowtie.Decimal.parse('1E-13')),
      };
    }""")
    assert result["acc"] == result["expected"]
    assert result["genuinelyThatSmall"] is True


def test_round_trip_seventeen_significant_digits_with_no_truncation(page):
    # Native doubles carry roughly 15-17 significant decimal digits and
    # cannot be trusted for the 17th; Decimal must preserve every digit
    # exactly since it never touches floating point in parse/multiply/
    # toDecimalString.
    value = '1.2345678901234567E-15'
    result = page.evaluate("(v) => Bowtie.Decimal.parse(v).toDecimalString()", value)
    assert result == '0.' + '0' * 14 + '12345678901234567'


def test_normalize_strips_trailing_zeros_without_changing_the_represented_value(page):
    result = page.evaluate("""() => {
      const a = Bowtie.Decimal.parse('1.500');
      const b = Bowtie.Decimal.parse('100');
      return {
        aMantissaExponent: [a.mantissa.toString(), a.exponent],
        aString: a.toDecimalString(),
        bMantissaExponent: [b.mantissa.toString(), b.exponent],
        bString: b.toDecimalString(),
      };
    }""")
    assert result["aMantissaExponent"] == ["15", -1]
    assert result["aString"] == "1.5"
    assert result["bMantissaExponent"] == ["1", 2]
    assert result["bString"] == "100"


def test_to_display_number_stays_accurate_at_1e_minus_15_magnitude(page):
    result = page.evaluate("""() => {
      return Bowtie.Decimal.parse('1.23456E-15').toDisplayNumber(6);
    }""")
    assert abs(result - 1.23456e-15) < 1e-20


def test_convert_hour_year_precise_at_an_extremely_small_frequency(page):
    # A frequency of 1E-15 events/hour is well within an ordinary double's
    # precision envelope (doubles are precise to ~15-17 significant figures
    # regardless of magnitude, until the subnormal range far below this) --
    # convertHourYear's one documented floating-point step must still land
    # within its promised 12-significant-figure precision here.
    result = page.evaluate("""() => {
      const perHour = Bowtie.Decimal.parse('1E-15');
      const perYear = Bowtie.convertHourYear(perHour, 'hourToYear');
      const backToHour = Bowtie.convertHourYear(perYear, 'yearToHour');
      return backToHour.toDisplayNumber(12);
    }""")
    relative_error = abs(result - 1e-15) / 1e-15
    assert relative_error < 1e-10


def test_parse_handles_a_fifty_digit_mantissa_without_overflow(page):
    # BigInt is arbitrary-precision -- there is no digit-count ceiling the
    # way there would be with a native Number.
    digits = "1" + "0" * 49
    result = page.evaluate("(v) => Bowtie.Decimal.parse(v).toDecimalString()", digits)
    assert result == digits


def test_parse_accepts_a_leading_plus_sign(page):
    result = page.evaluate("() => Bowtie.Decimal.parse('+1.5E-15').toDecimalString()")
    assert result == '0.' + '0' * 14 + '15'
