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
      // Any pointerdown outside the open menu dismisses it -- the same
      // "click away to close" convention as a native context menu.
      document.addEventListener('pointerdown', (e) => {
        if (this.menuEl && !this.menuEl.contains(e.target)) this.close();
      });
    }

    render(x, y, items) {
      this.close();
      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;

      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'context-menu-item';
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          item.action();
          this.close();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      this.menuEl = menu;
    }

    close() {
      if (this.menuEl) {
        this.menuEl.remove();
        this.menuEl = null;
      }
    }
  }

  Bowtie.ContextMenuView = ContextMenuView;
})(window.Bowtie = window.Bowtie || {});
