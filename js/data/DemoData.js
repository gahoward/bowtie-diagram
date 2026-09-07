// GENERATED FILE -- do not edit directly.
// Source of truth: js/data/demo-bowtie.json -- edit that file (plain,
// schema-v7 JSON, the same shape "Export to JSON" produces), then run
// `node scripts/build-demo-data.js` to regenerate this file.
//
// Wrapped into a real script (rather than fetched as JSON) so it works
// standalone over file:// -- see scripts/build-demo-data.js.
(function (Bowtie) {
  Bowtie.DEMO_DATA = {
  "version": 7,
  "name": "Demo: Pipeline Overpressure Release",
  "idCounters": {
    "page": 2,
    "cause": 5,
    "outcome": 5,
    "preventativeBarrier": 4,
    "mitigativeBarrier": 4,
    "line": 10
  },
  "retiredIds": {
    "cause": [],
    "outcome": [],
    "preventativeBarrier": [],
    "mitigativeBarrier": []
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
  "causes": [
    {
      "id": "C_1",
      "name": "Valve Inadvertently Opened",
      "x": 150,
      "y": 90,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "C_2",
      "name": "Flange Leak",
      "x": 150,
      "y": 310,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "C_3",
      "name": "Corrosion or Erosion",
      "x": 150,
      "y": 530,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "C_4",
      "name": "Dropped Object or Vehicle Collision",
      "x": 150,
      "y": 750,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "C_5",
      "name": "Bund Wall Cracking",
      "x": 150,
      "y": 200,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_2"
    }
  ],
  "outcomes": [
    {
      "id": "O_1",
      "name": "Pool Fire",
      "x": 2070,
      "y": 90,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "O_2",
      "name": "Flash Fire",
      "x": 2070,
      "y": 310,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "O_3",
      "name": "Explosion",
      "x": 2070,
      "y": 530,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "O_4",
      "name": "Release, No Ignition",
      "x": 2070,
      "y": 750,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_1"
    },
    {
      "id": "O_5",
      "name": "Ground/Water Contamination",
      "x": 1550,
      "y": 200,
      "w": 140,
      "h": 60,
      "pageId": "PAGE_2"
    }
  ],
  "preventativeBarriers": [
    {
      "id": "PB_1",
      "name": "Automatic Shutdown Valve (ESDV)",
      "x": 470,
      "y": 90,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_1"
    },
    {
      "id": "PB_2",
      "name": "Bolted Flange Joint Inspection Programme",
      "x": 470,
      "y": 310,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_1"
    },
    {
      "id": "PB_3",
      "name": "Pressure Relief & Corrosion Monitoring System",
      "x": 790,
      "y": 310,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_1"
    },
    {
      "id": "PB_4",
      "name": "Bund Integrity Inspection Programme",
      "x": 470,
      "y": 200,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_2"
    }
  ],
  "mitigativeBarriers": [
    {
      "id": "MB_1",
      "name": "Deluge / Fixed Fire Suppression System",
      "x": 1750,
      "y": 90,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_1"
    },
    {
      "id": "MB_2",
      "name": "Fire & Gas Detection System",
      "x": 1430,
      "y": 200,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_1"
    },
    {
      "id": "MB_3",
      "name": "Blast Wall / Explosion Relief Panels",
      "x": 1430,
      "y": 530,
      "w": 36,
      "h": 110,
      "pageId": "PAGE_1"
    },
    {
      "id": "MB_4",
      "name": "Spill Containment & Recovery Plan",
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
      "originType": "cause",
      "originId": "C_1",
      "stops": [
        "PB_1",
        "PB_3"
      ],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_2",
      "originType": "cause",
      "originId": "C_2",
      "stops": [
        "PB_2",
        "PB_3"
      ],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_3",
      "originType": "cause",
      "originId": "C_3",
      "stops": [
        "PB_3"
      ],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_4",
      "originType": "cause",
      "originId": "C_4",
      "stops": [],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_5",
      "originType": "outcome",
      "originId": "O_1",
      "stops": [
        "MB_1",
        "MB_2"
      ],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_6",
      "originType": "outcome",
      "originId": "O_2",
      "stops": [
        "MB_2"
      ],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_7",
      "originType": "outcome",
      "originId": "O_3",
      "stops": [
        "MB_3"
      ],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_8",
      "originType": "outcome",
      "originId": "O_4",
      "stops": [],
      "pageId": "PAGE_1"
    },
    {
      "id": "LINE_9",
      "originType": "cause",
      "originId": "C_5",
      "stops": [
        "PB_4"
      ],
      "pageId": "PAGE_2"
    },
    {
      "id": "LINE_10",
      "originType": "outcome",
      "originId": "O_5",
      "stops": [
        "MB_4"
      ],
      "pageId": "PAGE_2"
    }
  ]
};
})(window.Bowtie = window.Bowtie || {});
