"""Document identity: author, revision, date, approval (proposals/20).

`README.md` and `DESIGN_NOTES.md` both describe an exported bowtie as
something that may be an audit artifact, and several decisions in the
codebase are justified by exactly that framing. The document itself
carried no identity at all: no author, no revision, no date, no
approver. Two exports of the same analysis a month apart were
indistinguishable except by a file timestamp, which does not survive
being emailed.

The governing principle these tests exist to hold: **the tool records
what the user states, it does not enforce a process.** Nothing here
should ever grow a required field, a sign-off order, or an
export-blocking rule -- see test_nothing_is_required_of_the_user below.
"""
import json

from playwright.sync_api import expect

from helpers import eventually_equals

EMPTY = {
    "reference": "", "revision": "", "status": "", "date": "",
    "author": "", "checkedBy": "", "approvedBy": "",
    "organisation": "", "notes": "", "history": [],
}


def _doc(page):
    return page.evaluate("() => window.__lastModel.document")


def _set(page, patch):
    page.evaluate("(p) => window.__lastUndo.model.setDocumentMetadata(p)", patch)


# --- Model ----------------------------------------------------------------

def test_a_new_document_states_nothing(page):
    assert _doc(page) == EMPTY


def test_setting_one_field_leaves_the_others_alone(page):
    """The Document tab commits one text field on blur; it must not
    clobber the other eight."""
    _set(page, {"author": "A. Fenwick"})
    _set(page, {"revision": "B"})
    doc = _doc(page)
    assert doc["author"] == "A. Fenwick"
    assert doc["revision"] == "B"
    assert doc["approvedBy"] == ""


def test_a_revision_is_free_text_not_a_parsed_scheme(page):
    """Organisations use A/B/C, 1.0, 'Issue 3 Rev 2' and dated
    revisions. A parser would be wrong for someone on day one
    (proposals/20, open question 1)."""
    for value in ["A", "2.1", "Issue 3 Rev 2", "2026-05-20", "第3版"]:
        _set(page, {"revision": value})
        assert _doc(page)["revision"] == value


def test_unknown_keys_are_not_absorbed(page):
    """The block is a fixed set of statements, not a bag."""
    _set(page, {"author": "A. Fenwick", "favouriteColour": "green"})
    assert "favouriteColour" not in _doc(page)


def test_adding_a_revision_keeps_the_previous_state(page):
    """Bumping a revision should leave a trail, which is most of the
    point of recording one."""
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addDocumentRevision({revision: 'A', date: '2026-03-12', author: 'AF', summary: 'First draft'});
      m.addDocumentRevision({revision: 'B', date: '2026-04-02', author: 'AF', summary: 'For review'});
    }""")
    history = _doc(page)["history"]
    assert [e["revision"] for e in history] == ["A", "B"], "newest last"
    assert history[0]["summary"] == "First draft"


def test_a_revision_can_be_removed_and_a_bad_index_is_a_no_op(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addDocumentRevision({revision: 'A'});
      m.addDocumentRevision({revision: 'B'});
      m.removeDocumentRevision(0);
      m.removeDocumentRevision(99);
      m.removeDocumentRevision(-1);
    }""")
    assert [e["revision"] for e in _doc(page)["history"]] == ["B"]


def test_it_is_one_undo_step(page):
    """Document-wide by definition -- an approval is of the analysis, not
    of one page of it."""
    _set(page, {"author": "A. Fenwick"})
    page.evaluate("() => window.__lastUndo.undo()")
    assert _doc(page)["author"] == ""
    page.evaluate("() => window.__lastUndo.redo()")
    assert _doc(page)["author"] == "A. Fenwick"


# --- Round-trip -----------------------------------------------------------

def test_it_survives_an_export_import_round_trip(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setDocumentMetadata({
        reference: 'HAZOP-2026-014', revision: 'C', status: 'Issued',
        date: '2026-05-20', author: 'A. Fenwick', checkedBy: 'R. Oduya',
        approvedBy: 'M. Halvorsen', organisation: 'Northfield Terminal',
        notes: 'Scope: the export line only.',
      });
      m.addDocumentRevision({revision: 'C', date: '2026-05-20', author: 'AF', summary: 'Issued'});
    }""")
    before = _doc(page)

    reloaded = page.evaluate("""() => {
      const doc = window.__lastModel.toJSON();
      window.__lastImportExport.loadDocument(JSON.parse(JSON.stringify(doc)));
      return window.__lastModel.document;
    }""")
    assert reloaded == before


def test_the_serialized_document_is_not_aliased_to_the_live_model(page):
    """toJSON's copy must be independent, like idCounters and retiredIds."""
    page.evaluate("() => window.__lastUndo.model.addDocumentRevision({revision: 'A'})")
    mutated = page.evaluate("""() => {
      const out = window.__lastModel.toJSON();
      out.document.revision = 'TAMPERED';
      out.document.history[0].revision = 'TAMPERED';
      return window.__lastModel.document;
    }""")
    assert mutated["revision"] == ""
    assert mutated["history"][0]["revision"] == "A"


def test_a_document_without_the_block_reads_as_nothing_stated(page):
    """A v12 file arrives migrated, but a hand-built one -- or a
    half-written one -- must not throw."""
    for bad in [None, "not an object", 42, {"history": "not a list"}]:
        loaded = page.evaluate("""(bad) => {
          const doc = window.__lastModel.toJSON();
          doc.document = bad;
          return window.__lastImportExport.loadDocument(doc);
        }""", bad)
        assert loaded is True, f"{bad!r} should load, not be rejected"
        assert _doc(page) == EMPTY


def test_a_non_string_field_falls_back_rather_than_landing_as_is(page):
    page.evaluate("""() => {
      const doc = window.__lastModel.toJSON();
      doc.document = {revision: 12, author: null, notes: ['a', 'b'], history: [{revision: 7}]};
      window.__lastImportExport.loadDocument(doc);
    }""")
    doc = _doc(page)
    assert doc["revision"] == "" and doc["author"] == "" and doc["notes"] == ""
    assert doc["history"] == [{"revision": "", "date": "", "author": "", "summary": ""}]


# --- The principle --------------------------------------------------------

def test_nothing_is_required_of_the_user(page):
    """A working sketch is a legitimate use of this tool. A missing
    revision is a process question, not a defect in the diagram -- so it
    produces no warning and blocks no export (proposals/20, open
    question 4)."""
    page.evaluate("() => window.__lastUndo.model.addThreat({x: 150, y: 200, name: 'Corrosion'})")
    warnings = page.evaluate("() => window.__lastModel.getWarnings().map((w) => w.message)")
    assert not any("revision" in w.lower() or "author" in w.lower() for w in warnings)
    expect(page.locator("#btn-export-json")).to_be_enabled()
