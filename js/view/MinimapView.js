(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MINI_W = 220;
  const MINI_H = 140;
  const PAD = 10;

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  // Every <defs> id (the TLE's radial gradient, the Hazard's stripe
  // pattern — see ShapeRenderer) is freshly generated on every main-canvas
  // render, so a straight clone would duplicate those ids into the
  // document once the same content also lives inside the minimap. Browsers
  // happen to resolve the (invalid) duplicate to the first match either
  // way, which is visually harmless here since both copies are identical —
  // but it's still invalid HTML and worth not relying on, so give the
  // minimap's own copies distinct ids instead.
  function rewriteDefIds(root) {
    root.querySelectorAll('[id]').forEach((defEl) => {
      const oldId = defEl.getAttribute('id');
      const newId = `mini-${oldId}`;
      defEl.setAttribute('id', newId);
      root.querySelectorAll(`[fill="url(#${oldId})"]`).forEach((user) => {
        user.setAttribute('fill', `url(#${newId})`);
      });
    });
  }

  // Miniature overview of the whole diagram: a scaled-down LIVE clone of
  // the main canvas's own connections/nodes layers (the real shapes, the
  // real connection lines, the real colors — via the same CSS classes),
  // not a hand-drawn approximation of dots with no connecting lines at
  // all. A rectangle overlays the main canvas's current pan/zoom window;
  // click or drag anywhere on the minimap to jump the main view there.
  class MinimapView {
    constructor(containerEl, panZoom) {
      this.panZoom = panZoom;
      this.contentBounds = null;
      this.dragging = false;

      this.svg = el('svg', {
        class: 'minimap', width: MINI_W, height: MINI_H, viewBox: `0 0 ${MINI_W} ${MINI_H}`,
      });
      this.contentGroup = el('g', { class: 'minimap-content' });
      this.viewportRect = el('rect', { class: 'minimap-viewport' });
      this.svg.appendChild(this.contentGroup);
      this.svg.appendChild(this.viewportRect);
      containerEl.appendChild(this.svg);

      this.svg.addEventListener('pointerdown', (e) => { this.dragging = true; this._jumpTo(e); });
      window.addEventListener('pointermove', (e) => { if (this.dragging) this._jumpTo(e); });
      window.addEventListener('pointerup', () => { this.dragging = false; });

      panZoom.onChange(() => this._updateViewportRect());
    }

    // `connectionsLayer`/`nodesLayer` are CanvasView's own live <g>
    // elements, cloned rather than re-derived from model data — so the
    // minimap can never drift out of sync with what the main canvas
    // actually just rendered (a barrier's grown box, a bent connection
    // into the TLE, focus/warning styling, all of it).
    render(connectionsLayer, nodesLayer, contentBounds) {
      this.contentBounds = contentBounds;
      this.contentGroup.replaceChildren();
      if (!contentBounds) return;

      const scale = this._scale();
      const tx = PAD - contentBounds.minX * scale;
      const ty = PAD - contentBounds.minY * scale;
      this.contentGroup.setAttribute('transform', `translate(${tx}, ${ty}) scale(${scale})`);

      const connectionsClone = connectionsLayer.cloneNode(true);
      const nodesClone = nodesLayer.cloneNode(true);
      rewriteDefIds(nodesClone);
      this.contentGroup.appendChild(connectionsClone);
      this.contentGroup.appendChild(nodesClone);

      this._updateViewportRect();
    }

    _scale() {
      if (!this.contentBounds) return 1;
      const cw = Math.max(this.contentBounds.maxX - this.contentBounds.minX, 1);
      const ch = Math.max(this.contentBounds.maxY - this.contentBounds.minY, 1);
      return Math.min((MINI_W - PAD * 2) / cw, (MINI_H - PAD * 2) / ch);
    }

    // Uses `panZoom.getVisibleRect()` — NOT `panZoom.viewBox` directly. The
    // stored viewBox's aspect ratio is whatever `fitToBounds` last set (the
    // diagram's own content shape), which routinely differs from the
    // actual rendered canvas element's aspect ratio; the real visible area
    // can then extend well beyond `viewBox.w`/`.h` in the under-constrained
    // dimension (SVG letterboxing — see `getVisibleRect`'s own comment for
    // why that's genuinely visible, not just blank margin). Using the raw
    // viewBox here understated what was actually on screen, sometimes by a
    // large margin after zooming in.
    _updateViewportRect() {
      if (!this.contentBounds) return;
      const scale = this._scale();
      const vb = this.panZoom.getVisibleRect();
      this.viewportRect.setAttribute('x', PAD + (vb.x - this.contentBounds.minX) * scale);
      this.viewportRect.setAttribute('y', PAD + (vb.y - this.contentBounds.minY) * scale);
      this.viewportRect.setAttribute('width', Math.max(vb.w * scale, 4));
      this.viewportRect.setAttribute('height', Math.max(vb.h * scale, 4));
    }

    _jumpTo(e) {
      if (!this.contentBounds) return;
      const rect = this.svg.getBoundingClientRect();
      const scale = this._scale();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.panZoom.centerOn(
        this.contentBounds.minX + (mx - PAD) / scale,
        this.contentBounds.minY + (my - PAD) / scale,
      );
    }
  }

  Bowtie.MinimapView = MinimapView;
})(window.Bowtie = window.Bowtie || {});
