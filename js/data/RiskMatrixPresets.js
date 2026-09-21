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
        "reviewPeriod": "Immediate action required",
        "rank": 0
      },
      {
        "id": "B",
        "label": "B - Undesirable",
        "colour": "#f57c00",
        "description": "Risk shall be reduced as far as reasonably practicable (ALARP).",
        "reviewPeriod": "Reduce as soon as reasonably practicable",
        "rank": 1
      },
      {
        "id": "C",
        "label": "C - Tolerable",
        "colour": "#fbc02d",
        "description": "Risk is tolerable provided it has been reduced ALARP and is periodically reviewed.",
        "reviewPeriod": "Periodic review",
        "rank": 2
      },
      {
        "id": "D",
        "label": "D - Broadly Acceptable",
        "colour": "#388e3c",
        "description": "Risk is broadly acceptable; no further action required beyond routine monitoring.",
        "reviewPeriod": "Routine monitoring",
        "rank": 3
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
  },
  "milstd882e": {
    "id": "milstd882e",
    "name": "MIL-STD-882E",
    "source": "MIL-STD-882E, Department of Defense Standard Practice: System Safety, 11 May 2012 -- Table I (Severity Categories), Table II (Probability Levels, specific individual item), Table III (Risk Assessment Matrix). Transcribed for this editor; check against a controlled copy of the standard, and against your programme's own tailoring of risk acceptance authority, before using it for a real assessment.",
    "authoringUnit": "lifetime",
    "authoringExposureHours": 100000,
    "severityClasses": [
      {
        "id": "negligible",
        "ordinal": 0,
        "label": "Negligible (4)",
        "description": "Injury or occupational illness not resulting in a lost work day, minimal environmental impact, or monetary loss less than $100K."
      },
      {
        "id": "marginal",
        "ordinal": 1,
        "label": "Marginal (3)",
        "description": "Injury or occupational illness resulting in one or more lost work days, reversible moderate environmental impact, or monetary loss of at least $100K but less than $1M."
      },
      {
        "id": "critical",
        "ordinal": 2,
        "label": "Critical (2)",
        "description": "Permanent partial disability, injuries or occupational illness that may result in hospitalization of at least three personnel, reversible significant environmental impact, or monetary loss of at least $1M but less than $10M."
      },
      {
        "id": "catastrophic",
        "ordinal": 3,
        "label": "Catastrophic (1)",
        "description": "Death, permanent total disability, irreversible significant environmental impact, or monetary loss of $10M or more."
      }
    ],
    "likelihoodClasses": [
      {
        "id": "frequent",
        "ordinal": 4,
        "label": "Frequent (A)",
        "description": "Likely to occur often in the life of an item: probability of occurrence greater than 10^-1.",
        "minValue": "0.000001"
      },
      {
        "id": "probable",
        "ordinal": 3,
        "label": "Probable (B)",
        "description": "Will occur several times in the life of an item: probability of occurrence less than 10^-1 but greater than 10^-2.",
        "minValue": "0.0000001"
      },
      {
        "id": "occasional",
        "ordinal": 2,
        "label": "Occasional (C)",
        "description": "Likely to occur sometime in the life of an item: probability of occurrence less than 10^-2 but greater than 10^-3.",
        "minValue": "0.00000001"
      },
      {
        "id": "remote",
        "ordinal": 1,
        "label": "Remote (D)",
        "description": "Unlikely, but possible to occur in the life of an item: probability of occurrence less than 10^-3 but greater than 10^-6.",
        "minValue": "0.00000000001"
      },
      {
        "id": "improbable",
        "ordinal": 0,
        "label": "Improbable (E)",
        "description": "So unlikely it can be assumed occurrence may not be experienced in the life of an item: probability of occurrence less than 10^-6. The standard's sixth level, Eliminated (F), is a state rather than a band -- the hazard has been removed and cannot occur -- so it has no boundary to band a computed figure against and is deliberately not listed here.",
        "minValue": "0"
      }
    ],
    "riskClasses": [
      {
        "id": "high",
        "rank": 0,
        "label": "High",
        "colour": "#d32f2f",
        "description": "Risk acceptance authority: Component Acquisition Executive (MIL-STD-882E 4.3.4, subject to programme tailoring).",
        "reviewPeriod": "Accept only at Component Acquisition Executive level"
      },
      {
        "id": "serious",
        "rank": 1,
        "label": "Serious",
        "colour": "#f57c00",
        "description": "Risk acceptance authority: Program Executive Officer (MIL-STD-882E 4.3.4, subject to programme tailoring).",
        "reviewPeriod": "Accept only at Program Executive Officer level"
      },
      {
        "id": "medium",
        "rank": 2,
        "label": "Medium",
        "colour": "#fbc02d",
        "description": "Risk acceptance authority: Program Manager (MIL-STD-882E 4.3.4, subject to programme tailoring).",
        "reviewPeriod": "Accept at Program Manager level"
      },
      {
        "id": "low",
        "rank": 3,
        "label": "Low",
        "colour": "#388e3c",
        "description": "Risk acceptance authority: Program Manager (MIL-STD-882E 4.3.4, subject to programme tailoring).",
        "reviewPeriod": "Accept at Program Manager level"
      }
    ],
    "cells": [
      [
        "low",
        "medium",
        "medium",
        "medium"
      ],
      [
        "low",
        "medium",
        "medium",
        "serious"
      ],
      [
        "low",
        "medium",
        "serious",
        "high"
      ],
      [
        "medium",
        "serious",
        "high",
        "high"
      ],
      [
        "medium",
        "serious",
        "high",
        "high"
      ]
    ]
  }
};
})(window.Bowtie = window.Bowtie || {});
