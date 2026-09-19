(function (Bowtie) {
  // Every shortcut but the two below activates an existing menu button by
  // id, so a shortcut can never do something the menus can't -- and a
  // disabled button (a blocking warning disabling every export) disables
  // its shortcut for free, with no second rule to keep in step.
  //
  // `combo`: `[modifier, key]` where modifier is 'mod' (Ctrl, or ⌘ on a
  // Mac), 'mod+shift', or '' for a bare key.
  const SHORTCUTS = [
    { combo: 'mod+s', buttonId: 'btn-export-json', label: 'Export to JSON' },
    { combo: 'mod+o', buttonId: 'btn-import-json', label: 'Import from JSON' },
    { combo: 'mod+shift+e', buttonId: 'btn-export-svg', label: 'Export to SVG' },
    { combo: 'mod+shift+p', buttonId: 'btn-export-png', label: 'Export to PNG' },
    { combo: 'mod+p', buttonId: 'btn-print', label: 'Print' },
    { combo: 'mod+shift+a', buttonId: 'btn-auto-arrange', label: 'Auto-arrange' },
    { combo: 'mod+0', buttonId: 'btn-reset-view', label: 'Reset view' },
    { combo: 'mod+shift+r', buttonId: 'btn-risk-summary', label: 'Risk Summary' },
    { combo: 'delete', action: 'delete', label: 'Remove the selected node from this page' },
    { combo: 'escape', action: 'clear', label: 'Clear the selection' },
    { combo: '?', action: 'help', label: 'Keyboard shortcuts' },
  ];

  const TEXT_INPUTS = ['INPUT', 'TEXTAREA', 'SELECT'];

  function isMac() {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  }

  // "Ctrl+Shift+E" / "⌘⇧E" for the help sheet and the menu titles.
  function describe(combo) {
    const mac = isMac();
    return combo.split('+').map((part) => {
      if (part === 'mod') return mac ? '⌘' : 'Ctrl';
      if (part === 'shift') return mac ? '⇧' : 'Shift';
      if (part === 'delete') return 'Delete';
      if (part === 'escape') return 'Esc';
      if (part === '?') return '?';
      return part.toUpperCase();
    }).join(mac ? '' : '+');
  }

  function comboFor(e) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();
    if (key === 'delete' || key === 'backspace') return 'delete';
    if (key === 'escape') return 'escape';
    // A US layout reports Shift+/ as '?', but not every layout (or
    // synthetic key event) does -- accept the physical key too.
    if (!mod && (e.key === '?' || (key === '/' && e.shiftKey))) return '?';
    if (!mod) return null;
    return `mod${e.shiftKey ? '+shift' : ''}+${key}`;
  }

  // Keyboard routes to the actions the menus already offer, plus Delete
  // for the selected node and `?` for the sheet listing all of it
  // (ui_fitness_proposal.md / proposals 03). Deliberately inert while a
  // text field has focus or a modal is open -- Ctrl+S inside a Properties
  // name field must not export, and Delete must not remove a node while
  // its name is being typed.
  class ShortcutsController {
    constructor({ onDeleteSelected, onClearSelection, helpButton }) {
      this.onDeleteSelected = onDeleteSelected;
      this.onClearSelection = onClearSelection;
      document.addEventListener('keydown', (e) => this._onKeyDown(e));
      if (helpButton) helpButton.addEventListener('click', () => this.openHelp());
    }

    _blocked(e) {
      if (e.repeat) return true;
      const target = e.target;
      if (target && TEXT_INPUTS.includes(target.tagName)) return true;
      if (target && target.isContentEditable) return true;
      // A modal is open: #app is inert (ModalView), and every shortcut
      // here drives #app's own chrome.
      const app = document.getElementById('app');
      return Boolean(app && app.inert);
    }

    _onKeyDown(e) {
      const combo = comboFor(e);
      if (!combo) return;
      const shortcut = SHORTCUTS.find((s) => s.combo === combo);
      if (!shortcut) return;
      if (this._blocked(e)) return;

      if (shortcut.action === 'help') {
        e.preventDefault();
        this.openHelp();
        return;
      }
      if (shortcut.action === 'clear') {
        // Never swallowed: Escape also closes an open menu (MenuBarController)
        // and cancels a drag, and both must keep working.
        this.onClearSelection();
        return;
      }
      if (shortcut.action === 'delete') {
        // Only swallow the key when there is actually something selected,
        // so Backspace keeps its ordinary meaning otherwise.
        if (!this.onDeleteSelected()) return;
        e.preventDefault();
        return;
      }
      const btn = document.getElementById(shortcut.buttonId);
      if (!btn || btn.disabled) return; // nothing to do, and never swallow the key
      e.preventDefault();
      btn.click();
    }

    openHelp() {
      const body = document.createElement('div');
      const intro = document.createElement('p');
      intro.className = 'modal-subtitle';
      intro.textContent = 'These work whenever the canvas has focus and no dialog is open.';
      body.appendChild(intro);

      const list = document.createElement('dl');
      list.className = 'shortcut-list';
      SHORTCUTS.forEach((shortcut) => {
        const key = document.createElement('dt');
        key.textContent = describe(shortcut.combo);
        const label = document.createElement('dd');
        label.textContent = shortcut.label;
        list.append(key, label);
      });
      body.appendChild(list);

      Bowtie.ModalView.openModal({
        title: 'Keyboard shortcuts',
        bodyEl: body,
        actions: [{ label: 'Close', primary: true }],
      });
    }

    // Appends the key to each menu item's tooltip, so the shortcuts are
    // discoverable from the menus rather than only from the sheet.
    annotateMenus() {
      SHORTCUTS.filter((s) => s.buttonId).forEach((shortcut) => {
        const btn = document.getElementById(shortcut.buttonId);
        if (btn) btn.title = `${shortcut.label} (${describe(shortcut.combo)})`;
      });
    }
  }

  Bowtie.ShortcutsController = ShortcutsController;
  Bowtie.SHORTCUTS = SHORTCUTS;
  Bowtie.describeShortcut = describe;
})(window.Bowtie = window.Bowtie || {});
