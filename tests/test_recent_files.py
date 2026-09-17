"""RecentFilesController (proposals/04): a returning user had to browse
for last week's file every time -- the start screen knew nothing. Where
the File System Access API exists, the handles of files opened or saved
natively are kept in IndexedDB (a FileSystemFileHandle is structured-
cloneable, so the entry re-opens THAT file rather than a name we could
never resolve) and listed under the Open zone.

The fakes here are classes, not object literals: structured clone copies
own data properties and drops the prototype, so an instance with only
`name` as an own property stores cleanly -- exactly like the real handle
-- while a literal carrying function properties would throw DataCloneError.
Which is also why `read()` is stubbed where a test needs a handle to come
back out of the database still usable.
"""
from conftest import INIT_SCRIPT, complete_new_bowtie_wizard

FAKE_HANDLE = """
  class FakeHandle {
    constructor(name) { this.name = name; }
    async createWritable() { return { write: async () => {}, close: async () => {} }; }
  }
  window.FakeHandle = FakeHandle;
"""


def _fresh_page(browser, base_url, init_extra=""):
    pg = browser.new_page(viewport={"width": 1600, "height": 1000})
    pg.errors = []
    pg.on("pageerror", lambda exc: pg.errors.append(str(exc)))
    pg.add_init_script(INIT_SCRIPT)
    if init_extra:
        pg.add_init_script(init_extra)
    pg.goto(f"{base_url}/index.html")
    return pg


def _started(browser, base_url, init_extra=""):
    pg = _fresh_page(browser, base_url, init_extra)
    complete_new_bowtie_wizard(pg)
    pg.wait_for_timeout(150)
    return pg


def _remember(pg, *names):
    pg.evaluate(
        """async (names) => {
          eval(window.__fakeHandleSrc);
          for (const name of names) await window.__lastRecentFiles.remember(new FakeHandle(name));
        }""",
        list(names),
    )


def _install_fake_handle(pg):
    pg.evaluate(f"() => {{ window.__fakeHandleSrc = {FAKE_HANDLE!r}; }}")


def test_remembering_a_file_lists_it_on_the_next_visit(browser, base_url):
    pg = _started(browser, base_url)
    try:
        _install_fake_handle(pg)
        _remember(pg, "overpressure.json")
        pg.reload()
        pg.wait_for_timeout(300)

        recent = pg.locator(".welcome-recent")
        assert recent.is_visible()
        assert recent.locator(".welcome-recent-label").text_content() == "Recently opened"
        item = recent.locator(".welcome-recent-item")
        assert item.count() == 1
        assert "overpressure.json" in item.first.text_content()
        assert "today" in item.first.locator(".welcome-recent-when").text_content()
    finally:
        assert pg.errors == []
        pg.close()


def test_the_same_file_twice_is_one_entry(browser, base_url):
    pg = _started(browser, base_url)
    try:
        _install_fake_handle(pg)
        _remember(pg, "overpressure.json", "overpressure.json", "other.json")
        assert pg.evaluate(
            "async () => (await window.__lastRecentFiles.list()).map((e) => e.name)"
        ) == ["other.json", "overpressure.json"], "most recent first, no duplicate"
    finally:
        assert pg.errors == []
        pg.close()


def test_at_most_five_are_kept(browser, base_url):
    """Older entries are pruned, not just hidden -- the store is never
    read beyond the newest five."""
    pg = _started(browser, base_url)
    try:
        _install_fake_handle(pg)
        _remember(pg, *[f"file{n}.json" for n in range(7)])
        names = pg.evaluate("async () => (await window.__lastRecentFiles.list()).map((e) => e.name)")
        assert len(names) == 5
        assert names[0] == "file6.json", "the newest survives"
        stored = pg.evaluate(
            """async () => new Promise((resolve) => {
              const req = indexedDB.open('bowtie-diagram');
              req.onsuccess = () => {
                const all = req.result.transaction('recent').objectStore('recent').getAll();
                all.onsuccess = () => { req.result.close(); resolve(all.result.length); };
              };
            })"""
        )
        assert stored == 5, "pruned, not merely unlisted"
    finally:
        assert pg.errors == []
        pg.close()


def test_an_export_through_the_native_dialog_remembers_the_file(browser, base_url):
    pg = _started(browser, base_url)
    try:
        pg.evaluate(
            """(src) => {
              eval(src);
              window.showSaveFilePicker = async () => new FakeHandle('saved-study.json');
            }""",
            FAKE_HANDLE,
        )
        pg.click("#menu-trigger-file")
        pg.click("#btn-export-json")
        pg.wait_for_timeout(300)
        assert pg.evaluate(
            "async () => (await window.__lastRecentFiles.list()).map((e) => e.name)"
        ) == ["saved-study.json"]
    finally:
        assert pg.errors == []
        pg.close()


def test_clicking_an_entry_loads_that_document(browser, base_url):
    pg = _started(browser, base_url)
    try:
        _install_fake_handle(pg)
        # A real document to "re-open": the current one, with a cause that
        # makes it recognisable once loaded.
        pg.evaluate("() => window.__lastUndo.model.addCause({x: 150, y: 200, name: 'Corrosion'})")
        doc = pg.evaluate("() => JSON.stringify(window.__lastModel.toJSON())")
        _remember(pg, "overpressure.json")
        pg.reload()
        pg.wait_for_timeout(300)

        # A handle that has been through IndexedDB comes back as plain
        # data -- only a real FileSystemFileHandle survives with its
        # methods -- so the read itself is stubbed.
        pg.evaluate("(text) => { window.__lastRecentFiles.read = async () => text; }", doc)
        pg.locator(".welcome-recent-item").first.click()
        pg.wait_for_timeout(400)

        assert pg.locator(".welcome-overlay").count() == 0
        assert pg.evaluate(
            "() => window.__lastModel.causes.map((c) => window.__lastModel.getNode(c.nodeId).name)"
        ) == ["Corrosion"]
    finally:
        assert pg.errors == []
        pg.close()


def test_an_entry_that_cannot_be_read_drops_out_of_the_list(browser, base_url):
    """Permission refused, or the file has been moved or deleted since."""
    pg = _started(browser, base_url)
    try:
        _install_fake_handle(pg)
        _remember(pg, "moved.json")
        pg.reload()
        pg.wait_for_timeout(300)
        assert pg.locator(".welcome-recent-item").count() == 1

        pg.locator(".welcome-recent-item").first.click()
        pg.wait_for_timeout(200)
        assert pg.locator(".welcome-recent-item").count() == 0
        assert pg.locator(".welcome-overlay").count() == 1, "still on the start screen"
    finally:
        assert pg.errors == []
        pg.close()


def test_without_the_file_system_access_api_there_is_no_list(browser, base_url):
    """Firefox, Safari, or a page opened over file://: nothing could be
    remembered but a name, and a name that cannot be re-opened is worse
    than no list at all."""
    pg = _started(browser, base_url, "delete window.showOpenFilePicker;")
    try:
        assert pg.evaluate("() => window.__lastRecentFiles.supported") is False
        assert pg.evaluate("async () => await window.__lastRecentFiles.list()") == []
        pg.reload()
        pg.wait_for_timeout(300)
        assert pg.locator(".welcome-recent").count() == 1, "the container exists"
        assert pg.locator(".welcome-recent-item").count() == 0
        assert pg.locator(".welcome-recent").is_hidden()
    finally:
        assert pg.errors == []
        pg.close()
