(function (Bowtie) {
  // Structural review finding 04: six of ContextMenuController's ~26
  // methods were modal-orchestration flows with nothing to do with routing
  // events or deciding what a right-click menu should list -- opening the
  // Properties modal, a generic error dialog, the multi-line checkbox
  // picker, the "inherit downstream barriers?" prompt (and the plain-
  // attach-with-rollback path it sits in front of), and the searchable
  // attach-target picker. Lifted out wholesale so the controller is left
  // with exactly one job: build the list of items a given right-click
  // should offer. Nothing outside ContextMenuController constructs one of
  // these, so there's no interface being preserved here, unlike
  // BowtieModel's undo-Proxy-bound surface.
  class ContextMenuModalFlows {
    constructor(model, triggerAutoArrange, getDisplayUnit) {
      this.model = model;
      this.triggerAutoArrange = triggerAutoArrange;
      this.getDisplayUnit = getDisplayUnit;
    }

    // Opens the shared Properties modal (PropertiesModal.js) for any node
    // type -- Identity (name/description/identifier), Risk Analysis
    // (qualitative/quantitative fields, library nodes only), and read-only
    // Computed values (Outcome risk class/likelihood, TLE computed
    // likelihood). Reached from both double-click and the context menu's
    // "Properties" item.
    rename(el) {
      Bowtie.openPropertiesModal({ model: this.model, el, displayUnit: this.getDisplayUnit() });
    }

    showError(message) {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(p);
      Bowtie.ModalView.openModal({ title: 'Cannot Do That', bodyEl: body, actions: [{ label: 'OK', primary: true }] });
    }

    // The sole path every "attach to existing barrier" action runs through
    // (attachExistingBarrier's line-segment reattach, and the inherit-prompt
    // flow's attachInputToPreventativeControl/attachOutputToMitigativeControl
    // calls below) -- re-arranging here on success covers all of them in one
    // place rather than after each individual call site.
    safeAttach(fn) {
      try {
        fn();
        this.triggerAutoArrange();
        return true;
      } catch (err) {
        this.showError(err.message);
        return false;
      }
    }

    // Wraps attachInputToPreventativeControl/attachOutputToMitigativeControl
    // (via `attach(inheritDownstream)`): only asks the user whether to
    // inherit `targetId`'s existing downstream continuation when there
    // actually IS one on some other line (`excludeLineId` is the line
    // about to be replaced, so it never answers its own question) --
    // otherwise inheriting or not makes no difference, so it just attaches
    // (with `inheritDownstream: true`, though `false` would produce the
    // exact same result) without bothering the user over a non-choice.
    attachWithInheritPrompt(targetId, excludeLineId, attach) {
      const continuation = this.model._donorContinuation(targetId, excludeLineId);
      if (continuation.length === 0) {
        this.safeAttach(() => attach(true));
        return;
      }
      // What "decline" actually resolves to depends on whether this line
      // already had its own further barriers before this attach -- the
      // modal's wording needs to say which, not just always claim "goes
      // straight to the TLE" (only true for the common bare-origin case).
      const excludeLine = this.model.lines.find((l) => l.id === excludeLineId);
      const ownContinuation = excludeLine ? excludeLine.stops.filter((id) => id !== targetId) : [];
      this._openInheritDownstreamModal(
        continuation,
        ownContinuation,
        (inherit) => this.safeAttach(() => attach(inherit)),
      );
    }

    // `continuation` is the donor's stops past the barrier being attached
    // to (e.g. ['PB_3'] when attaching to a barrier that already continues
    // on to PB_3 before the TLE); `ownContinuation` is whatever this
    // line's OWN stops already were beyond the target barrier, if any --
    // declining keeps those instead, or goes straight to the TLE if there
    // were none. Offers a real third way out (Cancel) alongside the two
    // real choices, since this can come up mid-attach and the user may not
    // have realized the target barrier already continues further.
    _openInheritDownstreamModal(continuation, ownContinuation, onChoice) {
      const nameOf = (id) => {
        const el = this.model.findById(id);
        if (!el) return id;
        const node = this.model.getNode(el.nodeId);
        const displayId = this.model.displayIdentifierFor(node);
        return `${displayId} (${node.name})`;
      };
      const continuationNames = continuation.map(nameOf).join(', ');
      const declineDescription = ownContinuation.length > 0
        ? `keep going through its own existing path (${ownContinuation.map(nameOf).join(', ')}) instead`
        : 'go straight to the TLE from this barrier instead';
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = `This barrier already continues on to ${continuationNames} before reaching the TLE. `
        + `Should the new connection follow that same path, or ${declineDescription}?`;
      body.appendChild(p);

      Bowtie.ModalView.openModal({
        title: 'Inherit Downstream Barriers?',
        bodyEl: body,
        dismissible: false,
        actions: [
          { label: 'Cancel' },
          { label: 'Stop Here', onClick: () => onChoice(false) },
          { label: 'Follow Existing Path', primary: true, onClick: () => onChoice(true) },
        ],
      });
    }

    // Generic "pick which of several lines this should apply to" checkbox
    // picker -- shared by ContextMenuController's own shunt (reorder) items
    // and its _addBarrierFrom flow, both of which need to ask "which
    // path(s)?" whenever a barrier carries more than one line.
    openLineSelectModal(title, options, preselectedKey, onConfirm, description) {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = description || 'This point currently carries multiple lines. Select which one(s) should route '
        + 'through the new barrier — anything left unselected continues exactly as before.';
      body.appendChild(p);

      const checks = options.map((opt) => {
        const label = document.createElement('label');
        label.className = 'modal-checkbox-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = opt.key;
        if (preselectedKey && opt.key === preselectedKey) input.checked = true;
        const span = document.createElement('span');
        span.textContent = opt.label;
        label.appendChild(input);
        label.appendChild(span);
        body.appendChild(label);
        return input;
      });

      Bowtie.ModalView.openModal({
        title,
        bodyEl: body,
        dismissible: false,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Confirm',
            primary: true,
            onClick: () => {
              const selected = checks.filter((c) => c.checked).map((c) => c.value);
              onConfirm(selected.length > 0 ? selected : null);
            },
          },
        ],
      });
    }

    // Generic searchable-by-id/name candidate picker -- shared by every
    // "attach to existing barrier" item, whichever menu it was offered from
    // (a Cause/Outcome node's own menu, or a right-clicked line segment).
    openAttachModal(title, candidates, onPick) {
      const body = document.createElement('div');

      const filterWrap = document.createElement('label');
      filterWrap.className = 'modal-field';
      const filterLabel = document.createElement('span');
      filterLabel.textContent = 'Filter';
      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Search by id or name…';
      filterWrap.appendChild(filterLabel);
      filterWrap.appendChild(filterInput);
      body.appendChild(filterWrap);

      const list = document.createElement('div');
      list.className = 'attach-list';
      body.appendChild(list);

      // `candidates` are always PLACEMENTS (attachExistingBarrier/
      // attachInputToPreventativeControl/attachOutputToMitigativeControl
      // all operate on placement ids) -- displayed id/name resolve through
      // each one's shared library node instead, same as everywhere else a
      // barrier renders (node_library_proposal.md "Two id spaces").
      const rows = candidates.map((c) => {
        const node = this.model.getNode(c.nodeId);
        const displayId = this.model.displayIdentifierFor(node);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'attach-list-item';

        const idSpan = document.createElement('span');
        idSpan.className = 'attach-list-id';
        idSpan.textContent = displayId;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'attach-list-name';
        nameSpan.textContent = node.name;

        btn.appendChild(idSpan);
        btn.appendChild(nameSpan);
        btn.addEventListener('click', () => {
          onPick(c);
          modal.close();
        });
        list.appendChild(btn);
        return { el: btn, haystack: `${displayId} ${node.name}`.toLowerCase() };
      });

      filterInput.addEventListener('input', () => {
        const term = filterInput.value.trim().toLowerCase();
        rows.forEach((row) => { row.el.hidden = term.length > 0 && !row.haystack.includes(term); });
      });

      const modal = Bowtie.ModalView.openModal({
        title,
        bodyEl: body,
        actions: [{ label: 'Cancel' }],
      });
      filterInput.focus();
    }
  }

  Bowtie.ContextMenuModalFlows = ContextMenuModalFlows;
})(window.Bowtie = window.Bowtie || {});
