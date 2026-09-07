#!/usr/bin/env node
// One-off migration: reads the original schema-v7 js/data/demo-bowtie.json
// (single-node-space: a placement's own id WAS the visible id) and emits
// three schema-v8 demo documents -- one per document mode
// (quantitative_mode_proposal.md "Modes") -- splitting each old placement
// into a library node (keeping the OLD visible id/name) + a fresh
// placement (a new PLACEMENT_n id, nodeId pointing at the node), per
// node_library_proposal.md's "Two id spaces". Run once; the three output
// files (js/data/demo-simple.json, demo-qualitative.json,
// demo-quantitative.json) are the real source of truth from here on,
// hand-edited/extended directly like any other demo content.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'data', 'demo-bowtie.json');
const OUT_DIR = path.join(__dirname, '..', 'js', 'data');

const CAUSE_KEYS = ['causes', 'outcomes', 'preventativeBarriers', 'mitigativeBarriers'];
const TYPE_FOR_KEY = {
  causes: 'cause', outcomes: 'outcome', preventativeBarriers: 'preventativeBarrier', mitigativeBarriers: 'mitigativeBarrier',
};

function migrateToV8(oldData) {
  const data = JSON.parse(JSON.stringify(oldData));
  const remap = {}; // old visible id -> new placement id
  let placementCounter = 0;
  const library = {
    cause: [], outcome: [], preventativeBarrier: [], mitigativeBarrier: [],
  };

  CAUSE_KEYS.forEach((key) => {
    const type = TYPE_FOR_KEY[key];
    data[key] = data[key].map((el) => {
      placementCounter += 1;
      const newId = `PLACEMENT_${placementCounter}`;
      remap[el.id] = newId;
      library[type].push({
        id: el.id, type, name: el.name, description: '', identifier: '',
        likelihoodClassId: null, severityClassId: null, frequency: null, riskReductionFactor: null,
      });
      return {
        id: newId, nodeId: el.id, x: el.x, y: el.y, w: el.w, h: el.h, pageId: el.pageId,
      };
    });
  });

  data.lines = data.lines.map((line) => ({
    ...line,
    originId: remap[line.originId],
    stops: line.stops.map((s) => remap[s]),
  }));

  data.version = 8;
  data.idCounters.placement = placementCounter;
  data.library = library;
  data.identifierDisplayMode = 'internal';
  data.mode = 'simple';
  data.riskMatrix = null;
  return data;
}

const oldData = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const simple = migrateToV8(oldData);
fs.writeFileSync(path.join(OUT_DIR, 'demo-simple.json'), JSON.stringify(simple, null, 2));
console.log('Wrote js/data/demo-simple.json');

// --- Qualitative and Quantitative variants ---------------------------
// Same diagram, same node identities -- only the document mode, active
// matrix, and each node's risk fields differ, exercising both risk modes
// concretely against the SAME shipped example (quantitative_mode_
// proposal.md's own recommendation: "a natural moment to actually
// demonstrate the feature in the shipped demo").
global.window = { Bowtie: {} };
require(path.join(__dirname, '..', 'js', 'model', 'Decimal.js'));
require(path.join(__dirname, '..', 'js', 'data', 'RiskMatrixPresets.js'));
const leaflet5 = global.window.Bowtie.RISK_MATRIX_PRESETS.leaflet5;

function findNode(data, type, name) {
  const node = data.library[type].find((n) => n.name === name);
  if (!node) throw new Error(`No ${type} node named "${name}" found`);
  return node;
}

const qualitative = JSON.parse(JSON.stringify(simple));
qualitative.version = 8;
qualitative.mode = 'qualitative';
qualitative.riskMatrix = leaflet5;
// Page 1 (Pipeline Release): a spread of likelihood/severity picks across
// the shared-barrier structure, including at least one cause/outcome left
// unset (qualitative_mode_proposal.md: "items can be missing").
findNode(qualitative, 'cause', 'Valve Inadvertently Opened').likelihoodClassId = 'occasional';
findNode(qualitative, 'cause', 'Flange Leak').likelihoodClassId = 'probable';
findNode(qualitative, 'cause', 'Corrosion or Erosion').likelihoodClassId = 'remote';
// 'Dropped Object or Vehicle Collision' (C_4) deliberately left unset.
findNode(qualitative, 'outcome', 'Pool Fire').likelihoodClassId = 'remote';
findNode(qualitative, 'outcome', 'Pool Fire').severityClassId = 'major';
findNode(qualitative, 'outcome', 'Flash Fire').likelihoodClassId = 'improbable';
findNode(qualitative, 'outcome', 'Flash Fire').severityClassId = 'critical';
findNode(qualitative, 'outcome', 'Explosion').likelihoodClassId = 'highly_improbable';
findNode(qualitative, 'outcome', 'Explosion').severityClassId = 'catastrophic';
// 'Release, No Ignition' (O_4) deliberately left unset (no severity/
// likelihood picked -- its risk class simply isn't shown).
findNode(qualitative, 'cause', 'Bund Wall Cracking').likelihoodClassId = 'improbable';
findNode(qualitative, 'outcome', 'Ground/Water Contamination').likelihoodClassId = 'improbable';
findNode(qualitative, 'outcome', 'Ground/Water Contamination').severityClassId = 'marginal';
fs.writeFileSync(path.join(OUT_DIR, 'demo-qualitative.json'), JSON.stringify(qualitative, null, 2));
console.log('Wrote js/data/demo-qualitative.json');

const quantitative = JSON.parse(JSON.stringify(simple));
quantitative.version = 8;
quantitative.mode = 'quantitative';
quantitative.riskMatrix = leaflet5;
// Threats: raw frequencies (canonical events/hour), one deliberately
// Unknown (quantitative_mode_proposal.md: excluded from the TLE max, but
// must be visibly flagged -- see computeTleLikelihood's excludedThreatCount).
findNode(quantitative, 'cause', 'Valve Inadvertently Opened').frequency = { value: '0.001' };
findNode(quantitative, 'cause', 'Flange Leak').frequency = { value: '0.01' };
findNode(quantitative, 'cause', 'Corrosion or Erosion').frequency = { value: '0.0001' };
findNode(quantitative, 'cause', 'Dropped Object or Vehicle Collision').frequency = { unknown: true };
findNode(quantitative, 'cause', 'Bund Wall Cracking').frequency = { value: '0.00005' };
// Barriers: risk reduction factors, one deliberately Unknown (skipped from
// the product entirely -- conservative, no flag needed).
findNode(quantitative, 'preventativeBarrier', 'Automatic Shutdown Valve (ESDV)').riskReductionFactor = { value: '0.1' };
findNode(quantitative, 'preventativeBarrier', 'Bolted Flange Joint Inspection Programme').riskReductionFactor = { value: '0.5' };
findNode(quantitative, 'preventativeBarrier', 'Pressure Relief & Corrosion Monitoring System').riskReductionFactor = { unknown: true };
findNode(quantitative, 'preventativeBarrier', 'Bund Integrity Inspection Programme').riskReductionFactor = { value: '0.2' };
findNode(quantitative, 'mitigativeBarrier', 'Deluge / Fixed Fire Suppression System').riskReductionFactor = { value: '0.3' };
findNode(quantitative, 'mitigativeBarrier', 'Fire & Gas Detection System').riskReductionFactor = { value: '0.4' };
findNode(quantitative, 'mitigativeBarrier', 'Blast Wall / Explosion Relief Panels').riskReductionFactor = { value: '0.25' };
findNode(quantitative, 'mitigativeBarrier', 'Spill Containment & Recovery Plan').riskReductionFactor = { value: '0.6' };
// Severity is still a direct pick even in Quantitative mode (never
// computed) -- same picks as the qualitative variant, for the outcomes
// that have one.
findNode(quantitative, 'outcome', 'Pool Fire').severityClassId = 'major';
findNode(quantitative, 'outcome', 'Flash Fire').severityClassId = 'critical';
findNode(quantitative, 'outcome', 'Explosion').severityClassId = 'catastrophic';
findNode(quantitative, 'outcome', 'Ground/Water Contamination').severityClassId = 'marginal';
fs.writeFileSync(path.join(OUT_DIR, 'demo-quantitative.json'), JSON.stringify(quantitative, null, 2));
console.log('Wrote js/data/demo-quantitative.json');
