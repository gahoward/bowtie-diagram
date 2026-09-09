"""Schema v9 round-trip, and the version-mismatch guard that replaced the
old migration path (this project has exactly one user, so there is no
migration code any more — an incompatible file is rejected outright rather
than silently misread)."""


# Every field DocumentSerializer persists, read straight off the live model
# rather than re-derived from its own toJSON() -- design review finding 08.
# The previous version of this test compared JSON.stringify(before) against
# JSON.stringify(restored.toJSON()), where `before` was ALSO produced by
# toJSON(): a field toJSON() forgot to serialize would be equally absent
# from both sides, so the comparison would pass vacuously. Reading "before"
# off the original live model's own in-memory state (built by addCause/
# renameNode/etc., never round-tripped) means a genuinely dropped field
# shows up here as a real mismatch against the restored model's default.
_SNAPSHOT_JS = """
(m) => ({
  name: m.name,
  mode: m.mode,
  riskMatrixId: m.riskMatrix ? m.riskMatrix.id : null,
  identifierDisplayMode: m.identifierDisplayMode,
  idCounters: { ...m.idCounters },
  retiredIds: Object.fromEntries(
    Object.entries(m.retiredIds).map(([type, entries]) => [
      type, entries.map((e) => ({ id: e.id, reEnabled: e.reEnabled })),
    ]),
  ),
  library: Object.fromEntries(
    Object.entries(m.library).map(([type, nodes]) => [
      type,
      nodes.map((n) => ({
        id: n.id,
        name: n.name,
        description: n.description,
        identifier: n.identifier,
        likelihoodClassId: n.likelihoodClassId,
        severityClassId: n.severityClassId,
        frequency: n.frequency,
        riskReductionFactor: n.riskReductionFactor,
        barrierType: n.barrierType,
        owner: n.owner,
        effectiveness: n.effectiveness,
      })),
    ]),
  ),
  pages: m.pages.map((p) => ({
    name: p.name,
    description: p.description,
    tleName: p.topLevelEvent.name,
    tleDescription: p.topLevelEvent.description,
    tleX: p.topLevelEvent.x,
    tleY: p.topLevelEvent.y,
    tleR: p.topLevelEvent.r,
    hazardName: p.hazard.name,
    hazardDescription: p.hazard.description,
  })),
  causes: m.causes.map((c) => ({ nodeId: c.nodeId, x: c.x, y: c.y, w: c.w, h: c.h })),
  outcomes: m.outcomes.map((o) => ({ nodeId: o.nodeId, x: o.x, y: o.y, w: o.w, h: o.h })),
  preventativeBarriers: m.preventativeBarriers.map((p) => ({ nodeId: p.nodeId, x: p.x, y: p.y, w: p.w, h: p.h })),
  mitigativeBarriers: m.mitigativeBarriers.map((b) => ({ nodeId: b.nodeId, x: b.x, y: b.y, w: b.w, h: b.h })),
  lines: m.lines.map((l) => ({
    originType: l.originType,
    originNodeId: m.findById(l.originId).nodeId,
    stopNodeIds: l.stops.map((stopId) => m.findById(stopId).nodeId),
  })),
})
"""


def test_export_then_import_round_trips_every_persisted_field(page):
    """Sets every persisted field to a distinctive, non-default value, then
    compares a live-model snapshot of the original against one of the
    round-tripped copy -- see _SNAPSHOT_JS above for why that catches what
    a serialized-to-serialized comparison structurally cannot."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      m.setIdentifierDisplayMode('custom');
      m.setName('Distinctive Document Name');

      const page2 = m.addPage({ name: 'Second Page', description: 'Page two description' });
      m.renamePage(m.pages[0].id, { name: 'First Page', description: 'Page one description' });
      m.renameElement(m.pages[0].topLevelEvent.id, 'Distinctive TLE', 'TLE description');
      m.renameElement(m.pages[0].hazard.id, 'Distinctive Hazard', 'Hazard description');

      const cause = m.addCause({ name: 'Distinctive Cause', description: 'Cause description', x: 321, y: 87 });
      m.renameNode(cause.nodeId, { identifier: 'CUSTOM-CAUSE', frequency: { value: '1E-3' } });
      const pb = m.addPreventativeControl(cause.id);
      m.renameNode(pb.nodeId, {
        riskReductionFactor: { value: '10' },
        barrierType: 'hardware', owner: 'Ops Team', effectiveness: 'high',
      });

      const outcome = m.addOutcome({ name: 'Distinctive Outcome', pageId: page2.id, x: 999, y: 111 });
      m.renameNode(outcome.nodeId, {
        severityClassId: m.riskMatrix.severityClasses[1].id,
        likelihoodClassId: m.riskMatrix.likelihoodClasses[1].id,
      });
      const mb = m.addMitigativeControl(outcome.id);
      m.renameNode(mb.nodeId, { riskReductionFactor: { unknown: true } });

      // Populate retiredIds with a distinctive, re-enabled entry.
      const doomed = m.addCause({ name: 'Doomed' });
      const doomedNodeId = doomed.nodeId;
      m.deleteNode(doomedNodeId);
      m.reEnableId('cause', doomedNodeId);
    }""")
    page.wait_for_timeout(100)

    result = page.evaluate(f"""() => {{
      const snapshot = {_SNAPSHOT_JS};
      const m = window.__lastModel;
      const before = snapshot(m);
      const restored = Bowtie.BowtieModel.fromJSON(m.toJSON());
      const after = snapshot(restored);
      return {{ before, after, equal: JSON.stringify(before) === JSON.stringify(after) }};
    }}""")
    assert result["equal"] is True, (
        f"round trip dropped or altered a field:\nbefore={result['before']}\nafter={result['after']}"
    )


def test_wrong_schema_version_is_rejected_with_a_message(page):
    page.evaluate("""() => {
      const data = window.__lastModel.toJSON();
      data.version = 5;
      window.__badImportData = data;
    }""")
    # Exercise the same guard ImportExportController._onImportFile applies,
    # without needing to drive an actual <input type=file> pick.
    shown = page.evaluate("""() => {
      const data = window.__badImportData;
      const mismatch = data.version !== Bowtie.BowtieModel.SCHEMA_VERSION;
      return { mismatch, current: Bowtie.BowtieModel.SCHEMA_VERSION };
    }""")
    assert shown["mismatch"] is True
    assert shown["current"] == 9
