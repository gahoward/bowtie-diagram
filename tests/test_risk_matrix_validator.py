"""Unit tests for js/model/RiskMatrixValidator.js -- the runtime validator
Project Settings' "Import Risk Matrix..." runs a user-supplied JSON file
through (same checks scripts/build-risk-matrix-presets.js applies to a
bundled preset at build time, ported so the two can't drift), plus its
export-side mirror image, denormalizeRiskMatrixForExport.
"""

# A minimal, well-formed matrix: 2 severity classes, 2 likelihood classes,
# 2 risk classes, a 2x2 cell grid, authored in per-year figures (like
# Leaflet 5) so unit conversion is actually exercised.
VALID_MATRIX = {
    "id": "custom-test",
    "name": "Custom Test Matrix",
    "authoringUnit": "year",
    "severityClasses": [
        {"id": "minor", "ordinal": 0, "label": "Minor"},
        {"id": "major", "ordinal": 1, "label": "Major"},
    ],
    "likelihoodClasses": [
        {"id": "frequent", "ordinal": 1, "label": "Frequent", "minValue": "0.1"},
        {"id": "rare", "ordinal": 0, "label": "Rare", "minValue": "0.001"},
    ],
    "riskClasses": [
        {"id": "high", "label": "High", "colour": "#d32f2f"},
        {"id": "low", "label": "Low", "colour": "#388e3c"},
    ],
    "cells": [
        ["low", "high"],
        ["high", "high"],
    ],
}


def _validate(page, matrix):
    return page.evaluate("(m) => Bowtie.validateRiskMatrix(m)", matrix)


def test_valid_matrix_is_accepted_and_converts_min_values_to_canonical_hours(page):
    result = _validate(page, VALID_MATRIX)
    assert result["ok"] is True
    min_values = {c["id"]: c["minValue"] for c in result["matrix"]["likelihoodClasses"]}
    assert abs(float(min_values["frequent"]) - 0.1 / 8760) / (0.1 / 8760) < 1e-9
    assert abs(float(min_values["rare"]) - 0.001 / 8760) / (0.001 / 8760) < 1e-9


def test_valid_matrix_authored_in_hours_is_not_converted(page):
    matrix = {**VALID_MATRIX, "authoringUnit": "hour"}
    result = _validate(page, matrix)
    assert result["ok"] is True
    min_values = {c["id"]: c["minValue"] for c in result["matrix"]["likelihoodClasses"]}
    assert min_values["frequent"] == "0.1"


def test_rejects_non_object(page):
    for bad in [None, "a string", 42, [1, 2, 3]]:
        result = _validate(page, bad)
        assert result["ok"] is False


def test_rejects_missing_required_fields(page):
    for key in ["id", "name", "cells"]:
        matrix = {k: v for k, v in VALID_MATRIX.items() if k != key}
        result = _validate(page, matrix)
        assert result["ok"] is False, f"missing {key} should be rejected"


def test_rejects_invalid_authoring_unit(page):
    matrix = {**VALID_MATRIX, "authoringUnit": "decade"}
    result = _validate(page, matrix)
    assert result["ok"] is False
    assert "authoringUnit" in result["error"]


def test_rejects_empty_classes(page):
    matrix = {**VALID_MATRIX, "severityClasses": []}
    result = _validate(page, matrix)
    assert result["ok"] is False
    assert "at least one" in result["error"]


def test_rejects_non_contiguous_ordinals(page):
    matrix = {
        **VALID_MATRIX,
        "severityClasses": [
            {"id": "minor", "ordinal": 0, "label": "Minor"},
            {"id": "major", "ordinal": 2, "label": "Major"},  # gap: 0, 2
        ],
    }
    result = _validate(page, matrix)
    assert result["ok"] is False
    assert "ordinals" in result["error"]


def test_rejects_likelihood_classes_not_sorted_most_frequent_first(page):
    matrix = {
        **VALID_MATRIX,
        "likelihoodClasses": [
            {"id": "rare", "ordinal": 1, "label": "Rare", "minValue": "0.001"},
            {"id": "frequent", "ordinal": 0, "label": "Frequent", "minValue": "0.1"},
        ],
    }
    result = _validate(page, matrix)
    assert result["ok"] is False
    assert "most-frequent-first" in result["error"]


def test_rejects_duplicate_min_value(page):
    matrix = {
        **VALID_MATRIX,
        "likelihoodClasses": [
            {"id": "frequent", "ordinal": 1, "label": "Frequent", "minValue": "0.1"},
            {"id": "rare", "ordinal": 0, "label": "Rare", "minValue": "0.1"},
        ],
    }
    result = _validate(page, matrix)
    assert result["ok"] is False


def test_rejects_wrong_cell_grid_dimensions(page):
    matrix = {**VALID_MATRIX, "cells": [["low", "high"]]}  # only 1 row, needs 2
    result = _validate(page, matrix)
    assert result["ok"] is False
    assert "rows" in result["error"]

    matrix2 = {**VALID_MATRIX, "cells": [["low"], ["high", "high"]]}  # row 0 has 1 column, needs 2
    result2 = _validate(page, matrix2)
    assert result2["ok"] is False
    assert "columns" in result2["error"]


def test_rejects_cell_referencing_unknown_risk_class(page):
    matrix = {**VALID_MATRIX, "cells": [["low", "nonexistent"], ["high", "high"]]}
    result = _validate(page, matrix)
    assert result["ok"] is False
    assert "nonexistent" in result["error"]


def test_export_denormalize_round_trips_exactly_through_reimport(page):
    result = page.evaluate("""(m) => {
      const validated = Bowtie.validateRiskMatrix(m);
      const denormalized = Bowtie.denormalizeRiskMatrixForExport(validated.matrix);
      const reimported = Bowtie.validateRiskMatrix(denormalized);
      return {
        denormalizedMinValue: denormalized.likelihoodClasses.find((c) => c.id === 'frequent').minValue,
        firstCanonical: validated.matrix.likelihoodClasses.find((c) => c.id === 'frequent').minValue,
        secondCanonical: reimported.matrix.likelihoodClasses.find((c) => c.id === 'frequent').minValue,
      };
    }""", VALID_MATRIX)
    assert result["denormalizedMinValue"] == "0.1"  # back to the human-authored per-year figure
    assert result["firstCanonical"] == result["secondCanonical"]  # exact round trip, no drift


def test_export_denormalize_leaves_hour_authored_matrix_unchanged(page):
    result = page.evaluate("""(m) => {
      const hourMatrix = { ...m, authoringUnit: 'hour' };
      const validated = Bowtie.validateRiskMatrix(hourMatrix);
      const denormalized = Bowtie.denormalizeRiskMatrixForExport(validated.matrix);
      return denormalized.likelihoodClasses.find((c) => c.id === 'frequent').minValue;
    }""", VALID_MATRIX)
    assert result == "0.1"
