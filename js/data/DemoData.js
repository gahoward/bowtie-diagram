// GENERATED FILE -- do not edit directly.
// Source of truth: js/data/demo-simple.json, demo-qualitative.json,
// demo-quantitative.json -- one per document mode (quantitative_mode_
// proposal.md "Modes"). Edit those files (plain schema-v8 JSON, the same
// shape "Export to JSON" produces), then run
// `node scripts/build-demo-data.js` to regenerate this file.
//
// Wrapped into a real script (rather than fetched as JSON) so it works
// standalone over file:// -- see scripts/build-demo-data.js.
(function (Bowtie) {
  Bowtie.DEMO_DATA_VARIANTS = {
  "simple": {
    "version": 14,
    "name": "Demo: Pipeline Overpressure Release",
    "idCounters": {
      "page": 2,
      "threat": 5,
      "consequence": 5,
      "preventativeBarrier": 4,
      "mitigativeBarrier": 4,
      "line": 11,
      "placement": 20,
      "escalationFactor": 1,
      "escalationBarrier": 1
    },
    "retiredIds": {
      "threat": [],
      "consequence": [],
      "preventativeBarrier": [],
      "mitigativeBarrier": [],
      "escalationFactor": [],
      "escalationBarrier": []
    },
    "pages": [
      {
        "id": "PAGE_1",
        "name": "Pipeline Release",
        "description": "Primary process containment failure scenario.",
        "topLevelEvent": {
          "id": "TLE_1",
          "name": "Release (Loss of Containment)",
          "x": 1110,
          "y": 365,
          "r": 70
        },
        "hazard": {
          "id": "HAZARD_1",
          "name": "Flammable Liquid"
        }
      },
      {
        "id": "PAGE_2",
        "name": "Bund Containment Failure",
        "description": "Secondary containment scenario, independent of the primary release on the first page.",
        "topLevelEvent": {
          "id": "TLE_2",
          "name": "Secondary Containment Breach",
          "x": 850,
          "y": 200,
          "r": 70
        },
        "hazard": {
          "id": "HAZARD_2",
          "name": "Stored Chemical Inventory"
        }
      }
    ],
    "threats": [
      {
        "id": "PLACEMENT_1",
        "nodeId": "T_1",
        "x": 150,
        "y": 90,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_2",
        "nodeId": "T_2",
        "x": 150,
        "y": 310,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_3",
        "nodeId": "T_3",
        "x": 150,
        "y": 530,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_4",
        "nodeId": "T_4",
        "x": 150,
        "y": 750,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_5",
        "nodeId": "T_5",
        "x": 150,
        "y": 200,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_2"
      }
    ],
    "consequences": [
      {
        "id": "PLACEMENT_6",
        "nodeId": "C_1",
        "x": 2070,
        "y": 90,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_7",
        "nodeId": "C_2",
        "x": 2070,
        "y": 310,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_8",
        "nodeId": "C_3",
        "x": 2070,
        "y": 530,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_9",
        "nodeId": "C_4",
        "x": 2070,
        "y": 750,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_10",
        "nodeId": "C_5",
        "x": 1550,
        "y": 200,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_2"
      }
    ],
    "preventativeBarriers": [
      {
        "id": "PLACEMENT_11",
        "nodeId": "PB_1",
        "x": 470,
        "y": 90,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_12",
        "nodeId": "PB_2",
        "x": 470,
        "y": 310,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_13",
        "nodeId": "PB_3",
        "x": 790,
        "y": 310,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_14",
        "nodeId": "PB_4",
        "x": 470,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_2"
      }
    ],
    "mitigativeBarriers": [
      {
        "id": "PLACEMENT_15",
        "nodeId": "MB_1",
        "x": 1750,
        "y": 90,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_16",
        "nodeId": "MB_2",
        "x": 1430,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_17",
        "nodeId": "MB_3",
        "x": 1430,
        "y": 530,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_18",
        "nodeId": "MB_4",
        "x": 1230,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_2"
      }
    ],
    "lines": [
      {
        "id": "LINE_1",
        "originType": "threat",
        "originId": "PLACEMENT_1",
        "stops": [
          "PLACEMENT_11",
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_2",
        "originType": "threat",
        "originId": "PLACEMENT_2",
        "stops": [
          "PLACEMENT_12",
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_3",
        "originType": "threat",
        "originId": "PLACEMENT_3",
        "stops": [
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_4",
        "originType": "threat",
        "originId": "PLACEMENT_4",
        "stops": [],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_5",
        "originType": "consequence",
        "originId": "PLACEMENT_6",
        "stops": [
          "PLACEMENT_15",
          "PLACEMENT_16"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_6",
        "originType": "consequence",
        "originId": "PLACEMENT_7",
        "stops": [
          "PLACEMENT_16"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_7",
        "originType": "consequence",
        "originId": "PLACEMENT_8",
        "stops": [
          "PLACEMENT_17"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_8",
        "originType": "consequence",
        "originId": "PLACEMENT_9",
        "stops": [],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_9",
        "originType": "threat",
        "originId": "PLACEMENT_5",
        "stops": [
          "PLACEMENT_14"
        ],
        "pageId": "PAGE_2"
      },
      {
        "id": "LINE_10",
        "originType": "consequence",
        "originId": "PLACEMENT_10",
        "stops": [
          "PLACEMENT_18"
        ],
        "pageId": "PAGE_2"
      },
      {
        "id": "LINE_11",
        "originType": "escalationFactor",
        "originId": "PLACEMENT_19",
        "stops": [
          "PLACEMENT_20"
        ],
        "pageId": "PAGE_1"
      }
    ],
    "library": {
      "threat": [
        {
          "id": "T_1",
          "type": "threat",
          "name": "Valve Inadvertently Opened",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_2",
          "type": "threat",
          "name": "Flange Leak",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_3",
          "type": "threat",
          "name": "Corrosion or Erosion",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_4",
          "type": "threat",
          "name": "Dropped Object or Vehicle Collision",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_5",
          "type": "threat",
          "name": "Bund Wall Cracking",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        }
      ],
      "consequence": [
        {
          "id": "C_1",
          "type": "consequence",
          "name": "Pool Fire",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_2",
          "type": "consequence",
          "name": "Flash Fire",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_3",
          "type": "consequence",
          "name": "Explosion",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_4",
          "type": "consequence",
          "name": "Release, No Ignition",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_5",
          "type": "consequence",
          "name": "Ground/Water Contamination",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        }
      ],
      "preventativeBarrier": [
        {
          "id": "PB_1",
          "type": "preventativeBarrier",
          "name": "Automatic Shutdown Valve (ESDV)",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Process Engineering",
          "effectiveness": "high"
        },
        {
          "id": "PB_2",
          "type": "preventativeBarrier",
          "name": "Bolted Flange Joint Inspection Programme",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Maintenance",
          "effectiveness": "medium"
        },
        {
          "id": "PB_3",
          "type": "preventativeBarrier",
          "name": "Pressure Relief & Corrosion Monitoring System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Process Engineering",
          "effectiveness": "medium"
        },
        {
          "id": "PB_4",
          "type": "preventativeBarrier",
          "name": "Bund Integrity Inspection Programme",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "HSE",
          "effectiveness": "medium"
        }
      ],
      "mitigativeBarrier": [
        {
          "id": "MB_1",
          "type": "mitigativeBarrier",
          "name": "Deluge / Fixed Fire Suppression System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Fire Safety",
          "effectiveness": "high"
        },
        {
          "id": "MB_2",
          "type": "mitigativeBarrier",
          "name": "Fire & Gas Detection System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Instrumentation",
          "effectiveness": "high"
        },
        {
          "id": "MB_3",
          "type": "mitigativeBarrier",
          "name": "Blast Wall / Explosion Relief Panels",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "passive",
          "owner": "Civil/Structural",
          "effectiveness": "high"
        },
        {
          "id": "MB_4",
          "type": "mitigativeBarrier",
          "name": "Spill Containment & Recovery Plan",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Emergency Response",
          "effectiveness": "medium"
        }
      ],
      "escalationFactor": [
        {
          "id": "EF_1",
          "type": "escalationFactor",
          "name": "ESDV not proof tested on schedule",
          "description": "Valve closure time drifts out of specification between overhauls.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": null,
          "owner": "Maintenance",
          "effectiveness": null
        }
      ],
      "escalationBarrier": [
        {
          "id": "EB_1",
          "type": "escalationBarrier",
          "name": "Quarterly partial-stroke test",
          "description": "Scheduled test regime with results trended against the closure-time limit.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Maintenance",
          "effectiveness": "medium"
        }
      ]
    },
    "identifierDisplayMode": "internal",
    "document": {
      "reference": "HAZOP-2026-014",
      "revision": "A",
      "status": "Draft",
      "date": "2026-03-12",
      "author": "A. Fenwick (Process Safety)",
      "checkedBy": "",
      "approvedBy": "",
      "organisation": "Northfield Terminal",
      "notes": "Worked example shipped with the editor. Illustrative figures only — not a real assessment of any real facility.",
      "history": [
        {
          "revision": "A",
          "date": "2026-03-12",
          "author": "A. Fenwick",
          "summary": "First draft for internal comment."
        }
      ]
    },
    "mode": "simple",
    "riskMatrix": null,
    "escalationFactors": [
      {
        "id": "PLACEMENT_19",
        "nodeId": "EF_1",
        "x": 470,
        "y": 335,
        "w": 120,
        "h": 44,
        "pageId": "PAGE_1",
        "barrierId": "PLACEMENT_11"
      }
    ],
    "escalationBarriers": [
      {
        "id": "PLACEMENT_20",
        "nodeId": "EB_1",
        "x": 470,
        "y": 265,
        "w": 55,
        "h": 18,
        "pageId": "PAGE_1"
      }
    ]
  },
  "qualitative": {
    "version": 14,
    "name": "Demo: Pipeline Overpressure Release",
    "idCounters": {
      "page": 2,
      "threat": 5,
      "consequence": 5,
      "preventativeBarrier": 4,
      "mitigativeBarrier": 4,
      "line": 11,
      "placement": 20,
      "escalationFactor": 1,
      "escalationBarrier": 1
    },
    "retiredIds": {
      "threat": [],
      "consequence": [],
      "preventativeBarrier": [],
      "mitigativeBarrier": [],
      "escalationFactor": [],
      "escalationBarrier": []
    },
    "pages": [
      {
        "id": "PAGE_1",
        "name": "Pipeline Release",
        "description": "Primary process containment failure scenario.",
        "topLevelEvent": {
          "id": "TLE_1",
          "name": "Release (Loss of Containment)",
          "x": 1110,
          "y": 365,
          "r": 70
        },
        "hazard": {
          "id": "HAZARD_1",
          "name": "Flammable Liquid"
        }
      },
      {
        "id": "PAGE_2",
        "name": "Bund Containment Failure",
        "description": "Secondary containment scenario, independent of the primary release on the first page.",
        "topLevelEvent": {
          "id": "TLE_2",
          "name": "Secondary Containment Breach",
          "x": 850,
          "y": 200,
          "r": 70
        },
        "hazard": {
          "id": "HAZARD_2",
          "name": "Stored Chemical Inventory"
        }
      }
    ],
    "threats": [
      {
        "id": "PLACEMENT_1",
        "nodeId": "T_1",
        "x": 150,
        "y": 90,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_2",
        "nodeId": "T_2",
        "x": 150,
        "y": 310,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_3",
        "nodeId": "T_3",
        "x": 150,
        "y": 530,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_4",
        "nodeId": "T_4",
        "x": 150,
        "y": 750,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_5",
        "nodeId": "T_5",
        "x": 150,
        "y": 200,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_2"
      }
    ],
    "consequences": [
      {
        "id": "PLACEMENT_6",
        "nodeId": "C_1",
        "x": 2070,
        "y": 90,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_7",
        "nodeId": "C_2",
        "x": 2070,
        "y": 310,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_8",
        "nodeId": "C_3",
        "x": 2070,
        "y": 530,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_9",
        "nodeId": "C_4",
        "x": 2070,
        "y": 750,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_10",
        "nodeId": "C_5",
        "x": 1550,
        "y": 200,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_2"
      }
    ],
    "preventativeBarriers": [
      {
        "id": "PLACEMENT_11",
        "nodeId": "PB_1",
        "x": 470,
        "y": 90,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_12",
        "nodeId": "PB_2",
        "x": 470,
        "y": 310,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_13",
        "nodeId": "PB_3",
        "x": 790,
        "y": 310,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_14",
        "nodeId": "PB_4",
        "x": 470,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_2"
      }
    ],
    "mitigativeBarriers": [
      {
        "id": "PLACEMENT_15",
        "nodeId": "MB_1",
        "x": 1750,
        "y": 90,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_16",
        "nodeId": "MB_2",
        "x": 1430,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_17",
        "nodeId": "MB_3",
        "x": 1430,
        "y": 530,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_18",
        "nodeId": "MB_4",
        "x": 1230,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_2"
      }
    ],
    "lines": [
      {
        "id": "LINE_1",
        "originType": "threat",
        "originId": "PLACEMENT_1",
        "stops": [
          "PLACEMENT_11",
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_2",
        "originType": "threat",
        "originId": "PLACEMENT_2",
        "stops": [
          "PLACEMENT_12",
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_3",
        "originType": "threat",
        "originId": "PLACEMENT_3",
        "stops": [
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_4",
        "originType": "threat",
        "originId": "PLACEMENT_4",
        "stops": [],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_5",
        "originType": "consequence",
        "originId": "PLACEMENT_6",
        "stops": [
          "PLACEMENT_15",
          "PLACEMENT_16"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_6",
        "originType": "consequence",
        "originId": "PLACEMENT_7",
        "stops": [
          "PLACEMENT_16"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_7",
        "originType": "consequence",
        "originId": "PLACEMENT_8",
        "stops": [
          "PLACEMENT_17"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_8",
        "originType": "consequence",
        "originId": "PLACEMENT_9",
        "stops": [],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_9",
        "originType": "threat",
        "originId": "PLACEMENT_5",
        "stops": [
          "PLACEMENT_14"
        ],
        "pageId": "PAGE_2"
      },
      {
        "id": "LINE_10",
        "originType": "consequence",
        "originId": "PLACEMENT_10",
        "stops": [
          "PLACEMENT_18"
        ],
        "pageId": "PAGE_2"
      },
      {
        "id": "LINE_11",
        "originType": "escalationFactor",
        "originId": "PLACEMENT_19",
        "stops": [
          "PLACEMENT_20"
        ],
        "pageId": "PAGE_1"
      }
    ],
    "library": {
      "threat": [
        {
          "id": "T_1",
          "type": "threat",
          "name": "Valve Inadvertently Opened",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "occasional",
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_2",
          "type": "threat",
          "name": "Flange Leak",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "probable",
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_3",
          "type": "threat",
          "name": "Corrosion or Erosion",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "remote",
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_4",
          "type": "threat",
          "name": "Dropped Object or Vehicle Collision",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "T_5",
          "type": "threat",
          "name": "Bund Wall Cracking",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "improbable",
          "severityClassId": null,
          "frequency": null,
          "protection": null
        }
      ],
      "consequence": [
        {
          "id": "C_1",
          "type": "consequence",
          "name": "Pool Fire",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "remote",
          "severityClassId": "major",
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_2",
          "type": "consequence",
          "name": "Flash Fire",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "improbable",
          "severityClassId": "critical",
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_3",
          "type": "consequence",
          "name": "Explosion",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "highly_improbable",
          "severityClassId": "catastrophic",
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_4",
          "type": "consequence",
          "name": "Release, No Ignition",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_5",
          "type": "consequence",
          "name": "Ground/Water Contamination",
          "description": "",
          "identifier": "",
          "likelihoodClassId": "improbable",
          "severityClassId": "marginal",
          "frequency": null,
          "protection": null
        }
      ],
      "preventativeBarrier": [
        {
          "id": "PB_1",
          "type": "preventativeBarrier",
          "name": "Automatic Shutdown Valve (ESDV)",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Process Engineering",
          "effectiveness": "high"
        },
        {
          "id": "PB_2",
          "type": "preventativeBarrier",
          "name": "Bolted Flange Joint Inspection Programme",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Maintenance",
          "effectiveness": "medium"
        },
        {
          "id": "PB_3",
          "type": "preventativeBarrier",
          "name": "Pressure Relief & Corrosion Monitoring System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Process Engineering",
          "effectiveness": "medium"
        },
        {
          "id": "PB_4",
          "type": "preventativeBarrier",
          "name": "Bund Integrity Inspection Programme",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "HSE",
          "effectiveness": "medium"
        }
      ],
      "mitigativeBarrier": [
        {
          "id": "MB_1",
          "type": "mitigativeBarrier",
          "name": "Deluge / Fixed Fire Suppression System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Fire Safety",
          "effectiveness": "high"
        },
        {
          "id": "MB_2",
          "type": "mitigativeBarrier",
          "name": "Fire & Gas Detection System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "hardware",
          "owner": "Instrumentation",
          "effectiveness": "high"
        },
        {
          "id": "MB_3",
          "type": "mitigativeBarrier",
          "name": "Blast Wall / Explosion Relief Panels",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "passive",
          "owner": "Civil/Structural",
          "effectiveness": "high"
        },
        {
          "id": "MB_4",
          "type": "mitigativeBarrier",
          "name": "Spill Containment & Recovery Plan",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Emergency Response",
          "effectiveness": "medium"
        }
      ],
      "escalationFactor": [
        {
          "id": "EF_1",
          "type": "escalationFactor",
          "name": "ESDV not proof tested on schedule",
          "description": "Valve closure time drifts out of specification between overhauls.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": null,
          "owner": "Maintenance",
          "effectiveness": null
        }
      ],
      "escalationBarrier": [
        {
          "id": "EB_1",
          "type": "escalationBarrier",
          "name": "Quarterly partial-stroke test",
          "description": "Scheduled test regime with results trended against the closure-time limit.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Maintenance",
          "effectiveness": "medium"
        }
      ]
    },
    "identifierDisplayMode": "internal",
    "document": {
      "reference": "HAZOP-2026-014",
      "revision": "B",
      "status": "For review",
      "date": "2026-04-02",
      "author": "A. Fenwick (Process Safety)",
      "checkedBy": "R. Oduya (Operations)",
      "approvedBy": "",
      "organisation": "Northfield Terminal",
      "notes": "Worked example shipped with the editor. Illustrative figures only — not a real assessment of any real facility.",
      "history": [
        {
          "revision": "A",
          "date": "2026-03-12",
          "author": "A. Fenwick",
          "summary": "First draft for internal comment."
        },
        {
          "revision": "B",
          "date": "2026-04-02",
          "author": "A. Fenwick",
          "summary": "Likelihood and severity classes assigned; sent for operations review."
        }
      ]
    },
    "mode": "qualitative",
    "riskMatrix": {
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
    },
    "escalationFactors": [
      {
        "id": "PLACEMENT_19",
        "nodeId": "EF_1",
        "x": 470,
        "y": 335,
        "w": 120,
        "h": 44,
        "pageId": "PAGE_1",
        "barrierId": "PLACEMENT_11"
      }
    ],
    "escalationBarriers": [
      {
        "id": "PLACEMENT_20",
        "nodeId": "EB_1",
        "x": 470,
        "y": 265,
        "w": 55,
        "h": 18,
        "pageId": "PAGE_1"
      }
    ]
  },
  "quantitative": {
    "version": 14,
    "name": "Demo: Pipeline Overpressure Release",
    "idCounters": {
      "page": 2,
      "threat": 5,
      "consequence": 5,
      "preventativeBarrier": 4,
      "mitigativeBarrier": 4,
      "line": 11,
      "placement": 20,
      "escalationFactor": 1,
      "escalationBarrier": 1
    },
    "retiredIds": {
      "threat": [],
      "consequence": [],
      "preventativeBarrier": [],
      "mitigativeBarrier": [],
      "escalationFactor": [],
      "escalationBarrier": []
    },
    "pages": [
      {
        "id": "PAGE_1",
        "name": "Pipeline Release",
        "description": "Primary process containment failure scenario.",
        "topLevelEvent": {
          "id": "TLE_1",
          "name": "Release (Loss of Containment)",
          "x": 1110,
          "y": 365,
          "r": 70
        },
        "hazard": {
          "id": "HAZARD_1",
          "name": "Flammable Liquid"
        }
      },
      {
        "id": "PAGE_2",
        "name": "Bund Containment Failure",
        "description": "Secondary containment scenario, independent of the primary release on the first page.",
        "topLevelEvent": {
          "id": "TLE_2",
          "name": "Secondary Containment Breach",
          "x": 850,
          "y": 200,
          "r": 70
        },
        "hazard": {
          "id": "HAZARD_2",
          "name": "Stored Chemical Inventory"
        }
      }
    ],
    "threats": [
      {
        "id": "PLACEMENT_1",
        "nodeId": "T_1",
        "x": 150,
        "y": 90,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_2",
        "nodeId": "T_2",
        "x": 150,
        "y": 310,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_3",
        "nodeId": "T_3",
        "x": 150,
        "y": 530,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_4",
        "nodeId": "T_4",
        "x": 150,
        "y": 750,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_5",
        "nodeId": "T_5",
        "x": 150,
        "y": 200,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_2"
      }
    ],
    "consequences": [
      {
        "id": "PLACEMENT_6",
        "nodeId": "C_1",
        "x": 2070,
        "y": 90,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_7",
        "nodeId": "C_2",
        "x": 2070,
        "y": 310,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_8",
        "nodeId": "C_3",
        "x": 2070,
        "y": 530,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_9",
        "nodeId": "C_4",
        "x": 2070,
        "y": 750,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_10",
        "nodeId": "C_5",
        "x": 1550,
        "y": 200,
        "w": 140,
        "h": 60,
        "pageId": "PAGE_2"
      }
    ],
    "preventativeBarriers": [
      {
        "id": "PLACEMENT_11",
        "nodeId": "PB_1",
        "x": 470,
        "y": 90,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_12",
        "nodeId": "PB_2",
        "x": 470,
        "y": 310,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_13",
        "nodeId": "PB_3",
        "x": 790,
        "y": 310,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_14",
        "nodeId": "PB_4",
        "x": 470,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_2"
      }
    ],
    "mitigativeBarriers": [
      {
        "id": "PLACEMENT_15",
        "nodeId": "MB_1",
        "x": 1750,
        "y": 90,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_16",
        "nodeId": "MB_2",
        "x": 1430,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_17",
        "nodeId": "MB_3",
        "x": 1430,
        "y": 530,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_1"
      },
      {
        "id": "PLACEMENT_18",
        "nodeId": "MB_4",
        "x": 1230,
        "y": 200,
        "w": 36,
        "h": 110,
        "pageId": "PAGE_2"
      }
    ],
    "lines": [
      {
        "id": "LINE_1",
        "originType": "threat",
        "originId": "PLACEMENT_1",
        "stops": [
          "PLACEMENT_11",
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_2",
        "originType": "threat",
        "originId": "PLACEMENT_2",
        "stops": [
          "PLACEMENT_12",
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_3",
        "originType": "threat",
        "originId": "PLACEMENT_3",
        "stops": [
          "PLACEMENT_13"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_4",
        "originType": "threat",
        "originId": "PLACEMENT_4",
        "stops": [],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_5",
        "originType": "consequence",
        "originId": "PLACEMENT_6",
        "stops": [
          "PLACEMENT_15",
          "PLACEMENT_16"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_6",
        "originType": "consequence",
        "originId": "PLACEMENT_7",
        "stops": [
          "PLACEMENT_16"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_7",
        "originType": "consequence",
        "originId": "PLACEMENT_8",
        "stops": [
          "PLACEMENT_17"
        ],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_8",
        "originType": "consequence",
        "originId": "PLACEMENT_9",
        "stops": [],
        "pageId": "PAGE_1"
      },
      {
        "id": "LINE_9",
        "originType": "threat",
        "originId": "PLACEMENT_5",
        "stops": [
          "PLACEMENT_14"
        ],
        "pageId": "PAGE_2"
      },
      {
        "id": "LINE_10",
        "originType": "consequence",
        "originId": "PLACEMENT_10",
        "stops": [
          "PLACEMENT_18"
        ],
        "pageId": "PAGE_2"
      },
      {
        "id": "LINE_11",
        "originType": "escalationFactor",
        "originId": "PLACEMENT_19",
        "stops": [
          "PLACEMENT_20"
        ],
        "pageId": "PAGE_1"
      }
    ],
    "library": {
      "threat": [
        {
          "id": "T_1",
          "type": "threat",
          "name": "Valve Inadvertently Opened",
          "description": "Typical LOPA initiating event frequency, ~0.1/yr.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": {
            "value": "1.14E-5"
          },
          "protection": null
        },
        {
          "id": "T_2",
          "type": "threat",
          "name": "Flange Leak",
          "description": "Typical LOPA initiating event frequency, ~0.01/yr.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": {
            "value": "1.14E-6"
          },
          "protection": null
        },
        {
          "id": "T_3",
          "type": "threat",
          "name": "Corrosion or Erosion",
          "description": "Typical LOPA initiating event frequency, ~0.01/yr.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": {
            "value": "1.14E-6"
          },
          "protection": null
        },
        {
          "id": "T_4",
          "type": "threat",
          "name": "Dropped Object or Vehicle Collision",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": {
            "unknown": true
          },
          "protection": null
        },
        {
          "id": "T_5",
          "type": "threat",
          "name": "Bund Wall Cracking",
          "description": "Typical LOPA initiating event frequency, ~0.05/yr.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": {
            "value": "5.7E-6"
          },
          "protection": null
        }
      ],
      "consequence": [
        {
          "id": "C_1",
          "type": "consequence",
          "name": "Pool Fire",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": "major",
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_2",
          "type": "consequence",
          "name": "Flash Fire",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": "critical",
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_3",
          "type": "consequence",
          "name": "Explosion",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": "catastrophic",
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_4",
          "type": "consequence",
          "name": "Release, No Ignition",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null
        },
        {
          "id": "C_5",
          "type": "consequence",
          "name": "Ground/Water Contamination",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": "marginal",
          "frequency": null,
          "protection": null
        }
      ],
      "preventativeBarrier": [
        {
          "id": "PB_1",
          "type": "preventativeBarrier",
          "name": "Automatic Shutdown Valve (ESDV)",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "rrf",
            "value": "10"
          },
          "barrierType": "hardware",
          "owner": "Process Engineering",
          "effectiveness": "high"
        },
        {
          "id": "PB_2",
          "type": "preventativeBarrier",
          "name": "Bolted Flange Joint Inspection Programme",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "pfdavg",
            "value": "0.5"
          },
          "barrierType": "human",
          "owner": "Maintenance",
          "effectiveness": "medium"
        },
        {
          "id": "PB_3",
          "type": "preventativeBarrier",
          "name": "Pressure Relief & Corrosion Monitoring System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "unknown": true
          },
          "barrierType": "hardware",
          "owner": "Process Engineering",
          "effectiveness": "medium"
        },
        {
          "id": "PB_4",
          "type": "preventativeBarrier",
          "name": "Bund Integrity Inspection Programme",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "sil",
            "value": "2"
          },
          "barrierType": "human",
          "owner": "HSE",
          "effectiveness": "medium"
        }
      ],
      "mitigativeBarrier": [
        {
          "id": "MB_1",
          "type": "mitigativeBarrier",
          "name": "Deluge / Fixed Fire Suppression System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "rrf",
            "value": "3"
          },
          "barrierType": "hardware",
          "owner": "Fire Safety",
          "effectiveness": "high"
        },
        {
          "id": "MB_2",
          "type": "mitigativeBarrier",
          "name": "Fire & Gas Detection System",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "rateRunning",
            "value": "1E-6",
            "rateUnit": "perHour",
            "dangerousFraction": "0.5"
          },
          "barrierType": "hardware",
          "owner": "Instrumentation",
          "effectiveness": "high"
        },
        {
          "id": "MB_3",
          "type": "mitigativeBarrier",
          "name": "Blast Wall / Explosion Relief Panels",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "unavailability",
            "value": "0.25"
          },
          "barrierType": "passive",
          "owner": "Civil/Structural",
          "effectiveness": "high"
        },
        {
          "id": "MB_4",
          "type": "mitigativeBarrier",
          "name": "Spill Containment & Recovery Plan",
          "description": "",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": {
            "measure": "rrf",
            "value": "20"
          },
          "barrierType": "human",
          "owner": "Emergency Response",
          "effectiveness": "medium"
        }
      ],
      "escalationFactor": [
        {
          "id": "EF_1",
          "type": "escalationFactor",
          "name": "ESDV not proof tested on schedule",
          "description": "Valve closure time drifts out of specification between overhauls.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": null,
          "owner": "Maintenance",
          "effectiveness": null,
          "degradation": {
            "mode": "factor",
            "value": "10"
          }
        }
      ],
      "escalationBarrier": [
        {
          "id": "EB_1",
          "type": "escalationBarrier",
          "name": "Quarterly partial-stroke test",
          "description": "Scheduled test regime with results trended against the closure-time limit.",
          "identifier": "",
          "likelihoodClassId": null,
          "severityClassId": null,
          "frequency": null,
          "protection": null,
          "barrierType": "human",
          "owner": "Maintenance",
          "effectiveness": "medium"
        }
      ]
    },
    "identifierDisplayMode": "internal",
    "document": {
      "reference": "HAZOP-2026-014",
      "revision": "C",
      "status": "Issued",
      "date": "2026-05-20",
      "author": "A. Fenwick (Process Safety)",
      "checkedBy": "R. Oduya (Operations)",
      "approvedBy": "M. Halvorsen (Technical Authority)",
      "organisation": "Northfield Terminal",
      "notes": "Worked example shipped with the editor. Illustrative figures only — not a real assessment of any real facility.",
      "history": [
        {
          "revision": "A",
          "date": "2026-03-12",
          "author": "A. Fenwick",
          "summary": "First draft for internal comment."
        },
        {
          "revision": "B",
          "date": "2026-04-02",
          "author": "A. Fenwick",
          "summary": "Likelihood and severity classes assigned; sent for operations review."
        },
        {
          "revision": "C",
          "date": "2026-05-20",
          "author": "A. Fenwick",
          "summary": "Barrier measures quantified (PFD/RRF); issued."
        }
      ]
    },
    "mode": "quantitative",
    "riskMatrix": {
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
    },
    "escalationFactors": [
      {
        "id": "PLACEMENT_19",
        "nodeId": "EF_1",
        "x": 470,
        "y": 335,
        "w": 120,
        "h": 44,
        "pageId": "PAGE_1",
        "barrierId": "PLACEMENT_11"
      }
    ],
    "escalationBarriers": [
      {
        "id": "PLACEMENT_20",
        "nodeId": "EB_1",
        "x": 470,
        "y": 265,
        "w": 55,
        "h": 18,
        "pageId": "PAGE_1"
      }
    ]
  }
};
  // Back-compat alias for every existing call site written before demo
  // variants existed (WelcomeController's Ctrl+Alt+D shortcut, tests) --
  // always the Simple-mode variant, today's original demo content.
  Bowtie.DEMO_DATA = Bowtie.DEMO_DATA_VARIANTS.simple;
})(window.Bowtie = window.Bowtie || {});
