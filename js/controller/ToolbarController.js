(function (Bowtie) {
  class ToolbarController {
    // `onRename` is what the toolbar's title button does -- main.js wires
    // it to Project Settings › General with the Name field focused
    // (ui_fitness_proposal.md S1), so there is exactly one place the
    // analysis is renamed rather than a separate Rename dialog too.
    constructor(model, {
      addThreatBtn, addConsequenceBtn, nameEl, onRename,
    }) {
      this.model = model;
      addThreatBtn.addEventListener('click', () => this._openCreateOrChoose('threat', (opts) => this.model.addThreat(opts)));
      addConsequenceBtn.addEventListener('click', () => this._openCreateOrChoose('consequence', (opts) => this.model.addConsequence(opts)));

      this.nameEl = nameEl;
      nameEl.addEventListener('click', () => onRename());
      model.onChange(() => this._renderName());
      this._renderName();
    }

    _renderName() {
      this.nameEl.textContent = this.model.name;
    }

    // node_library_proposal.md ask 3: the toolbar's "Add Threat"/"Add
    // Consequence" buttons go through the same shared create-or-choose modal
    // as every other creation entry point.
    _openCreateOrChoose(type, addFn) {
      Bowtie.openCreateOrChooseNodeModal({
        model: this.model,
        type,
        onCreate: (fields) => addFn(fields),
        onChooseExisting: (node) => addFn({ nodeId: node.id }),
      });
    }
  }

  Bowtie.ToolbarController = ToolbarController;
})(window.Bowtie = window.Bowtie || {});
