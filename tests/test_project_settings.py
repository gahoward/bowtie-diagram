"""UI-level coverage for ProjectSettingsController (js/controller/
ProjectSettingsController.js) -- Settings › Project Settings…, the one
modal for everything SAVED WITH THE DOCUMENT (ui_fitness_proposal.md S2):
three tabs -- General (name, identifier display), Risk analysis (mode
cards, matrix picker + summary/legend + import/export) and, only in
Quantitative mode, Quantitative (TLE aggregation, dangerous-fraction and
proof-test-interval defaults). Per-browser preferences (display unit and
friends) live in Preferences instead -- see test_preferences.py.
"""


from playwright.sync_api import expect
from helpers import eventually_contains, eventually_equals

def _open_project_settings(page, tab=None):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    page.wait_for_timeout(100)
    if tab:
        _go_to_tab(page, tab)


def _go_to_tab(page, tab):
    page.click(f".settings-tab[data-tab={tab}]")
    page.wait_for_timeout(80)


def _tabs(page):
    return page.locator(".settings-tab").all_text_contents()


def _set_mode(page, mode):
    """Picks a mode card on the Risk analysis tab (wherever the modal is)."""
    _go_to_tab(page, "risk")
    page.locator(f"input[name=analysis-mode][value={mode}]").check()
    page.wait_for_timeout(80)


def _done(page):
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(80)


def test_settings_menu_holds_only_project_settings_and_preferences(page):
    page.click("#menu-trigger-settings")
    texts = page.locator("#menu-dropdown-settings .menu-dropdown-item").all_text_contents()
    assert [t.rstrip("…") for t in texts] == ["Project Settings", "Preferences"]


def test_project_settings_has_general_and_risk_tabs_and_a_conditional_quantitative_tab(page):
    _open_project_settings(page)
    assert page.locator(".modal-subtitle").text_content() == "Saved with the document. Changes apply immediately."
    assert _tabs(page) == ["General", "Risk analysis"]
    assert page.locator(".settings-tab[aria-selected=true]").text_content() == "General"

    _set_mode(page, "quantitative")
    assert _tabs(page) == ["General", "Risk analysis", "Quantitative"]
    assert page.locator(".settings-tab[aria-selected=true]").text_content() == "Risk analysis", "the active tab survives the rebuild"

    _go_to_tab(page, "quantitative")
    page.locator("input[name=analysis-mode]").count() == 0
    _set_mode(page, "qualitative")
    assert _tabs(page) == ["General", "Risk analysis"]
    _done(page)


def test_project_settings_renames_the_document(page):
    _open_project_settings(page)
    name_input = page.locator("input[name=analysis-name]")
    name_input.fill("My Renamed Analysis")
    name_input.blur()

    eventually_equals(lambda: page.evaluate("() => window.__lastModel.name"), "My Renamed Analysis")


def test_committing_a_rename_does_not_drop_focus_to_body(page):
    """Structural review finding 09: the Name field's 'change' event fires
    on blur, after focus has already moved to whatever's next in tab order
    -- a same-tick modal body rebuild used to replace that element too,
    dropping focus to <body> with no way back for a keyboard user."""
    _open_project_settings(page)
    name_input = page.locator("input[name=analysis-name]")
    name_input.fill("Tabbed Away")
    name_input.press("Tab")

    eventually_equals(lambda: page.evaluate("() => window.__lastModel.name"), "Tabbed Away")
    assert page.evaluate("() => document.activeElement.tagName") != "BODY"


def test_a_blank_name_is_rejected_and_reverted(page):
    _open_project_settings(page)
    name_input = page.locator("input[name=analysis-name]")
    name_input.fill("   ")
    name_input.blur()
    eventually_equals(lambda: page.evaluate("() => window.__lastModel.name"), "Untitled Bowtie")
    assert name_input.input_value() == "Untitled Bowtie"


def test_project_settings_identifier_display_mode_lives_on_the_general_tab_only(page):
    _open_project_settings(page)
    assert page.locator("input[name=identifier-display-mode-toggle]").count() == 2
    _done(page)

    page.click("#menu-trigger-add")
    page.click("#btn-manage-ids")
    expect(page.locator("input[name=identifier-display-mode-toggle]")).to_have_count(0)
    assert page.locator(".modal-title").text_content() == "Node Library"


def test_project_settings_switching_identifier_mode_to_custom_backfills_ids(page):
    page.evaluate("() => { window.__lastModel.addThreat({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_project_settings(page)
    page.locator("input[name=identifier-display-mode-toggle][value=custom]").check()
    eventually_contains(lambda: page.locator(".settings-row:has-text('Identifiers') .settings-row-help").text_content(), "Node Library")
    _done(page)

    identifier = page.evaluate("""() => {
      const c = window.__lastModel.threats[0];
      return window.__lastModel.getNode(c.nodeId).identifier;
    }""")
    assert identifier == "T_1"


def test_risk_tab_uses_the_wizards_mode_cards_and_hides_the_matrix_in_simple_mode(page):
    _open_project_settings(page, tab="risk")
    cards = page.locator(".mode-card")
    assert cards.count() == 3
    assert "selected" in cards.nth(0).get_attribute("class")
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 0
    assert page.locator(".modal-field:has-text('Display frequencies')").count() == 0, "display unit is a Preference now"

    page.locator("input[name=analysis-mode][value=qualitative]").check()
    expect(page.locator(".modal-field:has-text('Risk matrix')")).to_have_count(1)
    assert "selected" in page.locator(".mode-card[data-mode=qualitative]").get_attribute("class")
    assert page.evaluate("() => window.__lastModel.mode") == "qualitative"

    page.locator("input[name=analysis-mode][value=simple]").check()
    expect(page.locator(".modal-field:has-text('Risk matrix')")).to_have_count(0)
    _done(page)


def test_matrix_summary_and_legend_appear_once_a_matrix_is_active(page):
    """Design review finding 02: the canvas risk badge only ever draws a
    bare letter -- this legend is the persistent, always-visible reference
    for what each letter means, now on one line with the matrix's shape."""
    _open_project_settings(page)
    _set_mode(page, "qualitative")
    assert page.locator(".risk-class-legend").count() == 0, "no matrix selected yet"

    page.locator("select[name=risk-matrix]").select_option("leaflet5")
    page.wait_for_timeout(80)

    summary = page.locator(".risk-matrix-summary")
    assert summary.count() == 1
    assert "6 severity × 7 likelihood" in summary.text_content()
    items = summary.locator(".risk-class-legend-item").all_text_contents()
    assert len(items) == 4
    assert any("A - Intolerable" in t for t in items)
    assert any("D - Broadly Acceptable" in t for t in items)

    page.locator("select[name=risk-matrix]").select_option("")
    expect(page.locator(".risk-class-legend")).to_have_count(0)


def test_quantitative_tab_tle_aggregation_toggle_updates_model_and_canvas(page):
    """Design review finding 11: the aggregation toggle drives
    BowtieModel.setTleAggregation, and the canvas TLE badge names whichever
    policy is active (CanvasView.js)."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c1 = m.addThreat({x: 150, y: 200});
      m.renameNode(c1.nodeId, { name: 'C1', frequency: { value: '0.001' } });
      const c2 = m.addThreat({x: 150, y: 400});
      m.renameNode(c2.nodeId, { name: 'C2', frequency: { value: '0.01' } });
    }""")
    page.wait_for_timeout(100)

    def tle_info_text():
        return page.evaluate("""
          () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.node-info-text text'))
            .map((t) => t.textContent).join(' | ')
        """)

    assert "(max)" in tle_info_text()

    _open_project_settings(page, tab="quantitative")
    assert page.locator("input[name=tle-aggregation]").count() == 2
    page.locator("input[name=tle-aggregation][value=sum]").check()
    page.wait_for_timeout(80)
    _done(page)

    assert page.evaluate("() => window.__lastModel.tleAggregation") == "sum"
    assert "(sum)" in tle_info_text()


def test_quantitative_tab_defaults_update_the_model(page):
    """barrier_measures_proposal.md's ProjectDefaults: the dangerous-
    fraction and proof-test-interval fallbacks a barrier's own protection
    overrides -- committed via setQuantitativeDefaults, same
    change-on-blur / _suppressNextRefresh pattern as the Name field."""
    assert page.evaluate("() => window.__lastModel.dangerousFraction") == "1"
    assert page.evaluate("() => window.__lastModel.proofTestIntervalH") == "8760"

    _open_project_settings(page)
    _set_mode(page, "quantitative")
    _go_to_tab(page, "quantitative")

    df_input = page.locator(".modal-field:has-text('Dangerous fraction') input[type=text]")
    df_input.fill("0.5")
    df_input.blur()
    page.wait_for_timeout(80)

    ti_input = page.locator(".modal-field:has-text('Proof-test interval') input[type=text]")
    ti_input.fill("4380")
    ti_input.blur()
    page.wait_for_timeout(80)
    _done(page)

    assert page.evaluate("() => window.__lastModel.dangerousFraction") == "0.5"
    assert page.evaluate("() => window.__lastModel.proofTestIntervalH") == "4380"


def test_quantitative_tab_defaults_reject_out_of_range_values(page):
    _open_project_settings(page)
    _set_mode(page, "quantitative")
    _go_to_tab(page, "quantitative")

    df_input = page.locator(".modal-field:has-text('Dangerous fraction') input[type=text]")
    df_input.fill("1.5")
    df_input.blur()

    eventually_equals(lambda: page.evaluate("() => window.__lastModel.dangerousFraction"), "1", "out-of-range input must be rejected")
    assert df_input.input_value() == "1"


def test_project_settings_selecting_a_matrix_preset_embeds_a_full_copy(page):
    _open_project_settings(page)
    _set_mode(page, "quantitative")
    page.locator("select[name=risk-matrix]").select_option("leaflet5")
    page.wait_for_timeout(80)

    embedded_id = page.evaluate("() => window.__lastModel.riskMatrix && window.__lastModel.riskMatrix.id")
    assert embedded_id == "leaflet5"
    is_copy = page.evaluate("() => window.__lastModel.riskMatrix !== Bowtie.RISK_MATRIX_PRESETS.leaflet5")
    assert is_copy is True


# --- Risk matrix import/export ---------------------------------------------
#
# Mirrors test_file_handlers.py's own convention: mock the two File System
# Access API entry points to test the "native path" deterministically
# (a real OS picker can't be driven from an automated test), and delete the
# API to test the legacy `<input type=file>` fallback.

_CUSTOM_MATRIX = {
    "id": "custom-import-test",
    "name": "Custom Import Test",
    "authoringUnit": "hour",
    "severityClasses": [{"id": "minor", "ordinal": 0, "label": "Minor"}],
    "likelihoodClasses": [{"id": "common", "ordinal": 0, "label": "Common", "minValue": "0"}],
    "riskClasses": [{"id": "x", "label": "X", "colour": "#888"}],
    "cells": [["x"]],
}


def _open_in_quantitative_mode(page):
    _open_project_settings(page)
    _set_mode(page, "quantitative")


def test_export_risk_matrix_button_disabled_until_a_matrix_is_active(page):
    _open_in_quantitative_mode(page)
    assert page.get_by_role("button", name="Export Risk Matrix…", exact=True).is_disabled()

    page.locator("select[name=risk-matrix]").select_option("leaflet5")
    page.wait_for_timeout(80)
    assert page.get_by_role("button", name="Export Risk Matrix…", exact=True).is_enabled()


def test_import_risk_matrix_via_native_picker_sets_it_active(page):
    _open_in_quantitative_mode(page)

    page.evaluate(
        """(matrix) => {
          window.showOpenFilePicker = async () => [{
            getFile: async () => ({ text: async () => JSON.stringify(matrix) }),
          }];
        }""",
        _CUSTOM_MATRIX,
    )
    page.get_by_role("button", name="Import Risk Matrix…", exact=True).click()
    page.wait_for_timeout(150)

    active_id = page.evaluate("() => window.__lastModel.riskMatrix && window.__lastModel.riskMatrix.id")
    assert active_id == "custom-import-test"
    # The imported matrix shows as its own (informational) option.
    assert page.locator("select[name=risk-matrix]").input_value() == "custom-import-test"
    assert "(imported)" in page.locator("select[name=risk-matrix] option:checked").text_content()


def test_import_risk_matrix_falls_back_to_hidden_input_when_api_unavailable(page, tmp_path):
    _open_in_quantitative_mode(page)
    page.evaluate("() => { delete window.showOpenFilePicker; }")

    file_path = tmp_path / "matrix.json"
    file_path.write_text(__import__("json").dumps(_CUSTOM_MATRIX))

    with page.expect_file_chooser() as fc_info:
        page.get_by_role("button", name="Import Risk Matrix…", exact=True).click()
    fc_info.value.set_files(str(file_path))
    page.wait_for_timeout(150)

    active_id = page.evaluate("() => window.__lastModel.riskMatrix && window.__lastModel.riskMatrix.id")
    assert active_id == "custom-import-test"


def test_import_risk_matrix_rejects_an_invalid_file(page):
    _open_in_quantitative_mode(page)

    page.evaluate("""() => {
      window.showOpenFilePicker = async () => [{
        getFile: async () => ({ text: async () => '{"id": "bad"}' }),
      }];
    }""")
    page.get_by_role("button", name="Import Risk Matrix…", exact=True).click()

    expect(page.locator(".modal-title", has_text="Cannot Import Risk Matrix")).to_have_count(1)
    page.get_by_role("button", name="OK", exact=True).click()
    assert page.evaluate("() => window.__lastModel.riskMatrix") is None


def test_export_then_reimport_risk_matrix_round_trips(page):
    _open_in_quantitative_mode(page)
    page.locator("select[name=risk-matrix]").select_option("leaflet5")
    page.wait_for_timeout(80)

    page.evaluate("""() => {
      window.__written = null;
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async (blob) => { window.__written = await blob.text(); },
          close: async () => {},
        }),
      });
    }""")
    page.get_by_role("button", name="Export Risk Matrix…", exact=True).click()
    page.wait_for_timeout(150)
    written = page.evaluate("() => window.__written")
    assert written is not None

    original_min_values = page.evaluate(
        "() => window.__lastModel.riskMatrix.likelihoodClasses.map((c) => c.minValue)"
    )

    # Reset to no matrix, then reimport the exported file.
    page.locator("select[name=risk-matrix]").select_option("")
    page.wait_for_timeout(80)
    page.evaluate(
        """(text) => {
          window.showOpenFilePicker = async () => [{ getFile: async () => ({ text: async () => text }) }];
        }""",
        written,
    )
    page.get_by_role("button", name="Import Risk Matrix…", exact=True).click()
    page.wait_for_timeout(150)

    reimported_min_values = page.evaluate(
        "() => window.__lastModel.riskMatrix.likelihoodClasses.map((c) => c.minValue)"
    )
    assert reimported_min_values == original_min_values
