"""UI-level coverage for the shared Properties modal (js/view/
PropertiesModal.js), reached via double-click or the context menu's
"Properties" item on any of the 5 node types (Cause/Outcome/Preventative
Barrier/Mitigative Barrier/TLE/Hazard). Driven through the real modal, not
by calling model methods directly -- an earlier regression
(PageScopedModel had no `renameNode` passthrough, so every save from this
modal threw "this.model.renameNode is not a function") went completely
undetected by the rest of the suite, because every quantitative-mode model
test drives window.__lastModel/window.__lastUndo directly and never
exercises ContextMenuController's own modal at all.

Supersedes the old test_risk_fields_ui.py (same risk-field coverage, now
alongside Identity/Computed section coverage in one file).
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


def _double_click_center(page, locator):
    box = locator.bounding_box()
    page.mouse.dblclick(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


def _open_properties_modal(page, node_selector):
    _right_click_center(page, page.locator(node_selector).first)
    page.wait_for_timeout(80)
    page.locator(".context-menu-item", has_text="Properties").click()
    page.wait_for_timeout(80)


# --- Identity section (name/description/identifier), all 5 node types -----

def test_double_click_opens_properties_modal(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)
    # MinimapView clones the whole live #nodes-layer <g> -- id and all --
    # into #minimap-container, so a bare ".node.cause" selector matches
    # both copies, and even "#nodes-layer .node.cause" matches both (the
    # clone keeps the same id too) -- see test_multi_page.py's
    # `_node_count`. `.first` picks the real, on-canvas one.
    _double_click_center(page, page.locator(".node.cause").first)
    page.wait_for_timeout(80)
    assert page.locator(".modal-overlay").count() == 1
    assert "Cause" in page.locator(".modal-title").text_content()
    page.get_by_role("button", name="Cancel", exact=True).click()


def test_properties_modal_saves_name_and_description_for_a_cause(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.cause")
    page.locator(".modal-section:has-text('Identity') input[type=text]").fill("Loss of Containment")
    page.locator(".modal-section:has-text('Identity') textarea").fill("A description of the cause.")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0
    node = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId);
    }""")
    assert node["name"] == "Loss of Containment"
    assert node["description"] == "A description of the cause."


def test_properties_modal_saves_name_and_description_for_the_tle(page):
    _open_properties_modal(page, ".node.top-level-event")
    page.locator(".modal-section:has-text('Identity') input[type=text]").fill("Major Release")
    page.locator(".modal-section:has-text('Identity') textarea").fill("The top-level event.")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    tle = page.evaluate("() => window.__lastModel.topLevelEvent")
    assert tle["name"] == "Major Release"
    assert tle["description"] == "The top-level event."


def test_properties_modal_saves_name_and_description_for_the_hazard(page):
    _open_properties_modal(page, ".node.hazard")
    page.locator(".modal-section:has-text('Identity') input[type=text]").fill("Flammable Gas")
    page.locator(".modal-section:has-text('Identity') textarea").fill("The hazard description.")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    hazard = page.evaluate("() => window.__lastModel.hazard")
    assert hazard["name"] == "Flammable Gas"
    assert hazard["description"] == "The hazard description."


def test_properties_modal_saves_barrier_name_and_description(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      const cause = m.addCause({x: 150, y: 200});
      m.addPreventativeControl(cause.id);
    }""")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.preventative-barrier")
    page.locator(".modal-section:has-text('Identity') input[type=text]").fill("Isolation Valve")
    page.locator(".modal-section:has-text('Identity') textarea").fill("Auto-closes on high pressure.")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    node = page.evaluate("""() => {
      const pb = window.__lastModel.preventativeBarriers[0];
      return window.__lastModel.getNode(pb.nodeId);
    }""")
    assert node["name"] == "Isolation Valve"
    assert node["description"] == "Auto-closes on high pressure."


def test_properties_modal_cancel_discards_changes(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)
    original_name = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).name;
    }""")

    _open_properties_modal(page, ".node.cause")
    page.locator(".modal-section:has-text('Identity') input[type=text]").fill("Should Not Save")
    page.get_by_role("button", name="Cancel", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0
    current_name = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).name;
    }""")
    assert current_name == original_name


def test_properties_modal_blank_name_shows_error_and_does_not_close(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.cause")
    page.locator(".modal-section:has-text('Identity') input[type=text]").fill("   ")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 1, "a blank name must not close the modal"
    assert page.locator(".modal-field-error").text_content() != ""


def test_properties_modal_shows_identifier_field_only_in_custom_mode(page):
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.cause")
    assert page.locator(".modal-field:has-text('Identifier')").count() == 0
    page.get_by_role("button", name="Cancel", exact=True).click()

    page.evaluate("() => window.__lastModel.setIdentifierDisplayMode('custom')")
    page.wait_for_timeout(80)
    _open_properties_modal(page, ".node.cause")
    assert page.locator(".modal-field:has-text('Identifier')").count() == 1
    page.locator(".modal-field:has-text('Identifier') input[type=text]").fill("LOC-1")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    identifier = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).identifier;
    }""")
    assert identifier == "LOC-1"


# --- Risk Analysis section (RiskFieldsForm.js) -----------------------------

def test_properties_modal_saves_outcome_severity_class_in_quantitative_mode(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addOutcome({x: 1200, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.outcome")
    page.locator(".modal-field:has-text('Severity') select").select_option("major")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0, "Save must close the modal, not silently fail"
    severity = page.evaluate("""() => {
      const o = window.__lastModel.outcomes[0];
      return window.__lastModel.getNode(o.nodeId).severityClassId;
    }""")
    assert severity == "major"


def test_properties_modal_saves_outcome_likelihood_class_in_qualitative_mode(page):
    _set_qualitative_mode(page)
    page.evaluate("() => { window.__lastModel.addOutcome({x: 1200, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.outcome")
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


def test_properties_modal_saves_cause_frequency_in_quantitative_mode(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.cause")
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


def test_properties_modal_saves_barrier_risk_reduction_factor_in_quantitative_mode(page):
    _set_quantitative_mode(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const cause = m.addCause({x: 150, y: 200});
      m.addPreventativeControl(cause.id);
    }""")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.preventative-barrier")
    page.locator(".modal-field:has-text('Risk Reduction Factor') input[type=checkbox]").uncheck()
    page.locator(".modal-field:has-text('Risk Reduction Factor') input[type=text]").fill("20")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 0
    rrf = page.evaluate("""() => {
      const pb = window.__lastModel.preventativeBarriers[0];
      return window.__lastModel.getNode(pb.nodeId).riskReductionFactor;
    }""")
    assert rrf == {"value": "20"}


def test_properties_modal_marking_frequency_unknown_saves_unknown_quantity(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.cause")
    page.locator(".modal-field:has-text('Frequency') input[type=checkbox]").check()
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    frequency = page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).frequency;
    }""")
    assert frequency == {"unknown": True}


def test_properties_modal_shows_no_risk_fields_or_computed_section_in_simple_mode(page):
    # Default mode -- the wizard-created page fixture starts in Simple mode.
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.cause")
    assert page.locator(".modal-field:has-text('Frequency')").count() == 0
    assert page.locator(".modal-field:has-text('Likelihood')").count() == 0
    assert page.locator(".modal-section:has-text('Computed')").count() == 0
    page.get_by_role("button", name="Cancel", exact=True).click()


# --- Computed section (read-only, Outcome and TLE) -------------------------

def _setup_computable_quantitative_scenario(page):
    """One cause with a known frequency feeding a single Outcome with a
    severity picked -- both the TLE's and the Outcome's computed likelihood
    become determinable."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c = m.addCause({x: 150, y: 200});
      m.renameNode(c.nodeId, { name: 'C1', frequency: { value: '1E-3' } });
      const o = m.addOutcome({x: 1200, y: 200});
      m.renameNode(o.nodeId, { name: 'O1', severityClassId: m.riskMatrix.severityClasses[3].id });
    }""")
    page.wait_for_timeout(100)


def test_properties_modal_shows_computed_likelihood_for_the_tle(page):
    _setup_computable_quantitative_scenario(page)
    _open_properties_modal(page, ".node.top-level-event")

    computed = page.locator(".modal-section:has-text('Computed')")
    assert computed.count() == 1
    text = computed.text_content()
    assert "0.001" in text
    assert "residual" in text.lower()
    assert "inherent" in text.lower()


def test_properties_modal_shows_risk_class_and_computed_likelihood_for_an_outcome(page):
    _setup_computable_quantitative_scenario(page)
    _open_properties_modal(page, ".node.outcome")

    computed = page.locator(".modal-section:has-text('Computed')")
    assert computed.count() == 1
    text = computed.text_content()
    assert "Risk class" in text
    assert "0.001" in text
    assert page.locator(".modal-risk-chip").count() == 1


def test_properties_modal_shows_excluded_threat_count_note(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.setMode('quantitative');
      m.setRiskMatrix(JSON.parse(JSON.stringify(Bowtie.RISK_MATRIX_PRESETS.leaflet5)));
      const c1 = m.addCause({x: 150, y: 200});
      m.renameNode(c1.nodeId, { name: 'Known', frequency: { value: '1E-3' } });
      const c2 = m.addCause({x: 150, y: 400});
      m.renameNode(c2.nodeId, { name: 'Unknown', frequency: { unknown: true } });
    }""")
    page.wait_for_timeout(100)

    _open_properties_modal(page, ".node.top-level-event")
    computed = page.locator(".modal-section:has-text('Computed')")
    assert "excluded" in computed.text_content().lower()


def test_properties_modal_shows_no_computed_section_for_outcome_without_severity(page):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addOutcome({x: 1200, y: 200}); }")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.outcome")
    assert page.locator(".modal-section:has-text('Computed')").count() == 0


# --- Quantitative input validation ----------------------------------------
#
# Before this, unparseable text was stored verbatim and the calculation then
# treated it as Unknown -- silently EXCLUDING that threat from the top-event
# max while the field still displayed what the user typed. Each case below
# must keep the dialog open, explain itself, and leave the model untouched.

def _cause_frequency(page):
    return page.evaluate("""() => {
      const c = window.__lastModel.causes[0];
      return window.__lastModel.getNode(c.nodeId).frequency;
    }""")


def _try_saving_frequency(page, text):
    _set_quantitative_mode(page)
    page.evaluate("() => { window.__lastModel.addCause({x: 150, y: 200}); }")
    page.wait_for_timeout(80)
    _open_properties_modal(page, ".node.cause")
    page.locator(".modal-field:has-text('Frequency') input[type=checkbox]").uncheck()
    page.locator(".modal-field:has-text('Frequency') input[type=text]").fill(text)
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)


def test_frequency_rejects_text_that_is_not_a_number(page):
    _try_saving_frequency(page, "not-a-number")
    assert page.locator(".modal-overlay").count() == 1, "must not close on invalid input"
    assert "must be a number" in page.locator(".modal-field-error").text_content()
    assert _cause_frequency(page) is None, "nothing may be stored"


def test_frequency_rejects_a_negative_value(page):
    _try_saving_frequency(page, "-1")
    assert page.locator(".modal-overlay").count() == 1
    assert "greater than 0" in page.locator(".modal-field-error").text_content()
    assert _cause_frequency(page) is None


def test_frequency_rejects_zero(page):
    _try_saving_frequency(page, "0")
    assert page.locator(".modal-overlay").count() == 1
    assert _cause_frequency(page) is None


def test_frequency_rejects_an_empty_box_rather_than_guessing(page):
    _try_saving_frequency(page, "")
    assert page.locator(".modal-overlay").count() == 1
    assert "Unknown" in page.locator(".modal-field-error").text_content(), \
        "the message should point at the Unknown checkbox as the deliberate choice"
    assert _cause_frequency(page) is None


def test_frequency_accepts_a_valid_value(page):
    _try_saving_frequency(page, "1E-4")
    assert page.locator(".modal-overlay").count() == 0
    assert _cause_frequency(page) == {"value": "1E-4"}


def test_risk_reduction_factor_rejects_a_value_below_one(page):
    """RRF is 1/PFD, so a value below 1 would multiply the risk up rather
    than reduce it -- the exact mistake the old '< 1' label invited."""
    _set_quantitative_mode(page)
    page.evaluate("""() => {
      const m = window.__lastModel;
      const cause = m.addCause({x: 150, y: 200});
      m.addPreventativeControl(cause.id);
    }""")
    page.wait_for_timeout(80)

    _open_properties_modal(page, ".node.preventative-barrier")
    page.locator(".modal-field:has-text('Risk Reduction Factor') input[type=checkbox]").uncheck()
    page.locator(".modal-field:has-text('Risk Reduction Factor') input[type=text]").fill("0.1")
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(80)

    assert page.locator(".modal-overlay").count() == 1
    assert "1 or greater" in page.locator(".modal-field-error").text_content()
    stored = page.evaluate("""() => {
      const pb = window.__lastModel.preventativeBarriers[0];
      return window.__lastModel.getNode(pb.nodeId).riskReductionFactor;
    }""")
    assert stored is None
