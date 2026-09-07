"""Golden-master test for the shipped Leaflet 5 risk matrix preset
(js/data/risk-matrices/leaflet5.json, built into js/data/
RiskMatrixPresets.js by scripts/build-risk-matrix-presets.js) plus unit
tests for js/model/RiskMatrix.js's pure lookup/banding helpers.
"""

# Transcribed directly from quantitative_mode_proposal.md's Annex D table
# (row = frequency label, column = severity label) -- the eyeball-verifiable
# source of truth this test checks the built preset against.
ANNEX_D_TABLE = {
    'frequent': {'catastrophic': 'A', 'disastrous': 'A', 'critical': 'A', 'major': 'A', 'marginal': 'A', 'negligible': 'C'},
    'probable': {'catastrophic': 'A', 'disastrous': 'A', 'critical': 'A', 'major': 'A', 'marginal': 'B', 'negligible': 'C'},
    'occasional': {'catastrophic': 'A', 'disastrous': 'A', 'critical': 'A', 'major': 'B', 'marginal': 'C', 'negligible': 'D'},
    'remote': {'catastrophic': 'A', 'disastrous': 'A', 'critical': 'B', 'major': 'C', 'marginal': 'C', 'negligible': 'D'},
    'improbable': {'catastrophic': 'A', 'disastrous': 'B', 'critical': 'C', 'major': 'C', 'marginal': 'D', 'negligible': 'D'},
    'highly_improbable': {'catastrophic': 'B', 'disastrous': 'C', 'critical': 'C', 'major': 'D', 'marginal': 'D', 'negligible': 'D'},
    'incredible': {'catastrophic': 'C', 'disastrous': 'D', 'critical': 'D', 'major': 'D', 'marginal': 'D', 'negligible': 'D'},
}

# Per-annum figures as printed in Annex D (the band FLOOR, i.e. the more
# frequent/larger end of each "X - Y" range) -- what a human would type in
# if building this matrix from scratch.
ANNEX_D_PER_ANNUM_MIN_VALUES = {
    'frequent': '0.1',
    'probable': '0.01',
    'occasional': '0.001',
    'remote': '0.0001',
    'improbable': '0.00001',
    'highly_improbable': '0.000001',
    'incredible': '0',
}


def test_leaflet5_preset_is_registered(page):
    ids = page.evaluate("() => Object.keys(Bowtie.RISK_MATRIX_PRESETS)")
    assert 'leaflet5' in ids


def test_leaflet5_all_42_cells_match_annex_d(page):
    mismatches = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      const out = [];
      for (const lc of m.likelihoodClasses) {
        for (const sc of m.severityClasses) {
          const cell = m.cells[lc.ordinal][sc.ordinal];
          out.push({ likelihood: lc.id, severity: sc.id, cell });
        }
      }
      return out;
    }""")
    assert len(mismatches) == 42
    for row in mismatches:
        expected = ANNEX_D_TABLE[row["likelihood"]][row["severity"]]
        assert row["cell"] == expected, (
            f"{row['likelihood']}/{row['severity']}: expected {expected}, got {row['cell']}"
        )


def test_leaflet5_likelihood_min_values_converted_correctly_from_per_annum(page):
    min_values = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      return Object.fromEntries(m.likelihoodClasses.map((c) => [c.id, c.minValue]));
    }""")
    for class_id, per_annum_str in ANNEX_D_PER_ANNUM_MIN_VALUES.items():
        expected_hourly = float(per_annum_str) / 8760
        actual_hourly = float(min_values[class_id])
        if expected_hourly == 0:
            assert actual_hourly == 0
        else:
            assert abs(actual_hourly - expected_hourly) / expected_hourly < 1e-9, class_id


def test_leaflet5_likelihood_classes_sorted_most_frequent_first(page):
    ordinals = page.evaluate("""() => {
      return Bowtie.RISK_MATRIX_PRESETS.leaflet5.likelihoodClasses.map((c) => c.ordinal);
    }""")
    assert ordinals == sorted(ordinals, reverse=True)


def test_leaflet5_ordinals_are_contiguous_from_zero(page):
    result = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      return {
        severity: m.severityClasses.map((c) => c.ordinal).sort((a, b) => a - b),
        likelihood: m.likelihoodClasses.map((c) => c.ordinal).sort((a, b) => a - b),
      };
    }""")
    assert result["severity"] == list(range(6))
    assert result["likelihood"] == list(range(7))


def test_cell_risk_class_id_looks_up_by_both_axes(page):
    result = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      return Bowtie.RiskMatrix.cellRiskClassId(m, 'frequent', 'negligible');
    }""")
    assert result == 'C'


def test_cell_risk_class_id_null_when_either_axis_missing(page):
    result = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      return [
        Bowtie.RiskMatrix.cellRiskClassId(m, null, 'negligible'),
        Bowtie.RiskMatrix.cellRiskClassId(m, 'frequent', null),
        Bowtie.RiskMatrix.cellRiskClassId(m, null, null),
      ];
    }""")
    assert result == [None, None, None]


def test_band_for_value_picks_the_correct_likelihood_class(page):
    # bandForValue operates on canonical events/hour, so per-annum test
    # figures are converted through the same shared helper before use --
    # matching how a real threat frequency would reach it.
    result = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.leaflet5;
      const perYear = (s) => Bowtie.convertHourYear(Bowtie.Decimal.parse(s), 'yearToHour');
      const band = (perYearStr) => Bowtie.RiskMatrix.bandForValue(m, perYear(perYearStr)).id;
      return {
        atFrequentFloor: band('0.1'),
        wellAboveFrequentFloor: band('5'),
        justBelowFrequentFloor: band('0.099'),
        atIncredibleFloor: Bowtie.RiskMatrix.bandForValue(m, Bowtie.Decimal.parse('0')).id,
        deepInImprobable: band('0.00003'),
      };
    }""")
    assert result["atFrequentFloor"] == 'frequent'
    assert result["wellAboveFrequentFloor"] == 'frequent'
    assert result["justBelowFrequentFloor"] == 'probable'
    assert result["atIncredibleFloor"] == 'incredible'
    assert result["deepInImprobable"] == 'improbable'


def test_quantity_to_decimal_handles_unknown_and_value(page):
    result = page.evaluate("""() => {
      return [
        Bowtie.RiskMatrix.quantityToDecimal({ unknown: true }),
        Bowtie.RiskMatrix.quantityToDecimal({ value: '0.001' }) && Bowtie.RiskMatrix.quantityToDecimal({ value: '0.001' }).toDecimalString(),
        Bowtie.RiskMatrix.quantityToDecimal(null),
        Bowtie.RiskMatrix.quantityToDecimal(undefined),
      ];
    }""")
    assert result == [None, '0.001', None, None]
