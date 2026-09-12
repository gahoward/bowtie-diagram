"""UI-level coverage for ProjectSettingsController (js/controller/
ProjectSettingsController.js) -- the single "Project Settings" modal
consolidating the analysis name, identifier display mode (moved out of
NodeLibraryController), the risk analysis mode/matrix picker, and the
events/hour <-> events/year display-unit preference (formerly the separate
"Analysis Mode" modal/ModeController).
"""


def _open_project_settings(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-project-settings")
    page.wait_for_timeout(100)


def test_project_settings_menu_item_replaces_analysis_mode(page):
    page.click("#menu-trigger-settings")
    dropdown = page.locator("#menu-dropdown-settings")
    texts = dropdown.locator(".menu-dropdown-item").all_text_contents()
    assert any("Project Settings" in t for t in texts)
    assert not any("Analysis Mode" in t for t in texts)


def test_project_settings_shows_name_identifiers_and_risk_analysis_sections(page):
    _open_project_settings(page)
    titles = page.locator(".modal-section-title").all_text_contents()
    assert titles == ["Analysis", "Identifiers", "Risk Analysis"]
    page.get_by_role("button", name="Close", exact=True).click()


def test_project_settings_renames_the_document(page):
    _open_project_settings(page)
    name_input = page.locator(".modal-section:has-text('Analysis') input[type=text]")
    name_input.fill("My Renamed Analysis")
    name_input.blur()
    page.wait_for_timeout(80)

    assert page.evaluate("() => window.__lastModel.name") == "My Renamed Analysis"


def test_committing_a_rename_does_not_drop_focus_to_body(page):
    """Structural review finding 09: the Name field's 'change' event fires
    on blur, after focus has already moved to whatever's next in tab order
    -- a same-tick modal body rebuild used to replace that element too,
    dropping focus to <body> with no way back for a keyboard user."""
    _open_project_settings(page)
    name_input = page.locator(".modal-section:has-text('Analysis') input[type=text]")
    name_input.fill("Tabbed Away")
    name_input.press("Tab")
    page.wait_for_timeout(80)

    assert page.evaluate("() => window.__lastModel.name") == "Tabbed Away"
    assert page.evaluate("() => document.activeElement.tagName") != "BODY"


def test_project_settings_identifier_display_mode_moved_out_of_node_library(page):
    # The toggle now lives only in Project Settings.
    _open_project_settings(page)
    assert page.locator("input[name=identifier-display-mode-toggle]").count() == 2
    page.get_by_role("button", name="Close", exact=True).click()

    page.click("#menu-trigger-settings")
    page.click("#btn-manage-ids")
    page.wait_for_timeout(100)
    assert page.locator("input[name=identifier-display-mode-toggle]").count() == 0
    assert page.locator(".modal-title").text_content() == "Node Library"


def test_project_settings_switching_identifier_mode_to_custom_backfills_ids(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_project_settings(page)
    page.locator("input[name=identifier-display-mode-toggle][value=custom]").check()
    page.wait_for_timeout(80)
    page.get_by_role("button", name="Close", exact=True).click()

    identifier = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).identifier;
    }""")
    assert identifier == "C_1"


def test_project_settings_matrix_picker_and_display_unit_appear_only_in_matching_modes(page):
    _open_project_settings(page)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 0
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 0
    assert page.locator(".modal-field:has-text('Combine multiple causes')").count() == 0

    page.locator("input[name=analysis-mode][value=qualitative]").check()
    page.wait_for_timeout(80)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 1
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 0
    assert page.locator(".modal-field:has-text('Combine multiple causes')").count() == 0

    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 1
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 1
    assert page.locator(".modal-field:has-text('Combine multiple causes')").count() == 1

    page.locator("input[name=analysis-mode][value=simple]").check()
    page.wait_for_timeout(80)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 0
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 0
    assert page.locator(".modal-field:has-text('Combine multiple causes')").count() == 0


def test_risk_class_legend_appears_once_a_matrix_is_active(page):
    """Design review finding 02: the canvas risk badge only ever draws a
    bare letter -- this legend is the persistent, always-visible reference
    for what each letter means, shown once a matrix is picked rather than
    requiring a hover per badge."""
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=qualitative]").check()
    page.wait_for_timeout(80)
    assert page.locator(".risk-class-legend").count() == 0, "no matrix selected yet"

    page.locator(".modal-field:has-text('Risk matrix') select").select_option("leaflet5")
    page.wait_for_timeout(80)

    legend = page.locator(".risk-class-legend")
    assert legend.count() == 1
    items = legend.locator(".risk-class-legend-item").all_text_contents()
    assert len(items) == 4
    assert any("A - Intolerable" in t for t in items)
    assert any("D - Broadly Acceptable" in t for t in items)

    page.locator(".modal-field:has-text('Risk matrix') select").select_option("")
    page.wait_for_timeout(80)
    assert page.locator(".risk-class-legend").count() == 0, "cleared alongside the matrix itself"


def test_project_settings_tle_aggregation_toggle_updates_model_and_canvas(page):
    """Design review finding 11: the aggregation toggle drives
    BowtieModel.setTleAggregation, and the canvas TLE badge names whichever
    policy is active (CanvasView.js)."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c1 = m.addCause({x: 150, y: 200});
      m.renameNode(c1.nodeId, { name: 'C1', frequency: { value: '0.001' } });
      const c2 = m.addCause({x: 150, y: 400});
      m.renameNode(c2.nodeId, { name: 'C2', frequency: { value: '0.01' } });
    }""")
    page.wait_for_timeout(100)

    def tle_info_text():
        return page.evaluate("""
          () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.node-info-text text'))
            .map((t) => t.textContent).join(' | ')
        """)

    assert "(max)" in tle_info_text()
    assert page.evaluate("() => window.__lastModel.tleAggregation") == "max"

    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
    assert page.locator("input[name=tle-aggregation]").count() == 2
    page.locator("input[name=tle-aggregation][value=sum]").check()
    page.wait_for_timeout(80)
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)

    assert page.evaluate("() => window.__lastModel.tleAggregation") == "sum"
    assert "(sum)" in tle_info_text()


def test_project_settings_quantitative_defaults_update_the_model(page):
    """barrier_measures_proposal.md's ProjectDefaults: the dangerous-
    fraction and proof-test-interval fallbacks a barrier's own protection
    overrides -- committed via setQuantitativeDefaults, same
    change-on-blur / _suppressNextRefresh pattern as the Name field."""
    assert page.evaluate("() => window.__lastModel.dangerousFraction") == "1"
    assert page.evaluate("() => window.__lastModel.proofTestIntervalH") == "8760"

    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)

    df_input = page.locator(".modal-field:has-text('dangerous fraction') input[type=text]")
    df_input.fill("0.5")
    df_input.blur()
    page.wait_for_timeout(80)

    ti_input = page.locator(".modal-field:has-text('proof-test interval') input[type=text]")
    ti_input.fill("4380")
    ti_input.blur()
    page.wait_for_timeout(80)

    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)

    assert page.evaluate("() => window.__lastModel.dangerousFraction") == "0.5"
    assert page.evaluate("() => window.__lastModel.proofTestIntervalH") == "4380"


def test_project_settings_quantitative_defaults_reject_out_of_range_values(page):
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)

    df_input = page.locator(".modal-field:has-text('dangerous fraction') input[type=text]")
    df_input.fill("1.5")
    df_input.blur()
    page.wait_for_timeout(80)

    assert page.evaluate("() => window.__lastModel.dangerousFraction") == "1", "out-of-range input must be rejected"


def test_project_settings_selecting_a_matrix_preset_embeds_a_full_copy(page):
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
    page.locator(".modal-field:has-text('Risk matrix') select").select_option("leaflet5")
    page.wait_for_timeout(80)

    embedded_id = page.evaluate("() => window.__lastModel.riskMatrix && window.__lastModel.riskMatrix.id")
    assert embedded_id == "leaflet5"
    is_copy = page.evaluate("() => window.__lastModel.riskMatrix !== Bowtie.RISK_MATRIX_PRESETS.leaflet5")
    assert is_copy is True


def test_project_settings_display_unit_toggle_changes_canvas_likelihood_text(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.renameNode(c.nodeId, { name: 'C1', frequency: { value: '1' } });
    }""")
    page.wait_for_timeout(100)

    def tle_info_text():
        return page.evaluate("""
          () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.node-info-text text'))
            .map((t) => t.textContent).join(' | ')
        """)

    assert "/hr" in tle_info_text()

    _open_project_settings(page)
    page.locator("input[name=display-unit][value=year]").check()
    page.wait_for_timeout(80)
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)

    assert "/yr" in tle_info_text()


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


def test_export_risk_matrix_button_disabled_until_a_matrix_is_active(page):
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
    assert page.get_by_role("button", name="Export Risk Matrix…", exact=True).is_disabled()

    page.locator(".modal-field:has-text('Risk matrix') select").select_option("leaflet5")
    page.wait_for_timeout(80)
    assert page.get_by_role("button", name="Export Risk Matrix…", exact=True).is_enabled()


def test_import_risk_matrix_via_native_picker_sets_it_active(page):
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)

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


def test_import_risk_matrix_falls_back_to_hidden_input_when_api_unavailable(page, tmp_path):
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
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
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)

    page.evaluate("""() => {
      window.showOpenFilePicker = async () => [{
        getFile: async () => ({ text: async () => '{"id": "bad"}' }),
      }];
    }""")
    page.get_by_role("button", name="Import Risk Matrix…", exact=True).click()
    page.wait_for_timeout(150)

    assert page.locator(".modal-title", has_text="Cannot Import Risk Matrix").count() == 1
    page.get_by_role("button", name="OK", exact=True).click()
    assert page.evaluate("() => window.__lastModel.riskMatrix") is None


def test_export_then_reimport_risk_matrix_round_trips(page):
    _open_project_settings(page)
    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
    page.locator(".modal-field:has-text('Risk matrix') select").select_option("leaflet5")
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
    page.locator(".modal-field:has-text('Risk matrix') select").select_option("")
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
