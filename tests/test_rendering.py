"""bugs.md: line annotations cut off by their own barrier, and exports
cropping the lowest barrier's descriptive text.
"""


def test_annotation_label_does_not_overlap_its_own_barrier(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 400});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id); // gives PB_1 two lanes -> labels drawn
    }""")
    page.wait_for_timeout(150)

    overlap = page.evaluate("""() => {
      const labels = Array.from(document.querySelectorAll('.connection-label'));
      const boxes = Array.from(document.querySelectorAll('.node.preventative-barrier .shape'));
      let overlap = false;
      labels.forEach((label) => {
        const lb = label.getBoundingClientRect();
        boxes.forEach((shape) => {
          const sb = shape.getBoundingClientRect();
          if (!(lb.right <= sb.left || lb.left >= sb.right || lb.bottom <= sb.top || lb.top >= sb.bottom)) {
            overlap = true;
          }
        });
      });
      return { overlap, labelCount: labels.length };
    }""")
    assert overlap["labelCount"] > 0
    assert not overlap["overlap"]


def test_shared_barrier_labels_show_node_display_ids_not_placement_ids(page):
    """Regression: `line.originId` is the origin Cause/Outcome's own
    PLACEMENT id (an internal bookkeeping key, never meant to be shown --
    see "Two id spaces" in node_library_proposal.md), but ConnectionRenderer
    used to pass it straight to the label instead of resolving it through
    the origin's NODE, so a shared barrier's lane annotations showed
    "PLACEMENT_3" instead of "C_1"/"C_2"."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const pb1 = m.addPreventativeControl(m.causes[0].id);
      m.addCause({x: 150, y: 400});
      m.attachInputToPreventativeControl(m.causes[1].id, pb1.id); // gives PB_1 two lanes -> labels drawn
    }""")
    page.wait_for_timeout(150)

    # MinimapView clones the whole live #connections-layer <g> -- id and all
    # -- into #minimap-container (same reasoning as #nodes-layer, see
    # test_multi_page.py's `_node_count`), so a bare, unscoped selector would
    # double-count every label via its minimap clone.
    labels = page.evaluate("""
      () => Array.from(document.getElementById('connections-layer').querySelectorAll('.connection-label'))
        .map((l) => l.textContent)
    """)
    display_ids = page.evaluate("""() => {
      const m = window.__lastModel;
      return m.causes.map((c) => m.getNode(c.nodeId).id);
    }""")
    assert len(labels) == 2
    assert sorted(labels) == sorted(display_ids)
    assert all(not l.startswith('PLACEMENT_') for l in labels)


def test_content_bounds_include_lowest_barrier_label(page):
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addPreventativeControl(m.causes[0].id);
    }""")
    page.wait_for_timeout(150)

    lowest_label_bottom = page.evaluate("""() => {
      const texts = Array.from(document.querySelectorAll('#nodes-layer .node.preventative-barrier text'));
      let maxBottom = -Infinity;
      texts.forEach((t) => {
        const bb = t.getBBox();
        maxBottom = Math.max(maxBottom, bb.y + bb.height);
      });
      return maxBottom;
    }""")
    content_bounds = page.evaluate("() => window.__lastView.getContentBounds()")
    assert content_bounds["maxY"] >= lowest_label_bottom - 1  # 1px tolerance


def test_export_style_reflects_live_css_variables(page):
    """The export style block used to be a hand-copied hex duplicate of
    css/styles.css; it must now read the same --cause-fill etc. custom
    properties the live page uses, so a palette change can't silently
    desync exports from what's on screen."""
    page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
    }""")
    page.wait_for_timeout(100)

    live_fill = page.evaluate(
        "() => getComputedStyle(document.documentElement).getPropertyValue('--cause-fill').trim()"
    )
    svg_text = page.evaluate("""() => {
      const svgRoot = document.querySelector('#bowtie-canvas');
      let captured = null;
      const orig = URL.createObjectURL;
      URL.createObjectURL = (blob) => { captured = blob; return orig(blob); };
      // Force the legacy download-link path (not the real native "Save As"
      // dialog exportSvg now prefers where available) so this stays a
      // synchronous, deterministic content check regardless of whether the
      // test browser happens to implement the File System Access API.
      const savedPicker = window.showSaveFilePicker;
      delete window.showSaveFilePicker;
      Bowtie.ExportUtil.exportSvg(svgRoot, { minX: 0, minY: 0, maxX: 400, maxY: 400 }, 'test.svg');
      window.showSaveFilePicker = savedPicker;
      URL.createObjectURL = orig;
      return captured.text();
    }""")
    assert live_fill in svg_text
