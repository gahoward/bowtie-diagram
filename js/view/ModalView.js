(function (Bowtie) {
  // Structural review finding 03: an open modal painted an overlay but
  // never took focus, trapped it, or restored it -- Tab walked straight
  // into #app behind the backdrop, and those controls were still focusable
  // AND clickable. `openOverlays` tracks every currently-open dialog (they
  // can stack -- e.g. Node Library's own "Delete Node" confirmation opens
  // on top of the Node Library modal itself) so #app, and every overlay
  // except the topmost one, can be marked `inert` -- a native platform
  // primitive that removes an entire subtree from focus, tab order, and
  // pointer interaction in one step, no per-control bookkeeping needed.
  const openOverlays = [];

  // Every modal needs an id to point `aria-labelledby` at, and ids must
  // be unique across a document that can have several modals stacked.
  let nextDialogId = 0;

  function updateInertness() {
    const appEl = document.getElementById('app');
    if (appEl) appEl.inert = openOverlays.length > 0;
    openOverlays.forEach((ov, i) => { ov.inert = i !== openOverlays.length - 1; });
  }

  // Shared dialog-on-a-backdrop component used by the welcome flow, the
  // rename-bowtie dialog, and the attach-existing-node pickers.
  // `size: 'wide'` widens the dialog for content-heavy modals (the
  // Properties/Project Settings modals) that don't fit the default
  // 420px-ish width meant for a single name field or a short list;
  // `'xwide'` is for the one genuinely tabular modal (Risk Summary).
  const DIALOG_CLASSES = {
    wide: 'modal-dialog modal-dialog-wide',
    xwide: 'modal-dialog modal-dialog-xwide',
  };

  function openModal({
    title, bodyEl, actions, dismissible = true, size = 'normal',
  }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = DIALOG_CLASSES[size] || 'modal-dialog';
    // The file already did the hard part -- `inert` on everything below,
    // focus captured and restored, a shared Escape teardown. These three
    // attributes are what tell a screen reader that any of it happened
    // (proposals/18): without them each modal is an anonymous <div>,
    // including the non-dismissible welcome gate that blocks all use of
    // the app until it is answered.
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h2');
    titleEl.className = 'modal-title';
    nextDialogId += 1;
    const titleId = `modal-title-${nextDialogId}`;
    titleEl.id = titleId;

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'modal-body';

    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal-actions';

    dialog.appendChild(titleEl);
    dialog.appendChild(bodyContainer);
    dialog.appendChild(actionsRow);
    overlay.appendChild(dialog);

    // Restored on close, same as a native <dialog> would -- otherwise
    // closing a modal opened via keyboard (e.g. a menu item) drops focus
    // back to <body> with no way to tell where it went.
    const previouslyFocused = document.activeElement;
    // Escape's listener used to only ever get removed from inside its own
    // branch -- closing via a button click or a backdrop click (the far
    // more common paths) left it registered on `document` forever, one
    // more stale listener per modal ever opened for the rest of the
    // session. Torn down from the one shared `close()` now, regardless of
    // which path triggered it.
    let onKey = null;

    function close() {
      overlay.remove();
      if (onKey) document.removeEventListener('keydown', onKey);
      const idx = openOverlays.indexOf(overlay);
      if (idx !== -1) openOverlays.splice(idx, 1);
      updateInertness();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function'
        && document.body.contains(previouslyFocused) && !previouslyFocused.disabled) {
        previouslyFocused.focus();
      }
    }

    if (dismissible) {
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) close();
      });
      onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      document.addEventListener('keydown', onKey);
    }

    const handle = {
      overlay,
      dialog,
      close,
      // Labelling is re-decided here rather than once at construction,
      // because the welcome flow sets a title per step and opens with ''
      // before its first step runs. An empty title names nothing, so
      // pointing aria-labelledby at the empty <h2> would be worse than
      // leaving the dialog unnamed for that one tick.
      //
      // proposals/18 expected an `aria-label` fallback for untitled
      // modals, naming the import spinner. That modal is titled
      // ('Importing'), and so is every other one in the app -- so the
      // fallback would have been a parameter nothing passed.
      setTitle(text) {
        titleEl.textContent = text;
        if (text) dialog.setAttribute('aria-labelledby', titleId);
        else dialog.removeAttribute('aria-labelledby');
      },
      setBody(el) {
        bodyContainer.replaceChildren(el);
      },
      setActions(newActions) {
        actionsRow.replaceChildren();
        newActions.forEach((a) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = a.label;
          btn.className = a.primary ? 'modal-btn modal-btn-primary' : 'modal-btn';
          btn.addEventListener('click', () => {
            const result = a.onClick ? a.onClick() : undefined;
            if (result !== false) close();
          });
          actionsRow.appendChild(btn);
        });
      },
    };

    handle.setTitle(title);
    handle.setBody(bodyEl);
    handle.setActions(actions || []);

    document.body.appendChild(overlay);
    openOverlays.push(overlay);
    updateInertness();

    // Focus lands on the first real control (so a keyboard user can start
    // typing/tabbing immediately), falling back to the dialog itself --
    // made programmatically focusable via tabindex="-1" -- for a modal
    // with nothing focusable in it (e.g. the import-loading spinner).
    const firstFocusable = dialog.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      dialog.tabIndex = -1;
      dialog.focus();
    }

    return handle;
  }

  Bowtie.ModalView = { openModal };
})(window.Bowtie = window.Bowtie || {});
