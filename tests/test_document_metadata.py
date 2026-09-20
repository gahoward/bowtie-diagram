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


# --- The Document tab -----------------------------------------------------

def _open_document_tab(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    page.click(".settings-tab[data-tab='document']")
    page.wait_for_selector(".settings-panel[data-tab='document']")


def test_the_tab_shows_every_field_and_none_is_required(page):
    _open_document_tab(page)
    for name in ["reference", "revision", "status", "author",
                 "checkedBy", "approvedBy", "organisation", "date", "notes"]:
        expect(page.locator(f"[name='document-{name}']")).to_have_count(1)
    # "Records, does not enforce" has to be visible, not just true.
    assert "does not verify" in page.locator(".settings-note").text_content()
    assert page.locator("[required]").count() == 0


def test_typing_a_field_reaches_the_model(page):
    _open_document_tab(page)
    field = page.locator("[name='document-approvedBy']")
    field.fill("M. Halvorsen (Technical Authority)")
    field.blur()
    eventually_equals(lambda: _doc(page)["approvedBy"], "M. Halvorsen (Technical Authority)")


def test_committing_a_field_does_not_steal_focus(page):
    """Structural review finding 09: a same-tick body rebuild replaces
    the element focus has just moved to, dropping it to <body>."""
    _open_document_tab(page)
    page.locator("[name='document-reference']").fill("HAZOP-2026-014")
    page.locator("[name='document-revision']").focus()
    eventually_equals(lambda: _doc(page)["reference"], "HAZOP-2026-014")
    assert page.evaluate("() => document.activeElement.name") == "document-revision"


def test_today_fills_the_date_but_only_when_asked(page):
    """A date the tool invented is a statement the user did not make
    (proposals/20, open question 3)."""
    _open_document_tab(page)
    assert _doc(page)["date"] == "", "nothing is filled in for you"
    page.get_by_role("button", name="Today", exact=True).click()
    today = page.evaluate("""() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }""")
    eventually_equals(lambda: _doc(page)["date"], today)


def test_add_revision_snapshots_the_current_fields(page):
    _open_document_tab(page)
    page.locator("[name='document-revision']").fill("B")
    page.locator("[name='document-author']").fill("A. Fenwick")
    page.locator("[name='document-author']").blur()
    eventually_equals(lambda: _doc(page)["author"], "A. Fenwick")

    page.locator("[name='document-revision-summary']").fill("Sent for operations review")
    page.get_by_role("button", name="Add revision", exact=True).click()

    eventually_equals(lambda: len(_doc(page)["history"]), 1)
    entry = _doc(page)["history"][0]
    assert entry["revision"] == "B"
    assert entry["author"] == "A. Fenwick"
    assert entry["summary"] == "Sent for operations review"


def test_the_history_is_listed_and_a_row_can_be_removed(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.addDocumentRevision({revision: 'A', date: '2026-03-12', author: 'AF', summary: 'First draft'});
      m.addDocumentRevision({revision: 'B', date: '2026-04-02', author: 'AF', summary: 'For review'});
    }""")
    _open_document_tab(page)
    expect(page.locator(".document-history-row")).to_have_count(2)
    assert "First draft" in page.locator(".document-history-row").first.text_content()

    page.get_by_role("button", name="Remove revision A").click()
    expect(page.locator(".document-history-row")).to_have_count(1)
    assert [e["revision"] for e in _doc(page)["history"]] == ["B"]


def test_an_empty_history_says_so_rather_than_showing_a_bare_table(page):
    _open_document_tab(page)
    assert "No revisions recorded yet" in page.locator(".document-history").text_content()
    expect(page.locator(".document-history-table")).to_have_count(0)


# --- The printed cover sheet ----------------------------------------------
#
# The highest-value consumer of the whole block (proposals/20), and most
# of the reason to have built it: a printed analysis that cannot say who
# produced it, when, at what revision and who accepted it is not an audit
# artifact.

def _print(page):
    page.evaluate("() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }")
    page.click("#menu-trigger-file")
    page.click("#btn-print")
    # `state="attached"`: #print-root is display:none except @media
    # print, so waiting for it to be VISIBLE never resolves.
    page.wait_for_selector("#print-root", state="attached")
    eventually_equals(lambda: page.evaluate("() => window.__printed"), 1)


def _fill_document(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setDocumentMetadata({
        reference: 'HAZOP-2026-014', revision: 'C', status: 'Issued',
        date: '2026-05-20', author: 'A. Fenwick', checkedBy: 'R. Oduya',
        approvedBy: 'M. Halvorsen', organisation: 'Northfield Terminal',
        notes: 'Scope: the export line only.',
      });
      m.addDocumentRevision({revision: 'B', date: '2026-04-02', author: 'AF', summary: 'For review'});
      m.addDocumentRevision({revision: 'C', date: '2026-05-20', author: 'AF', summary: 'Issued'});
    }""")


def test_a_filled_document_gets_a_cover_sheet(page):
    _fill_document(page)
    _print(page)
    cover = page.locator("#print-root .print-cover")
    expect(cover).to_have_count(1)
    assert cover.locator(".print-cover-title").text_content() == "Untitled Bowtie"

    text = cover.text_content()
    for value in ["HAZOP-2026-014", "Issued", "2026-05-20", "A. Fenwick",
                  "R. Oduya", "M. Halvorsen", "Northfield Terminal",
                  "Scope: the export line only."]:
        assert value in text, f"{value!r} missing from the cover sheet"
    # Newest last, as the model stores it.
    rows = cover.locator(".print-cover-history tbody tr").all_text_contents()
    assert len(rows) == 2 and "For review" in rows[0] and "Issued" in rows[1]


def test_a_blank_document_gets_no_cover_sheet_at_all(page):
    """A page of empty labels would suggest the analysis is incomplete.
    A working sketch is a legitimate use of this tool."""
    _print(page)
    expect(page.locator("#print-root .print-cover")).to_have_count(0)
    # Just the one diagram sheet -- no cover, and no summary in simple mode.
    expect(page.locator("#print-root .print-page")).to_have_count(1)


def test_only_stated_fields_appear(page):
    """Recorded as stated -- a blank field is omitted, not printed as an
    empty row."""
    page.evaluate("""() => window.__lastUndo.model.setDocumentMetadata({
      reference: 'HAZOP-2026-014', author: 'A. Fenwick',
    })""")
    _print(page)
    cover = page.locator("#print-root .print-cover")
    labels = cover.locator(".print-cover-fields dt").all_text_contents()
    assert labels == ["Reference", "Prepared by"]
    assert cover.locator(".print-cover-notes").count() == 0
    assert cover.locator(".print-cover-history").count() == 0


def test_every_diagram_sheet_carries_its_provenance(page):
    """A loose sheet on a desk should say what it came from -- without
    this, page 3 is anonymous the moment it leaves the stapler."""
    _fill_document(page)
    page.evaluate("() => window.__lastUndo.model.addPage({name: 'Subsea'})")
    _print(page)

    footers = page.locator("#print-root .print-page-footer").all_text_contents()
    assert len(footers) == 2, "one per diagram sheet, not on the cover"
    assert all("HAZOP-2026-014 · C · 2026-05-20" in f for f in footers)
    assert any("Subsea" in f for f in footers)


def test_a_blank_document_prints_no_footer(page):
    _print(page)
    expect(page.locator("#print-root .print-page-footer")).to_have_count(0)


# --- The optional CSV header ----------------------------------------------

def _open_risk_summary_with_rows(page):
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addConsequence({x: 1200, y: 200, name: 'Fire'});
      m.renameNode(c.nodeId, {severityClassId: 'major'});
      window.__csv = null;
      Bowtie.ExportUtil.exportCsv = (text) => { window.__csv = text; };
    }""")
    page.click("#menu-trigger-view")
    page.click("#btn-risk-summary")
    page.wait_for_selector(".modal-dialog-xwide")


def test_the_csv_header_is_off_by_default(page):
    """A spreadsheet import wants a clean header row; eight label/value
    rows above it break the naive read_csv most people reach for."""
    _fill_document(page)
    _open_risk_summary_with_rows(page)
    expect(page.locator("[name='include-document-header']")).not_to_be_checked()

    page.get_by_role("button", name="Export CSV…", exact=True).click()
    csv = page.evaluate("() => window.__csv")
    assert csv.split("\r\n")[0].startswith("page,"), "the first line is the column header"
    assert "HAZOP-2026-014" not in csv


def test_ticking_it_puts_the_document_above_the_table(page):
    _fill_document(page)
    _open_risk_summary_with_rows(page)
    page.locator("[name='include-document-header']").check()
    page.get_by_role("button", name="Export CSV…", exact=True).click()

    lines = page.evaluate("() => window.__csv").split("\r\n")
    assert lines[0] == "Reference,HAZOP-2026-014"
    assert "Approved by,M. Halvorsen" in lines
    blank = lines.index("")
    assert lines[blank + 1].startswith("page,"), "a blank row separates preamble from data"


def test_an_empty_document_adds_no_header_even_when_ticked(page):
    """Only what is stated -- a tick with nothing to say adds nothing,
    rather than eight empty rows."""
    _open_risk_summary_with_rows(page)
    page.locator("[name='include-document-header']").check()
    page.get_by_role("button", name="Export CSV…", exact=True).click()
    assert page.evaluate("() => window.__csv").split("\r\n")[0].startswith("page,")


def test_the_barrier_register_offers_the_same_option(page):
    """One modal shell, so the two tables cannot drift (proposals/15)."""
    _fill_document(page)
    page.evaluate("""() => {
      const m = window.__lastUndo.model;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const t = m.addThreat({x: 150, y: 200, name: 'Overpressure'});
      m.addPreventativeControl(t.id, {name: 'Relief valve'});
      window.__csv = null;
      Bowtie.ExportUtil.exportCsv = (text) => { window.__csv = text; };
    }""")
    page.click("#menu-trigger-view")
    page.click("#btn-barrier-register")
    page.wait_for_selector(".modal-dialog-xwide")

    page.locator("[name='include-document-header']").check()
    page.get_by_role("button", name="Export CSV…", exact=True).click()
    assert page.evaluate("() => window.__csv").startswith("Reference,HAZOP-2026-014")
