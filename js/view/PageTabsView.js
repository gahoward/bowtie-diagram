(function (Bowtie) {
  // Pure render: rebuilds the #page-tabs strip from scratch given the
  // current pages and active page id. Never attaches event listeners
  // itself — PageTabsController owns all interaction via one delegated
  // listener on the container, the same split CanvasView/DragController
  // use for the canvas (render() just re-lays-out data-* attributed
  // buttons; the controller interprets clicks on them).
  class PageTabsView {
    constructor(container) {
      this.container = container;
    }

    // `jumpOpen`: whether the "Jump to page" dropdown should render open.
    // Render is otherwise a pure function of (pages, activePageId) — the
    // controller re-passes jumpOpen explicitly on every render call since
    // rebuilding the DOM from scratch would otherwise lose it.
    render(pages, activePageId, { jumpOpen } = {}) {
      const scroll = document.createElement('div');
      scroll.className = 'page-tabs-scroll';

      pages.forEach((page) => {
        const tab = document.createElement('div');
        tab.className = `page-tab${page.id === activePageId ? ' active' : ''}`;
        tab.dataset.pageId = page.id;
        if (page.description) tab.title = page.description;

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'page-tab-label';
        label.textContent = page.name;
        label.dataset.action = 'select';
        label.dataset.pageId = page.id;
        tab.appendChild(label);

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'page-tab-edit';
        editBtn.title = 'Edit page name/description';
        editBtn.textContent = '✎';
        editBtn.dataset.action = 'edit';
        editBtn.dataset.pageId = page.id;
        tab.appendChild(editBtn);

        // Hidden on the last remaining tab — there is always exactly one
        // page, so there is never a valid "delete the only page" action.
        if (pages.length > 1) {
          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'page-tab-close';
          closeBtn.title = 'Delete page';
          closeBtn.textContent = '×';
          closeBtn.dataset.action = 'delete';
          closeBtn.dataset.pageId = page.id;
          tab.appendChild(closeBtn);
        }

        scroll.appendChild(tab);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'page-tab-add';
      addBtn.textContent = '+ Add page';
      addBtn.dataset.action = 'add';
      scroll.appendChild(addBtn);

      const jump = document.createElement('div');
      jump.className = 'page-jump';

      const jumpTrigger = document.createElement('button');
      jumpTrigger.type = 'button';
      jumpTrigger.className = 'page-jump-trigger';
      jumpTrigger.textContent = 'Jump to page ▾';
      jumpTrigger.dataset.action = 'toggle-jump';
      jump.appendChild(jumpTrigger);

      const jumpDropdown = document.createElement('div');
      jumpDropdown.className = 'page-jump-dropdown';
      jumpDropdown.hidden = !jumpOpen;
      pages.forEach((page) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'page-jump-item';
        item.textContent = page.name;
        item.dataset.action = 'jump-to';
        item.dataset.pageId = page.id;
        jumpDropdown.appendChild(item);
      });
      jump.appendChild(jumpDropdown);

      this.container.replaceChildren(scroll, jump);
    }
  }

  Bowtie.PageTabsView = PageTabsView;
})(window.Bowtie = window.Bowtie || {});
