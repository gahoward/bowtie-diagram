(function (Bowtie) {
  const el = Bowtie.Dom.el;

  // Small chrome controls that more than one screen builds. Same
  // reasoning as Dom.js/Svg.js in proposals/15 part 1: these had each
  // grown a private copy, and two copies of a control drift -- silently,
  // because the two screens are tested through different assertions.
  //
  // The bar for living here is that a SECOND caller already exists. A
  // control used once belongs in the view that uses it.

  // A tablist. Project Settings and the Node Library each grew their own
  // copy: same `settings-tabs`/`settings-tab` classes, same role/
  // aria-selected wiring, differing only in which `data-*` attribute the
  // button carries (`data-tab` vs `data-type`) -- which is why `dataKey`
  // is a parameter rather than something this picks.
  //
  // proposals/18 finished the pattern here, once, rather than twice:
  // both copies set role/aria-selected and implemented NO keyboard
  // navigation, which is worse than setting no roles at all -- the roles
  // promise an assistive-technology user arrow keys that silently did
  // nothing.
  //
  // What that needs, and what is below: a roving tabindex (only the
  // selected tab is in the Tab order, so Tab moves past the strip rather
  // than through every tab), arrow/Home/End to move between them, and
  // `aria-controls` pointing at the panel each one reveals. The roving
  // idiom is CanvasKeyboardController's, one dimension simpler.
  //
  // **Manual activation**: an arrow moves focus only, and Enter/Space
  // (the button's own native activation) selects. ARIA offers automatic
  // activation too -- selection follows focus -- and it is the wrong
  // choice here for a concrete reason: both callers answer `onSelect` by
  // rebuilding the entire modal body, which destroys the very button the
  // user is arrowing through. Selection-follows-focus would drop focus
  // to <body> on the first arrow press and leave the remaining arrows
  // doing nothing, which is the same broken promise this is fixing.
  //
  // Activation still rebuilds, so `focusSelectedTab` below puts focus
  // back on the replacement element; the callers use it.
  //
  // `panelId` is what `aria-controls` points at. The caller owns the
  // panel, so it passes the id it will put there.
  function tabs({ items, activeId, dataKey, onSelect, panelId }) {
    const nav = el('div', 'settings-tabs');
    nav.setAttribute('role', 'tablist');
    const buttons = items.map((item) => {
      const btn = Bowtie.Dom.button(item.label, 'settings-tab');
      btn.dataset[dataKey] = item.id;
      btn.setAttribute('role', 'tab');
      const selected = item.id === activeId;
      btn.setAttribute('aria-selected', String(selected));
      // Roving tabindex: exactly one tab is tabbable at a time.
      btn.tabIndex = selected ? 0 : -1;
      if (panelId) btn.setAttribute('aria-controls', panelId);
      btn.addEventListener('click', () => onSelect(item.id));
      nav.appendChild(btn);
      return btn;
    });

    nav.addEventListener('keydown', (e) => {
      const index = buttons.indexOf(document.activeElement);
      if (index === -1) return;
      const moveTo = (i) => {
        e.preventDefault();
        buttons[(i + buttons.length) % buttons.length].focus();
      };
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') moveTo(index + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') moveTo(index - 1);
      else if (e.key === 'Home') moveTo(0);
      else if (e.key === 'End') moveTo(buttons.length - 1);
    });

    return nav;
  }

  // One radio and its label, as a `.modal-checkbox-row`. `onPick` fires
  // only when this radio is the one that became checked -- a `change`
  // event reaches the newly-checked radio alone, but saying so here
  // means a caller can never be wrong about it.
  function radioRow({ name, value, text, checked, onPick }) {
    const row = el('label', 'modal-checkbox-row');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.value = value;
    radio.checked = Boolean(checked);
    radio.addEventListener('change', () => { if (radio.checked) onPick(value); });
    row.append(radio, el('span', null, text));
    return row;
  }

  // The same rows, wrapped as a settings control. Project Settings wants
  // the `.settings-options` wrapper; the welcome wizard appends its rows
  // straight into a `.modal-field` alongside a hint it toggles, so it
  // uses `radioRow` directly rather than unwrapping this.
  function radioGroup({ name, options, selected, onPick }) {
    const control = el('div', 'settings-options');
    options.forEach((opt) => control.appendChild(radioRow({
      name, value: opt.value, text: opt.text, checked: selected === opt.value, onPick,
    })));
    return control;
  }

  // Selecting a tab rebuilds the panel AND the strip, so the element
  // that had focus no longer exists. Callers that rebuild in response to
  // `onSelect` call this afterwards to move focus to the replacement --
  // but only when a tab had focus to begin with, so a mouse user's focus
  // is never yanked into the strip.
  function focusSelectedTab(root) {
    const tab = root.querySelector('.settings-tab[aria-selected="true"]');
    if (tab) tab.focus();
  }

  // True when the element with focus right now is one of these tabs.
  // Read BEFORE a rebuild; paired with focusSelectedTab after it.
  function tabHasFocus() {
    const active = document.activeElement;
    return Boolean(active && active.classList && active.classList.contains('settings-tab'));
  }

  Bowtie.FormControls = {
    tabs, radioRow, radioGroup, focusSelectedTab, tabHasFocus,
  };
})(window.Bowtie = window.Bowtie || {});
