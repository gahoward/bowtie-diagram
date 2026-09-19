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
  // One builder is also what makes proposals/18 a small change rather
  // than two: these tablists announce themselves to assistive tech as
  // tabs but implement no arrow-key navigation, and that is now one
  // place to fix instead of two that must agree.
  function tabs({ items, activeId, dataKey, onSelect }) {
    const nav = el('div', 'settings-tabs');
    nav.setAttribute('role', 'tablist');
    items.forEach((item) => {
      const btn = Bowtie.Dom.button(item.label, 'settings-tab');
      btn.dataset[dataKey] = item.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(item.id === activeId));
      btn.addEventListener('click', () => onSelect(item.id));
      nav.appendChild(btn);
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

  Bowtie.FormControls = { tabs, radioRow, radioGroup };
})(window.Bowtie = window.Bowtie || {});
