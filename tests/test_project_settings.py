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

    page.locator("input[name=analysis-mode][value=qualitative]").check()
    page.wait_for_timeout(80)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 1
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 0

    page.locator("input[name=analysis-mode][value=quantitative]").check()
    page.wait_for_timeout(80)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 1
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 1

    page.locator("input[name=analysis-mode][value=simple]").check()
    page.wait_for_timeout(80)
    assert page.locator(".modal-field:has-text('Risk matrix')").count() == 0
    assert page.locator(".modal-field:has-text('Display frequencies as')").count() == 0


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
