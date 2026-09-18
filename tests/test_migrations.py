"""Forward schema migrations (proposals/12).

`loadDocument` used to reject anything but an exact SCHEMA_VERSION
match, which was right while no files existed outside this repo and
every bump changed the meaning of a field. It stops being right the
moment someone else has an export: each later bump would strand their
file with no way forward but editing JSON by hand.

The shipped chain is empty -- the next bump (proposals 08 or 11) adds
its own entry -- so these tests register a migration and raise
SCHEMA_VERSION in the page to stand in for that bump. Everything under
test is the real path: the chain lookup, the deep copy, the version
rules in `loadDocument`, the Upgraded notice, and the dirty flag.
"""
import json
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"
V10 = json.loads((FIXTURES / "schema-v10.json").read_text())

# Stands in for the next real bump: raise the editor's own version and
# register the step that reaches it.
BUMP = """(steps) => {
  Bowtie.BowtieModel.SCHEMA_VERSION = 10 + steps;
  for (let n = 0; n < steps; n += 1) {
    Bowtie.Migrations.MIGRATIONS.push({
      from: 10 + n,
      to: 11 + n,
      describe: `Renamed nothing, step ${n + 1}`,
      migrate: (doc) => ({ ...doc, name: `${doc.name} [${n + 1}]` }),
    });
  }
}"""


def _bump(page, steps=1):
    page.evaluate(BUMP, steps)


def _load(page, doc):
    return page.evaluate("(doc) => window.__lastImportExport.loadDocument(doc)", doc)


def _dirty(page):
    return page.evaluate("() => window.__lastUnsavedChanges.dirty")


def _modal_title(page):
    return page.locator(".modal-title").last.text_content()


# --- migrateDocument itself ----------------------------------------------

def test_the_shipped_chain_is_empty_and_the_current_version_needs_no_migration(page):
    """Nothing to migrate yet -- but `canMigrate` must already say so
    rather than throwing, since every import asks it."""
    assert page.evaluate("() => Bowtie.Migrations.MIGRATIONS.length") == 0
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(Bowtie.BowtieModel.SCHEMA_VERSION)") is False
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(9)") is False


def test_a_chain_is_applied_in_order_and_the_input_is_never_mutated(page):
    _bump(page, steps=2)
    result = page.evaluate(
        """(doc) => {
          const before = JSON.stringify(doc);
          const out = Bowtie.Migrations.migrateDocument(doc);
          return { out, untouched: JSON.stringify(doc) === before };
        }""",
        {"version": 10, "name": "Study", "pages": [{"id": "p1"}]},
    )
    assert result["untouched"] is True, "the caller's parsed file is left exactly as read"
    assert result["out"]["ok"] is True
    assert result["out"]["doc"]["version"] == 12
    assert result["out"]["doc"]["name"] == "Study [1] [2]"
    assert result["out"]["applied"] == [
        "v10 → v11: Renamed nothing, step 1",
        "v11 → v12: Renamed nothing, step 2",
    ]


def test_a_gap_in_the_chain_is_a_refusal_not_a_leap(page):
    """A missing step must never be skipped over: half-upgrading a
    document is worse than refusing it."""
    page.evaluate("""() => {
      Bowtie.BowtieModel.SCHEMA_VERSION = 12;
      Bowtie.Migrations.MIGRATIONS.push({
        from: 11, to: 12, describe: 'Only the second half', migrate: (d) => d,
      });
    }""")
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(10)") is False
    assert page.evaluate("() => Bowtie.Migrations.migrateDocument({version: 10}).ok") is False
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(11)") is True


# --- the version rules in loadDocument ------------------------------------

def test_a_file_from_the_future_is_refused(page):
    assert _load(page, {**V10, "version": 99}) is False
    assert _modal_title(page) == "Unsupported File Version"
    body = page.locator(".modal-body").text_content()
    assert "newer than" in body, "the reason is which way round the mismatch is"


def test_a_file_older_than_the_upgrade_path_is_refused_with_the_reason(page):
    assert _load(page, {**V10, "version": 9}) is False
    assert _modal_title(page) == "Unsupported File Version"
    assert "predate the upgrade path" in page.locator(".modal-body").text_content()


def test_the_current_version_loads_with_no_notice(page):
    assert _load(page, V10) is True
    page.wait_for_timeout(120)
    assert page.locator(".modal-title").count() == 0, "nothing to announce"
    assert _dirty(page) is False, "an ordinary import is exactly what is on disk"


# --- an upgraded load, end to end -----------------------------------------

def test_an_older_file_is_upgraded_loaded_and_left_needing_a_save(page):
    _bump(page)
    assert _load(page, V10) is True
    page.wait_for_timeout(120)

    assert _modal_title(page) == "Upgraded"
    body = page.locator(".modal-body").text_content()
    assert "v10 → v11: Renamed nothing, step 1" in body
    assert "original file has not been changed" in body
    page.get_by_role("button", name="OK", exact=True).click()
    page.wait_for_timeout(80)

    # The document really loaded -- the demo's own pages and nodes.
    assert page.evaluate("() => window.__lastModel.pages.length") == len(V10["pages"])
    assert page.evaluate("() => window.__lastModel.causes.length") == len(V10["causes"])
    assert page.evaluate("() => window.__lastModel.name").endswith("[1]"), "the migration ran"
    assert _dirty(page) is True, "the file on disk is still the old version"


def test_the_fixture_is_the_document_the_editor_exported_at_v10(page):
    """The fixture is frozen on purpose -- a migration has to be tested
    against what v10 really wrote, not what today's code assumes. This
    guards the copy itself: it must still be a loadable v10 document."""
    assert V10["version"] == 10
    assert _load(page, V10) is True
    page.wait_for_timeout(100)
    assert page.evaluate("() => window.__lastModel.getWarnings().length") == 0


def test_a_recovery_snapshot_from_an_older_version_upgrades_too(page):
    """Snapshots are stored documents, so a bump would otherwise strand
    unsaved work the same way it strands files."""
    _bump(page)
    page.evaluate(
        """(doc) => {
          window.localStorage.setItem('bowtie-diagram.recovery', JSON.stringify({
            savedAt: new Date().toISOString(), name: doc.name,
            pages: doc.pages.length, nodes: doc.causes.length, document: doc,
          }));
        }""",
        V10,
    )
    loaded = page.evaluate("() => window.__lastRecovery.restore(window.__lastImportExport)")
    page.wait_for_timeout(150)
    assert loaded is True
    assert page.evaluate("() => window.__lastModel.name").endswith("[1]")
    assert _dirty(page) is True


def test_a_migration_that_throws_refuses_the_file_rather_than_half_loading_it(page):
    """A broken migration is a bug in that migration -- but it must not
    land as an uncaught error over a partly-loaded document."""
    page.evaluate("""() => {
      Bowtie.BowtieModel.SCHEMA_VERSION = 11;
      Bowtie.Migrations.MIGRATIONS.push({
        from: 10, to: 11, describe: 'Throws', migrate: () => { throw new Error('bad step'); },
      });
    }""")
    before = page.evaluate("() => window.__lastModel.causes.length")
    assert _load(page, V10) is False
    page.wait_for_timeout(120)
    assert _modal_title(page) == "Upgrade Failed"
    assert "bad step" in page.locator(".modal-body").text_content()
    assert page.evaluate("() => window.__lastModel.causes.length") == before, "the model is untouched"


def test_a_step_that_does_not_advance_is_refused_rather_than_looped_on(page):
    """`to <= from` in a malformed entry would otherwise spin the chain
    walk forever, hanging the tab instead of declining the file."""
    page.evaluate("""() => {
      Bowtie.BowtieModel.SCHEMA_VERSION = 11;
      Bowtie.Migrations.MIGRATIONS.push({ from: 10, to: 10, describe: 'Goes nowhere', migrate: (d) => d });
    }""")
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(10)") is False
    assert _load(page, V10) is False
    assert _modal_title(page) == "Unsupported File Version"
