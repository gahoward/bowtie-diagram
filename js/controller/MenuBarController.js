(function (Bowtie) {
  // Drives the File/Add/View/Settings dropdowns in the toolbar (toolbar.md).
  // The dropdown markup holds the SAME button elements every other
  // controller already wires up by id (ImportExportController,
  // AutoArrangeController, etc.) — this controller only ever toggles
  // `hidden` on the dropdown container, never touches what happens when an
  // item is actually clicked.
  //
  // proposals/18, open question 1: these are full `role="menu"` widgets
  // rather than a labelled disclosure, because ContextMenuView.js already
  // set that precedent under proposals/13 -- and the canvas's menus
  // behaving one way while the toolbar's behave another is its own kind
  // of inconsistency. The arrow/Home/End handling below is deliberately
  // the same shape as that file's.
  class MenuBarController {
    // `menus`: [{ triggerId, dropdownId }, ...]
    constructor(menus) {
      this.menus = menus.map(({ triggerId, dropdownId }) => ({
        trigger: document.getElementById(triggerId),
        dropdown: document.getElementById(dropdownId),
      }));

      this.menus.forEach(({ trigger, dropdown }) => {
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', dropdown.id);
        dropdown.setAttribute('role', 'menu');
        dropdown.setAttribute('aria-labelledby', trigger.id);
        dropdown.querySelectorAll('.menu-dropdown-item').forEach((item) => {
          item.setAttribute('role', 'menuitem');
          // Roving tabindex: the menu itself is reached from the trigger,
          // and arrows move within it -- Tab should leave, not walk every
          // item (ContextMenuView.js does the same).
          item.tabIndex = -1;
        });
        dropdown.querySelectorAll('.menu-separator').forEach((rule) => {
          rule.setAttribute('role', 'separator');
        });

        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggle(dropdown);
        });
        // Down-arrow from the trigger opens the menu and lands on its
        // first item, which is what makes the role="menu" promise real
        // for a keyboard user.
        trigger.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          if (dropdown.hidden) this._toggle(dropdown);
          const items = this._itemsOf(dropdown);
          if (items.length) items[e.key === 'ArrowDown' ? 0 : items.length - 1].focus();
        });
        dropdown.addEventListener('keydown', (e) => this._onMenuKey(e, trigger, dropdown));
        // Delegated rather than one listener per item: closes the dropdown
        // after whichever item's own (independently-wired) click handler
        // has already run, since this fires on the container during the
        // event's bubble phase, strictly after the button's own listener.
        dropdown.addEventListener('click', (e) => {
          if (e.target.closest('button')) this._closeAll();
        });
      });

      document.addEventListener('pointerdown', (e) => {
        const insideAnyMenu = this.menus.some(
          ({ trigger, dropdown }) => trigger.contains(e.target) || dropdown.contains(e.target),
        );
        if (!insideAnyMenu) this._closeAll();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this._closeAll();
      });
    }

    // Enabled items only: a disabled item is not a stop on the way past.
    _itemsOf(dropdown) {
      return [...dropdown.querySelectorAll('.menu-dropdown-item:not([disabled])')];
    }

    _onMenuKey(e, trigger, dropdown) {
      const items = this._itemsOf(dropdown);
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement);
      const focusAt = (i) => {
        e.preventDefault();
        items[(i + items.length) % items.length].focus();
      };
      if (e.key === 'ArrowDown') focusAt(index + 1);
      else if (e.key === 'ArrowUp') focusAt(index - 1);
      else if (e.key === 'Home') focusAt(0);
      else if (e.key === 'End') focusAt(items.length - 1);
      else if (e.key === 'Escape' || e.key === 'Tab') {
        // Escape returns to the trigger; Tab is allowed to leave, but the
        // menu must not stay open behind it.
        this._closeAll();
        if (e.key === 'Escape') {
          e.preventDefault();
          trigger.focus();
        }
      }
      // Enter/Space activate through the button's own click handling,
      // and the delegated container listener closes the menu after.
    }

    _toggle(dropdown) {
      const wasOpen = !dropdown.hidden;
      this._closeAll();
      if (!wasOpen) dropdown.hidden = false;
      this._syncExpanded();
    }

    _closeAll() {
      this.menus.forEach(({ dropdown }) => { dropdown.hidden = true; });
      this._syncExpanded();
    }

    // One place where open/closed changes, so one place to say so.
    _syncExpanded() {
      this.menus.forEach(({ trigger, dropdown }) => {
        trigger.setAttribute('aria-expanded', String(!dropdown.hidden));
      });
    }
  }

  Bowtie.MenuBarController = MenuBarController;
})(window.Bowtie = window.Bowtie || {});
