(function (Bowtie) {
  document.addEventListener('DOMContentLoaded', () => {
    const svgRoot = document.getElementById('bowtie-canvas');
    const rawModel = new Bowtie.BowtieModel();
    const view = new Bowtie.CanvasView(svgRoot);

    // Every other controller (and the view, via `renderAll` below) is
    // constructed with `undo.model` — a Proxy around `rawModel` that
    // snapshots onto the undo stack immediately before any call to a
    // mutating BowtieModel method, so "add a barrier", "rename", "attach",
    // etc. each become one undo step with no changes needed at any of
    // their call sites. See UndoController.js for what it deliberately
    // does NOT auto-snapshot (dragging, import) and why.
    const undo = new Bowtie.UndoController(rawModel, {
      undoBtn: document.getElementById('btn-undo'),
      redoBtn: document.getElementById('btn-redo'),
    });
    const model = undo.model;
    window.__debugModel = model;

    // Owns which page is active and all page CRUD (add/rename/delete);
    // constructed with `model` (the undo-tracking Proxy), never `rawModel`
    // — see PageTabsController.js for why. Constructed early, before every
    // controller below that needs `pageScopedModel`.
    const pageTabs = new Bowtie.PageTabsController(model, document.getElementById('page-tabs'));
    // UndoController needs to know the active page to decide which per-page
    // stack undo()/redo() should compare against the document stack — but
    // PageTabsController itself has to be constructed with `undo.model`
    // (above), so this can't be a constructor argument without a circular
    // dependency. Bound here instead, right after pageTabs exists.
    // `pageTabs.onChange` also re-syncs the Undo/Redo buttons' enabled
    // state on every page switch, not just on the next mutation.
    undo.bindActivePage(() => pageTabs.getActivePageId(), (fn) => pageTabs.onChange(fn));

    // Gives every canvas-manipulation controller (and the view) a single
    // page's drawable content, shaped exactly like the old single-page
    // model, so their internals need no changes -- see PageScopedModel.js.
    const pageScopedModel = new Bowtie.PageScopedModel(model, () => pageTabs.getActivePageId());

    const panZoom = new Bowtie.PanZoomController(svgRoot, {
      x: 0, y: 0, w: Bowtie.BowtieModel.CANVAS_W, h: Bowtie.BowtieModel.CANVAS_H,
    });
    const minimap = new Bowtie.MinimapView(document.getElementById('minimap-container'), panZoom);

    const renderAll = () => {
      view.render(pageScopedModel, {
        showAnnotations: settings.showAnnotations,
        displayUnit: projectSettings.getDisplayUnit(),
      });
      minimap.render(view.connectionsLayer, view.nodesLayer, view.getContentBounds());
    };
    // Structural review finding 02: renderAll used to run synchronously off
    // every single _emitChange, which is exactly right for an ordinary
    // action (one mutation, one render) but not for a drag -- DragController
    // calls moveElement on every pointermove, so one drag gesture measured
    // at up to 11 full teardown-and-rebuild passes over both SVG layers.
    // Scoped to just that case (isDragging, set by DragController's start/
    // end callbacks below) rather than deferring every render generally:
    // ImportExportController's "loading modal stays up until the first page
    // has rendered" guarantee depends on loadDocument's _emitChange chain
    // rendering synchronously, and this leaves that path untouched.
    let isDragging = false;
    let dragRenderFrameId = null;
    rawModel.onChange(() => {
      if (!isDragging) {
        renderAll();
        return;
      }
      if (dragRenderFrameId !== null) return;
      dragRenderFrameId = requestAnimationFrame(() => {
        dragRenderFrameId = null;
        renderAll();
      });
    });
    // A page switch (or add/delete changing which page is active) re-renders
    // for the new active page, then re-fits the viewport to it — the same
    // call `btn-reset-view` already uses — since a different page's content
    // rarely shares the previous page's extent. Must run AFTER renderAll so
    // `view.getContentBounds()` reflects the page just switched to, not the
    // one just left.
    pageTabs.onChange(() => {
      renderAll();
      panZoom.fitToBounds(view.getContentBounds());
    });

    const settings = new Bowtie.SettingsController(document.getElementById('btn-settings'), renderAll);
    // Constructed here (before renderAll's first real call, and before
    // ContextMenuController below needs its getDisplayUnit) even though the
    // toolbar button it's wired to lives further down the settings
    // dropdown — see the `settings`/`projectSettings` closure-over-a-later-
    // const pattern already used for AutoArrangeController's
    // arrangeSpacing/pullChainsCloser callbacks below.
    const projectSettings = new Bowtie.ProjectSettingsController(
      model, document.getElementById('btn-project-settings'), renderAll,
      document.getElementById('import-risk-matrix-input'),
    );

    new Bowtie.ToolbarController(pageScopedModel, {
      addCauseBtn: document.getElementById('btn-add-cause'),
      addOutcomeBtn: document.getElementById('btn-add-outcome'),
      nameEl: document.getElementById('bowtie-name'),
    });

    // File/Add/View/Settings dropdowns (toolbar.md) — the buttons inside
    // each dropdown are the very same elements every controller above/below
    // already wires up by id; this only toggles which dropdown is open.
    new Bowtie.MenuBarController([
      { triggerId: 'menu-trigger-file', dropdownId: 'menu-dropdown-file' },
      { triggerId: 'menu-trigger-add', dropdownId: 'menu-dropdown-add' },
      { triggerId: 'menu-trigger-view', dropdownId: 'menu-dropdown-view' },
      { triggerId: 'menu-trigger-settings', dropdownId: 'menu-dropdown-settings' },
    ]);

    // `undo.snapshot` fires once per drag gesture (on pointerdown) — see
    // UndoController.js: `moveElement` itself is excluded from its generic
    // per-method-call snapshot hook, since it's called on every
    // pointermove, not once per gesture. Scoped to whichever page is
    // active at that moment — DragController (wired through
    // PageScopedModel) can only ever be dragging an element on that page.
    new Bowtie.DragController(
      pageScopedModel,
      svgRoot,
      () => {
        isDragging = true;
        undo.snapshot(pageTabs.getActivePageId());
      },
      () => {
        isDragging = false;
        if (dragRenderFrameId !== null) {
          cancelAnimationFrame(dragRenderFrameId);
          dragRenderFrameId = null;
        }
        renderAll();
      },
    );
    // Constructed ahead of ContextMenuController so its arrange() can be
    // handed in as the "topology just changed, tidy up" callback below —
    // reorder/attach actions move a barrier's depth without repositioning
    // anything, which used to leave stale x/y around until the user
    // remembered to click Auto-arrange themselves.
    const autoArrange = new Bowtie.AutoArrangeController(
      pageScopedModel,
      svgRoot,
      document.getElementById('btn-auto-arrange'),
      () => panZoom.fitToBounds(view.getContentBounds()),
      () => settings.arrangeSpacing,
      () => settings.pullChainsCloser,
    );
    new Bowtie.ContextMenuController(
      pageScopedModel, svgRoot, () => autoArrange.arrange(), () => projectSettings.getDisplayUnit(),
      // `nodeLibrary` is constructed further down (design review finding
      // 04's "Delete from Library…" item needs it) -- same closure-over-a-
      // later-const pattern as `settings`/`projectSettings` above.
      (nodeId) => nodeLibrary.openForNode(nodeId),
    );
    new Bowtie.FocusController(pageScopedModel, svgRoot);
    const importExport = new Bowtie.ImportExportController(
      model,
      svgRoot,
      () => view.getContentBounds(),
      {
        exportPngBtn: document.getElementById('btn-export-png'),
        exportSvgBtn: document.getElementById('btn-export-svg'),
        exportJsonBtn: document.getElementById('btn-export-json'),
        importJsonBtn: document.getElementById('btn-import-json'),
        importFileInput: document.getElementById('import-file-input'),
      },
      () => undo.reset(), // importing a file resets both the undo and redo history
    );

    document.getElementById('btn-reset-view').addEventListener('click', () => {
      panZoom.fitToBounds(view.getContentBounds());
    });

    const nodeLibrary = new Bowtie.NodeLibraryController(model, document.getElementById('btn-manage-ids'));

    const EXPORT_BUTTON_IDS = ['btn-export-png', 'btn-export-svg', 'btn-export-json'];
    const warnings = new Bowtie.WarningsController(model, document.getElementById('btn-warnings'), EXPORT_BUTTON_IDS);

    renderAll();

    const TOOLBAR_BUTTON_IDS = [
      'btn-add-cause', 'btn-add-outcome', 'btn-auto-arrange', 'btn-reset-view', 'btn-manage-ids', 'btn-settings',
      'btn-project-settings', 'btn-export-png', 'btn-export-svg', 'btn-export-json', 'btn-import-json',
      'menu-trigger-file', 'menu-trigger-add', 'menu-trigger-view', 'menu-trigger-settings',
    ];
    // Undo/Redo are deliberately NOT in this list — they start disabled and
    // stay that way until there's actually something to undo/redo, managed
    // entirely by UndoController itself (the same pattern WarningsController
    // uses for its own badge, rather than the generic "enable everything"
    // sweep below).

    // Nothing is usable until the welcome flow (New or Import) completes.
    new Bowtie.WelcomeController(model, document.getElementById('import-file-input'), importExport, () => {
      // Design review finding 05 -- the toolbar/canvas/minimap were fully
      // painted (just non-interactive) behind the welcome modal until now.
      document.getElementById('app').classList.remove('pre-welcome');
      TOOLBAR_BUTTON_IDS.forEach((id) => { document.getElementById(id).disabled = false; });
      // Warnings (e.g. an imported diagram with orphans) must re-block
      // export even though the loop above just unconditionally enabled it.
      warnings.refresh();
      // A fresh "New" bowtie is just a TLE+Hazard — keep the roomy default
      // view so the first Cause/Outcome (placed at a fixed default position)
      // doesn't land outside a tightly-fitted viewport. An imported diagram
      // has real content, so fitting to it is the right call.
      const hasContent = model.causes.length > 0 || model.outcomes.length > 0
        || model.preventativeBarriers.length > 0 || model.mitigativeBarriers.length > 0;
      if (hasContent) panZoom.fitToBounds(view.getContentBounds());
      // The welcome flow's own name/page/TLE/Hazard renames (or a completed
      // import) shouldn't leave anything undo-able back to a blank state.
      // Deferred a tick: this callback fires on the FIRST of the "Create"
      // step's four model changes (setName, renamePage, then two
      // renameElement calls) — resetting synchronously here would run
      // before the rest, which would then repopulate the stack right after
      // this clears it.
      setTimeout(() => undo.reset(), 0);
    });
  });
})(window.Bowtie = window.Bowtie || {});
