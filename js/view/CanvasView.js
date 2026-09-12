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
    //
    // Design review finding 02: the letter alone (`riskClass.id`) means
    // nothing without already having the active risk matrix memorized --
    // every class the matrix defines also carries a full `label` (e.g. "A -
    // Intolerable") and, on the shipped presets, a `reviewPeriod` ("Immediate
    // action required"). A native SVG <title> is the cheapest way to surface
    // that on hover without adding any new UI; see ProjectSettingsController
    // for the persistent legend this pairs with.
    _renderRiskBadge(cx, cy, riskClass) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('class', 'risk-class-badge');
      const title = document.createElementNS(svgNs, 'title');
      title.textContent = riskClass.reviewPeriod
        ? `${riskClass.label} — ${riskClass.reviewPeriod}`
        : riskClass.label;
      g.appendChild(title);
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
    // `emphasized` (design review finding 03): Quantitative mode's frequency/
    // RRF/likelihood figures are the actual deliverable of that mode, not
    // secondary chrome the way a Simple-mode Cause/Outcome name's plain
    // label is -- rendering them at the same quiet 11px/muted-gray weight
    // as everything else meant every diagram's headline numbers were also
    // its smallest, least contrasted text, and one that only gets smaller
    // once PanZoomController's viewBox zooms out to fit a larger diagram.
    // Qualitative mode's manually-picked class labels keep the quieter
    // default -- they're a static category pick, not a computed result.
    _renderInfoText(cx, topY, lines, { emphasized = false, title = null } = {}) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('class', emphasized ? 'node-info-text node-info-text-emphasized' : 'node-info-text');
      if (title) {
        const titleEl = document.createElementNS(svgNs, 'title');
        titleEl.textContent = title;
        g.appendChild(titleEl);
      }
      const lineHeight = emphasized ? 15 : 13;
      lines.forEach((line, i) => {
        const text = document.createElementNS(svgNs, 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', topY + i * lineHeight);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', emphasized ? '13' : '11');
        if (emphasized) {
          text.setAttribute('font-weight', '600');
          // fill comes from .node-info-text-emphasized text in styles.css
          // (the same --node-text token .node text already uses) rather
          // than an inline var(...) attribute, matching how every other
          // token-driven fill in this file is applied via a CSS rule.
        } else {
          text.setAttribute('fill', '#4b5563');
        }
        text.textContent = line;
        g.appendChild(text);
      });
      return g;
    }

    // Canonical events/hour -> a short display string in whichever unit
    // Project Settings' display-unit preference says -- read-only, purely
    // for this text (never fed back into a calculation), same rule as
    // PropertiesModal.js's own formatLikelihood. Accepts either the
    // Bowtie.Rational a computed likelihood arrives as, or the plain
    // Decimal a Cause's own entered frequency is.
    _formatLikelihood(value, displayUnit) {
      if (value === null) return null;
      const rational = value instanceof Bowtie.Rational ? value : Bowtie.Rational.fromDecimal(value);
      const perYear = displayUnit === 'year';
      const shown = perYear
        ? rational.multiplyNumerator(Bowtie.Decimal.parse(String(Bowtie.HOURS_PER_YEAR)))
        : rational;
      return `${shown.toDisplayNumber(3)}/${perYear ? 'yr' : 'hr'}`;
    }

    // Barrier protection "at a glance" summary, underneath a barrier's own
    // id/name label -- shared by both Preventative and Mitigative
    // barriers. Shows WHAT WAS ENTERED (e.g. "PFD: 1.0E-2"), per barrier_
    // measures_proposal.md's "Units and display" -- that's what the
    // engineer recognises from their own source document; the normalised
    // equivalent (BarrierMeasures.describe) goes in the hover title
    // instead, following the risk-badge tooltip precedent. An explicit
    // "Unknown" line matters here too: an Unknown barrier isn't excluded
    // like an Unknown cause, it's silently SKIPPED from the fold instead
    // (Quantitative.js's own "conservative" skip rule) -- worth flagging
    // on the barrier itself since nothing else surfaces it.
    _barrierInfoLines(model, node) {
      if (model.mode !== 'quantitative' || !node.protection) return { lines: [], title: null };
      if (node.protection.unknown) return { lines: ['Barrier: Unknown'], title: null };
      const measure = Bowtie.BarrierMeasures.list().find((m) => m.id === node.protection.measure);
      if (!measure) return { lines: [], title: null };
      const value = Bowtie.Decimal.parse(node.protection.value).toDisplayNumber(3);
      const defaults = { dangerousFraction: model.dangerousFraction, proofTestIntervalH: model.proofTestIntervalH };
      return {
        lines: [`${measure.short}: ${value}`],
        title: Bowtie.BarrierMeasures.describe(node.protection, defaults),
      };
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
          // Design review finding 11: name the active aggregation right on
          // the figure it produced, since 'max' and 'sum' are both valid,
          // very differently-valued answers to "what's the TLE's
          // likelihood" for the exact same diagram. Appended in parens
          // (rather than before the value) so this stays a superstring of
          // the original "Likelihood: <value>" text.
          const lines = [`Likelihood: ${text} (${model.tleAggregation})`];
          if (residual.excludedThreatCount) lines.push(`(${residual.excludedThreatCount} excluded)`);
          const infoY = model.topLevelEvent.y + tleResult.bounds.r + 14;
          nodeGroups.push(this._renderInfoText(model.topLevelEvent.x, infoY, lines, { emphasized: true }));
          extend(model.topLevelEvent.x, infoY + lines.length * 15, 60, 10);
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
            const emphasized = model.mode === 'quantitative';
            const infoY = cause.y + result.bounds.h / 2 + 14;
            nodeGroups.push(this._renderInfoText(cause.x, infoY, infoLines, { emphasized }));
            extend(cause.x, infoY + infoLines.length * (emphasized ? 15 : 13), result.bounds.w / 2, 10);
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
            // Same finding-11 labeling as the TLE badge above -- this
            // figure is derived from the TLE's own aggregated likelihood
            // (see computeConsequenceLikelihood), so it carries the same
            // 'max'-vs-'sum' dependency.
            if (text) infoLines.push(`Likelihood: ${text} (${model.tleAggregation})`);
          }
          if (infoLines.length > 0) {
            const emphasized = model.mode === 'quantitative';
            const infoY = outcome.y + result.bounds.h / 2 + 14;
            nodeGroups.push(this._renderInfoText(outcome.x, infoY, infoLines, { emphasized }));
            extend(outcome.x, infoY + infoLines.length * (emphasized ? 15 : 13), result.bounds.w / 2, 10);
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
        const { lines: infoLines, title: infoTitle } = this._barrierInfoLines(model, pbNode);
        if (infoLines.length > 0) {
          // _barrierInfoLines only ever returns lines in Quantitative mode
          // (see its own guard) -- always the protection figure, so always
          // emphasized.
          const infoY = result.bounds.labelCenterY + result.bounds.labelHalfHeight + 14;
          nodeGroups.push(this._renderInfoText(pb.x, infoY, infoLines, { emphasized: true, title: infoTitle }));
          extend(pb.x, infoY + infoLines.length * 15, result.bounds.labelHalfWidth, 10);
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
        const { lines: infoLines, title: infoTitle } = this._barrierInfoLines(model, mbNode);
        if (infoLines.length > 0) {
          // Same as the Preventative Barrier case above: always
          // Quantitative mode's protection figure, so always emphasized.
          const infoY = result.bounds.labelCenterY + result.bounds.labelHalfHeight + 14;
          nodeGroups.push(this._renderInfoText(mb.x, infoY, infoLines, { emphasized: true, title: infoTitle }));
          extend(mb.x, infoY + infoLines.length * 15, result.bounds.labelHalfWidth, 10);
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
