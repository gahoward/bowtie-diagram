"""Schema round-trip, and the version rules around it.

A file NEWER than the editor is still rejected outright rather than
silently misread; one OLDER than v10 predates the upgrade path and is
rejected too. Older files from v10 on are migrated instead -- that half
lives in test_migrations.py (proposals/12)."""


# Every field DocumentSerializer persists, read straight off the live model
# rather than re-derived from its own toJSON() -- design review finding 08.
# The previous version of this test compared JSON.stringify(before) against
# JSON.stringify(restored.toJSON()), where `before` was ALSO produced by
# toJSON(): a field toJSON() forgot to serialize would be equally absent
# from both sides, so the comparison would pass vacuously. Reading "before"
# off the original live model's own in-memory state (built by addThreat/
# renameNode/etc., never round-tripped) means a genuinely dropped field
# shows up here as a real mismatch against the restored model's default.
_SNAPSHOT_JS = """
(m) => ({
  name: m.name,
  mode: m.mode,
  riskMatrixId: m.riskMatrix ? m.riskMatrix.id : null,
  tleAggregation: m.tleAggregation,
  dangerousFraction: m.dangerousFraction,
  proofTestIntervalH: m.proofTestIntervalH,
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
        protection: n.protection,
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
  threats: m.threats.map((c) => ({ nodeId: c.nodeId, x: c.x, y: c.y, w: c.w, h: c.h })),
  consequences: m.consequences.map((o) => ({ nodeId: o.nodeId, x: o.x, y: o.y, w: o.w, h: o.h })),
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
      m.setTleAggregation('sum');
      m.setQuantitativeDefaults({ dangerousFraction: '0.9', proofTestIntervalH: '4380' });
      m.setIdentifierDisplayMode('custom');
      m.setName('Distinctive Document Name');

      const page2 = m.addPage({ name: 'Second Page', description: 'Page two description' });
      m.renamePage(m.pages[0].id, { name: 'First Page', description: 'Page one description' });
      m.renameElement(m.pages[0].topLevelEvent.id, 'Distinctive TLE', 'TLE description');
      m.renameElement(m.pages[0].hazard.id, 'Distinctive Hazard', 'Hazard description');

      const threat = m.addThreat({ name: 'Distinctive Threat', description: 'Threat description', x: 321, y: 87 });
      m.renameNode(threat.nodeId, { identifier: 'CUSTOM-THREAT', frequency: { value: '1E-3' } });
      const pb = m.addPreventativeControl(threat.id);
      m.renameNode(pb.nodeId, {
        protection: { measure: 'rrf', value: '10' },
        barrierType: 'hardware', owner: 'Ops Team', effectiveness: 'high',
      });

      const consequence = m.addConsequence({ name: 'Distinctive Consequence', pageId: page2.id, x: 999, y: 111 });
      m.renameNode(consequence.nodeId, {
        severityClassId: m.riskMatrix.severityClasses[1].id,
        likelihoodClassId: m.riskMatrix.likelihoodClasses[1].id,
      });
      const mb = m.addMitigativeControl(consequence.id);
      m.renameNode(mb.nodeId, { protection: { unknown: true } });

      // Populate retiredIds with a distinctive, re-enabled entry.
      const doomed = m.addThreat({ name: 'Doomed' });
      const doomedNodeId = doomed.nodeId;
      m.deleteNode(doomedNodeId);
      m.reEnableId('threat', doomedNodeId);
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


def test_a_version_older_than_the_upgrade_path_is_rejected_with_a_message(page):
    """v5 predates v10, where the migration chain starts, so there is no
    fixture to migrate it against and no way to know what its fields
    meant -- it is refused, not guessed at."""
    loaded = page.evaluate("""() => {
      const data = window.__lastModel.toJSON();
      data.version = 5;
      return window.__lastImportExport.loadDocument(data);
    }""")
    assert loaded is False
    assert page.locator(".modal-title").last.text_content() == "Unsupported File Version"
    assert "version 5" in page.locator(".modal-body").text_content()
    assert page.evaluate("() => Bowtie.BowtieModel.SCHEMA_VERSION") > 5, \
        "the refusal is about the FILE being too old, not about this version in particular"
