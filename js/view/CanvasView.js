(function (Bowtie) {
  class CanvasView {
    // The live canvas names its two layers by id; an off-screen render
    // surface (ExportUtil.renderPageToSvg, for exporting a page that
    // isn't the active one) uses classes instead, so the document never
    // carries duplicate ids.
    constructor(svgRoot) {
      this.svgRoot = svgRoot;
      this.connectionsLayer = svgRoot.querySelector('#connections-layer, .connections-layer');
      this.nodesLayer = svgRoot.querySelector('#nodes-layer, .nodes-layer');
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
    //
    // `phase` ('pre' | 'post' | null) is set only when the badge is one
    // half of a pre-mitigation -> post-mitigation pair (Quantitative mode,
    // see render below): it names which half in the tooltip and gives the
    // pre-mitigation badge a dashed ring, so the two read as "before" and
    // "after" rather than two unexplained letters. A lone badge (Qualitative
    // mode's single manual pick) keeps the plain tooltip.
    _renderRiskBadge(cx, cy, riskClass, { phase = null } = {}) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const PHASE_LABELS = {
        pre: 'Pre-mitigation (no barriers)',
        post: 'Post-mitigation (with barriers)',
      };
      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('class', phase ? `risk-class-badge risk-class-badge-${phase}` : 'risk-class-badge');
      const title = document.createElementNS(svgNs, 'title');
      const classText = riskClass.reviewPeriod
        ? `${riskClass.label} — ${riskClass.reviewPeriod}`
        : riskClass.label;
      title.textContent = phase ? `${PHASE_LABELS[phase]}: ${classText}` : classText;
      g.appendChild(title);
      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', 11);
      circle.setAttribute('fill', riskClass.colour || '#888');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '1.5');
      // Inline (not a CSS rule) so an SVG/PNG export keeps the distinction.
      if (phase === 'pre') circle.setAttribute('stroke-dasharray', '2.5 2');
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

    // The "->" between a pre-mitigation and post-mitigation badge pair.
    _renderBadgeArrow(cx, cy) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const text = document.createElementNS(svgNs, 'text');
      text.setAttribute('class', 'risk-class-badge-arrow');
      text.setAttribute('x', cx);
      text.setAttribute('y', cy);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#4b5563');
      text.textContent = '→';
      return text;
    }

    // "At a glance" text under a node -- one or more short lines (severity/
    // likelihood on an Consequence, computed likelihood on the TLE), centered
    // below its shape. Distinct from the risk-class badge above: the badge
    // is a compact glanceable chip, this is the actual labeled figures
    // (quantitative_mode_proposal.md's own "Node Library/rename modal is
    // where the full picks live" note only scopes the CUSTOM MATRIX EDITOR
    // out of the canvas, not a plain summary of the picks already made).
    // `emphasized` (design review finding 03): Quantitative mode's frequency/
    // RRF/likelihood figures are the actual deliverable of that mode, not
    // secondary chrome the way a Simple-mode Threat/Consequence name's plain
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
    // Decimal a Threat's own entered frequency is.
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
    // like an Unknown threat, it's silently SKIPPED from the fold instead
    // (Quantitative.js's own "conservative" skip rule) -- worth flagging
    // on the barrier itself since nothing else surfaces it.
    // The three "at a glance" summaries the canvas prints under a node.
    // Extracted from render() so CanvasKeyboardController's accessible
    // names (proposals/13) are built from the SAME strings a sighted user
    // reads -- a screen-reader name that drifts from the drawing is worse
    // than none, because nothing would ever catch it.
    // What a screen reader says for one node: what it is, what it is
    // called, and whatever figures the canvas prints beside it -- built
    // from the same info-line builders below, so the spoken and the drawn
    // versions cannot disagree (proposals/13).
    //
    // A barrier also says which lines run through it, because that is the
    // one thing a sighted user reads from the picture (the bar crossing
    // two lanes) and a screen-reader user cannot.
    _accessibleName(model, placement, displayUnit) {
      const TYPE_WORDS = {
        threat: 'Threat',
        consequence: 'Consequence',
        preventativeBarrier: 'Preventative barrier',
        mitigativeBarrier: 'Mitigative barrier',
        escalationFactor: 'Escalation factor',
        escalationBarrier: 'Escalation barrier',
      };
      const node = model.getNode(placement.nodeId);
      const parts = [`${TYPE_WORDS[placement.type] || placement.type} ${model.displayIdentifierFor(node)}`];
      if (node.name) parts.push(node.name);

      if (placement.type === 'threat') parts.push(...this._threatInfoLines(model, placement, displayUnit));
      else if (placement.type === 'consequence') {
        parts.push(...this._consequenceInfoLines(model, placement, displayUnit));
        const assessment = model.mode !== 'simple' && model.riskMatrix
          ? model.assessConsequence(placement.id) : null;
        if (assessment && assessment.post && assessment.post.riskClass) {
          parts.push(`risk class ${assessment.post.riskClass.label}`);
          if (assessment.pre && assessment.pre.riskClass) {
            parts.push(`pre-mitigation ${assessment.pre.riskClass.label}`);
          }
        }
      } else if (placement.type === 'preventativeBarrier' || placement.type === 'mitigativeBarrier') {
        parts.push(...this._barrierInfoLines(model, node, placement).lines);
        const origins = model.linesThrough(placement.id)
          .map((line) => model.findById(line.originId))
          .filter(Boolean)
          .map((origin) => model.displayIdentifierFor(model.getNode(origin.nodeId)));
        if (origins.length > 0) parts.push(`on lines from ${origins.join(' and ')}`);
        const factors = model.escalationFactorsFor(placement.id);
        if (factors.length > 0) parts.push(`${factors.length} escalation factor${factors.length > 1 ? 's' : ''}`);
      } else if (placement.type === 'escalationFactor') {
        const barrier = model.findById(placement.barrierId);
        if (barrier) parts.push(`degrades ${model.displayIdentifierFor(model.getNode(barrier.nodeId))}`);
      }
      return parts.join(', ');
    }

    // The top event and the hazard are not library nodes -- they belong to
    // the page, one each, and carry their own name -- so they get their
    // own small builder rather than being forced through the placement
    // one.
    _fixtureName(model, el, displayUnit) {
      if (el.type === 'hazard') return `Hazard, ${el.name}`;
      if (el.type !== 'topLevelEvent') return el.name || el.type;
      return [`Top event, ${el.name}`, ...this._tleInfoLines(model, displayUnit)].join(', ');
    }

    _tleInfoLines(model, displayUnit) {
      // Quantitative mode only: Qualitative has no arithmetic combination
      // defined for threats (each is a direct class pick).
      if (model.mode !== 'quantitative') return [];
      const residual = model.computeTleLikelihoodForActivePage();
      const text = this._formatLikelihood(residual.value, displayUnit);
      if (!text) return [];
      // Design review finding 11: name the active aggregation right on the
      // figure it produced, since 'max' and 'sum' are both valid, very
      // differently-valued answers for the same diagram. Appended in
      // parens so this stays a superstring of "Likelihood: <value>".
      const lines = [`Likelihood: ${text} (${model.tleAggregation})`];
      if (residual.excludedThreatCount) lines.push(`(${residual.excludedThreatCount} excluded)`);
      return lines;
    }

    // An explicit "Unknown" line (rather than silence) matters here: an
    // Unknown frequency isn't just "not shown", it EXCLUDES this threat
    // from the TLE's calculation entirely.
    _threatInfoLines(model, threat, displayUnit) {
      if (model.mode === 'simple') return [];
      const node = model.getNode(threat.nodeId);
      const lines = [];
      if (model.mode === 'qualitative' && model.riskMatrix && node.likelihoodClassId) {
        const likelihood = Bowtie.RiskMatrix.likelihoodClass(model.riskMatrix, node.likelihoodClassId);
        if (likelihood) lines.push(`Likelihood: ${likelihood.label}`);
      } else if (model.mode === 'quantitative' && node.frequency) {
        if (node.frequency.unknown) {
          lines.push('Frequency: Unknown');
        } else {
          const text = this._formatLikelihood(Bowtie.RiskMatrix.quantityToDecimal(node.frequency), displayUnit);
          if (text) lines.push(`Frequency: ${text}`);
        }
      }
      return lines;
    }

    _consequenceInfoLines(model, consequence, displayUnit) {
      if (model.mode === 'simple') return [];
      const node = model.getNode(consequence.nodeId);
      const lines = [];
      if (model.riskMatrix && node.severityClassId) {
        const severity = Bowtie.RiskMatrix.severityClass(model.riskMatrix, node.severityClassId);
        if (severity) lines.push(`Severity: ${severity.label}`);
      }
      if (model.mode === 'qualitative' && model.riskMatrix && node.likelihoodClassId) {
        const likelihood = Bowtie.RiskMatrix.likelihoodClass(model.riskMatrix, node.likelihoodClassId);
        if (likelihood) lines.push(`Likelihood: ${likelihood.label}`);
      } else if (model.mode === 'quantitative') {
        const residual = model.computeConsequenceLikelihood(consequence.id);
        const text = this._formatLikelihood(residual.value, displayUnit);
        // Same finding-11 labeling as the TLE: this figure derives from
        // the TLE's own aggregated likelihood, so it carries the same
        // 'max'-vs-'sum' dependency.
        if (text) lines.push(`Likelihood: ${text} (${model.tleAggregation})`);
        // The same figure with every barrier removed -- the "before" half
        // of the badge pair, as an actual number.
        const inherent = model.computeConsequenceLikelihood(consequence.id, { includeBarriers: false });
        const inherentText = this._formatLikelihood(inherent.value, displayUnit);
        if (inherentText) lines.push(`Pre-mitigation: ${inherentText}`);
      }
      return lines;
    }

    // `placement`, when given, brings in what this barrier's uncontrolled
    // escalation factors cost it (proposals/21): the degradation is a
    // property of the placement, not of the library node, since the same
    // barrier can be degraded on one page and untouched on another.
    _barrierInfoLines(model, node, placement) {
      if (model.mode !== 'quantitative' || !node.protection) return { lines: [], title: null };
      if (node.protection.unknown) return { lines: ['Barrier: Unknown'], title: null };
      const measure = Bowtie.BarrierMeasures.list().find((m) => m.id === node.protection.measure);
      if (!measure) return { lines: [], title: null };
      const value = Bowtie.Decimal.parse(node.protection.value).toDisplayNumber(3);
      const defaults = { dangerousFraction: model.dangerousFraction, proofTestIntervalH: model.proofTestIntervalH };
      const degradation = placement ? model.degradationSummaryFor(placement.id) : null;
      if (!degradation) {
        return {
          lines: [`${measure.short}: ${value}`],
          title: Bowtie.BarrierMeasures.describe(node.protection, defaults),
        };
      }
      // The claimed figure keeps its place -- it is what the analyst
      // entered and what Properties shows -- with the short form of the
      // degradation on its own line beneath it, so a degraded barrier can
      // never look like an undegraded one at a glance. The full
      // claimed-and-effective reading, and the count behind it, go in the
      // hover title rather than onto the diagram.
      const factors = `${degradation.factors} uncontrolled escalation factor${degradation.factors === 1 ? '' : 's'}`;
      return {
        lines: [`${measure.short}: ${value}`, degradation.describe],
        title: [degradation.effect, factors].filter(Boolean).join('\n'),
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
      // "Canvas badges"): the highest contributing threat's frequency times
      // its own known preventative barriers, Quantitative mode only --
      // Qualitative mode has no arithmetic combination defined for threats
      // (each is a direct class pick, nothing to combine at the TLE).
      const tleLines = this._tleInfoLines(model, displayUnit);
      if (tleLines.length > 0) {
        const infoY = model.topLevelEvent.y + tleResult.bounds.r + 14;
        nodeGroups.push(this._renderInfoText(model.topLevelEvent.x, infoY, tleLines, { emphasized: true }));
        extend(model.topLevelEvent.x, infoY + tleLines.length * 15, 60, 10);
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
      // thing labeled T_1" -- including every test in this suite written
      // before the node library existed -- would naturally look up
      // instead). Both keys always describe the exact same bounds, since
      // "at most one placement per node per page" holds.
      model.threats.forEach((threat) => {
        const { stableId, displayId, displayName } = displayFor(threat);
        const result = Bowtie.ShapeRenderer.renderThreat(this.svgRoot, threat, stableId, displayId, displayName);
        boundsById[threat.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(threat.x, threat.y, result.bounds.w / 2, result.bounds.h / 2);

        // Likelihood/frequency "at a glance" summary, underneath the
        // Threat's own box -- mirrors the Consequence summary below. An explicit
        // "Unknown" line (rather than silence) matters here: an Unknown
        // frequency isn't just "not shown", it EXCLUDES this threat from the
        // TLE's max-of-known-frequencies calculation entirely (BowtieModel.
        // computeTleLikelihood) -- worth flagging on the threat itself, not
        // just as an aggregate count at the TLE.
        {
          const infoLines = this._threatInfoLines(model, threat, displayUnit);
          if (infoLines.length > 0) {
            const emphasized = model.mode === 'quantitative';
            const infoY = threat.y + result.bounds.h / 2 + 14;
            nodeGroups.push(this._renderInfoText(threat.x, infoY, infoLines, { emphasized }));
            extend(threat.x, infoY + infoLines.length * (emphasized ? 15 : 13), result.bounds.w / 2, 10);
          }
        }
      });

      model.consequences.forEach((consequence) => {
        const { stableId, displayId, displayName } = displayFor(consequence);
        const result = Bowtie.ShapeRenderer.renderConsequence(this.svgRoot, consequence, stableId, displayId, displayName);
        boundsById[consequence.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(consequence.x, consequence.y, result.bounds.w / 2, result.bounds.h / 2);

        // Risk-class badge (quantitative_mode_proposal.md "Canvas badges"):
        // a small colour-coded chip at the consequence's own risk class,
        // mode-aware (assessConsequence picks manual vs. computed
        // likelihood per BowtieModel's own mode dispatch) -- silent
        // (nothing rendered) whenever there's no active matrix or the
        // class can't yet be determined, exactly like every other
        // "nothing computed" case in this feature.
        //
        // In Quantitative mode this is a PAIR -- "pre-mitigation ->
        // post-mitigation", the proposal's inherent/residual ALARP picture
        // -- with the post-mitigation badge keeping the original top-right
        // spot and the pre-mitigation one (dashed ring) to its left. The
        // pre-mitigation class needs exactly the same inputs as the post-
        // mitigation one minus the barriers, so it's never determinable
        // when the post-mitigation class isn't.
        if (model.mode !== 'simple' && model.riskMatrix) {
          const assessment = model.assessConsequence(consequence.id);
          const postClass = assessment ? assessment.post.riskClass : null;
          const preClass = assessment && assessment.pre ? assessment.pre.riskClass : null;
          const badgeX = consequence.x + result.bounds.w / 2;
          const badgeY = consequence.y - result.bounds.h / 2;
          if (postClass && preClass) {
            nodeGroups.push(this._renderRiskBadge(badgeX - 46, badgeY, preClass, { phase: 'pre' }));
            nodeGroups.push(this._renderBadgeArrow(badgeX - 23, badgeY));
            nodeGroups.push(this._renderRiskBadge(badgeX, badgeY, postClass, { phase: 'post' }));
          } else if (postClass) {
            nodeGroups.push(this._renderRiskBadge(badgeX, badgeY, postClass));
          }
        }

        // Severity/likelihood "at a glance" summary, underneath the
        // Consequence's own box: whichever of severity/likelihood is actually
        // set, mode-aware (qualitative = the manual likelihood pick,
        // quantitative = the computed residual likelihood) -- silent when
        // this consequence's node has nothing set yet.
        {
          const infoLines = this._consequenceInfoLines(model, consequence, displayUnit);
          if (infoLines.length > 0) {
            const emphasized = model.mode === 'quantitative';
            const infoY = consequence.y + result.bounds.h / 2 + 14;
            nodeGroups.push(this._renderInfoText(consequence.x, infoY, infoLines, { emphasized }));
            extend(consequence.x, infoY + infoLines.length * (emphasized ? 15 : 13), result.bounds.w / 2, 10);
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
        const { lines: infoLines, title: infoTitle } = this._barrierInfoLines(model, pbNode, pb);
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
        const { lines: infoLines, title: infoTitle } = this._barrierInfoLines(model, mbNode, mb);
        if (infoLines.length > 0) {
          // Same as the Preventative Barrier case above: always
          // Quantitative mode's protection figure, so always emphasized.
          const infoY = result.bounds.labelCenterY + result.bounds.labelHalfHeight + 14;
          nodeGroups.push(this._renderInfoText(mb.x, infoY, infoLines, { emphasized: true, title: infoTitle }));
          extend(mb.x, infoY + infoLines.length * 15, result.bounds.labelHalfWidth, 10);
        }
      });

      // Escalation factors and their controls (proposals/08), rendered
      // after the barriers so a factor's bounds can be measured against
      // the barrier it hangs off. A factor is keyed in the DOM by its
      // PLACEMENT id rather than its node id: it is the one kind that can
      // appear twice on a page (degrading two barriers), so the node id
      // would not be unique here -- see ShapeRenderer.
      model.escalationFactors.forEach((factor) => {
        const { displayId, displayName } = displayFor(factor);
        const result = Bowtie.ShapeRenderer.renderEscalationFactor(
          this.svgRoot, factor, factor.id, displayId, displayName,
        );
        boundsById[factor.id] = result.bounds;
        nodeGroups.push(result.g);
        extend(factor.x, factor.y, result.bounds.w / 2, result.bounds.h / 2);
      });

      model.escalationBarriers.forEach((eb) => {
        const { stableId, displayId, displayName } = displayFor(eb);
        const result = Bowtie.ShapeRenderer.renderEscalationBarrier(
          this.svgRoot, eb, stableId, displayId, displayName,
        );
        boundsById[eb.id] = result.bounds;
        boundsById[stableId] = result.bounds;
        nodeGroups.push(result.g);
        extend(eb.x, eb.y, result.bounds.w / 2, result.bounds.h / 2);
        // Its label runs to the RIGHT rather than below (the line
        // continues below it), so the content bounds have to follow it
        // there or an export crops it.
        extend(
          (eb.x + result.bounds.labelRight) / 2, result.bounds.labelCenterY,
          Math.abs(result.bounds.labelRight - eb.x) / 2, result.bounds.labelHalfHeight,
        );
      });

      const connectionsFragment = Bowtie.ConnectionRenderer.render(model, boundsById, hazardLayout, opts);

      // Accessibility (proposals/13): every node becomes a focusable,
      // self-describing group. `focusable="true"` is for Safari, which
      // otherwise ignores tabindex on SVG elements. The roving tabindex
      // itself -- exactly one node at 0, the rest at -1 -- is applied by
      // CanvasKeyboardController after this render, since which node holds
      // it is controller state that has to survive replaceChildren.
      nodeGroups.forEach((g) => {
        if (!g.classList || !g.classList.contains('node')) return;
        const placement = model.findById(g.getAttribute('data-id'));
        if (!placement) return;
        g.setAttribute('role', 'group');
        g.setAttribute('tabindex', '-1');
        g.setAttribute('focusable', 'true');
        g.setAttribute('aria-label', placement.nodeId
          ? this._accessibleName(model, placement, displayUnit)
          : this._fixtureName(model, placement, displayUnit));
      });

      this.connectionsLayer.replaceChildren(connectionsFragment);
      this.nodesLayer.replaceChildren(...nodeGroups);

      this.boundsById = boundsById;
      this._contentBounds = { minX, minY, maxX, maxY };
    }
  }

  Bowtie.CanvasView = CanvasView;
})(window.Bowtie = window.Bowtie || {});
