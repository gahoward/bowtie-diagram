"""Forward schema migrations (proposals/12), and the first real link in
the chain: v10 -> v11, the Threats/Consequences rename (proposals/11).

`loadDocument` used to reject anything but an exact SCHEMA_VERSION
match, which was right while no files existed outside this repo and
every bump changed the meaning of a field. It stops being right the
moment someone else has an export: each later bump would strand their
file with no way forward but editing JSON by hand.

`tests/fixtures/schema-v10.json`, `schema-v11.json` and
`schema-v12.json` are the
quantitative demo exactly as each version exported it, and they are
**frozen** — never regenerate it from a later
build, or the migration is only ever tested against what today's code
assumes the old shape was. The cases the shipped chain cannot produce (a
gap, a step that does not advance, a step that throws) register a
synthetic migration and raise SCHEMA_VERSION in the page; everything
else runs against the real chain.
"""
import json
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"
V10 = json.loads((FIXTURES / "schema-v10.json").read_text())
V11 = json.loads((FIXTURES / "schema-v11.json").read_text())
V12 = json.loads((FIXTURES / "schema-v12.json").read_text())
V13 = json.loads((FIXTURES / "schema-v13.json").read_text())


def _steps_from(page, version):
    """The chain a fixture of `version` must walk to reach current.

    Derived rather than spelled out: every schema bump used to require
    editing four literal lists here, which is churn that teaches nothing
    and is easy to get subtly wrong."""
    current = page.evaluate("() => Bowtie.BowtieModel.SCHEMA_VERSION")
    return [f"v{v} → v{v + 1}" for v in range(version, current)]


def _load(page, doc):
    return page.evaluate("(doc) => window.__lastImportExport.loadDocument(doc)", doc)


def _dirty(page):
    return page.evaluate("() => window.__lastUnsavedChanges.dirty")


def _modal_title(page):
    return page.locator(".modal-title").last.text_content()


def _names(page, collection):
    return page.evaluate(
        f"() => window.__lastModel.{collection}.map((p) => window.__lastModel.getNode(p.nodeId).id)"
    )


# --- the chain ------------------------------------------------------------

def test_the_chain_reaches_the_current_version_from_v10(page):
    """Written against SCHEMA_VERSION rather than a literal, so a bump
    that forgets its migration entry fails HERE -- which is the point of
    the test -- instead of only failing this assertion's own arithmetic."""
    current = page.evaluate("() => Bowtie.BowtieModel.SCHEMA_VERSION")
    assert current == 14
    for version in range(10, current):
        assert page.evaluate("(v) => Bowtie.Migrations.canMigrate(v)", version) is True, \
            f"v{version} must have a path to v{current}"
    assert page.evaluate("(v) => Bowtie.Migrations.canMigrate(v)", current) is False, "already current"
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(9)") is False, "predates the chain"


def test_a_v10_file_walks_every_step_of_the_chain(page):
    """Several bumps now sit between v10 and current, so this is the case
    the chain exists for: each step runs in order, on the output of the
    last, and the earliest step's work survives all of them."""
    current = page.evaluate("() => Bowtie.BowtieModel.SCHEMA_VERSION")
    result = page.evaluate("(doc) => Bowtie.Migrations.migrateDocument(doc)", V10)
    assert result["ok"] is True
    assert [line.split(":")[0] for line in result["applied"]] == _steps_from(page, 10)
    assert result["doc"]["version"] == current
    assert result["doc"]["library"]["threat"][0]["id"] == "T_1", "the rename still happened"
    assert result["doc"]["escalationFactors"] == [], "and the additive step filled in the rest"
    assert result["doc"]["document"]["revision"] == "", "and the newest step too"


def test_the_v11_to_v12_step_adds_escalation_shape_and_changes_nothing_else(page):
    """Escalation factors were purely additive (proposals/08), so this
    step must leave every existing key exactly as it found it."""
    result = page.evaluate("(doc) => Bowtie.Migrations.migrateDocument(doc)", V11)
    assert result["ok"] is True
    assert [line.split(":")[0] for line in result["applied"]] == _steps_from(page, 11)
    doc = result["doc"]
    assert doc["escalationFactors"] == [] and doc["escalationBarriers"] == []
    assert doc["library"]["escalationFactor"] == [] and doc["library"]["escalationBarrier"] == []
    assert doc["retiredIds"]["escalationFactor"] == []
    assert doc["idCounters"]["escalationFactor"] == 0
    for key in ["threats", "consequences", "lines", "pages", "preventativeBarriers"]:
        assert doc[key] == V11[key], f"{key} must be untouched"


def test_migrating_leaves_the_callers_own_file_exactly_as_read(page):
    """A failed load must leave the parsed file untouched, so the chain
    works on a deep copy rather than in place."""
    untouched = page.evaluate(
        """(doc) => {
          const before = JSON.stringify(doc);
          Bowtie.Migrations.migrateDocument(doc);
          return JSON.stringify(doc) === before;
        }""",
        V10,
    )
    assert untouched is True


# --- v10 -> v11: the rename -----------------------------------------------

def test_the_rename_migration_rotates_ids_and_renames_every_key(page):
    """Checked on the chain's final output rather than on the step alone:
    what matters is that the rename's effects survive every later step."""
    result = page.evaluate("(doc) => Bowtie.Migrations.migrateDocument(doc)", V10)
    assert result["ok"] is True
    assert result["applied"][0] == (
        "v10 → v11: Renamed Causes to Threats and Outcomes to Consequences "
        "(ids C_n became T_n, O_n became C_n)"
    )
    doc = result["doc"]
    assert [n["id"] for n in doc["library"]["threat"]] == ["T_1", "T_2", "T_3", "T_4", "T_5"]
    assert [n["id"] for n in doc["library"]["consequence"]] == ["C_1", "C_2", "C_3", "C_4", "C_5"]
    assert all(n["type"] == "threat" for n in doc["library"]["threat"])
    assert all(n["type"] == "consequence" for n in doc["library"]["consequence"])
    assert "cause" not in doc["library"] and "outcome" not in doc["library"]
    assert "causes" not in doc and "outcomes" not in doc
    assert {line["originType"] for line in doc["lines"]} == {"threat", "consequence"}
    assert "cause" not in doc["idCounters"] and "threat" in doc["idCounters"]
    assert "cause" not in doc["retiredIds"] and "threat" in doc["retiredIds"]


def test_a_retired_id_rotates_with_its_collection(page):
    """An id retired as C_3 (a Cause) has to come back as T_3, or the next
    Threat would be handed an id a previous one still owns."""
    retired = {**V10, "retiredIds": {**V10["retiredIds"], "cause": ["C_3"], "outcome": ["O_2"]}}
    doc = page.evaluate("(doc) => Bowtie.Migrations.migrateDocument(doc).doc", retired)
    assert doc["retiredIds"]["threat"] == ["T_3"]
    assert doc["retiredIds"]["consequence"] == ["C_2"]


def test_a_v10_file_opens_as_a_current_document_needing_a_save(page):
    assert _load(page, V10) is True
    page.wait_for_timeout(150)

    assert _modal_title(page) == "Upgraded"
    body = page.locator(".modal-body").text_content()
    assert "Causes to Threats" in body
    assert "original file has not been changed" in body
    page.get_by_role("button", name="OK", exact=True).click()
    page.wait_for_timeout(80)

    assert _names(page, "threats") == ["T_1", "T_2", "T_3", "T_4", "T_5"]
    assert _names(page, "consequences") == ["C_1", "C_2", "C_3", "C_4", "C_5"]
    assert page.evaluate("() => window.__lastModel.getWarnings().length") == 0, "and it holds together"
    assert _dirty(page) is True, "the file on disk is still v10"


def test_the_upgraded_document_exports_at_the_current_version(page):
    """The round trip that matters: open an old file, save it, and what
    lands on disk is the new schema rather than a half-renamed hybrid."""
    assert _load(page, V10) is True
    page.get_by_role("button", name="OK", exact=True).click()
    exported = page.evaluate("() => window.__lastModel.toJSON()")
    assert exported["version"] == 14
    assert "threats" in exported and "causes" not in exported
    assert [n["id"] for n in exported["library"]["threat"]] == ["T_1", "T_2", "T_3", "T_4", "T_5"]


def test_a_recovery_snapshot_from_an_older_version_upgrades_too(page):
    """Snapshots are stored documents, so a bump would otherwise strand
    unsaved work the same way it strands files."""
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
    page.wait_for_timeout(200)
    assert loaded is True
    assert _names(page, "threats") == ["T_1", "T_2", "T_3", "T_4", "T_5"]
    assert _dirty(page) is True


# --- the version rules in loadDocument ------------------------------------

def test_a_file_from_the_future_is_refused(page):
    assert _load(page, {**V10, "version": 99}) is False
    assert _modal_title(page) == "Unsupported File Version"
    assert "newer than" in page.locator(".modal-body").text_content()


def test_a_file_older_than_the_upgrade_path_is_refused_with_the_reason(page):
    assert _load(page, {**V10, "version": 9}) is False
    assert _modal_title(page) == "Unsupported File Version"
    assert "predate the upgrade path" in page.locator(".modal-body").text_content()


def test_the_current_version_loads_with_no_notice(page):
    current = page.evaluate("() => window.__lastModel.toJSON()")
    assert _load(page, current) is True
    page.wait_for_timeout(150)
    assert page.locator(".modal-title").count() == 0, "nothing to announce"
    assert _dirty(page) is False, "an ordinary import is exactly what is on disk"


def test_the_v12_to_v13_step_adds_the_document_block_and_changes_nothing_else(page):
    """The document identity block (proposals/20) is purely additive, so
    this step must leave every existing key exactly as it found it."""
    result = page.evaluate("(doc) => Bowtie.Migrations.migrateDocument(doc)", V12)
    assert result["ok"] is True
    assert [line.split(":")[0] for line in result["applied"]] == _steps_from(page, 12)
    doc = result["doc"]

    assert doc["document"] == {
        "reference": "", "revision": "", "status": "", "date": "",
        "author": "", "checkedBy": "", "approvedBy": "",
        "organisation": "", "notes": "", "history": [],
    }, "an old document states nothing, rather than guessing"

    for key in V12:
        if key == "version":
            continue
        assert doc[key] == V12[key], f"{key} must be untouched"


def test_a_v12_file_carries_its_content_through_the_upgrade(page):
    """The fixture is a real v12 export with a full diagram in it -- the
    additive step must not cost any of it."""
    assert _load(page, V12) is True
    page.wait_for_timeout(200)
    assert page.evaluate("() => window.__lastModel.threats.length") == len(V12["threats"])
    assert page.evaluate("() => window.__lastModel.escalationFactors.length") == len(V12["escalationFactors"])
    assert page.evaluate("() => window.__lastModel.document.revision") == ""


def test_the_v13_to_v14_step_changes_no_existing_figure(page):
    """proposals/21 changes what escalation factors MEAN, but not what an
    existing document reports: `degradation` defaults to null, so an
    analysis says exactly what it said before until an analyst states
    one. That is the whole reason the field has no default value."""
    before = page.evaluate("""(doc) => {
      window.__lastImportExport.loadDocument(JSON.parse(JSON.stringify(doc)));
      return {
        tle: window.__lastModel.computeTleLikelihood(window.__lastModel.pages[0].id).likelihood,
        factors: window.__lastModel.escalationFactors.length,
      };
    }""", V13)

    result = page.evaluate("(doc) => Bowtie.Migrations.migrateDocument(doc)", V13)
    assert result["ok"] is True
    assert [line.split(":")[0] for line in result["applied"]] == _steps_from(page, 13)

    after = page.evaluate("""(doc) => {
      window.__lastImportExport.loadDocument(doc);
      return {
        tle: window.__lastModel.computeTleLikelihood(window.__lastModel.pages[0].id).likelihood,
        factors: window.__lastModel.escalationFactors.length,
      };
    }""", result["doc"])

    assert after["factors"] == before["factors"] > 0, "the fixture has escalation factors to be wrong about"
    assert after["tle"] == before["tle"], "upgrading must not move a single figure"


# --- chain integrity (cases the shipped chain cannot produce) -------------
#
# Each of these invents a step BEYOND the current version rather than
# naming one, so a schema bump does not silently turn "a gap in the
# chain" into "the real chain" and quietly stop testing anything. The
# page is fresh per test, so mutating the globals here leaks nowhere.


def test_a_gap_in_the_chain_is_a_refusal_not_a_leap(page):
    """A missing step must never be skipped over: half-upgrading a
    document is worse than refusing it."""
    page.evaluate("""() => {
      const current = Bowtie.BowtieModel.SCHEMA_VERSION;
      // Target two versions ahead but supply only the LAST leg, so the
      // step from `current` is the one that is missing.
      Bowtie.BowtieModel.SCHEMA_VERSION = current + 2;
      Bowtie.Migrations.MIGRATIONS.push({
        from: current + 1, to: current + 2, describe: 'Only the last leg', migrate: (d) => d,
      });
    }""")
    assert page.evaluate("() => Bowtie.Migrations.canMigrate(10)") is False, "the step from current is missing"
    assert page.evaluate(
        "() => Bowtie.Migrations.canMigrate(Bowtie.BowtieModel.SCHEMA_VERSION - 1)"
    ) is True


def test_a_step_that_does_not_advance_is_refused_rather_than_looped_on(page):
    """`to <= from` in a malformed entry would otherwise spin the chain
    walk forever, hanging the tab instead of declining the file."""
    page.evaluate("""() => {
      const current = Bowtie.BowtieModel.SCHEMA_VERSION;
      Bowtie.BowtieModel.SCHEMA_VERSION = current + 1;
      Bowtie.Migrations.MIGRATIONS.push({
        from: current, to: current, describe: 'Goes nowhere', migrate: (d) => d,
      });
    }""")
    assert page.evaluate(
        "() => Bowtie.Migrations.canMigrate(Bowtie.BowtieModel.SCHEMA_VERSION - 1)"
    ) is False
    assert _load(page, V10) is False
    assert _modal_title(page) == "Unsupported File Version"


def test_a_migration_that_throws_refuses_the_file_rather_than_half_loading_it(page):
    """A broken migration is a bug in that migration -- but it must not
    land as an uncaught error over a partly-loaded document."""
    page.evaluate("""() => {
      const current = Bowtie.BowtieModel.SCHEMA_VERSION;
      Bowtie.BowtieModel.SCHEMA_VERSION = current + 1;
      Bowtie.Migrations.MIGRATIONS.push({
        from: current, to: current + 1, describe: 'Throws',
        migrate: () => { throw new Error('bad step'); },
      });
    }""")
    before = page.evaluate("() => window.__lastModel.threats.length")
    assert _load(page, V10) is False
    page.wait_for_timeout(120)
    assert _modal_title(page) == "Upgrade Failed"
    assert "bad step" in page.locator(".modal-body").text_content()
    assert page.evaluate("() => window.__lastModel.threats.length") == before, "the model is untouched"


def test_the_fixtures_are_frozen_at_their_own_versions(page):
    """Guards the copy itself: a fixture quietly regenerated from a later
    build would make its migration test meaningless."""
    assert V10["version"] == 10
    assert "causes" in V10 and "outcomes" in V10
    assert [n["id"] for n in V10["library"]["cause"]] == ["C_1", "C_2", "C_3", "C_4", "C_5"]
    assert V11["version"] == 11
    assert "threats" in V11 and "escalationFactors" not in V11
