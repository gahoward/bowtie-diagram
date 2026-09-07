(function (Bowtie) {
  class CanvasView {
    constructor(svgRoot) {
      this.svgRoot = svgRoot;
      this.connectionsLayer = svgRoot.querySelector('#connections-layer');
      this.nodesLayer = svgRoot.querySelector('#nodes-layer');
      this.boundsById = {};
      this._contentBounds = null;
    }

    getContentBounds() {
      return this._contentBounds;
    }

    // A small colour-coded circle + risk-class letter, top-right of a
    // consequence's own box -- matches "the existing barrier-chip visual
    // language" the design doc asks for (a simple, legible chip rather
    // than a full data panel on the canvas itself; the Node Library/rename
    // modal is where the full likelihood/severity picks live).
    _renderRiskBadge(cx, cy, riskClass) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('class', 'risk-class-badge');
      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', 11);
      circle.setAttribute('fill', riskClass.colour || '#888');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '1.5');
      g.appendChild(circle);
      const text = document.createElementNS(svgNs, 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', cy);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#ffffff');
      text.textContent = riskClass.id;
      g.appendChild(text);
      return g;
    }

    render(model, opts = {}) {
      const boundsById = {};
      const nodeGroups = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const extend = (cx, cy, halfW, halfH) => {
        minX = Math.min(minX, cx - halfW);
        maxX = Math.max(maxX, cx + halfW);
        minY = Math.min(minY, cy - halfH);
        maxY = Math.max(maxY, cy + halfH);
      };

      const tleResult = Bowtie.ShapeRenderer.renderTopLevelEvent(this.svgRoot, model.topLevelEvent);
      boundsById[model.topLevelEvent.id] = tleResult.bounds;
      nodeGroups.push(tleResult.g);
      extend(model.topLevelEvent.x, model.topLevelEvent.y, tleResult.bounds.r, tleResult.bounds.r);

      const hazardLayout = Bowtie.Layout.hazardLayout(
        this.svgRoot, model.hazard, model.topLevelEvent, tleResult.bounds.r,
      );
      const hazardResult = Bowtie.ShapeRenderer.renderHazard(model.hazard, hazardLayout);
      boundsById[model.hazard.id] = hazardResult.bounds;
      nodeGroups.push(hazardResult.g);
      extend(hazardLayout.x, hazardLayout.y, hazardLayout.w / 2, hazardLayout.h / 2);

      // Every rendered label resolves through the placement's `nodeId`
      // against the shared library (node_library_proposal.md "Two id
      // spaces") — never the placement's own `.id`/`.name`, which no
      // longer exist for this purpose (the placement's `.id` stays only as
      // the DOM `data-id` ShapeRenderer sets, for drag/context-menu/focus
      // lookups).
      const displayFor = (placement) => {
        const node = model.getNode(placement.nodeId);
        return { stableId: node.id, displayId: model.displayIdentifierFor(node), displayName: node.name };
      };

      // Every bounds entry is written under BOTH the placement's own
      // internal id (what ConnectionRenderer's Line.stops/originId-based
      // lookups below actually key on -- unaffected by any of this) AND
      // the resolved node's stable id (what a caller reasoning about "the
      // thing labeled C_1" -- including every test in this suite written
      // before the node library existed -- would naturally look up
      // instead). Both keys always describe the exact same bounds, since
      // "at most one placement per node per page" holds.
      model.causes.forEach((cause) => {
        const { stableId, displayId, displayName } = displayFor(cause);
        const result = Bowtie.ShapeRenderer.renderCause(this.svgRoot, cause, stableId, displayId, displayName);
        boundsById[cause.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(cause.x, cause.y, result.bounds.w / 2, result.bounds.h / 2);
      });

      model.outcomes.forEach((outcome) => {
        const { stableId, displayId, displayName } = displayFor(outcome);
        const result = Bowtie.ShapeRenderer.renderOutcome(this.svgRoot, outcome, stableId, displayId, displayName);
        boundsById[outcome.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(outcome.x, outcome.y, result.bounds.w / 2, result.bounds.h / 2);

        // Risk-class badge (quantitative_mode_proposal.md "Canvas badges"):
        // a small colour-coded chip at the consequence's own risk class,
        // mode-aware (getConsequenceRiskClass picks manual vs. computed
        // likelihood per BowtieModel's own mode dispatch) -- silent
        // (nothing rendered) whenever there's no active matrix or the
        // class can't yet be determined, exactly like every other
        // "nothing computed" case in this feature.
        if (model.mode !== 'simple' && model.riskMatrix) {
          const riskClassId = model.getConsequenceRiskClass(outcome.id);
          if (riskClassId) {
            const riskClass = Bowtie.RiskMatrix.riskClass(model.riskMatrix, riskClassId);
            if (riskClass) {
              nodeGroups.push(this._renderRiskBadge(outcome.x + result.bounds.w / 2, outcome.y - result.bounds.h / 2, riskClass));
            }
          }
        }
      });

      model.preventativeBarriers.forEach((pb) => {
        const laneYs = model.laneYsThrough(pb.id);
        const { stableId, displayId, displayName } = displayFor(pb);
        const result = Bowtie.ShapeRenderer.renderPreventativeBarrier(
          this.svgRoot, pb, laneYs, stableId, displayId, displayName,
        );
        boundsById[pb.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(pb.x, result.bounds.cy, result.bounds.w / 2, result.bounds.h / 2);
        extend(pb.x, result.bounds.labelCenterY, result.bounds.labelHalfWidth, result.bounds.labelHalfHeight);
      });

      model.mitigativeBarriers.forEach((mb) => {
        const laneYs = model.laneYsThrough(mb.id);
        const { stableId, displayId, displayName } = displayFor(mb);
        const result = Bowtie.ShapeRenderer.renderMitigativeBarrier(
          this.svgRoot, mb, laneYs, stableId, displayId, displayName,
        );
        boundsById[mb.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(mb.x, result.bounds.cy, result.bounds.w / 2, result.bounds.h / 2);
        extend(mb.x, result.bounds.labelCenterY, result.bounds.labelHalfWidth, result.bounds.labelHalfHeight);
      });

      const connectionsFragment = Bowtie.ConnectionRenderer.render(model, boundsById, hazardLayout, opts);

      this.connectionsLayer.replaceChildren(connectionsFragment);
      this.nodesLayer.replaceChildren(...nodeGroups);

      this.boundsById = boundsById;
      this._contentBounds = { minX, minY, maxX, maxY };
    }
  }

  Bowtie.CanvasView = CanvasView;
})(window.Bowtie = window.Bowtie || {});
