# Tests

A checked-in Playwright/pytest suite covering the model's splice/attach/
truncate primitives and the UI flows that drive them. This replaces the
project's previous practice of writing a throwaway script per change and
discarding it — several real bugs (barrier placement direction, the
outcome-side truncate direction, line-scoped attach) were only caught
because a test happened to cover that exact case; this is what makes that
coverage survive between sessions instead of needing to be re-derived and
re-tested from memory every time.

## Setup

```
pip install -r tests/requirements.txt
playwright install chromium
```

## Running

From the project root:

```
pytest tests/
```

No dev server needs to be started by hand — `conftest.py` spins up a
`ThreadingHTTPServer` on an ephemeral port serving the project root for the
duration of the session, and tears it down afterwards. There is no build
step for the app itself, so tests run directly against `index.html` as-is.

## How it's structured

- **`conftest.py`** — the `page` fixture launches a fresh browser tab per
  test, already through the "New Bowtie" welcome flow. It also injects a
  small `Proxy` around `window.Bowtie` (see `INIT_SCRIPT`) that wraps
  `BowtieModel`/`CanvasView` the moment `main.js` constructs one, stashing
  the instance on `window.__lastModel` / `window.__lastView` — this is how
  tests reach into live model/view state without the app needing to expose
  either itself.
- **`helpers.py`** — click-targeting helpers. A Line renders as at most two
  `<line>` elements with no DOM element per gap between barriers, so "click
  the segment between these two barriers" or "click the diagonal bend into
  the TLE" has to be computed from real SVG coordinates via the canvas's own
  `getScreenCTM()`, not guessed from a DOM bounding box (which can include
  space a taller barrier's own box occupies on top of the line).
- **`test_model_splicing.py`** — the highest-value file: BowtieModel's
  insert/attach/truncate primitives, exercised directly via
  `window.__lastModel`, no UI clicking involved. Fast and immune to
  rendering changes. Also covers `nudgeBarrierColumn` (shared_barrier_
  column_collision_fix.md §3's manual per-barrier column shunt): moves a
  Preventative/Mitigative Barrier by exactly `colSpacing` in the
  kind-appropriate direction, and is undoable.
- **`test_barrier_placement.py`**, **`test_rendering.py`**,
  **`test_autoarrange.py`**, **`test_focus_hover.py`**,
  **`test_attach_and_truncate_ui.py`** — UI-driven coverage of the same
  behaviors reached through real right-clicks, hovers, and context menus.
  `test_autoarrange.py` also covers a long, realistically-wrapping Cause
  name not overlapping its sibling row (an architecture review finding —
  see `DESIGN_NOTES.md`'s `LEAF_ROW_MARGIN` entry), and a barrier shared by
  two chains with different remaining lengths to the TLE landing in its
  own column instead of colliding with the barrier that makes it longer
  (shared_barrier_column_collision_fix.md §1-2). `test_barrier_placement.py`
  also covers the "Shift Toward/Away From TLE" context-menu items
  (shared_barrier_column_collision_fix.md §3) moving an isolated barrier by
  one column in the correct, kind-mirrored direction.
- **`test_undo_redo.py`**, **`test_drag_ordering.py`** — snapshot-based
  undo/redo (stack capping, phantom-step avoidance on a failed mutation,
  one-undo-step-per-drag-gesture) and `DragController`'s ordering/overlap
  clamps. `test_undo_redo.py` also covers a plain inspection click (no
  movement) leaving undo/redo history completely untouched — a real,
  previously-uncaught bug an architecture review found (see
  `DESIGN_NOTES.md`'s `DRAG_THRESHOLD_PX` entry).
- **`test_import_export.py`** — schema v6 round-trip and the
  version-mismatch guard (there is no migration path for older schema
  versions; an incompatible file is rejected outright).
- **`test_file_handlers.py`** — import/export preferring the native File
  System Access API (`showSaveFilePicker`/`showOpenFilePicker`) with a
  fallback to the legacy download-link/hidden-`<input>` path wherever that
  API doesn't exist. A real native OS file dialog can't be driven from an
  automated test at all, so the "native path" tests mock the two entry
  points with an in-page fake instead of actually opening one; the
  "fallback path" tests delete those globals so the legacy behaviour runs
  deterministically. Also covers `exportPng`'s null-blob guard (an
  oversized canvas — plausible given auto-arrange's unbounded layout —
  makes `canvas.toBlob` hand back `null` instead of throwing).
- **`test_toolbar_menus.py`** — the File/Add/View/Settings dropdown menus
  and the empty-canvas/TLE context menu (Add Cause/Add Outcome reachable
  from anywhere on the diagram, not just an existing Cause/Outcome node).
  Also covers the bowtie-name button staying centered on the whole toolbar
  regardless of how unequal the left/right side groups' widths are (a real
  bug — `#toolbar`'s grid columns must be `1fr auto 1fr`, not `auto 1fr
  auto`; see `DESIGN_NOTES.md`'s `MenuBarController.js` entry), and the
  wishlist fix where choosing "Add Cause"/"Add Outcome" from a right-click
  on the WRONG side of the TLE falls back to the toolbar's own default
  placement instead of landing on the wrong side.
- **`test_welcome.py`** — the first-load welcome modal's three side-by-side
  ways to start (New Bowtie Wizard / Upload a .json file / drag-and-drop),
  driven directly via the `browser`/`base_url` fixtures rather than `page`
  (which already drives past this modal). Confirms the drop zone reuses the
  same validated import path as the upload button (via a synthesized
  `change` event on the shared hidden `<input>`), not a second one. Also
  covers the "Load Demo" button (stacked in the wizard column, not a fourth
  column) and its Ctrl+Alt+D shortcut (demo_json_proposal.md) — including
  that the shortcut does nothing once the modal has closed, and that
  loading the demo routes through `ImportExportController.loadDocument`'s
  same shape/version validation a real import gets (a deliberately staled
  `Bowtie.DEMO_DATA.version` must fail the same "Unsupported File Version"
  dialog, not silently load).
- **`test_auto_arrange_fix.py`** — auto-arrange-fix.md's two fixes: §4 (a
  bare, zero-stop Cause/Outcome's line must never cross an unrelated
  barrier's box — geometry-sampled in both Loose and Tight mode, plus a
  dedicated Hazard-clearance check for the bare-line case specifically) and
  §7 (the opt-in "pull causes/outcomes closer to their first real stop"
  Settings toggle — off-by-default parity with pre-toggle behavior, the
  forced-deep and fully-bare repositioning cases, that no barrier or
  y-position ever moves, and the Outcome-side mirror).
- **`test_dist_smoke.py`** — the release-time smoke test (deployment
  proposal §5): points a page at `dist/bowtie-diagram.html` via `file://`
  (not the HTTP server every other test uses) and re-runs a small slice of
  the suite against it — no leftover external `<script src>`/`<link>`
  references, a full create/chain/auto-arrange/export/reimport round trip,
  and loading the demo. Skipped automatically when `dist/` hasn't been
  built (`npm run build`), since that's a deliberate publish-time step, not
  part of the normal edit/test loop. Reuses `conftest.py`'s session-scoped
  `browser` fixture rather than starting a second `sync_playwright()` —
  Playwright's sync API only tolerates one live manager per process.
- **`test_minimap.py`** — the viewport-overlay rectangle reflecting the
  TRUE visible area (`PanZoomController.getVisibleRect()`), not the raw
  stored `viewBox`, which can understate it by several times over once SVG
  letterboxing is involved (see `DESIGN_NOTES.md`'s `MinimapView.js` entry).
  Also covers a second, previously-uncaught cause of the same symptom: the
  rectangle going stale after a plain window resize with no pan/zoom in
  between, since nothing was watching the SVG element's own rendered size —
  fixed via a `ResizeObserver` in `PanZoomController.js`.
- **`test_tight_spacing.py`** — Settings' Loose/Tight auto-arrange spacing:
  tight mode measurably closer columns, still no horizontal label overlap,
  still clears the Hazard (a real bug caught live — see `DESIGN_NOTES.md`'s
  Auto-arrange horizontal-spacing section), and the per-side-depth fix
  (a shallower side no longer padded out to match a deeper one).

## Adding a test

Prefer driving `window.__lastModel` directly (see `test_model_splicing.py`)
when what you're testing is model *behavior* — it's faster and doesn't
depend on click-targeting math. Reach for the UI-driven style only when
what you're actually testing is the UI itself: which menu item appears,
where a click lands, what gets hovered.

**Scope any `.node`/`.connection` selector to `#bowtie-canvas`.** The
minimap (`MinimapView.js`) renders by cloning the main canvas's own
nodes/connections layers wholesale, for visual fidelity — so it carries the
exact same classes AND `data-id` attributes as the real thing, just scaled
down. An unscoped `page.locator('.node.cause')`-style selector (or
`[data-id="PB_1"]`) now matches both the real node and its minimap clone,
which Playwright's default strict mode rejects as ambiguous. Always write
`#bowtie-canvas .node...` (see `_drag_node_to` in `test_drag_ordering.py`
for the pattern) rather than a bare selector.
