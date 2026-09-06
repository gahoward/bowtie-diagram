(function (Bowtie) {
  const MARGIN_Y = 90;

  // Horizontal (column) spacing has two user-selectable modes (Settings ->
  // "Auto-arrange spacing": Loose/Tight) — unlike the vertical constants
  // below, which are all load-bearing overlap-avoidance requirements and
  // never change. COL_SPACING_LOOSE is the original, generously-padded
  // default; COL_SPACING_TIGHT is the real minimum that still avoids
  // horizontal collisions BETWEEN BARRIER COLUMNS (and Cause/Outcome-to-
  // -first-barrier), derived the same way GROUP_GAP was derived for the
  // vertical direction, from real (not guessed) geometry:
  //   - two CHAINED barriers (depth d -> d+1) commonly land on the exact
  //     same Y (a simple chain's successor is the midpoint of its one
  //     predecessor, i.e. that same value) — their labels, each wrap-capped
  //     at BARRIER_LABEL_MAX_WIDTH (ShapeRenderer's `labelMaxWidth`) and
  //     centered under the barrier, must not touch: needs >=
  //     BARRIER_LABEL_MAX_WIDTH between columns.
  //   - a Cause/Outcome's own box (width CAUSE_OUTCOME_W) sitting next to
  //     the first barrier column needs its own half-width plus the
  //     barrier's label half-width.
  // The largest of these, plus a fixed margin for visual breathing room, is
  // the tight-mode column spacing. This does NOT cover the hop from the
  // last barrier column into the TLE itself — see TLE_ADJACENT_GAP_TIGHT,
  // which is a genuinely different constraint (the Hazard sitting above the
  // TLE, not a label).
  const BARRIER_LABEL_MAX_WIDTH = 110; // ShapeRenderer's renderControl `labelMaxWidth`
  const CAUSE_OUTCOME_W = 140; // BowtieModel's addCause/addOutcome `w` — fixed, never resized
  const TLE_DEFAULT_R = 70; // TopLevelEvent's default `r`
  // Minimum vertical gap the topmost Cause/Outcome row must keep above the
  // TLE's own y (see the shift applied near the end of arrange()) — sized
  // generously past a typical TLE radius plus the Hazard's height/gap so
  // the TLE's own bulk can never crowd the top row's lines. Declared here
  // (rather than down with the other vertical constants) because
  // TLE_ADJACENT_GAP_TIGHT below needs it too.
  const TLE_CLEARANCE = 220;
  const COL_SPACING_LOOSE = 320;
  const COL_SPACING_TIGHT = Math.ceil(20 + Math.max(
    BARRIER_LABEL_MAX_WIDTH,
    (CAUSE_OUTCOME_W / 2) + (BARRIER_LABEL_MAX_WIDTH / 2),
  ));
  // The hop from the LAST barrier column into the TLE (and, mirrored, from
  // the TLE into the FIRST MC column) can't just reuse COL_SPACING_TIGHT.
  // The Hazard sits directly above the TLE (fixed width — HAZARD_HALF_W is
  // half of Hazard's default `w:170`) with its own bottom edge
  // TLE_DEFAULT_R + HAZARD_GAP above the TLE. A barrier's connecting line
  // bends toward the TLE in a straight run from wherever its own row sits
  // (commonly TLE_CLEARANCE above the TLE — the topmost row's minimum, and
  // the ordinary case for a small diagram); tightening this specific hop
  // the same amount as COL_SPACING_TIGHT lets that run still be above the
  // Hazard's bottom edge by the time it re-enters the Hazard's own x-range
  // on the way in — visibly cutting through it (caught live: the two outer
  // barrier columns' bend lines sliced straight through the Hazard box
  // after naively reusing COL_SPACING_TIGHT here too). Solving "the line
  // must have already dropped to the Hazard's bottom edge by the time its
  // x reaches the Hazard's own edge" for the minimum horizontal run gives
  // `TLE_CLEARANCE * HAZARD_HALF_W / (TLE_DEFAULT_R + HAZARD_GAP)` — ~170px
  // for these constants — plus the same margin as COL_SPACING_TIGHT.
  const HAZARD_HALF_W = 85; // Hazard's default w:170, halved
  const HAZARD_GAP = 40; // Layout.js's HAZARD_GAP
  const TLE_ADJACENT_GAP_TIGHT = Math.ceil(
    20 + ((TLE_CLEARANCE * HAZARD_HALF_W) / (TLE_DEFAULT_R + HAZARD_GAP)),
  );
  // Spacing between two Cause/Outcome leaf rows that end up MERGED into the
  // same shared barrier (i.e. within one orderByAdjacency group). These
  // rows never need barrier-collision clearance from each other — they
  // feed the same barrier, not two separate ones — so this stays a plain,
  // compact spacing. Barrier geometry (below) is irrelevant here.
  const ROW_SPACING = 110;

  // Barrier geometry mirrored from the model/render layer (BowtieModel's
  // addPreventativeControl/_makeBarrierNear hardcode every barrier to
  // w:36, h:110 — never resized; Layout.js's LANE_MARGIN is 16) — literals,
  // not imports, since this controller only ever computes *positions*
  // ahead of any render, but these are true model-level constants, not
  // runtime/DOM-derived ones, so hand-deriving GROUP_GAP from them keeps
  // it correct-by-construction rather than a re-guessed magic number.
  const BARRIER_DEFAULT_H = 110;
  const LANE_MARGIN = 16;
  const LABEL_GAP = 14; // ShapeRenderer's `labelTop = cy + h/2 + 14`
  // Generous upper bound on a barrier's id+name label block height
  // (ShapeRenderer wraps the name to a max width and stacks lines at 16px
  // each, plus one line for the id) — sized past what even a long,
  // multi-line-wrapping control name would need, since this controller has
  // no DOM/TextWrap access to measure any real label exactly.
  const LABEL_CLEARANCE = 96;

  // Minimum vertical gap between every OTHER pair of adjacent Cause/Outcome
  // leaf rows — i.e. between two different orderByAdjacency groups, or
  // between two singleton (unmerged) rows — sized so that no two
  // same-depth-column barriers' rendered boxes, OR either one's id/name
  // label (which renders BELOW its box, only ever eating into the gap
  // toward the NEXT group), can collide. The binding case is two lone,
  // unrelated barriers with no merge on either side: each contributes its
  // own default half-height AND (the upper one) its own label — a merged
  // barrier's box actually hugs its outermost lane far more tightly
  // (LANE_MARGIN/2 = 8px past it) than a lone barrier's half-height (55px),
  // so any merge on either side only ever needs LESS room, never more; one
  // constant sized for the worst (all-lone) case safely covers every case.
  // This subsumed a narrower, merge-only "EXTRA_GROUP_GAP" that used to
  // apply just to the merged case — which was actually the SAFER case, so
  // it left the plain lone-barrier-vs-lone-barrier boundary (the common
  // case, and the one baseline5's own "barriers... not drawn in such a way
  // that they intercept lines they are not associated with" targets) using
  // only the too-small ROW_SPACING above, with zero real clearance before
  // a single line of label text was even counted.
  const GROUP_GAP = (BARRIER_DEFAULT_H / 2) + LABEL_GAP + LABEL_CLEARANCE + (BARRIER_DEFAULT_H / 2);
  const MIN_ROWS = 3;
  // ROW_SPACING/GROUP_GAP above assume a Cause/Outcome renders at its
  // default height (Layout's MIN_H = 60) — true for a short name, but
  // Layout.causeOutcomeBounds grows a Cause/Outcome's OWN box taller,
  // unbounded, as its name wraps to more lines (unlike a barrier's label,
  // which renders outside its box so the box itself never grows). Neither
  // constant above ever referenced that possible growth (architecture
  // review finding, 2026): two rows sharing an immediate barrier, each
  // given a several-sentence real risk description wrapping to 5+ lines,
  // could end up with taller boxes than the 110px ROW_SPACING between them
  // — the exact overlap this whole file exists to prevent, just from the
  // leaf's own box instead of a barrier's. `LEAF_ROW_MARGIN` is the same
  // kind of fixed breathing-room margin used elsewhere in this file; unlike
  // LABEL_CLEARANCE (which has to guess, since a barrier's real label
  // height was never measurable here), a Cause/Outcome's real rendered
  // height IS measurable — `assignLeafYs` calls the exact same
  // `Layout.causeOutcomeBounds` the live render uses, so this closes the
  // gap exactly rather than picking another, still-guessable ceiling.
  const LEAF_ROW_MARGIN = 20;

  // Orders `nodes` by a depth-first walk of `adjacency` (a Map from id to
  // the Set of ids it directly shares a barrier with) so that any two
  // nodes linked — directly OR transitively through a chain of shared
  // barriers — end up adjacent, with NO unrelated node between them. This
  // is stronger than grouping by a single shared key: two Causes can share
  // a barrier several hops downstream while their own immediate next
  // barriers differ (Cause A -> PB1 -> PB3, Cause C -> PB4 -> PB3), and a
  // third barrier can bridge two otherwise-unconnected pairs through a
  // shared Cause (A-B share one barrier, B-C share a different one) — a
  // DFS naturally chains A-B-C together in that case, which a simple
  // "group by shared key" can't express at all. Returns the flat, fully
  // ordered array (one DFS traversal per connected component, started in
  // original array order for stability) — see `assignLeafYs` for how the
  // GAP between two adjacent entries is decided; it is deliberately NOT
  // "same DFS component", since — as in the Cause A -> PB1 -> PB3, Cause C
  // -> PB4 -> PB3 example above — two nodes can end up correctly adjacent
  // here while still having two entirely distinct barriers in the very
  // first depth column, which still need full separation from each other.
  function orderByAdjacency(nodes, adjacency) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
    const visited = new Set();
    const ordered = [];

    const visit = (node) => {
      visited.add(node.id);
      ordered.push(node);
      const neighborIds = Array.from(adjacency.get(node.id) || [])
        .filter((id) => byId.has(id) && !visited.has(id))
        .sort((a, b) => indexOf.get(a) - indexOf.get(b));
      neighborIds.forEach((id) => {
        if (!visited.has(id)) visit(byId.get(id));
      });
    };

    nodes.forEach((node) => {
      if (!visited.has(node.id)) visit(node);
    });

    return ordered;
  }

  // Assigns y-positions down an adjacency-ordered leaf array (Causes or
  // Outcomes). The gap between two consecutive entries is ROW_SPACING only
  // when they share the exact same immediate barrier (`Line.stops[0]`) —
  // meaning they are, at the very first depth column, literally the same
  // box, not two — and GROUP_GAP otherwise. This is intentionally NOT based
  // on whether orderByAdjacency placed them in the same connected
  // component: that grouping exists to get the ORDER right (so a shared
  // barrier several hops downstream still pulls its two Causes adjacent),
  // but two adjacent entries can still each own a wholly separate barrier
  // at depth 1 that only merges later (e.g. Cause A -> PB1 -> PB3, Cause C
  // -> PB4 -> PB3) — PB1 and PB4 are two distinct boxes sharing that same
  // depth-1 column, and need GROUP_GAP's full clearance between them just
  // as much as two entirely unrelated Causes would.
  function assignLeafYs(nodes, model, svgRoot) {
    const ys = new Map();
    const halfH = (node) => Bowtie.Layout.causeOutcomeBounds(svgRoot, node).h / 2;
    let y = MARGIN_Y;
    nodes.forEach((node, i) => {
      if (i > 0) {
        const prevNode = nodes[i - 1];
        const prevFirstStop = model._lineFor(prevNode.id).stops[0];
        const firstStop = model._lineFor(node.id).stops[0];
        const shareImmediateBarrier = prevFirstStop && firstStop && prevFirstStop === firstStop;
        const baseGap = shareImmediateBarrier ? ROW_SPACING : GROUP_GAP;
        // Neither ROW_SPACING nor GROUP_GAP alone accounts for a wrapped,
        // multi-line name growing THIS PARTICULAR row's (or its neighbour's)
        // own box taller than the default — see LEAF_ROW_MARGIN above. Take
        // whichever of the base gap or the two actual measured half-heights
        // (plus margin) is larger, so a long name only ever grows the gap,
        // never shrinks it below what barrier-collision-avoidance already
        // required.
        const neededForOwnBoxes = halfH(prevNode) + halfH(node) + LEAF_ROW_MARGIN;
        y += Math.max(baseGap, neededForOwnBoxes);
      }
      ys.set(node.id, y);
    });
    return ys;
  }

  class AutoArrangeController {
    // `svgRoot` is needed for real Cause/Outcome text measurement
    // (`Layout.causeOutcomeBounds`, same call the live render uses) — see
    // LEAF_ROW_MARGIN above for why that's the correct-by-construction fix
    // rather than another guessed constant. `getSpacingMode`, if given, is
    // read fresh on every arrange() (not just at construction) — it's a
    // callback rather than a one-off value so a later Settings change
    // takes effect on the next click without needing to reconstruct this
    // controller. Expected to return 'tight' or 'loose'; anything else
    // (including omitted) defaults to 'loose'. `getPullChainsCloser`
    // mirrors this for the independent "pull shallow chains closer to the
    // TLE" toggle (auto-arrange-fix.md §7) — a separate axis from
    // Loose/Tight, also read fresh on every arrange(); omitted defaults to
    // off (today's existing fixed-column behavior).
    constructor(model, svgRoot, button, onArranged, getSpacingMode, getPullChainsCloser) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.onArranged = onArranged;
      this.getSpacingMode = getSpacingMode || (() => 'loose');
      this.getPullChainsCloser = getPullChainsCloser || (() => false);
      button.addEventListener('click', () => this.arrange());
    }

    // The first-found barrier immediately TLE-ward (successor) of
    // `barrierId` in some line's stops, or null if it connects straight to
    // the TLE. Mirrors the pre-Line-rework model's "first found wins" for
    // the rare case where a barrier's lines have diverged onto different
    // next stops. Shared by both _pcDepth and _mcDepth below — Line.stops
    // uses the same origin-nearest-first convention for both PB and MB
    // chains (see Line.js), so "next stop toward the TLE" means the same
    // thing for either.
    _successorOf(barrierId) {
      for (let i = 0; i < this.model.lines.length; i += 1) {
        const line = this.model.lines[i];
        const idx = line.stops.indexOf(barrierId);
        if (idx !== -1 && idx < line.stops.length - 1) return line.stops[idx + 1];
      }
      return null;
    }

    // Distance (in barrier hops) from the TopLevelEvent. A PB feeding
    // directly into the TLE (nothing further toward the TLE in its
    // Line.stops) is depth 1; one chained before it (further from the TLE)
    // is one deeper. This must be measured from the TLE, not from the
    // Cause: a lone PB with no further barrier before the TLE (e.g. a
    // single barrier on an otherwise-bare Cause) sits immediately before
    // the TLE regardless of how many hops it is from its own Cause, and
    // needs to land in the same TLE-adjacent column as any other chain's
    // final barrier (architecture review finding, 2026 — a lone barrier
    // was landing a full column short of the TLE, alongside chains'
    // FIRST barriers instead of their LAST, because depth was previously
    // measured from the Cause end instead).
    _pcDepth(pb, cache) {
      if (cache.has(pb.id)) return cache.get(pb.id);
      const downstreamId = this._successorOf(pb.id);
      const downstream = downstreamId ? this.model.preventativeBarriers.find((p) => p.id === downstreamId) : null;
      const depth = downstream ? 1 + this._pcDepth(downstream, cache) : 1;
      cache.set(pb.id, depth);
      return depth;
    }

    // Mirrors _pcDepth exactly (both now measure distance from the
    // TopLevelEvent). An MB fed directly by the TLE (nothing further toward
    // the TLE in its Line.stops) is depth 1; one chained before it (toward
    // the TLE) is one deeper.
    _mcDepth(mb, cache) {
      if (cache.has(mb.id)) return cache.get(mb.id);
      const upstreamId = this._successorOf(mb.id);
      const upstream = upstreamId ? this.model.mitigativeBarriers.find((m) => m.id === upstreamId) : null;
      const depth = upstream ? 1 + this._mcDepth(upstream, cache) : 1;
      cache.set(mb.id, depth);
      return depth;
    }

    // For every barrier in `barriers`, every pair of Lines passing through
    // it (`linesThrough` — regardless of how many other stops separate
    // each Line from that barrier) share it directly: their origins must
    // end up adjacent, or the barrier's grown box (spanning both their
    // lanes) will visually intercept whatever unrelated Cause/Outcome
    // ends up between them. Returns a Map from origin id to the Set of
    // other origin ids it directly shares at least one barrier with, fed
    // into orderByAdjacency.
    _directAdjacency(barriers) {
      const adjacency = new Map();
      const addEdge = (a, b) => {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
      };
      barriers.forEach((barrier) => {
        const originIds = this.model.linesThrough(barrier.id).map((l) => l.originId);
        for (let i = 0; i < originIds.length; i += 1) {
          for (let j = i + 1; j < originIds.length; j += 1) {
            addEdge(originIds[i], originIds[j]);
          }
        }
      });
      return adjacency;
    }

    // The y-value(s) that directly feed `barrierId` from its leaf-ward side
    // (the Cause, for a PB; the Outcome, for an MB) — either an
    // already-positioned barrier immediately leaf-ward of it in some line's
    // stops, or the line's own origin node when `barrierId` sits at index 0
    // (nearest the origin, by the shared stops convention). Reads from
    // `positionedY`, which callers must have already filled in for anything
    // leaf-ward of `barrierId`.
    _leafwardYsFor(barrierId, positionedY) {
      const ys = [];
      this.model.lines.forEach((line) => {
        const idx = line.stops.indexOf(barrierId);
        if (idx === -1) return;
        if (idx === 0) {
          const origin = this.model.findById(line.originId);
          ys.push(positionedY.has(origin.id) ? positionedY.get(origin.id) : origin.y);
        } else {
          const prevId = line.stops[idx - 1];
          if (positionedY.has(prevId)) ys.push(positionedY.get(prevId));
        }
      });
      return ys;
    }

    // Positions every barrier in `byDepth` by propagating up from its own
    // leaf-ward neighbours (already-positioned, thanks to `depths` ordering
    // things so every barrier's leafward side is handled before it) rather
    // than spacing each depth column independently — this way a barrier
    // naturally lands at the midpoint of the actual lines it serves, so its
    // grown height (Layout.controlBounds) only ever needs to cover its own
    // lanes. Both PC and MC depth are measured from the TLE, so both
    // propagate the same direction: descending depth (leaf-adjacent,
    // highest-depth columns first, since that end's position is already
    // known — the Cause or Outcome itself) — see the two call sites below.
    _propagateDepthYs(byDepth, depths, positionedY) {
      depths.forEach((d) => {
        (byDepth.get(d) || []).forEach((node) => {
          const leafYs = this._leafwardYsFor(node.id, positionedY);
          if (leafYs.length > 0) {
            positionedY.set(node.id, (Math.min(...leafYs) + Math.max(...leafYs)) / 2);
          } else if (!positionedY.has(node.id)) {
            positionedY.set(node.id, node.y);
          }
        });
      });
    }

    arrange() {
      const { model } = this;
      const pcDepthCache = new Map();
      const mcDepthCache = new Map();

      const pcsByDepth = new Map();
      model.preventativeBarriers.forEach((pb) => {
        const d = this._pcDepth(pb, pcDepthCache);
        if (!pcsByDepth.has(d)) pcsByDepth.set(d, []);
        pcsByDepth.get(d).push(pb);
      });
      const mcsByDepth = new Map();
      model.mitigativeBarriers.forEach((mb) => {
        const d = this._mcDepth(mb, mcDepthCache);
        if (!mcsByDepth.has(d)) mcsByDepth.set(d, []);
        mcsByDepth.get(d).push(mb);
      });

      const maxPcDepth = pcsByDepth.size > 0 ? Math.max(...pcsByDepth.keys()) : 0;
      const maxMcDepth = mcsByDepth.size > 0 ? Math.max(...mcsByDepth.keys()) : 0;
      const colSpacing = this.getSpacingMode() === 'tight' ? COL_SPACING_TIGHT : COL_SPACING_LOOSE;

      // Sibling ordering: Causes/Outcomes sharing a downstream barrier —
      // at ANY depth, not just the immediate next stop, and transitively
      // through a chain of such sharing — end up adjacent (requirement:
      // "C1, C3, C2 permissible if C1 and C3 shared a Preventative
      // Control"), so no unrelated node's lane can fall inside a shared
      // barrier's grown box. Barrier-level order (within a depth column)
      // does NOT need this: every barrier's y comes from _propagateDepthYs
      // below, purely as the midpoint of its own leafward neighbours,
      // independent of iteration order — only the leaf assignment order
      // actually determines a y (via assignLeafYs), so only Causes and
      // Outcomes need to go through orderByAdjacency.
      const causeCluster = orderByAdjacency(model.causes, this._directAdjacency(model.preventativeBarriers));
      const outcomeCluster = orderByAdjacency(model.outcomes, this._directAdjacency(model.mitigativeBarriers));

      // Leaf rows (Causes/Outcomes) get their y first, with extra clearance
      // around any merge group; every barrier depth then propagates its y
      // from whatever's already positioned leaf-ward of it.
      const positionedY = new Map();
      assignLeafYs(causeCluster, model, this.svgRoot).forEach((y, id) => positionedY.set(id, y));
      assignLeafYs(outcomeCluster, model, this.svgRoot).forEach((y, id) => positionedY.set(id, y));

      // Both PC and MC depth are now measured from the TLE (see _pcDepth),
      // so both propagate the same direction: leaf-adjacent (highest-depth)
      // columns first, since that's the end whose position is already known
      // (the Cause/Outcome itself) — then progressively toward the
      // TLE-adjacent (depth 1) column.
      const descendingPcDepths = Array.from({ length: maxPcDepth }, (_, i) => maxPcDepth - i);
      this._propagateDepthYs(pcsByDepth, descendingPcDepths, positionedY);
      const descendingMcDepths = Array.from({ length: maxMcDepth }, (_, i) => maxMcDepth - i);
      this._propagateDepthYs(mcsByDepth, descendingMcDepths, positionedY);

      const rowCount = Math.max(
        causeCluster.length,
        outcomeCluster.length,
        ...Array.from(pcsByDepth.values(), (arr) => arr.length),
        ...Array.from(mcsByDepth.values(), (arr) => arr.length),
        MIN_ROWS,
      );

      // The TLE sits at the midpoint of whatever directly touches it: the
      // depth-1 (TLE-adjacent) PBs and the depth-1 (TLE-adjacent) MBs — both
      // depth-1 now, since both are measured from the TLE — or the row
      // midpoint as a fallback for a diagram with neither yet.
      const tleAdjacentYs = [
        ...(pcsByDepth.get(1) || []).map((n) => positionedY.get(n.id)),
        ...(mcsByDepth.get(1) || []).map((n) => positionedY.get(n.id)),
      ];
      const tleY = tleAdjacentYs.length > 0
        ? (Math.min(...tleAdjacentYs) + Math.max(...tleAdjacentYs)) / 2
        : MARGIN_Y + ((rowCount * ROW_SPACING) / 2);

      // The topmost Cause/Outcome row must clear the TLE (and the Hazard
      // sitting above it) by TLE_CLEARANCE. Left alone, a single simple
      // chain per side (one Cause -> one PB, say) makes the TLE's y land
      // exactly on that Cause's own row — the TLE's bulk then crowds that
      // row's lines straight through neighbouring barriers' descriptive
      // text. Shift every Cause/Outcome/barrier position (never the TLE
      // itself, which stays exactly where its neighbours placed it) up by
      // however much is missing so the top row always ends up above the
      // TLE with room to spare.
      const topRowYs = [...causeCluster, ...outcomeCluster].map((n) => positionedY.get(n.id));
      if (topRowYs.length > 0) {
        const topmostY = Math.min(...topRowYs);
        const minAllowedTopY = tleY - TLE_CLEARANCE;
        if (topmostY > minAllowedTopY) {
          const delta = topmostY - minAllowedTopY;
          positionedY.forEach((y, id) => positionedY.set(id, y - delta));
        }
      }

      const causesX = 150;
      // The hop immediately into/out of the TLE uses `tleAdjacentGap`, NOT
      // `colSpacing` — see TLE_ADJACENT_GAP_TIGHT above for why that hop
      // has its own, larger constraint (the Hazard) that tight mode's
      // ordinary column spacing doesn't satisfy. In loose mode the two are
      // the same value, preserving the original, already-safe behaviour
      // exactly.
      const tleAdjacentGap = this.getSpacingMode() === 'tight' ? TLE_ADJACENT_GAP_TIGHT : COL_SPACING_LOOSE;
      // Each side's offset from the TLE is sized from ITS OWN depth, not a
      // shared max of the two — previously both sides used the deeper
      // side's depth, so a shallower side got padded with wasted empty
      // columns' worth of gap it never actually used. A real inefficiency,
      // independent of loose/tight mode, fixed here for both.
      const tleX = causesX + (maxPcDepth * colSpacing) + tleAdjacentGap;
      const outcomesX = tleX + (maxMcDepth * colSpacing) + tleAdjacentGap;
      // PC depth is measured from the TLE (depth 1 = TLE-adjacent), but
      // causesX is the fixed, cause-adjacent end — so column position runs
      // the OPPOSITE direction from depth: depth 1 gets the highest x
      // (closest to the TLE), depth `maxPcDepth` gets the lowest (closest
      // to causesX). Mirrors mcColX, which is already TLE-anchored the
      // same way for the MC side.
      const pcColX = (d) => causesX + ((maxPcDepth - d + 1) * colSpacing);
      const mcColX = (d) => tleX + tleAdjacentGap + ((d - 1) * colSpacing);

      const updates = [];
      const placeWithPositionedY = (nodes, xOrFn) => {
        nodes.forEach((node) => updates.push({
          id: node.id,
          x: typeof xOrFn === 'function' ? xOrFn(node) : xOrFn,
          y: positionedY.get(node.id),
        }));
      };

      // §7 toggle ("pull shallow chains closer to the TLE"): off by default,
      // preserving today's fixed-column causesX/outcomesX for every origin
      // regardless of how few barriers its own chain actually has. When on,
      // each origin is positioned one gap before wherever its own chain's
      // first REAL stop actually is, instead of always starting at the
      // fixed causesX/outcomesX column:
      //   - fully bare (no stops at all): one gap before the TLE itself —
      //     there's nothing between that column and the TLE to cross, so
      //     ConnectionRenderer's zero-stop rendering is safe automatically.
      //   - has stops, but its first stop sits deeper than depth 1 (forced
      //     there by a merge elsewhere): one gap before that first stop's
      //     real column, i.e. `pcColX(depth) - colSpacing` for a Cause —
      //     this is pure arithmetic on the SAME `depth`/`colSpacing` already
      //     used to place that barrier, so it needs no new constant.
      //   - first stop already at its own natural minimum depth (1, the
      //     common unmerged case): the formula above resolves to exactly
      //     `causesX` — no change from today. (Mirrored for Outcomes/MBs,
      //     whose depth is counted from the TLE outward, so their "natural,
      //     unforced" case is `depth === maxMcDepth` instead of depth 1.)
      // Moving the origin never moves the barrier it targets — only origins
      // are ever repositioned here, so this can't conflict with anything a
      // shared barrier's other lines need from its own (unchanged) position.
      const pullChainsCloser = this.getPullChainsCloser();
      const causeOriginX = (cause) => {
        const line = model._lineFor(cause.id);
        if (line.stops.length === 0) return tleX - tleAdjacentGap;
        return pcColX(pcDepthCache.get(line.stops[0])) - colSpacing;
      };
      const outcomeOriginX = (outcome) => {
        const line = model._lineFor(outcome.id);
        if (line.stops.length === 0) return tleX + tleAdjacentGap;
        return mcColX(mcDepthCache.get(line.stops[0])) + colSpacing;
      };

      placeWithPositionedY(causeCluster, pullChainsCloser ? causeOriginX : causesX);
      pcsByDepth.forEach((pcs, d) => placeWithPositionedY(pcs, pcColX(d)));
      mcsByDepth.forEach((mcs, d) => placeWithPositionedY(mcs, mcColX(d)));
      placeWithPositionedY(outcomeCluster, pullChainsCloser ? outcomeOriginX : outcomesX);
      updates.push({ id: model.topLevelEvent.id, x: tleX, y: tleY });

      model.setPositions(updates);
      if (this.onArranged) this.onArranged();
    }
  }

  Bowtie.AutoArrangeController = AutoArrangeController;
})(window.Bowtie = window.Bowtie || {});
