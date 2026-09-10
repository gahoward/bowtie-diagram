"""UI-level coverage for WarningsController (design review finding 05).
`getWarnings().length` drives both the toolbar badge's visibility/count
AND force-disabling all three export buttons -- a data-integrity rule
that had nothing behind it at the controller level before this file.
Orphaning a barrier reproduces it the way DESIGN_NOTES.md describes it
actually happening: "Connect Directly to TLE" truncates a Line's stops,
leaving whatever barrier used to be downstream referenced by nothing.
"""

EXPORT_BUTTON_IDS = ["btn-export-png", "btn-export-svg", "btn-export-json"]


def _orphan_a_preventative_barrier(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const cause = m.causes[0];
      m.addPreventativeControl(cause.id);
      const line = m._lineFor(cause.id);
      m.connectLineDirectlyToTle(line.id, null);
    }""")
    page.wait_for_timeout(80)


def test_orphaning_a_barrier_shows_the_badge_lists_it_and_disables_export(page):
    _orphan_a_preventative_barrier(page)

    badge = page.locator("#btn-warnings")
    assert badge.is_visible()
    assert badge.locator(".warning-count").text_content() == "1"
    for btn_id in EXPORT_BUTTON_IDS:
        assert page.locator(f"#{btn_id}").is_disabled()

    badge.click()
    page.wait_for_timeout(50)
    assert page.locator(".modal-title").text_content() == "Warnings"
    assert page.locator(".warning-list li").count() == 1
    assert "not connected to any Cause" in page.locator(".warning-list li").text_content()
    page.get_by_role("button", name="Close", exact=True).click()


def test_resolving_the_orphan_hides_the_badge_and_re_enables_export(page):
    for btn_id in EXPORT_BUTTON_IDS:
        assert page.locator(f"#{btn_id}").is_enabled(), "sanity check: a fresh bowtie has no warnings"

    _orphan_a_preventative_barrier(page)
    assert page.locator("#btn-warnings").is_visible()

    page.evaluate("""() => {
      const m = window.__lastModel;
      const orphan = m.preventativeBarriers[0];
      m.deleteElement(orphan.id);
    }""")
    page.wait_for_timeout(80)

    badge = page.locator("#btn-warnings")
    assert badge.is_hidden()
    for btn_id in EXPORT_BUTTON_IDS:
        assert page.locator(f"#{btn_id}").is_enabled()
