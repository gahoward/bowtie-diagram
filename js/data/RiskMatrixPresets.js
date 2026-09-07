// GENERATED FILE -- do not edit directly.
// Source of truth: js/data/risk-matrices/*.json -- edit those files (each
// authored in its own natural unit, see "authoringUnit"), then run
// `node scripts/build-risk-matrix-presets.js` to regenerate this file.
//
// Wrapped into a real script (rather than fetched as JSON) so it works
// standalone over file:// -- see scripts/build-risk-matrix-presets.js.
// Every likelihoodClasses[].minValue below is already canonical
// events/hour; "authoringUnit" is preserved only as display metadata for
// the matrix editor, never read by calculation/banding logic.
(function (Bowtie) {
  Bowtie.RISK_MATRIX_PRESETS = {
  "leaflet5": {
    "id": "leaflet5",
    "name": "Leaflet 5 (Ships) Annex D",
    "source": "DE&S S&EP Leaflet 5, Issue 3, October 2020 -- Annex D, Ships Common Risk Classification Matrix",
    "authoringUnit": "year",
    "severityClasses": [
      {
        "id": "negligible",
        "ordinal": 0,
        "label": "Negligible",
        "description": "Minor injury/illness"
      },
      {
        "id": "marginal",
        "ordinal": 1,
        "label": "Marginal",
        "description": "Recoverable injury/illness"
      },
      {
        "id": "major",
        "ordinal": 2,
        "label": "Major",
        "description": "Permanent injury/illness"
      },
      {
        "id": "critical",
        "ordinal": 3,
        "label": "Critical",
        "description": "1 to 10 deaths"
      },
      {
        "id": "disastrous",
        "ordinal": 4,
        "label": "Disastrous",
        "description": "10 to 100 deaths"
      },
      {
        "id": "catastrophic",
        "ordinal": 5,
        "label": "Catastrophic",
        "description": "More than 100 deaths"
      }
    ],
    "likelihoodClasses": [
      {
        "id": "frequent",
        "ordinal": 6,
        "label": "Frequent",
        "description": "Likely to occur repeatedly on the ship during its life",
        "minValue": "0.0000114155251142"
      },
      {
        "id": "probable",
        "ordinal": 5,
        "label": "Probable",
        "description": "Likely to occur from time to time",
        "minValue": "0.00000114155251142"
      },
      {
        "id": "occasional",
        "ordinal": 4,
        "label": "Occasional",
        "description": "May occur once during the ship's life",
        "minValue": "0.000000114155251142"
      },
      {
        "id": "remote",
        "ordinal": 3,
        "label": "Remote",
        "description": "Unlikely to occur during the ship's life",
        "minValue": "0.0000000114155251142"
      },
      {
        "id": "improbable",
        "ordinal": 2,
        "label": "Improbable",
        "description": "Very unlikely to occur",
        "minValue": "0.00000000114155251142"
      },
      {
        "id": "highly_improbable",
        "ordinal": 1,
        "label": "Highly Improbable",
        "description": "Extremely unlikely to occur",
        "minValue": "0.000000000114155251142"
      },
      {
        "id": "incredible",
        "ordinal": 0,
        "label": "Incredible",
        "description": "Extremely rare event",
        "minValue": "0"
      }
    ],
    "riskClasses": [
      {
        "id": "A",
        "label": "A - Intolerable",
        "colour": "#d32f2f",
        "description": "Risk shall be reduced regardless of cost unless the cost is grossly disproportionate to the benefit gained.",
        "reviewPeriod": "Immediate action required"
      },
      {
        "id": "B",
        "label": "B - Undesirable",
        "colour": "#f57c00",
        "description": "Risk shall be reduced as far as reasonably practicable (ALARP).",
        "reviewPeriod": "Reduce as soon as reasonably practicable"
      },
      {
        "id": "C",
        "label": "C - Tolerable",
        "colour": "#fbc02d",
        "description": "Risk is tolerable provided it has been reduced ALARP and is periodically reviewed.",
        "reviewPeriod": "Periodic review"
      },
      {
        "id": "D",
        "label": "D - Broadly Acceptable",
        "colour": "#388e3c",
        "description": "Risk is broadly acceptable; no further action required beyond routine monitoring.",
        "reviewPeriod": "Routine monitoring"
      }
    ],
    "cells": [
      [
        "D",
        "D",
        "D",
        "D",
        "D",
        "C"
      ],
      [
        "D",
        "D",
        "D",
        "C",
        "C",
        "B"
      ],
      [
        "D",
        "D",
        "C",
        "C",
        "B",
        "A"
      ],
      [
        "D",
        "C",
        "C",
        "B",
        "A",
        "A"
      ],
      [
        "D",
        "C",
        "B",
        "A",
        "A",
        "A"
      ],
      [
        "C",
        "B",
        "A",
        "A",
        "A",
        "A"
      ],
      [
        "C",
        "A",
        "A",
        "A",
        "A",
        "A"
      ]
    ]
  }
};
})(window.Bowtie = window.Bowtie || {});
