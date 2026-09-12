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


def test_badge_title_names_the_affected_page(page):
    """Design review finding 06: the badge's count alone gives no hint
    where to look on a multi-page document before opening the modal."""
    assert page.locator("#btn-warnings").get_attribute("title") == "Warnings"

    page.evaluate("() => { window.__lastModel.renamePage(window.__lastModel.pages[0].id, { name: 'Topside' }); }")
    _orphan_a_preventative_barrier(page)

    assert page.locator("#btn-warnings").get_attribute("title") == "Warnings on: Topside"


def test_badge_title_lists_every_affected_page_once_each(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.renamePage(m.pages[0].id, { name: 'Topside' });
      const p2 = m.addPage({ name: 'Subsea' });
      m.addCause({ x: 150, y: 200 });
      m.addPreventativeControl(m.causes[0].id);
      m.connectLineDirectlyToTle(m._lineFor(m.causes[0].id).id, null);
      m.addCause({ x: 150, y: 200, pageId: p2.id });
      const c2 = m.causes.find((c) => c.pageId === p2.id);
      m.addPreventativeControl(c2.id);
      m.connectLineDirectlyToTle(m._lineFor(c2.id).id, null);
    }""")
    page.wait_for_timeout(80)

    title = page.locator("#btn-warnings").get_attribute("title")
    assert title.startswith("Warnings on: ")
    names = title.removeprefix("Warnings on: ").split(", ")
    assert set(names) == {"Topside", "Subsea"}


# --- barrier_measures_proposal.md: advisory warnings never block export --

def _add_pfh_barrier_that_never_limits(page):
    # Committed through renameNode (not a bare property assignment) so it
    # fires model.onChange -- WarningsController's refresh() is bound to
    # that, the same way the real UI's Properties modal save path does.
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      const c = m.addCause({x: 150, y: 200});
      m.renameNode(c.nodeId, { frequency: { value: '1' } });
      const pb = m.addPreventativeControl(c.id);
      m.renameNode(pb.nodeId, { protection: { measure: 'pfh', value: '10' } });
    }""")
    page.wait_for_timeout(80)


def test_advisory_barrier_warning_shows_the_badge_but_leaves_export_enabled(page):
    _add_pfh_barrier_that_never_limits(page)

    badge = page.locator("#btn-warnings")
    assert badge.is_visible()
    assert badge.locator(".warning-count").text_content() == "1"
    for btn_id in EXPORT_BUTTON_IDS:
        assert page.locator(f"#{btn_id}").is_enabled(), "advisory warnings must never disable export"

    badge.click()
    page.wait_for_timeout(50)
    assert "Advisory" in page.locator(".modal-overlay").text_content()
    page.get_by_role("button", name="Close", exact=True).click()


def test_a_blocking_and_an_advisory_warning_together_still_disable_export(page):
    _add_pfh_barrier_that_never_limits(page)
    _orphan_a_preventative_barrier(page)

    assert page.locator("#btn-warnings").locator(".warning-count").text_content() == "2"
    for btn_id in EXPORT_BUTTON_IDS:
        assert page.locator(f"#{btn_id}").is_disabled(), "the blocking orphan warning must still disable export"


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
