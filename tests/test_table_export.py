"""Unit tests for js/view/TableExport.js -- the CSV/TSV serialiser the
Risk Summary's "Export CSV…" and "Copy as table" go through (and, later,
the barrier register). RFC 4180 quoting is the whole point: an outcome
named `Fire, "major"` must survive a round trip into a spreadsheet.
"""


def _csv(page, table):
    return page.evaluate("(t) => Bowtie.TableExport.toCsv(t)", table)


def _tsv(page, table):
    return page.evaluate("(t) => Bowtie.TableExport.toTsv(t)", table)


def test_plain_rows_need_no_quoting(page):
    table = {"columns": ["id", "name"], "rows": [["O_1", "Pool Fire"], ["O_2", "Flash Fire"]]}
    assert _csv(page, table) == "id,name\r\nO_1,Pool Fire\r\nO_2,Flash Fire"


def test_fields_containing_the_delimiter_are_quoted(page):
    table = {"columns": ["name"], "rows": [["Fire, smoke"]]}
    assert _csv(page, table) == 'name\r\n"Fire, smoke"'
    # ...but a comma needs no quoting in TSV.
    assert _tsv(page, table) == "name\r\nFire, smoke"


def test_embedded_quotes_are_doubled(page):
    table = {"columns": ["name"], "rows": [['A "major" release']]}
    assert _csv(page, table) == 'name\r\n"A ""major"" release"'


def test_embedded_newlines_are_quoted_not_split(page):
    table = {"columns": ["name"], "rows": [["Line one\nLine two"]]}
    assert _csv(page, table) == 'name\r\n"Line one\nLine two"'


def test_tabs_are_quoted_in_tsv(page):
    table = {"columns": ["name"], "rows": [["A\tB"]]}
    assert _tsv(page, table) == 'name\r\n"A\tB"'


def test_null_and_missing_cells_become_empty_fields(page):
    table = {"columns": ["a", "b", "c"], "rows": [[None, "", 0]]}
    assert _csv(page, table) == "a,b,c\r\n,,0"


def test_no_rows_still_writes_the_header(page):
    assert _csv(page, {"columns": ["a", "b"], "rows": []}) == "a,b"
