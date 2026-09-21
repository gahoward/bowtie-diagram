"""bugs.md: hovering a Line felt continuous through its flat run but the
bend into the TLE was "considered separately" — a Line renders as up to two
<line> elements sharing one data-line-id, and plain CSS :hover only bolds
whichever single element the pointer is actually over. FocusController now
toggles a `.hovered` class across every element sharing that id.

Also covers a real regression: FocusController._apply built its "related"
node sets from Line.originId/.stops (internal, never-rendered PLACEMENT
ids) and compared them directly against each node's `data-id` DOM
attribute, which node_library_proposal.md's "Two id spaces" rework made
the visible NODE id instead — so a placement id could never match, and
clicking a Threat/Consequence dimmed EVERY barrier on its own side, including
the one actually on its path. FocusController.js was never updated for
that rework (git history: untouched since the initial commit) even
though ShapeRenderer/PageScopedModel's own `data-id` comments already
documented the new scheme.
"""


def test_hovering_one_segment_marks_every_segment_of_the_same_line(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200});
      m.addPreventativeControl(m.threats[0].id);
      m.addPreventativeControl(m.threats[0].id);
    }""")
    page.wait_for_timeout(150)

    flat = page.locator('[data-role="threat-line"]').nth(0)
    bend = page.locator('[data-role="threat-line"]').nth(1)
    box = flat.bounding_box()
    # Near the start of the flat run, clear of any barrier's own box.
    page.mouse.move(box["x"] + 5, box["y"] + box["height"] / 2)
    page.wait_for_timeout(60)

    assert "hovered" in (flat.get_attribute("class") or "")
    assert "hovered" in (bend.get_attribute("class") or "")

    page.mouse.move(50, 900)
    page.wait_for_timeout(60)
    assert "hovered" not in (flat.get_attribute("class") or "")
    assert "hovered" not in (bend.get_attribute("class") or "")


def test_hovering_one_segment_marks_every_segment_consequence_side(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addConsequence({x: 1200, y: 200});
      m.addMitigativeControl(m.consequences[0].id);
      m.addMitigativeControl(m.consequences[0].id);
    }""")
    page.wait_for_timeout(150)

    segs = page.locator('[data-role="consequence-line"]')
    bend, flat = segs.nth(0), segs.nth(1)  # bend (TLE-ward) rendered first, flat (to-consequence) second
    box = flat.bounding_box()
    # Near the consequence end of the flat run, clear of any barrier's own box.
    page.mouse.move(box["x"] + box["width"] - 5, box["y"] + box["height"] / 2)
    page.wait_for_timeout(60)

    assert "hovered" in (flat.get_attribute("class") or "")
    assert "hovered" in (bend.get_attribute("class") or "")


# --- Click-focus dimming: the Threat/Consequence AND every barrier on its own
# Line's path must stay un-dimmed; everything else on that side dims. -------

def test_clicking_a_threat_keeps_it_and_its_own_barrier_undimmed(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200});
      m.addPreventativeControl(m.threats[0].id);
      m.addThreat({x: 150, y: 400});
      m.addPreventativeControl(m.threats[1].id);
    }""")
    page.wait_for_timeout(150)

    threats = page.locator("#bowtie-canvas .node.threat")
    barriers = page.locator("#bowtie-canvas .node.preventative-barrier")
    threats.nth(0).click()
    page.wait_for_timeout(80)

    assert "dimmed" not in (threats.nth(0).get_attribute("class") or "")
    assert "dimmed" not in (barriers.nth(0).get_attribute("class") or "")
    assert "dimmed" in (threats.nth(1).get_attribute("class") or "")
    assert "dimmed" in (barriers.nth(1).get_attribute("class") or "")


def test_clicking_an_consequence_keeps_it_and_its_own_barrier_undimmed(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addConsequence({x: 1200, y: 200});
      m.addMitigativeControl(m.consequences[0].id);
      m.addConsequence({x: 1200, y: 400});
      m.addMitigativeControl(m.consequences[1].id);
    }""")
    page.wait_for_timeout(150)

    consequences = page.locator("#bowtie-canvas .node.consequence")
    barriers = page.locator("#bowtie-canvas .node.mitigative-barrier")
    consequences.nth(0).click()
    page.wait_for_timeout(80)

    assert "dimmed" not in (consequences.nth(0).get_attribute("class") or "")
    assert "dimmed" not in (barriers.nth(0).get_attribute("class") or "")
    assert "dimmed" in (consequences.nth(1).get_attribute("class") or "")
    assert "dimmed" in (barriers.nth(1).get_attribute("class") or "")


def test_clicking_empty_canvas_clears_focus(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200});
      m.addPreventativeControl(m.threats[0].id);
      m.addThreat({x: 150, y: 400});
    }""")
    page.wait_for_timeout(150)

    threats = page.locator("#bowtie-canvas .node.threat")
    threats.nth(0).click()
    page.wait_for_timeout(80)
    assert "dimmed" in (threats.nth(1).get_attribute("class") or "")

    page.locator("#bowtie-canvas").click(position={"x": 5, "y": 5})
    page.wait_for_timeout(80)
    assert "dimmed" not in (threats.nth(1).get_attribute("class") or "")
