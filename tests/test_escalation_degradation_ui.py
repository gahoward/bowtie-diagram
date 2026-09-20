"""The surfaces proposals/21 added once the arithmetic worked: the
Degradation control in an escalation factor's Properties, the Barrier
Register's "Degraded by" column, and what the canvas shows for a barrier
whose claim is being eaten.

`test_quantitative_escalation.py` covers the numbers. This file covers
whether an analyst can ever SEE them: a degradation that moves a
consequence's risk class while being invisible on the diagram and absent
from the table that exists to name barriers needing attention would be
the same defect proposals/21 set out to fix, one layer up.
"""

from playwright.sync_api import expect

from helpers import eventually_equals


# One threat, one PFD barrier, one escalation factor on it -- the same
# shape test_quantitative_escalation.py uses, so the figures here can be
# read against the ones there.
SETUP = """() => {
  const m = window.__lastUndo.model;
  m.setMode('quantitative');
  m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
  const t = m.addThreat({x: 150, y: 200, name: 'Overpressure'});
  m.renameNode(t.nodeId, {frequency: {value: '1'}});
  const b = m.addPreventativeControl(t.id, {name: 'Relief valve'});
  m.renameNode(b.nodeId, {protection: {measure: 'pfdavg', value: '1E-2'}});
  const ef = m.addEscalationFactor(b.id, {name: 'Untested'});
  return {barrierId: b.id, barrierNodeId: b.nodeId, factorId: ef.id, factorNodeId: ef.nodeId};
}"""


def _setup(page):
    ids = page.evaluate(SETUP)
    page.wait_for_timeout(120)
    return ids


def _degrade(page, node_id, degradation):
    page.evaluate(
        "([nodeId, degradation]) => window.__lastUndo.model.renameNode(nodeId, {degradation})",
        [node_id, degradation],
    )
    page.wait_for_timeout(120)


def _control(page, factor_id):
    page.evaluate(
        "(id) => window.__lastUndo.model.addEscalationBarrier(id, {name: 'Quarterly test'})",
        factor_id,
    )
    page.wait_for_timeout(120)


def _open_properties(page, selector):
    box = page.locator(f"#bowtie-canvas {selector}").first.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button="right")
    page.wait_for_timeout(80)
    page.locator(".context-menu-item", has_text="Properties").click()
    page.wait_for_timeout(80)


# --- The Degradation control ---------------------------------------------

def test_an_escalation_factor_has_a_degradation_control_in_quantitative_mode(page):
    _setup(page)
    _open_properties(page, ".node.escalation-factor")
    expect(page.locator("select[name=degradation-mode]")).to_have_count(1)
    options = page.locator("select[name=degradation-mode] option").all_text_contents()
    assert options[0] == "No degradation", "the default, and what every v13 document carries"
    assert len(options) == 4, "factor and floor both (open question 2), plus Unknown"
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_the_control_is_absent_in_the_other_two_modes(page):
    """A degradation is a quantity, and Simple and Qualitative mode do no
    arithmetic for it to change -- the same rule every other quantitative
    field in this form follows."""
    _setup(page)
    page.evaluate("() => window.__lastModel.setMode('qualitative')")
    page.wait_for_timeout(120)
    _open_properties(page, ".node.escalation-factor")
    expect(page.locator("select[name=degradation-mode]")).to_have_count(0)
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_the_value_field_appears_only_once_a_mode_is_chosen(page):
    _setup(page)
    _open_properties(page, ".node.escalation-factor")
    value = page.locator("input[name=degradation-value]")
    expect(value).to_be_hidden()
    page.locator("select[name=degradation-mode]").select_option("factor")
    expect(value).to_be_visible()
    page.locator("select[name=degradation-mode]").select_option("")
    expect(value).to_be_hidden()
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_saving_a_factor_degradation_moves_the_figure(page):
    """The whole point, driven the way an analyst reaches it rather than
    through renameNode: 1/hr through a 1E-2 barrier is 1E-2, and ten
    times worse is 1E-1."""
    ids = _setup(page)
    assert page.evaluate("""() => {
      const c = window.__lastModel.computeTleLikelihood(window.__lastModel.pages[0].id);
      return c.value.toExactDecimal().toDecimalString();
    }""") == "0.01"

    _open_properties(page, ".node.escalation-factor")
    page.locator("select[name=degradation-mode]").select_option("factor")
    page.locator("input[name=degradation-value]").fill("10")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".modal-overlay")).to_have_count(0)

    assert page.evaluate(
        "(id) => window.__lastModel.getNode(id).degradation",
        ids["factorNodeId"],
    ) == {"mode": "factor", "value": "10"}
    eventually_equals(lambda: page.evaluate("""() => {
      const c = window.__lastModel.computeTleLikelihood(window.__lastModel.pages[0].id);
      return c.value.toExactDecimal().toDecimalString();
    }"""), "0.1")


def test_a_multiplier_below_one_is_refused(page):
    """A factor under 1 would make the barrier BETTER, which is an
    escalation factor claiming credit -- the diagram says the opposite."""
    _setup(page)
    _open_properties(page, ".node.escalation-factor")
    page.locator("select[name=degradation-mode]").select_option("factor")
    page.locator("input[name=degradation-value]").fill("0.5")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".modal-field-error")).to_contain_text("use 1 or more")
    expect(page.locator(".modal-overlay")).to_have_count(1), "the dialog stays open"
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_a_floor_of_zero_is_refused(page):
    _setup(page)
    _open_properties(page, ".node.escalation-factor")
    page.locator("select[name=degradation-mode]").select_option("floor")
    page.locator("input[name=degradation-value]").fill("0")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".modal-field-error")).to_contain_text("greater than 0")
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_a_chosen_mode_with_no_value_is_refused_rather_than_silently_dropped(page):
    _setup(page)
    _open_properties(page, ".node.escalation-factor")
    page.locator("select[name=degradation-mode]").select_option("factor")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".modal-field-error")).to_contain_text("Degradation is empty")
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_the_value_box_is_ready_to_type_in_as_soon_as_a_mode_is_chosen(page):
    """Every other quantity in this form carries its own Unknown tickbox,
    which `makeQuantityField` ticks whenever there is no value yet. Here
    that would hand anyone who picked a mode a disabled box -- so Unknown
    is the mode select's own last option, and the value field is always
    editable."""
    _setup(page)
    _open_properties(page, ".node.escalation-factor")
    page.locator("select[name=degradation-mode]").select_option("factor")
    expect(page.locator("input[name=degradation-value]")).to_be_editable()
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_a_degradation_of_unknown_size_is_its_own_choice_and_survives_a_reopen(page):
    """'There is a degradation and I do not know how big' is a different
    statement from 'there is none'. It changes no figure -- the same
    conservative skip every other quantity uses -- but it must not come
    back as No degradation, which would rewrite the analyst's statement
    the next time anyone pressed Save."""
    ids = _setup(page)
    _open_properties(page, ".node.escalation-factor")
    page.locator("select[name=degradation-mode]").select_option("unknown")
    expect(page.locator("input[name=degradation-value]")).to_be_hidden()
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".modal-overlay")).to_have_count(0)

    assert page.evaluate(
        "(id) => window.__lastModel.getNode(id).degradation",
        ids["factorNodeId"],
    ) == {"unknown": True}
    _open_properties(page, ".node.escalation-factor")
    expect(page.locator("select[name=degradation-mode]")).to_have_value("unknown")
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_an_existing_degradation_comes_back_into_the_form(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "floor", "value": "1E-1"})
    _open_properties(page, ".node.escalation-factor")
    expect(page.locator("select[name=degradation-mode]")).to_have_value("floor")
    expect(page.locator("input[name=degradation-value]")).to_have_value("1E-1")
    page.get_by_role("button", name="Cancel", exact=True).click()


# --- The canvas -----------------------------------------------------------

def _barrier_info_lines(page):
    return page.locator("#bowtie-canvas .node.preventative-barrier").first.evaluate(
        """(g) => Array.from(g.parentNode.querySelectorAll('.node-info text, .node-info tspan'))
                      .map((t) => t.textContent)"""
    )


def test_a_degraded_barrier_says_so_on_the_diagram(page):
    """Without this the diagram's own figure ('PFD: 0.01') is a claim the
    arithmetic no longer honours."""
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    texts = page.locator("#bowtie-canvas text").all_text_contents()
    assert "PFD: 0.01" in texts, "the claimed figure keeps its place"
    assert "×10 worse" in texts


def test_the_barrier_title_gives_claimed_and_effective_together(page):
    ids = _setup(page)
    before = page.locator("#bowtie-canvas title").all_text_contents()
    assert not any("degraded" in t for t in before)

    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    titles = [t for t in page.locator("#bowtie-canvas title").all_text_contents() if "PFD" in t]
    degraded = [t for t in titles if "degraded" in t]
    assert len(degraded) == 1
    assert "0.01" in degraded[0] and "0.1" in degraded[0]
    assert "1 uncontrolled escalation factor" in degraded[0]


def test_an_undegraded_barrier_keeps_its_plain_normalised_reading(page):
    _setup(page)
    titles = [t for t in page.locator("#bowtie-canvas title").all_text_contents() if "PFD" in t]
    assert any("equivalent PFD: 0.01" in t for t in titles)
    assert not any("degraded" in t for t in titles)


# --- The escalation line (open question 3) --------------------------------

def _line_is_heavy(page):
    return page.evaluate(
        """() => {
          const line = document.querySelector('#bowtie-canvas [data-role="escalation-line"]');
          return line ? line.classList.contains('degrading') : null;
        }"""
    )


def test_a_degrading_factors_line_is_drawn_more_heavily(page):
    ids = _setup(page)
    assert _line_is_heavy(page) is False
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    assert _line_is_heavy(page) is True, "'this one moves the numbers', without opening Properties"


def test_controlling_the_factor_takes_the_weight_back_off(page):
    """The line says what the arithmetic does, and a controlled factor
    does not degrade -- the same condition the advisory warning uses."""
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    _control(page, ids["factorId"])
    assert _line_is_heavy(page) is False


def test_a_degradation_on_an_unknown_barrier_does_not_weight_the_line(page):
    """The fold skips an Unknown barrier entirely, so nothing is being
    degraded -- a heavy line here would claim an effect the arithmetic
    does not have."""
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    page.evaluate(
        "(id) => window.__lastUndo.model.renameNode(id, {protection: {unknown: true}})",
        ids["barrierNodeId"],
    )
    page.wait_for_timeout(120)
    assert _line_is_heavy(page) is False


def test_the_line_is_never_weighted_outside_quantitative_mode(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    page.evaluate("() => window.__lastModel.setMode('qualitative')")
    page.wait_for_timeout(150)
    assert _line_is_heavy(page) is False


# --- The Barrier Register -------------------------------------------------

def _open_register(page):
    page.click("#menu-trigger-view")
    page.click("#btn-barrier-register")
    page.wait_for_timeout(150)


def _close_register(page):
    page.get_by_role("button", name="Close", exact=True).click()
    page.wait_for_timeout(80)


def test_the_register_names_what_the_barrier_lost(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    _open_register(page)
    cell = page.locator(".barrier-register-degraded").first
    expect(cell).to_have_text("×10 worse")
    assert "1 uncontrolled escalation factor" in cell.get_attribute("title")
    _close_register(page)


def test_the_registers_measure_tooltip_carries_the_effective_figure(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    _open_register(page)
    title = page.locator(".barrier-register-table tbody td").nth(6).get_attribute("title")
    assert "equivalent PFD: 0.01" in title and "degraded: 0.1" in title
    _close_register(page)


def test_a_capped_claim_reads_as_capped_rather_than_as_a_multiplier(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "floor", "value": "1E-1"})
    _open_register(page)
    expect(page.locator(".barrier-register-degraded").first).to_have_text("claim capped")
    _close_register(page)


def test_a_controlled_factor_leaves_the_column_empty(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    _control(page, ids["factorId"])
    _open_register(page)
    expect(page.locator(".barrier-register-degraded")).to_have_count(0)
    _close_register(page)


def test_an_unknown_barrier_reports_no_degradation_at_all(page):
    """The fold skips an Unknown barrier entirely, so its factors are
    eating nothing. A `×10 worse` in this column would be the table
    claiming a cost the arithmetic never applied."""
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    page.evaluate(
        "(id) => window.__lastUndo.model.renameNode(id, {protection: {unknown: true}})",
        ids["barrierNodeId"],
    )
    page.wait_for_timeout(120)
    _open_register(page)
    expect(page.locator(".barrier-register-degraded")).to_have_count(0)
    expect(page.locator(".barrier-register-unknown").first).to_have_text("Unknown")
    _close_register(page)


def test_the_export_carries_the_degradation_column(page):
    ids = _setup(page)
    _degrade(page, ids["factorNodeId"], {"mode": "factor", "value": "10"})
    _open_register(page)
    table = page.evaluate("() => window.__lastBarrierRegister._exportTable()")
    assert table["columns"][10] == "degradation"
    row = [r for r in table["rows"] if "Relief valve" in r][0]
    assert row[10] == "×10 worse"
    _close_register(page)


# --- The demo -------------------------------------------------------------

def test_the_demo_states_a_degradation_on_its_controlled_factor(browser, base_url):
    """The worked example is the one place the feature is discovered.

    The quantitative variant, since that is the only mode in which a
    degradation means anything.

    The demo's factor is *controlled* — a quarterly test regime answers
    it — so its stated `×10 worse` changes no figure. That is the point:
    it shows what an analyst writes down, and shows the control earning
    its place by keeping it out of the numbers.
    """
    from conftest import INIT_SCRIPT

    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    try:
        pg.locator('.welcome-segmented-option[data-variant="quantitative"]').click()
        pg.get_by_role("button", name="Explore the demo", exact=True).click()
        pg.wait_for_timeout(400)
        factor = pg.evaluate("""() => {
          const m = window.__lastModel;
          const ef = m.escalationFactors[0];
          return {
            degradation: m.getNode(ef.nodeId).degradation,
            degrading: m.isEscalationFactorDegrading(ef),
          };
        }""")
        assert factor["degradation"] == {"mode": "factor", "value": "10"}
        assert factor["degrading"] is False, "controlled, so it degrades nothing"
        assert pg.locator("#bowtie-canvas .connection.escalation.degrading").count() == 0
        assert pg.evaluate("() => window.__lastModel.getWarnings().length") == 0, \
            "the demo must still load clean"
    finally:
        assert pg.errors == []
        pg.close()
