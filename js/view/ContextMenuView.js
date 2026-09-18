(function (Bowtie) {
  // Structural review finding 04: ContextMenuController used to own both
  // deciding what a right-click should offer AND painting/closing the
  // floating menu itself -- a view concern indistinguishable in shape from
  // ModalView.js's own render/close pair. Split out so the controller's
  // job is purely "what items, in response to what event", never "how does
  // a menu actually get drawn".
  class ContextMenuView {
    constructor() {
      this.menuEl = null;
      this.returnFocusTo = null;
      // Any pointerdown outside the open menu dismisses it -- the same
      // "click away to close" convention as a native context menu.
      document.addEventListener('pointerdown', (e) => {
        if (this.menuEl && !this.menuEl.contains(e.target)) this.close();
      });
    }

    // `returnFocusTo`, if given, is what regains focus when the menu
    // closes -- the node the keyboard opened it from (proposals/13).
    // Without it, closing a menu opened by Shift+F10 would drop focus to
    // the body and strand a keyboard user at the top of the page.
    render(x, y, items, returnFocusTo = null) {
      this.close();
      this.returnFocusTo = returnFocusTo || null;
      const menu = document.createElement('div');
      menu.className = 'context-menu';
      // A real menu, not a styled div: a screen reader should say "menu,
      // 5 items" and read each one, which needs the roles.
      menu.setAttribute('role', 'menu');
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.addEventListener('keydown', (e) => this._onKeyDown(e));

      // `{ separator: true }` draws a rule between groups (create /
      // inspect / destroy -- see ContextMenuController._buildNodeItems);
      // `danger: true` colours a destructive item.
      items.forEach((item) => {
        if (item.separator) {
          const rule = document.createElement('div');
          rule.className = 'context-menu-separator';
          rule.setAttribute('role', 'separator');
          menu.appendChild(rule);
          return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = item.danger ? 'context-menu-item context-menu-item-danger' : 'context-menu-item';
        btn.setAttribute('role', 'menuitem');
        // Roving tabindex again, for the same reason as on the canvas:
        // the menu is one stop, arrows move inside it.
        btn.tabIndex = -1;
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          item.action();
          this.close();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      this.menuEl = menu;
      // Only move focus when the menu was opened from the keyboard:
      // stealing it on a right-click would take focus off whatever the
      // pointer user was working in.
      if (this.returnFocusTo) {
        const first = menu.querySelector('.context-menu-item');
        if (first) first.focus();
      }
    }

    _onKeyDown(e) {
      const items = [...this.menuEl.querySelectorAll('.context-menu-item')];
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
      else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      // Enter/Space activate through the button's own click handling.
    }

    close() {
      if (this.menuEl) {
        this.menuEl.remove();
        this.menuEl = null;
        const returnTo = this.returnFocusTo;
        this.returnFocusTo = null;
        if (returnTo && document.body.contains(returnTo)) returnTo.focus();
      }
    }
  }

  Bowtie.ContextMenuView = ContextMenuView;
})(window.Bowtie = window.Bowtie || {});
