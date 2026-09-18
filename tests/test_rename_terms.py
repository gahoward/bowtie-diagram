"""The Threats/Consequences rename (proposals/11).

The bowtie method's own terms are *threat* and *consequence*; the app
said *cause* and *outcome* everywhere. The rename went through every
layer at once — labels, menus, model methods, CSS classes, the JSON
schema and the visible id prefixes — so what is worth testing is not the
mechanics of each layer but that the layers agree: the menu, the node
library, the ids on the canvas and the exported document all say the
same thing.

The id prefixes ROTATED: a Threat is `T_n`, and `C_n` moved from Cause
to Consequence. That rotation is why this needed a schema bump (v11) and
a migration — `test_migrations.py` covers the upgrade path itself.
"""


def _add_one_of_each(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addThreat({x: 150, y: 200, name: 'Corrosion'});
      m.addConsequence({x: 1200, y: 200, name: 'Release'});
    }""")
    page.wait_for_timeout(120)


def test_new_nodes_get_the_rotated_id_prefixes(page):
    _add_one_of_each(page)
    ids = page.evaluate("""() => {
      const m = window.__lastModel;
      return {
        threat: m.getNode(m.threats[0].nodeId).id,
        consequence: m.getNode(m.consequences[0].nodeId).id,
      };
    }""")
    assert ids["threat"] == "T_1", "a Threat is T_n"
    assert ids["consequence"] == "C_1", "C_ moved from Cause to Consequence"


def test_the_canvas_renders_them_under_the_new_class_names(page):
    _add_one_of_each(page)
    assert page.locator("#bowtie-canvas .node.threat").count() == 1
    assert page.locator("#bowtie-canvas .node.consequence").count() == 1
    assert page.locator("#bowtie-canvas .node.cause").count() == 0
    assert page.locator("#bowtie-canvas .node.outcome").count() == 0
    roles = page.evaluate(
        "() => [...new Set([...document.querySelectorAll('#connections-layer [data-role]')]"
        ".map((l) => l.getAttribute('data-role')))]"
    )
    assert not any("cause" in r or "outcome" in r for r in roles), roles


def test_the_add_menu_and_node_library_say_threats_and_consequences(page):
    page.click("#menu-trigger-add")
    labels = page.locator("#menu-dropdown-add .menu-dropdown-item").all_text_contents()
    assert "Add Threat" in labels
    assert "Add Consequence" in labels
    assert not any("Cause" in label or "Outcome" in label for label in labels)
    page.click("#btn-manage-ids")
    page.wait_for_timeout(120)
    tabs = page.locator(".modal-dialog .settings-tab, .modal-dialog .library-tab").all_text_contents()
    assert any("Threat" in t for t in tabs), tabs
    assert any("Consequence" in t for t in tabs), tabs
    page.get_by_role("button", name="Done", exact=True).click()


def test_the_exported_document_uses_the_new_keys(page):
    _add_one_of_each(page)
    doc = page.evaluate("() => window.__lastModel.toJSON()")
    assert doc["version"] == 11
    assert "threats" in doc and "consequences" in doc
    assert "causes" not in doc and "outcomes" not in doc
    assert sorted(doc["library"]) == [
        "consequence", "mitigativeBarrier", "preventativeBarrier", "threat",
    ]
    assert {line["originType"] for line in doc["lines"]} == {"threat", "consequence"}
    assert sorted(doc["idCounters"]) == sorted(
        ["page", "threat", "consequence", "preventativeBarrier", "mitigativeBarrier", "line", "placement"]
    )


def test_the_illustration_and_start_screen_use_the_new_words(browser, base_url):
    from conftest import INIT_SCRIPT

    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    pg.goto(f"{base_url}/index.html")
    try:
        text = pg.locator(".welcome-body").text_content()
        assert "Cause" not in text and "Outcome" not in text
        labels = pg.locator(".welcome-illustration svg text").all_text_contents()
        assert "THREATS" in labels and "CONSEQUENCES" in labels
    finally:
        assert pg.errors == []
        pg.close()


def test_no_user_facing_copy_still_says_cause_or_outcome(page):
    """A sweep of the live DOM rather than of the source: whatever the
    codemod missed in a template string would show up here."""
    _add_one_of_each(page)
    for menu in ["file", "add", "view", "settings"]:
        page.click(f"#menu-trigger-{menu}")
        text = page.locator(f"#menu-dropdown-{menu}").text_content()
        assert "Cause" not in text and "Outcome" not in text, f"{menu}: {text}"
    page.keyboard.press("Escape")
    toolbar = page.locator("#toolbar").text_content()
    assert "Cause" not in toolbar and "Outcome" not in toolbar
