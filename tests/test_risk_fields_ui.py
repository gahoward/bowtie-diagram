"""UI-level coverage for the rename modal's qualitative/quantitative risk
fields (RiskFieldsForm.js), driven through the real context-menu Rename
flow (ContextMenuController, constructed with PageScopedModel) rather than
by calling model methods directly on window.__lastModel/window.__lastUndo.
This is deliberate: an earlier regression (PageScopedModel had no
`renameNode` passthrough, so every Rename-with-risk-fields save threw
"this.model.renameNode is not a function") went completely undetected by
the rest of the suite, because every other quantitative-mode test drives
the raw model directly and never exercises ContextMenuController's own
modal at all.
"""


def _set_quantitative_mode(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
    }""")


def _set_qualitative_mode(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('qualitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
    }""")


def _right_click_center(page, locator):
    box = locator.bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button="right")


def _open_rename_modal(page, node_selector):
    _right_click_center(page, page.locator(node_selector).first)
    page.wait_for_timeout(80)
    page.locator(".context-menu-item", has_text="Rename").click()
    page.wait_for_timeout(80)


def test_rename_modal_saves_outcome_severity_class_in_quantitative_mode(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addOutcome({x: 1200, y: 200}); }")
    page.wait_for_timeout(80)

    _open_rename_modal(page, ".node.outcome")
    page.locator(".modal-field:has-text('Severity') select").select_option("major")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0, "Save must close the modal, not silently fail"
    severity = page.evaluate("""() => {
      const o = window.__lastModel.outcomes[0];
      return window.__lastModel.getNode(o.nodeId).severityClassId;
    }""")
    assert severity == "major"


def test_rename_modal_saves_outcome_likelihood_class_in_qualitative_mode(page):
    _set_qualitative_mode(page)
    page.evaluate("() => { window.__lastModel.addOutcome({x: 1200, y: 200}); }")
    page.wait_for_timeout(80)

    _open_rename_modal(page, ".node.outcome")
    page.locator(".modal-field:has-text('Likelihood') select").select_option(index=1)
    likelihood_value = page.locator(".modal-field:has-text('Likelihood') select").input_value()
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0
    likelihood = page.evaluate("""() => {
      const o = window.__lastModel.outcomes[0];
      return window.__lastModel.getNode(o.nodeId).likelihoodClassId;
    }""")
    assert likelihood == likelihood_value


def test_rename_modal_saves_cause_frequency_in_quantitative_mode(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_rename_modal(page, ".node.cause")
    # A Quantity field defaults to Unknown-checked (with its value input
    # disabled) when the node has no frequency yet -- see
    # RiskFieldsForm.js's makeQuantityField.
    page.locator(".modal-field:has-text('Frequency') input[type=checkbox]").uncheck()
    page.locator(".modal-field:has-text('Frequency') input[type=text]").fill("1E-4")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0
    frequency = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).frequency;
    }""")
    assert frequency == {"value": "1E-4"}


def test_rename_modal_saves_barrier_risk_reduction_factor_in_quantitative_mode(page):
    _set_quantitative_mode(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const cause = m.addCause({x: 150, y: 200});
      m.addPreventativeControl(cause.id);
    }""")
    page.wait_for_timeout(80)

    _open_rename_modal(page, ".node.preventative-barrier")
    page.locator(".modal-field:has-text('Risk Reduction Factor') input[type=checkbox]").uncheck()
    page.locator(".modal-field:has-text('Risk Reduction Factor') input[type=text]").fill("0.05")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0
    rrf = page.evaluate("""() => {
      const pb = window.__lastModel.preventativeBarriers[0];
      return window.__lastModel.getNode(pb.nodeId).riskReductionFactor;
    }""")
    assert rrf == {"value": "0.05"}


def test_rename_modal_marking_frequency_unknown_saves_unknown_quantity(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_rename_modal(page, ".node.cause")
    page.locator(".modal-field:has-text('Frequency') input[type=checkbox]").check()
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    frequency = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).frequency;
    }""")
    assert frequency == {"unknown": True}


def test_rename_modal_shows_no_risk_fields_in_simple_mode(page):
    # Default mode -- the wizard-created page fixture starts in Simple mode.
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_rename_modal(page, ".node.cause")
    assert page.locator(".modal-field:has-text('Frequency')").count() == 0
    assert page.locator(".modal-field:has-text('Likelihood')").count() == 0
    page.get_by_role("button", name="Cancel", exact=True).click()
