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

    const panZoom = new Bowtie.PanZoomController(svgRoot, {
      x: 0, y: 0, w: Bowtie.BowtieModel.CANVAS_W, h: Bowtie.BowtieModel.CANVAS_H,
    });
    const minimap = new Bowtie.MinimapView(document.getElementById('minimap-container'), panZoom);

    const renderAll = () => {
      view.render(model, { showAnnotations: settings.showAnnotations });
      minimap.render(view.connectionsLayer, view.nodesLayer, view.getContentBounds());
    };
    rawModel.onChange(renderAll);

    const settings = new Bowtie.SettingsController(document.getElementById('btn-settings'), renderAll);

    new Bowtie.ToolbarController(model, {
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
    // pointermove, not once per gesture.
    new Bowtie.DragController(model, svgRoot, () => undo.snapshot());
    new Bowtie.ContextMenuController(model, svgRoot, () => settings.arrangeSpacing);
    new Bowtie.FocusController(model, svgRoot);
    new Bowtie.AutoArrangeController(
      model,
      svgRoot,
      document.getElementById('btn-auto-arrange'),
      () => panZoom.fitToBounds(view.getContentBounds()),
      () => settings.arrangeSpacing,
      () => settings.pullChainsCloser,
    );
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

    new Bowtie.IdentifierManagerController(model, document.getElementById('btn-manage-ids'));

    const EXPORT_BUTTON_IDS = ['btn-export-png', 'btn-export-svg', 'btn-export-json'];
    const warnings = new Bowtie.WarningsController(model, document.getElementById('btn-warnings'), EXPORT_BUTTON_IDS);

    renderAll();

    const TOOLBAR_BUTTON_IDS = [
      'btn-add-cause', 'btn-add-outcome', 'btn-auto-arrange', 'btn-reset-view', 'btn-manage-ids', 'btn-settings',
      'btn-export-png', 'btn-export-svg', 'btn-export-json', 'btn-import-json',
      'menu-trigger-file', 'menu-trigger-add', 'menu-trigger-view', 'menu-trigger-settings',
    ];
    // Undo/Redo are deliberately NOT in this list — they start disabled and
    // stay that way until there's actually something to undo/redo, managed
    // entirely by UndoController itself (the same pattern WarningsController
    // uses for its own badge, rather than the generic "enable everything"
    // sweep below).

    // Nothing is usable until the welcome flow (New or Import) completes.
    new Bowtie.WelcomeController(model, document.getElementById('import-file-input'), importExport, () => {
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
      // The welcome flow's own name/TLE/Hazard renames (or a completed
      // import) shouldn't leave anything undo-able back to a blank state.
      // Deferred a tick: this callback fires on the FIRST of the "Create"
      // step's three model changes (setName, then two renameElement calls)
      // — resetting synchronously here would run before the other two,
      // which would then repopulate the stack right after this clears it.
      setTimeout(() => undo.reset(), 0);
    });
  });
})(window.Bowtie = window.Bowtie || {});
