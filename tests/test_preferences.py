"""Settings › Preferences… (PreferencesController, ui_fitness_proposal.md
S3): everything that is per browser rather than per document -- the
events/hour <-> events/year display unit, line-origin annotations, and the
two auto-arrange knobs (Loose/Tight spacing, pull-chains-closer, whose
effects test_tight_spacing.py / test_auto_arrange_fix.py cover). Applies
immediately (no apply-on-Close) and persists in localStorage.
"""
from conftest import complete_new_bowtie_wizard


def _open_preferences(page):
    page.click("#menu-trigger-settings")
    page.click("#btn-preferences")
    page.wait_for_timeout(100)


def _done(page):
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(80)


def _tle_info_text(page):
    return page.evaluate("""
      () => Array.from(document.getElementById('nodes-layer').querySelectorAll('.node-info-text text'))
        .map((t) => t.textContent).join(' | ')
    """)


def _setup_quantitative_threat(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addThreat({x: 150, y: 200});
      m.renameNode(c.nodeId, { name: 'C1', frequency: { value: '1' } });
    }""")
    page.wait_for_timeout(100)


def test_preferences_modal_groups_display_and_auto_arrange_and_says_it_is_per_browser(page):
    _open_preferences(page)
    assert page.locator(".modal-title").text_content() == "Preferences"
    assert "not saved in the file" in page.locator(".modal-subtitle").text_content()
    assert page.locator(".modal-section-title").all_text_contents() == ["Display", "Auto-arrange"]
    assert page.locator("input[name=display-unit]").count() == 2
    assert page.locator("input[name=show-annotations]").count() == 1
    assert page.locator("input[name=arrange-spacing]").count() == 2
    assert page.locator("input[name=pull-chains-closer]").count() == 1
    _done(page)


def test_display_unit_applies_immediately_to_the_canvas(page):
    _setup_quantitative_threat(page)
    assert "/hr" in _tle_info_text(page)

    _open_preferences(page)
    page.locator("input[name=display-unit][value=year]").check()
    page.wait_for_timeout(80)
    assert "/yr" in _tle_info_text(page), "no Done needed -- changes apply immediately"
    _done(page)
    assert "/yr" in _tle_info_text(page)


def test_line_annotations_toggle_applies_immediately(page):
    # Origin annotations only render on a barrier carrying more than one
    # lane (ConnectionRenderer.makeLabel), so share one barrier between
    # two threats.
    page.evaluate("""() => {
      const m = window.__lastModel;
      const c1 = m.addThreat({x: 150, y: 200});
      const c2 = m.addThreat({x: 150, y: 400});
      const pb = m.addPreventativeControl(c1.id);
      m.attachInputToPreventativeControl(c2.id, pb.id, false);
    }""")
    page.wait_for_timeout(80)

    # Scoped through getElementById: MinimapView clones the live layer --
    # id and all -- into #minimap-container on a trailing debounce, so a
    # plain CSS selector would also count the (stale) clone.
    def label_count():
        return page.evaluate("() => document.getElementById('connections-layer').querySelectorAll('.connection-label').length")

    assert label_count() > 0

    _open_preferences(page)
    page.locator("input[name=show-annotations]").uncheck()
    page.wait_for_timeout(80)
    assert label_count() == 0
    page.keyboard.press("Escape")
    page.wait_for_timeout(80)
    assert label_count() == 0, "Escape must not lose the change"


def test_preferences_persist_across_a_reload_via_local_storage(page):
    _open_preferences(page)
    page.locator("input[name=arrange-spacing][value=tight]").check()
    page.locator("input[name=display-unit][value=year]").check()
    page.wait_for_timeout(80)
    _done(page)
    stored = page.evaluate("() => JSON.parse(localStorage.getItem('bowtie-diagram.preferences'))")
    assert stored["arrangeSpacing"] == "tight" and stored["displayUnit"] == "year"

    page.reload()
    complete_new_bowtie_wizard(page)
    page.wait_for_timeout(150)
    _open_preferences(page)
    assert page.locator("input[name=arrange-spacing][value=tight]").is_checked()
    assert page.locator("input[name=display-unit][value=year]").is_checked()
    _done(page)


def test_a_corrupt_or_foreign_stored_value_is_ignored(page):
    page.evaluate("() => localStorage.setItem('bowtie-diagram.preferences', '{\"displayUnit\": \"fortnight\", \"arrangeSpacing\": 1')")
    page.reload()
    complete_new_bowtie_wizard(page)
    page.wait_for_timeout(150)
    _open_preferences(page)
    assert page.locator("input[name=display-unit][value=hour]").is_checked()
    assert page.locator("input[name=arrange-spacing][value=loose]").is_checked()
    _done(page)
