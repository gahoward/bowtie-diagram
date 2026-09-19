(function (Bowtie) {
  // The three document modes (quantitative_mode_proposal.md "Modes") with
  // the two lengths of explanation the UI uses: a four-word gloss (the
  // start screen's demo chooser) and a full sentence (the mode cards the
  // welcome wizard's step 2 and Project Settings › Risk analysis share).
  // One list so the two screens can never teach different things.
  const RISK_MODES = [
    {
      id: 'simple', label: 'Simple', gloss: 'no risk fields',
      description: 'Just the diagram. No likelihood, severity or risk fields.',
    },
    {
      id: 'qualitative', label: 'Qualitative', gloss: 'pick likelihood & severity',
      description: 'Pick a likelihood and severity class per threat/consequence; the matrix gives the risk class.',
    },
    {
      id: 'quantitative', label: 'Quantitative', gloss: 'compute from frequencies',
      description: 'Enter threat frequencies and barrier measures (RRF, PFD, PFH…); likelihood and risk class are computed.',
    },
  ];

  // Three selectable cards, one radio group. `name` is the radio group's
  // name (tests and callers address the inputs by it); `onSelect(id)`
  // fires on every change. The returned `setSelected` lets a caller that
  // re-renders elsewhere keep the cards in step without rebuilding them.
  function buildRiskModeCards({ selected, name, onSelect }) {
    const wrap = document.createElement('div');
    wrap.className = 'mode-cards';
    const cards = RISK_MODES.map((mode) => {
      const card = document.createElement('label');
      card.className = 'mode-card';
      card.dataset.mode = mode.id;
      const title = document.createElement('span');
      title.className = 'mode-card-title';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = mode.id;
      radio.checked = selected === mode.id;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        setSelected(mode.id);
        onSelect(mode.id);
      });
      const label = document.createElement('span');
      label.textContent = mode.label;
      title.append(radio, label);
      const description = document.createElement('span');
      description.className = 'mode-card-description';
      description.textContent = mode.description;
      card.append(title, description);
      card.classList.toggle('selected', selected === mode.id);
      wrap.appendChild(card);
      return { card, radio, id: mode.id };
    });
    function setSelected(id) {
      cards.forEach((c) => {
        c.card.classList.toggle('selected', c.id === id);
        c.radio.checked = c.id === id;
      });
    }
    return { el: wrap, setSelected };
  }

  Bowtie.RISK_MODES = RISK_MODES;
  Bowtie.buildRiskModeCards = buildRiskModeCards;
})(window.Bowtie = window.Bowtie || {});
