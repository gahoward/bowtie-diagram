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

      model.causes.forEach((cause) => {
        const result = Bowtie.ShapeRenderer.renderCause(this.svgRoot, cause);
        boundsById[cause.id] = result.bounds;
        nodeGroups.push(result.g);
        extend(cause.x, cause.y, result.bounds.w / 2, result.bounds.h / 2);
      });

      model.outcomes.forEach((outcome) => {
        const result = Bowtie.ShapeRenderer.renderOutcome(this.svgRoot, outcome);
        boundsById[outcome.id] = result.bounds;
        nodeGroups.push(result.g);
        extend(outcome.x, outcome.y, result.bounds.w / 2, result.bounds.h / 2);
      });

      model.preventativeBarriers.forEach((pb) => {
        const laneYs = model.laneYsThrough(pb.id);
        const result = Bowtie.ShapeRenderer.renderPreventativeBarrier(this.svgRoot, pb, laneYs);
        boundsById[pb.id] = result.bounds;
        nodeGroups.push(result.g);
        extend(pb.x, result.bounds.cy, result.bounds.w / 2, result.bounds.h / 2);
        extend(pb.x, result.bounds.labelCenterY, result.bounds.labelHalfWidth, result.bounds.labelHalfHeight);
      });

      model.mitigativeBarriers.forEach((mb) => {
        const laneYs = model.laneYsThrough(mb.id);
        const result = Bowtie.ShapeRenderer.renderMitigativeBarrier(this.svgRoot, mb, laneYs);
        boundsById[mb.id] = result.bounds;
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
