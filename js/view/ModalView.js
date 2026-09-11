(function (Bowtie) {
  // Shared dialog-on-a-backdrop component used by the welcome flow, the
  // rename-bowtie dialog, and the attach-existing-node pickers.
  // `size: 'wide'` widens the dialog for content-heavy modals (the
  // Properties/Project Settings modals) that don't fit the default
  // 420px-ish width meant for a single name field or a short list.
  function openModal({
    title, bodyEl, actions, dismissible = true, size = 'normal',
  }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = size === 'wide' ? 'modal-dialog modal-dialog-wide' : 'modal-dialog';

    const titleEl = document.createElement('h2');
    titleEl.className = 'modal-title';

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'modal-body';

    const actionsRow = document.createElement('div');
    actionsRow.className = 'modal-actions';

    dialog.appendChild(titleEl);
    dialog.appendChild(bodyContainer);
    dialog.appendChild(actionsRow);
    overlay.appendChild(dialog);

    function close() {
      overlay.remove();
    }

    if (dismissible) {
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) close();
      });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', onKey);
        }
      });
    }

    const handle = {
      overlay,
      dialog,
      close,
      setTitle(text) {
        titleEl.textContent = text;
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
    return handle;
  }

  Bowtie.ModalView = { openModal };
})(window.Bowtie = window.Bowtie || {});
