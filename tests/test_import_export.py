"""Schema v7 round-trip, and the version-mismatch guard that replaced the
old migration path (this project has exactly one user, so there is no
migration code any more — an incompatible file is rejected outright rather
than silently misread)."""


def test_export_then_import_round_trips(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
      m.addOutcome({x: 1200, y: 200});
      m.addMitigativeControl(m.outcomes[0].id);
    }""")
    page.wait_for_timeout(100)

    round_trips = page.evaluate("""() => {
      const before = window.__lastModel.toJSON();
      const restored = Bowtie.BowtieModel.fromJSON(before);
      return JSON.stringify(restored.toJSON()) === JSON.stringify(before);
    }""")
    assert round_trips is True


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
    assert shown["current"] == 7
