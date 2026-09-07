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

    // "At a glance" text under a node -- one or more short lines (severity/
    // likelihood on an Outcome, computed likelihood on the TLE), centered
    // below its shape. Distinct from the risk-class badge above: the badge
    // is a compact glanceable chip, this is the actual labeled figures
    // (quantitative_mode_proposal.md's own "Node Library/rename modal is
    // where the full picks live" note only scopes the CUSTOM MATRIX EDITOR
    // out of the canvas, not a plain summary of the picks already made).
    _renderInfoText(cx, topY, lines) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('class', 'node-info-text');
      lines.forEach((line, i) => {
        const text = document.createElementNS(svgNs, 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', topY + i * 13);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '11');
        text.setAttribute('fill', '#4b5563');
        text.textContent = line;
        g.appendChild(text);
      });
      return g;
    }

    // Canonical events/hour -> a short display string in whichever unit
    // Project Settings' display-unit preference says -- read-only, purely
    // for this text (never fed back into a calculation), same rule as
    // PropertiesModal.js's own formatLikelihood.
    _formatLikelihood(decimalValue, displayUnit) {
      if (decimalValue === null) return null;
      const converted = displayUnit === 'year'
        ? Bowtie.convertHourYear(decimalValue, 'hourToYear')
        : decimalValue;
      return `${converted.toDisplayNumber(3)}/${displayUnit === 'year' ? 'yr' : 'hr'}`;
    }

    // Risk-reduction-factor "at a glance" summary, underneath a barrier's
    // own id/name label -- shared by both Preventative and Mitigative
    // barriers. An explicit "Unknown" line matters here too: an Unknown
    // barrier isn't excluded like an Unknown cause, it's silently SKIPPED
    // from the product instead (BowtieModel.computeTleLikelihood/
    // computeConsequenceLikelihood's own "conservative" skip rule) -- worth
    // flagging on the barrier itself since nothing else surfaces it.
    _barrierInfoLines(model, node) {
      if (model.mode !== 'quantitative' || !node.riskReductionFactor) return [];
      if (node.riskReductionFactor.unknown) return ['RRF: Unknown'];
      const rrf = Bowtie.RiskMatrix.quantityToDecimal(node.riskReductionFactor);
      return rrf ? [`RRF: ${rrf.toDisplayNumber(3)}`] : [];
    }

    render(model, opts = {}) {
      const displayUnit = opts.displayUnit || 'hour';
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

      // TLE computed-likelihood summary (quantitative_mode_proposal.md
      // "Canvas badges"): the highest contributing cause's frequency times
      // its own known preventative barriers, Quantitative mode only --
      // Qualitative mode has no arithmetic combination defined for causes
      // (each is a direct class pick, nothing to combine at the TLE).
      if (model.mode === 'quantitative') {
        const residual = model.computeTleLikelihoodForActivePage();
        const text = this._formatLikelihood(residual.value, displayUnit);
        if (text) {
          const lines = [`Likelihood: ${text}`];
          if (residual.excludedThreatCount) lines.push(`(${residual.excludedThreatCount} excluded)`);
          const infoY = model.topLevelEvent.y + tleResult.bounds.r + 14;
          nodeGroups.push(this._renderInfoText(model.topLevelEvent.x, infoY, lines));
          extend(model.topLevelEvent.x, infoY + lines.length * 13, 60, 10);
        }
      }

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

        // Likelihood/frequency "at a glance" summary, underneath the
        // Cause's own box -- mirrors the Outcome summary below. An explicit
        // "Unknown" line (rather than silence) matters here: an Unknown
        // frequency isn't just "not shown", it EXCLUDES this cause from the
        // TLE's max-of-known-frequencies calculation entirely (BowtieModel.
        // computeTleLikelihood) -- worth flagging on the cause itself, not
        // just as an aggregate count at the TLE.
        if (model.mode !== 'simple') {
          const causeNode = model.getNode(cause.nodeId);
          const infoLines = [];
          if (model.mode === 'qualitative' && model.riskMatrix && causeNode.likelihoodClassId) {
            const likelihood = Bowtie.RiskMatrix.likelihoodClass(model.riskMatrix, causeNode.likelihoodClassId);
            if (likelihood) infoLines.push(`Likelihood: ${likelihood.label}`);
          } else if (model.mode === 'quantitative' && causeNode.frequency) {
            if (causeNode.frequency.unknown) {
              infoLines.push('Frequency: Unknown');
            } else {
              const freq = Bowtie.RiskMatrix.quantityToDecimal(causeNode.frequency);
              const text = this._formatLikelihood(freq, displayUnit);
              if (text) infoLines.push(`Frequency: ${text}`);
            }
          }
          if (infoLines.length > 0) {
            const infoY = cause.y + result.bounds.h / 2 + 14;
            nodeGroups.push(this._renderInfoText(cause.x, infoY, infoLines));
            extend(cause.x, infoY + infoLines.length * 13, result.bounds.w / 2, 10);
          }
        }
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

        // Severity/likelihood "at a glance" summary, underneath the
        // Outcome's own box: whichever of severity/likelihood is actually
        // set, mode-aware (qualitative = the manual likelihood pick,
        // quantitative = the computed residual likelihood) -- silent when
        // this outcome's node has nothing set yet.
        if (model.mode !== 'simple') {
          const outcomeNode = model.getNode(outcome.nodeId);
          const infoLines = [];
          if (model.riskMatrix && outcomeNode.severityClassId) {
            const severity = Bowtie.RiskMatrix.severityClass(model.riskMatrix, outcomeNode.severityClassId);
            if (severity) infoLines.push(`Severity: ${severity.label}`);
          }
          if (model.mode === 'qualitative' && model.riskMatrix && outcomeNode.likelihoodClassId) {
            const likelihood = Bowtie.RiskMatrix.likelihoodClass(model.riskMatrix, outcomeNode.likelihoodClassId);
            if (likelihood) infoLines.push(`Likelihood: ${likelihood.label}`);
          } else if (model.mode === 'quantitative') {
            const residual = model.computeConsequenceLikelihood(outcome.id);
            const text = this._formatLikelihood(residual.value, displayUnit);
            if (text) infoLines.push(`Likelihood: ${text}`);
          }
          if (infoLines.length > 0) {
            const infoY = outcome.y + result.bounds.h / 2 + 14;
            nodeGroups.push(this._renderInfoText(outcome.x, infoY, infoLines));
            extend(outcome.x, infoY + infoLines.length * 13, result.bounds.w / 2, 10);
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

        const pbNode = model.getNode(pb.nodeId);
        const infoLines = this._barrierInfoLines(model, pbNode);
        if (infoLines.length > 0) {
          const infoY = result.bounds.labelCenterY + result.bounds.labelHalfHeight + 14;
          nodeGroups.push(this._renderInfoText(pb.x, infoY, infoLines));
          extend(pb.x, infoY + infoLines.length * 13, result.bounds.labelHalfWidth, 10);
        }
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

        const mbNode = model.getNode(mb.nodeId);
        const infoLines = this._barrierInfoLines(model, mbNode);
        if (infoLines.length > 0) {
          const infoY = result.bounds.labelCenterY + result.bounds.labelHalfHeight + 14;
          nodeGroups.push(this._renderInfoText(mb.x, infoY, infoLines));
          extend(mb.x, infoY + infoLines.length * 13, result.bounds.labelHalfWidth, 10);
        }
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
