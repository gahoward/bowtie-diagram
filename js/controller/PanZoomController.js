(function (Bowtie) {
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 4;
  const ZOOM_STEP = 1.1;

  // Manages the SVG viewBox directly (no CSS transform) so hit-testing,
  // getScreenCTM()-based drag math, and export all keep working unchanged.
  class PanZoomController {
    constructor(svgRoot, initialViewBox) {
      this.svgRoot = svgRoot;
      this.viewBox = { ...initialViewBox };
      this._baseW = initialViewBox.w;
      this.panning = null;
      this._listeners = [];

      this._applyViewBox();

      svgRoot.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
      svgRoot.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      window.addEventListener('pointermove', (e) => this._onPointerMove(e));
      window.addEventListener('pointerup', () => this._onPointerUp());

      // `getVisibleRect()` depends on the SVG element's own rendered size
      // (via getBoundingClientRect/getScreenCTM), not just `viewBox` — so
      // anything that resizes the element without touching viewBox (a
      // window resize, the toolbar wrapping to a second line, devtools
      // opening) changes the TRUE visible area without ever calling
      // `_emitChange()`. MinimapView only recomputes its viewport rectangle
      // from that event, so it was going stale exactly whenever the window
      // was resized after the last pan/zoom/fit — the bug report of the
      // minimap's blue rectangle not matching what's actually on screen.
      new ResizeObserver(() => this._emitChange()).observe(svgRoot);
    }

    onChange(fn) {
      this._listeners.push(fn);
    }

    _emitChange() {
      this._listeners.forEach((fn) => fn(this.viewBox));
    }

    _applyViewBox() {
      const { x, y, w, h } = this.viewBox;
      this.svgRoot.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    }

    _clientToSvgPoint(clientX, clientY) {
      const pt = this.svgRoot.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(this.svgRoot.getScreenCTM().inverse());
    }

    // The TRUE visible rectangle in SVG user-space — NOT simply `this.viewBox`.
    // `viewBox`'s aspect ratio is locked to whatever `fitToBounds` last set it
    // to (the diagram's own content aspect ratio at that moment), which
    // routinely differs from the actual rendered element's aspect ratio once
    // the window is a different shape or the user has zoomed. The SVG's
    // default `preserveAspectRatio="xMidYMid meet"` then letterboxes
    // whichever dimension is under-constrained — and critically, the real
    // clip boundary is the rendered ELEMENT's own box, not the nominal
    // viewBox rectangle, so diagram content sitting in that letterbox
    // margin still renders and is genuinely visible on screen (MinimapView
    // bug: its viewport overlay used to be built from raw `viewBox` alone,
    // so it understated what was actually visible — sometimes drastically,
    // since the under-constrained dimension isn't capped at `viewBox`'s own
    // size at all). Mapping the element's own actual bounding box back
    // through its `getScreenCTM` gives the true rectangle, accounting for
    // this letterboxing rather than assuming it away.
    getVisibleRect() {
      const rect = this.svgRoot.getBoundingClientRect();
      const ctm = this.svgRoot.getScreenCTM();
      if (!rect.width || !rect.height || !ctm) return { ...this.viewBox };
      const inv = ctm.inverse();
      const toPoint = (clientX, clientY) => {
        const pt = this.svgRoot.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        return pt.matrixTransform(inv);
      };
      const tl = toPoint(rect.left, rect.top);
      const br = toPoint(rect.right, rect.bottom);
      return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
    }

    _onWheel(e) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newW = this.viewBox.w * factor;
      const scale = this._baseW / newW; // >1 means zoomed in relative to the starting view
      if (scale < MIN_SCALE || scale > MAX_SCALE) return;

      const cursor = this._clientToSvgPoint(e.clientX, e.clientY);
      const newH = this.viewBox.h * factor;
      this.viewBox = {
        x: cursor.x - (cursor.x - this.viewBox.x) * factor,
        y: cursor.y - (cursor.y - this.viewBox.y) * factor,
        w: newW,
        h: newH,
      };
      this._applyViewBox();
      this._emitChange();
    }

    _onPointerDown(e) {
      if (e.button !== 0) return;
      if (e.target.closest('.node')) return; // node drag owns this gesture
      this.panning = { startClientX: e.clientX, startClientY: e.clientY, startVB: { ...this.viewBox } };
      this.svgRoot.classList.add('is-panning');
      e.preventDefault();
    }

    _onPointerMove(e) {
      if (!this.panning) return;
      const rect = this.svgRoot.getBoundingClientRect();
      const scaleX = this.panning.startVB.w / rect.width;
      const scaleY = this.panning.startVB.h / rect.height;
      this.viewBox = {
        ...this.viewBox,
        x: this.panning.startVB.x - (e.clientX - this.panning.startClientX) * scaleX,
        y: this.panning.startVB.y - (e.clientY - this.panning.startClientY) * scaleY,
      };
      this._applyViewBox();
      this._emitChange();
    }

    _onPointerUp() {
      if (!this.panning) return;
      this.panning = null;
      this.svgRoot.classList.remove('is-panning');
    }

    centerOn(x, y) {
      this.viewBox = { ...this.viewBox, x: x - this.viewBox.w / 2, y: y - this.viewBox.h / 2 };
      this._applyViewBox();
      this._emitChange();
    }

    // Frames the given content bounds (with padding), used on load, after
    // auto-arrange, and by the "Reset view" button.
    fitToBounds(bounds, padding = 80) {
      if (!bounds) return;
      const w = Math.max(bounds.maxX - bounds.minX + padding * 2, 200);
      const h = Math.max(bounds.maxY - bounds.minY + padding * 2, 200);
      this._baseW = w;
      this.viewBox = { x: bounds.minX - padding, y: bounds.minY - padding, w, h };
      this._applyViewBox();
      this._emitChange();
    }
  }

  Bowtie.PanZoomController = PanZoomController;
})(window.Bowtie = window.Bowtie || {});
