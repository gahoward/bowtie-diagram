"""The status strip at the end of the bottom bar (proposals/07): which
mode the document is in, which risk matrix is active (with its class
letters), the unit computed figures are shown in, and how the top event
combines its threats -- all of which used to be invisible until the user
opened Settings. Every segment opens the setting it names.
"""


def _strip(page):
    return page.locator(".status-strip").text_content()


def _segment(page, text):
    return page.locator(".status-segment", has_text=text)


def _go_quantitative(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
    }""")
    page.wait_for_timeout(100)


def test_simple_mode_shows_only_the_mode(page):
    assert _strip(page) == "Simple"
    assert page.locator(".status-chips").count() == 0


def test_mode_matrix_chips_unit_and_aggregation_appear_in_quantitative_mode(page):
    _go_quantitative(page)
    text = _strip(page)
    assert "Quantitative" in text
    assert "Leaflet 5 (Ships) Annex D" in text
    assert "per hour" in text
    assert "max" in text
    assert page.locator(".status-chips .risk-class-legend-swatch").all_text_contents() == ["A", "B", "C", "D"]


def test_qualitative_mode_shows_the_matrix_but_no_unit_or_aggregation(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
    }""")
    page.wait_for_timeout(100)
    text = _strip(page)
    assert "Qualitative" in text and "Leaflet 5" in text
    assert "per hour" not in text and "max" not in text, "neither means anything without computed figures"


def test_a_missing_matrix_says_so(page):
    page.evaluate("() => { window.__lastModel.setMode('qualitative'); }")
    page.wait_for_timeout(100)
    assert "No risk matrix" in _strip(page)


def test_the_strip_follows_the_model_and_the_display_unit(page):
    _go_quantitative(page)
    assert "max" in _strip(page) and "per hour" in _strip(page)

    page.evaluate("() => { window.__lastModel.setTleAggregation('sum'); }")
    page.wait_for_timeout(80)
    assert "sum" in _strip(page)

    page.click("#menu-trigger-settings")
    page.click("#btn-preferences")
    page.locator("input[name=display-unit][value=year]").check()
    page.wait_for_timeout(80)
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(80)
    assert "per year" in _strip(page)


def test_segments_open_the_setting_they_name(page):
    _go_quantitative(page)

    _segment(page, "Leaflet 5").click()
    page.wait_for_timeout(100)
    assert page.locator(".modal-title").text_content() == "Project Settings"
    assert page.locator(".settings-tab[aria-selected=true]").text_content() == "Risk analysis"
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(80)

    _segment(page, "max").click()
    page.wait_for_timeout(100)
    assert page.locator(".settings-tab[aria-selected=true]").text_content() == "Quantitative"
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(80)

    _segment(page, "per hour").click()
    page.wait_for_timeout(100)
    assert page.locator(".modal-title").text_content() == "Preferences"
    page.get_by_role("button", name="Done", exact=True).click()


def test_the_strip_sits_beside_the_page_tabs_not_inside_them(page):
    """PageTabsView replaces its container's children wholesale on every
    render, so the strip has to live in its own element in the shared
    bottom bar -- otherwise adding a page would wipe it."""
    page.evaluate("() => { window.__lastModel.addPage({ name: 'Second' }); }")
    page.wait_for_timeout(100)
    assert page.locator(".status-strip").count() == 1
    assert page.locator("#bottom-bar > #page-tabs").count() == 1
    assert page.locator("#bottom-bar > #status-strip-container .status-strip").count() == 1
