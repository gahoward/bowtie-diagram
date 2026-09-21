"""Golden-master test for the bundled MIL-STD-882E preset
(js/data/risk-matrices/mil-std-882e.json, proposals/10), mirroring
test_risk_matrix.py's Leaflet 5 coverage, plus the "lifetime" authoring
unit it is the first matrix to use.

882E states its probability levels per ITEM LIFE ("likely to occur often
in the life of an item, probability > 10^-1"), not per unit time, so the
preset declares the item life it assumes (`authoringExposureHours`) and
the build converts through it. That assumption is the matrix's own, and
editable: a programme working to a different item life changes one field
and re-imports.
"""

# Transcribed from MIL-STD-882E Table III (row = probability level,
# column = severity category) -- the eyeball-verifiable source of truth
# this test checks the built preset against. The standard's sixth level,
# Eliminated (F), is a state rather than a band and is not a row here.
TABLE_III = {
    'frequent': {'catastrophic': 'high', 'critical': 'high', 'marginal': 'serious', 'negligible': 'medium'},
    'probable': {'catastrophic': 'high', 'critical': 'high', 'marginal': 'serious', 'negligible': 'medium'},
    'occasional': {'catastrophic': 'high', 'critical': 'serious', 'marginal': 'medium', 'negligible': 'low'},
    'remote': {'catastrophic': 'serious', 'critical': 'medium', 'marginal': 'medium', 'negligible': 'low'},
    'improbable': {'catastrophic': 'medium', 'critical': 'medium', 'marginal': 'medium', 'negligible': 'low'},
}

# Table II's per-item-life probability bounds: the FLOOR of each band,
# which is what a human transcribing the standard would type.
TABLE_II_PER_LIFE_MIN_VALUES = {
    'frequent': '0.1',
    'probable': '0.01',
    'occasional': '0.001',
    'remote': '0.000001',
    'improbable': '0',
}

EXPOSURE_HOURS = 100000


def _preset(page, expr):
    return page.evaluate(f"() => {{ const m = Bowtie.RISK_MATRIX_PRESETS.milstd882e; return {expr}; }}")


def test_the_preset_is_registered_alongside_leaflet5(page):
    ids = page.evaluate("() => Object.keys(Bowtie.RISK_MATRIX_PRESETS)")
    assert 'milstd882e' in ids and 'leaflet5' in ids


def test_all_20_cells_match_table_iii(page):
    cells = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.milstd882e;
      const out = [];
      for (const lc of m.likelihoodClasses) {
        for (const sc of m.severityClasses) {
          out.push({ likelihood: lc.id, severity: sc.id, cell: m.cells[lc.ordinal][sc.ordinal] });
        }
      }
      return out;
    }""")
    assert len(cells) == 20
    for row in cells:
        expected = TABLE_III[row["likelihood"]][row["severity"]]
        assert row["cell"] == expected, (
            f"{row['likelihood']}/{row['severity']}: expected {expected}, got {row['cell']}"
        )


def test_per_life_probabilities_are_converted_through_the_declared_item_life(page):
    assert _preset(page, "m.authoringUnit") == "lifetime"
    assert _preset(page, "m.authoringExposureHours") == EXPOSURE_HOURS
    min_values = _preset(page, "Object.fromEntries(m.likelihoodClasses.map((c) => [c.id, c.minValue]))")
    for class_id, per_life in TABLE_II_PER_LIFE_MIN_VALUES.items():
        expected = float(per_life) / EXPOSURE_HOURS
        actual = float(min_values[class_id])
        if expected == 0:
            assert actual == 0
        else:
            assert abs(actual - expected) / expected < 1e-9, class_id


def test_exporting_the_matrix_gives_the_per_life_figures_back(page):
    """Export → hand-edit → reimport has to round-trip, or a matrix would
    be converted a second time and every band boundary would shift."""
    authored = page.evaluate("""() => Bowtie.denormalizeRiskMatrixForExport(
      Bowtie.RISK_MATRIX_PRESETS.milstd882e,
    ).likelihoodClasses.map((c) => c.minValue)""")
    assert authored == list(TABLE_II_PER_LIFE_MIN_VALUES.values())


def test_eliminated_is_not_a_band(page):
    """Eliminated (F) means the hazard has been removed -- there is no
    boundary to band a computed figure against, so it is described in
    Improbable's text rather than listed as a class no value can reach."""
    ids = _preset(page, "m.likelihoodClasses.map((c) => c.id)")
    assert "eliminated" not in ids
    assert len(ids) == 5
    improbable = _preset(page, "m.likelihoodClasses.find((c) => c.id === 'improbable').description")
    assert "Eliminated (F)" in improbable


def test_the_axes_are_well_formed_like_every_other_preset(page):
    result = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.milstd882e;
      return {
        severity: m.severityClasses.map((c) => c.ordinal).sort((a, b) => a - b),
        likelihood: m.likelihoodClasses.map((c) => c.ordinal).sort((a, b) => a - b),
        listedOrder: m.likelihoodClasses.map((c) => c.ordinal),
        ranks: m.riskClasses.map((r) => r.rank),
      };
    }""")
    assert result["severity"] == list(range(4))
    assert result["likelihood"] == list(range(5))
    assert result["listedOrder"] == sorted(result["listedOrder"], reverse=True), "most frequent first"
    assert result["ranks"] == [0, 1, 2, 3], "worst first (proposals/05)"


def test_banding_a_computed_figure_uses_the_converted_bands(page):
    """A figure just above the Frequent floor (10^-1 per 100,000 h) bands
    as Frequent; one just below falls to Probable."""
    banded = page.evaluate("""() => {
      const m = Bowtie.RISK_MATRIX_PRESETS.milstd882e;
      const at = (v) => {
        const c = Bowtie.RiskMatrix.bandForValue(m, Bowtie.Decimal.parse(v));
        return c ? c.id : null;
      };
      return { above: at('2E-6'), just: at('1E-6'), below: at('9E-7'), tiny: at('1E-20') };
    }""")
    assert banded["above"] == "frequent"
    assert banded["just"] == "frequent"
    assert banded["below"] == "probable"
    assert banded["tiny"] == "improbable"


# --- reachable from the UI without either screen knowing about it ---------

def test_the_wizard_offers_it_and_creates_a_document_using_it(browser, base_url):
    """Both pickers enumerate RISK_MATRIX_PRESETS, so adding a preset is
    a data change -- this proves that claim rather than assuming it."""
    from conftest import INIT_SCRIPT

    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    try:
        pg.get_by_role("button", name="Start a new bowtie", exact=True).click()
        pg.locator(".modal-field:has-text('Analysis title') input").fill("882E study")
        pg.locator(".modal-field:has-text('Top-level event') input").fill("Loss of control")
        pg.locator(".modal-field:has-text('Hazard') input").fill("Stored energy")
        pg.get_by_role("button", name="Next", exact=True).click()

        pg.locator(".mode-card[data-mode=quantitative]").click()
        select = pg.locator(".welcome-matrix-field select")
        assert "MIL-STD-882E" in select.text_content()
        select.select_option("milstd882e")
        pg.wait_for_timeout(80)
        summary = pg.locator(".welcome-matrix-field .welcome-field-help").text_content()
        assert "4 severity × 5 likelihood classes" in summary
        assert "high serious medium low" in summary

        pg.get_by_role("button", name="Create", exact=True).click()
        pg.wait_for_timeout(200)
        assert pg.evaluate("() => window.__lastModel.riskMatrix.id") == "milstd882e"
        assert pg.evaluate("() => window.__lastModel.riskMatrix.authoringExposureHours") == EXPOSURE_HOURS
    finally:
        assert pg.errors == []
        pg.close()


def test_the_status_strip_names_it_with_its_class_chips(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.milstd882e)));
    }""")
    page.wait_for_timeout(120)
    strip = page.locator(".status-strip").text_content()
    assert "MIL-STD-882E" in strip
    assert page.locator(".status-chips .risk-class-legend-swatch").all_text_contents() == [
        "high", "serious", "medium", "low",
    ]
