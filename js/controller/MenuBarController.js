(function (Bowtie) {
  // Drives the File/Add/View/Settings dropdowns in the toolbar (toolbar.md).
  // The dropdown markup holds the SAME button elements every other
  // controller already wires up by id (ImportExportController,
  // AutoArrangeController, etc.) — this controller only ever toggles
  // `hidden` on the dropdown container, never touches what happens when an
  // item is actually clicked.
  class MenuBarController {
    // `menus`: [{ triggerId, dropdownId }, ...]
    constructor(menus) {
      this.menus = menus.map(({ triggerId, dropdownId }) => ({
        trigger: document.getElementById(triggerId),
        dropdown: document.getElementById(dropdownId),
      }));

      this.menus.forEach(({ trigger, dropdown }) => {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggle(dropdown);
        });
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

    _toggle(dropdown) {
      const wasOpen = !dropdown.hidden;
      this._closeAll();
      if (!wasOpen) dropdown.hidden = false;
    }

    _closeAll() {
      this.menus.forEach(({ dropdown }) => { dropdown.hidden = true; });
    }
  }

  Bowtie.MenuBarController = MenuBarController;
})(window.Bowtie = window.Bowtie || {});
