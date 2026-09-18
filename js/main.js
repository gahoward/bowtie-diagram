(function (Bowtie) {
  document.addEventListener('DOMContentLoaded', () => {
    const svgRoot = document.getElementById('bowtie-canvas');
    const rawModel = new Bowtie.BowtieModel();
    const view = new Bowtie.CanvasView(svgRoot);

    // Constructed on the raw model (not the undo-tracking proxy below) so
    // it sees every mutation regardless of which layer made it — undo/redo
    // included, since those are still changes since the document was last
    // saved.
    const unsavedChanges = new Bowtie.UnsavedChangesController(rawModel);

    // Crash insurance (proposals/04): while the document is dirty, the
    // last `toJSON()` is kept in localStorage on a debounce, and the
    // start screen offers it back. Constructed on `rawModel` for the same
    // reason as the guard above -- every mutation, whichever layer made
    // it. A recovered document is dirty again: it still isn't on disk.
    // Two loads leave the document deliberately dirty -- recovering a
    // snapshot, and opening a file that had to be upgraded (proposals/12)
    // -- because neither is what is on disk. Both can happen from the
    // welcome screen, whose own "a fresh document starts clean" deferral
    // runs LAST, so it has to know not to clear a guard they just put up.
    let loadedWorkNotOnDisk = false;
    const markNotOnDisk = () => {
      loadedWorkNotOnDisk = true;
      unsavedChanges.markDirty();
    };
    const recovery = new Bowtie.RecoveryController(rawModel, {
      isDirty: () => unsavedChanges.dirty,
      onRecovered: markNotOnDisk,
    });
    // Where the File System Access API exists, the handles of files
    // opened or saved natively, so the start screen can re-open them.
    const recentFiles = new Bowtie.RecentFilesController();

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

    // The render options the live canvas uses -- shared with the
    // off-screen page renders behind "Export all pages…" and Print…, so
    // an exported page looks like what's on screen.
    const renderOpts = () => ({
      showAnnotations: preferences.showAnnotations,
      displayUnit: preferences.getDisplayUnit(),
    });

    let statusStrip = null;
    let canvasKeyboard = null;
    const renderAll = () => {
      view.render(pageScopedModel, renderOpts());
      minimap.render(view.connectionsLayer, view.nodesLayer, view.getContentBounds());
      // Assigned further down (it needs projectSettings/preferences), and
      // renderAll runs before that point -- hence the `let` above and
      // this guard rather than a closure over a later `const`.
      if (statusStrip) statusStrip.render();
      // CanvasView replaced every node element, so the one that carried
      // `tabindex="0"` is gone -- put it back on whatever is selected.
      if (canvasKeyboard) canvasKeyboard.applyRovingTabindex();
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

    // Per-browser preferences (display unit, annotations, auto-arrange
    // knobs) -- everything that is NOT saved with the document; see
    // PreferencesController vs ProjectSettingsController.
    const preferences = new Bowtie.PreferencesController(document.getElementById('btn-preferences'), renderAll);
    // Constructed here (before renderAll's first real call, and before
    // ContextMenuController below needs its getDisplayUnit) even though the
    // toolbar button it's wired to lives further down the settings
    // dropdown — see the `settings`/`projectSettings` closure-over-a-later-
    // const pattern already used for AutoArrangeController's
    // arrangeSpacing/pullChainsCloser callbacks below.
    const projectSettings = new Bowtie.ProjectSettingsController(
      model, document.getElementById('btn-project-settings'),
      document.getElementById('import-risk-matrix-input'),
    );

    new Bowtie.ToolbarController(pageScopedModel, {
      addThreatBtn: document.getElementById('btn-add-threat'),
      addConsequenceBtn: document.getElementById('btn-add-consequence'),
      nameEl: document.getElementById('bowtie-name'),
      // One place to rename the analysis: the title opens Project
      // Settings › General with Name focused, rather than its own dialog.
      onRename: () => projectSettings.open({ tab: 'general', focusName: true }),
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
      () => preferences.arrangeSpacing,
      () => preferences.pullChainsCloser,
    );
    const contextMenu = new Bowtie.ContextMenuController(
      pageScopedModel, svgRoot, () => autoArrange.arrange(), () => preferences.getDisplayUnit(),
      // `nodeLibrary` is constructed further down (design review finding
      // 04's "Delete from Library…" item needs it) -- same closure-over-a-
      // later-const pattern as `settings`/`projectSettings` above.
      (nodeId) => nodeLibrary.openForNode(nodeId),
    );
    const focus = new Bowtie.FocusController(pageScopedModel, svgRoot);

    // Canvas keyboard access (proposals/13): a roving tabindex over the
    // node groups, arrow navigation that follows the diagram rather than
    // the DOM, and the same actions the pointer has. Shares
    // FocusController's `selectedId`, so keyboard focus and click
    // selection are one piece of state.
    canvasKeyboard = new Bowtie.CanvasKeyboardController(pageScopedModel, svgRoot, focus, {
      openProperties: (el) => Bowtie.openPropertiesModal({
        model: pageScopedModel, el, displayUnit: preferences.getDisplayUnit(),
      }),
      openContextMenu: (el, rect, node) => contextMenu.openForElement(el, rect, node),
      liveRegion: document.getElementById('canvas-live-region'),
      // Escape leaves the canvas for the toolbar, the way Escape leaves
      // any other composite widget.
      onLeave: () => document.getElementById('menu-trigger-file').focus(),
      // One undo entry per nudge -- the same explicit snapshot
      // DragController takes once per drag gesture.
      onBeforeNudge: () => undo.snapshot(pageTabs.getActivePageId()),
    });
    const importExport = new Bowtie.ImportExportController(
      model,
      svgRoot,
      () => view.getContentBounds(),
      {
        exportPngBtn: document.getElementById('btn-export-png'),
        exportSvgBtn: document.getElementById('btn-export-svg'),
        exportAllSvgBtn: document.getElementById('btn-export-all-svg'),
        exportAllPngBtn: document.getElementById('btn-export-all-png'),
        exportJsonBtn: document.getElementById('btn-export-json'),
        importJsonBtn: document.getElementById('btn-import-json'),
        importFileInput: document.getElementById('import-file-input'),
      },
      () => {
        undo.reset(); // importing a file resets both the undo and redo history
        unsavedChanges.markClean(); // ...and starts a new "since last save" clock
        recovery.clear(); // ...and there is nothing left to recover
      },
      () => {
        unsavedChanges.markClean();
        recovery.clear(); // the document is on disk now
      },
      () => renderOpts(),
      (handle) => recentFiles.remember(handle),
      // An upgraded document (proposals/12): the file on disk is still
      // the old version, so the unsaved-changes guard goes straight back
      // up, and the user is told what changed. The notice is deferred a
      // tick so it opens AFTER the import flow's own loading modal has
      // closed, rather than stacking on top of a dialog that is about to
      // disappear underneath it.
      (applied) => {
        markNotOnDisk();
        setTimeout(() => {
          const body = document.createElement('div');
          const intro = document.createElement('p');
          intro.textContent = 'This file was made by an older version of the editor and has been '
            + 'upgraded to open. Your original file has not been changed — export again to save '
            + 'the upgraded version.';
          body.appendChild(intro);
          const list = document.createElement('ul');
          list.className = 'migration-list';
          applied.forEach((line) => {
            const item = document.createElement('li');
            item.textContent = line;
            list.appendChild(item);
          });
          body.appendChild(list);
          Bowtie.ModalView.openModal({
            title: 'Upgraded', bodyEl: body, actions: [{ label: 'OK', primary: true }],
          });
        }, 0);
      },
    );

    document.getElementById('btn-reset-view').addEventListener('click', () => {
      panZoom.fitToBounds(view.getContentBounds());
    });

    // Edit in the library opens the same Properties modal the canvas
    // double-click does (ui_fitness_proposal.md S4) -- against the full
    // `model`, since a library node may have no placement on the active
    // page, or none at all.
    const nodeLibrary = new Bowtie.NodeLibraryController(model, document.getElementById('btn-manage-ids'), {
      openProperties: (el) => Bowtie.openPropertiesModal({ model, el, displayUnit: preferences.getDisplayUnit() }),
    });

    // Every way a diagram leaves the app -- a blocking warning disables
    // all of them, the all-pages exports and Print included.
    const EXPORT_BUTTON_IDS = [
      'btn-export-png', 'btn-export-svg', 'btn-export-json',
      'btn-export-all-svg', 'btn-export-all-png', 'btn-print',
    ];
    const warnings = new Bowtie.WarningsController(model, document.getElementById('btn-warnings'), EXPORT_BUTTON_IDS, {
      // "Show" on a warning row: switch to its page (which re-renders
      // synchronously via pageTabs.onChange above), focus the node's
      // lines, and flash the node itself so the eye lands on it.
      onShow: (warning) => {
        pageTabs.select(warning.pageId);
        focus.focusPlacement(warning.id);
        const placement = model.findById(warning.id);
        const nodeEl = placement && svgRoot.querySelector(`#nodes-layer .node[data-id="${placement.nodeId}"]`);
        if (nodeEl) {
          nodeEl.classList.add('located');
          setTimeout(() => nodeEl.classList.remove('located'), 1600);
        }
      },
    });

    // Document-wide (every page's consequences), so constructed with `model`
    // rather than `pageScopedModel`, like WarningsController above.
    const riskSummary = new Bowtie.RiskSummaryController(
      model, document.getElementById('btn-risk-summary'), () => preferences.getDisplayUnit(),
    );

    // The barrier owner's counterpart to the Risk Summary (proposals/09),
    // document-wide for the same reason: it walks every page.
    new Bowtie.BarrierRegisterController(
      model, document.getElementById('btn-barrier-register'), () => preferences.getDisplayUnit(),
    );

    // The document's own context (mode, matrix, unit, aggregation) at the
    // end of the bottom bar. Constructed with `model` -- all of it is
    // document-wide -- and re-rendered from renderAll too, since the
    // display unit lives in Preferences rather than on the model.
    statusStrip = new Bowtie.StatusStripController(
      model, document.getElementById('status-strip-container'), {
        getDisplayUnit: () => preferences.getDisplayUnit(),
        openProjectSettings: (opts) => projectSettings.open(opts),
        openPreferences: () => preferences.open(),
      },
    );

    // Keys for what the menus already do, plus Delete on the selected
    // node and `?` for the sheet listing all of it. Constructed after
    // every menu button exists -- it drives them by id (and reads their
    // `disabled`), so it can never do more than the menus allow.
    const shortcuts = new Bowtie.ShortcutsController({
      onDeleteSelected: () => {
        const id = focus.getSelectedId();
        if (!id) return false;
        pageScopedModel.deleteElement(id);
        return true;
      },
      onClearSelection: () => focus.clearSelection(),
      helpButton: document.getElementById('btn-shortcuts'),
    });
    shortcuts.annotateMenus();

    // File > Print…: every page's diagram, then the Risk Summary tables
    // (built by the controller above, so the printed tables are the same
    // ones the modal shows).
    document.getElementById('btn-print').addEventListener('click', () => {
      Bowtie.PrintView.printDocument(model, {
        opts: renderOpts(),
        displayUnit: preferences.getDisplayUnit(),
        riskSummaryBody: riskSummary.buildSummaryBody(),
      });
    });

    renderAll();

    const TOOLBAR_BUTTON_IDS = [
      'btn-add-threat', 'btn-add-consequence', 'btn-auto-arrange', 'btn-reset-view', 'btn-risk-summary',
      'btn-barrier-register', 'btn-shortcuts',
      'btn-manage-ids', 'btn-preferences', 'btn-export-all-svg', 'btn-export-all-png', 'btn-print',
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
      // view so the first Threat/Consequence (placed at a fixed default position)
      // doesn't land outside a tightly-fitted viewport. An imported diagram
      // has real content, so fitting to it is the right call.
      const hasContent = model.threats.length > 0 || model.consequences.length > 0
        || model.preventativeBarriers.length > 0 || model.mitigativeBarriers.length > 0;
      if (hasContent) panZoom.fitToBounds(view.getContentBounds());
      // The welcome flow's own name/page/TLE/Hazard renames (or a completed
      // import) shouldn't leave anything undo-able back to a blank state.
      // Deferred a tick: this callback fires on the FIRST of the "Create"
      // step's four model changes (setName, renamePage, then two
      // renameElement calls) — resetting synchronously here would run
      // before the rest, which would then repopulate the stack right after
      // this clears it. Same deferral applies to marking the document
      // clean -- a fresh "New Bowtie" shouldn't warn about unsaved changes
      // before the user has actually changed anything themselves.
      setTimeout(() => {
        undo.reset();
        if (!loadedWorkNotOnDisk) unsavedChanges.markClean();
      }, 0);
    }, { recovery, recent: recentFiles });
  });
})(window.Bowtie = window.Bowtie || {});
