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
  // same shared barrier (i.e. adjacent within one buildConsecutiveOrder
  // hyperedge block). These
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
  // leaf rows — i.e. between two different buildConsecutiveOrder blocks, or
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

  // Orders `nodes` so that every barrier's participating origins end up
  // CONTIGUOUS in the result, with no unrelated node's row ever falling
  // between two of them — otherwise that barrier's rendered box (which
  // always spans from its shallowest to its deepest participating lane,
  // Layout.controlBounds via laneYsThrough) visually swallows whatever
  // unrelated line's row got caught inside its span, even though that
  // line never stops there (reported bug: attaching a bare Cause to a
  // barrier that's a tight pair with one member of a larger, separately-
  // shared barrier's group left the bare Cause's own row sandwiched
  // inside the larger barrier's box).
  //
  // `hyperedges` (built by _hyperedges below) is one entry per barrier
  // with 2+ lines through it: `{ members: Set<originId> }` — the exact
  // set of Causes/Outcomes that need to land contiguous for that one
  // barrier. Plain pairwise adjacency can't express this correctly: a
  // node can need to sit next to ONE member of a larger group without
  // being absorbed into the middle of it, which only makes sense treating
  // each barrier's whole participant set as one constraint at a time.
  //
  // Processes hyperedges LARGEST-membership first, building each into an
  // opaque "block" (nested array) that later, smaller hyperedges treat as
  // one unit — a big, loose relationship claims its members' contiguous
  // block before a smaller, tighter one has to decide where within it to
  // attach. When a smaller hyperedge's members all fall inside a single
  // already-built block (rather than spanning several top-level blocks),
  // the merge has to happen one level deeper, INSIDE that block's own
  // children — recurses for exactly that reason (a bare Cause attached to
  // one member of an already-4-way-shared barrier needs its private pair
  // pulled together WITHIN that block, not merely alongside it). A block's
  // children are freely re-permuted at whatever level the merge happens
  // (nothing outside this function depends on any particular order among
  // a block's own members — see assignLeafYs, which sizes gaps from the
  // STOPS at each row, not from this ordering) so a needed member can
  // always move to an edge for the next merge to attach next to it — see
  // `promoteToEdge` below. Two nodes with no shared barrier at all are
  // never touched here and simply keep their original relative order.
  function buildConsecutiveOrder(nodes, hyperedges) {
    const flatten = (unit, out) => {
      if (Array.isArray(unit)) unit.forEach((u) => flatten(u, out));
      else out.push(unit);
      return out;
    };
    const intersectsMembers = (unit, members) => flatten(unit, []).some((id) => members.has(id));

    // Groups `children` (an array of units, mutated in place) so every
    // child intersecting `members` ends up together at one `edge`
    // ('start' or 'end'), each such child's own internal order untouched,
    // non-matching children keeping their relative order on the other side.
    const promoteToEdge = (children, members, edge) => {
      const matching = children.filter((c) => intersectsMembers(c, members));
      const rest = children.filter((c) => !intersectsMembers(c, members));
      const merged = edge === 'end' ? [...rest, ...matching] : [...matching, ...rest];
      children.splice(0, children.length, ...merged);
    };

    // Merges `members` into one contiguous run somewhere within `parent`
    // (an array, mutated in place) — either at this level, if the
    // hyperedge's members are spread across 2+ of `parent`'s own children,
    // or by recursing into the single child that already contains all of
    // them, going as deep as needed to find where they actually diverge.
    const mergeWithin = (parent, members) => {
      const touchedIdx = [];
      parent.forEach((child, i) => { if (intersectsMembers(child, members)) touchedIdx.push(i); });
      if (touchedIdx.length === 0) return;
      if (touchedIdx.length === 1) {
        const child = parent[touchedIdx[0]];
        if (Array.isArray(child)) mergeWithin(child, members);
        return;
      }

      // Bring each touched child's matching part to its own trailing edge
      // so concatenating the touched children end-to-end keeps THIS
      // hyperedge's members contiguous even when a child also carries
      // other members from a bigger, already-built hyperedge.
      touchedIdx.forEach((i) => {
        if (Array.isArray(parent[i])) promoteToEdge(parent[i], members, 'end');
      });

      const touchedSet = new Set(touchedIdx);
      const merged = touchedIdx.map((i) => parent[i]);
      const kept = parent.filter((_, i) => !touchedSet.has(i));
      const insertPos = parent.slice(0, touchedIdx[0]).filter((_, i) => !touchedSet.has(i)).length;
      kept.splice(insertPos, 0, merged);
      parent.splice(0, parent.length, ...kept);
    };

    const root = nodes.map((n) => n.id);
    const sortedEdges = [...hyperedges].sort((a, b) => b.members.size - a.members.size);
    sortedEdges.forEach(({ members }) => mergeWithin(root, members));

    const byId = new Map(nodes.map((n) => [n.id, n]));
    return flatten(root, []).map((id) => byId.get(id));
  }

  // Two Lines' stops arrays are the SAME box the whole way down -- not
  // just merged at the first hop, but never diverging into separate
  // barriers at any later hop either. Used by assignLeafYs below to decide
  // whether two adjacent rows can share the cheap ROW_SPACING gap: sharing
  // only `stops[0]` used to be treated as enough (two Causes exiting into
  // the same first barrier), but the manual path-reorder feature
  // (BowtieModel.swapBarrierWithNeighbor) can now produce a line whose
  // stops[0] matches a neighbour's while its LATER stops diverge into a
  // wholly separate barrier -- e.g. two Causes merge into one shared
  // barrier, then each continues through its OWN further barrier before
  // the TLE. Those later barriers are two distinct boxes (each with its
  // own label) needing GROUP_GAP's full clearance from each other, exactly
  // like any other two lone barriers would -- checking only stops[0] would
  // grant them ROW_SPACING instead and let one row's barrier label overlap
  // the very next row's barrier box (reported bug: shifting a shared
  // barrier away from the TLE on two of its lines at once).
  function stopsFullyMatch(a, b) {
    return a.length === b.length && a.every((stopId, i) => stopId === b[i]);
  }

  // Assigns y-positions down an adjacency-ordered leaf array (Causes or
  // Outcomes). The gap between two consecutive entries is ROW_SPACING —
  // not the full barrier-collision GROUP_GAP — only when their entire
  // remaining chains are identical (see stopsFullyMatch above): either
  // they share the exact same full path to the TLE (meaning every barrier
  // along it is, for both of them, literally the same box, not two), or
  // NEITHER has any barrier at all (`Line.stops` empty for both), meaning
  // there is no barrier box or label anywhere near this particular pair's
  // shared boundary for GROUP_GAP to actually be protecting (a real
  // reported case: several Causes/Outcomes with few barriers between them
  // — GROUP_GAP's full worst-case clearance, sized for two lone BARRIERS'
  // boxes+labels, was being paid between rows that had no barrier at all).
  // Otherwise GROUP_GAP applies. This is intentionally NOT based on
  // whether buildConsecutiveOrder placed them in the same hyperedge block:
  // that grouping exists to get the ORDER right (so a shared barrier
  // several hops downstream still pulls its two Causes adjacent), but two
  // adjacent entries can still each own a wholly separate barrier at depth
  // 1 that only merges later (e.g. Cause A -> PB1 -> PB3, Cause C -> PB4
  // -> PB3) — PB1 and PB4 are two distinct boxes sharing that same depth-1
  // column, and need GROUP_GAP's full clearance between them just as much
  // as two entirely unrelated Causes would.
  function assignLeafYs(nodes, model, svgRoot) {
    const ys = new Map();
    const halfH = (node) => Bowtie.Layout.causeOutcomeBounds(svgRoot, node).h / 2;
    let y = MARGIN_Y;
    nodes.forEach((node, i) => {
      if (i > 0) {
        const prevNode = nodes[i - 1];
        const prevStops = model._lineFor(prevNode.id).stops;
        const stops = model._lineFor(node.id).stops;
        const baseGap = stopsFullyMatch(prevStops, stops) ? ROW_SPACING : GROUP_GAP;
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

    // EVERY barrier immediately TLE-ward (successor) of `barrierId`, across
    // every line currently passing through it — not just the first one
    // found. Two lines can share `barrierId` and then diverge (one runs
    // straight to the TLE, another continues through a further barrier
    // first), and depth must be measured from whichever continuation is
    // DEEPEST (see _pcDepth/_mcDepth below): picking only the first-found
    // line's continuation under-counts a shared barrier's true distance
    // from the TLE whenever a shorter and a longer chain both pass through
    // it, landing it in the SAME column as the barrier that makes it
    // longer (architecture review finding, 2026 — reported as "PB_1 and
    // PB_2 land on the exact same spot after attaching a second Cause to
    // PB_1 ahead of its own pre-existing PB_2 → PB_3 chain": PB_1's line to
    // C_1 goes straight to PB_3, but its line to C_2 goes through PB_2
    // first — the first-found rule picked C_1's shorter continuation,
    // giving PB_1 the same depth as PB_2 itself). Shared by both _pcDepth
    // and _mcDepth — Line.stops uses the same origin-nearest-first
    // convention for both PB and MB chains (see Line.js), so "next stop(s)
    // toward the TLE" means the same thing for either.
    _successorsOf(barrierId) {
      const successors = [];
      this.model.lines.forEach((line) => {
        const idx = line.stops.indexOf(barrierId);
        if (idx !== -1 && idx < line.stops.length - 1) successors.push(line.stops[idx + 1]);
      });
      return successors;
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
    //
    // When `barrierId` is shared by lines with different-length
    // continuations (see _successorsOf above), depth is the DEEPEST of
    // them, i.e. 1 + the max depth among every distinct successor —
    // otherwise a barrier feeding both a short and a long remaining chain
    // would be assigned the short chain's (shallower) depth, colliding
    // with a barrier that's genuinely one or more columns further out.
    _pcDepth(pb, cache) {
      if (cache.has(pb.id)) return cache.get(pb.id);
      const downstreamDepths = this._successorsOf(pb.id)
        .map((id) => this.model.preventativeBarriers.find((p) => p.id === id))
        .filter(Boolean)
        .map((downstream) => this._pcDepth(downstream, cache));
      const depth = downstreamDepths.length > 0 ? 1 + Math.max(...downstreamDepths) : 1;
      cache.set(pb.id, depth);
      return depth;
    }

    // Mirrors _pcDepth exactly (both now measure distance from the
    // TopLevelEvent, and both take the deepest continuation when a barrier
    // is shared by diverging lines). An MB fed directly by the TLE (nothing
    // further toward the TLE in its Line.stops) is depth 1; one chained
    // before it (toward the TLE) is one deeper.
    _mcDepth(mb, cache) {
      if (cache.has(mb.id)) return cache.get(mb.id);
      const upstreamDepths = this._successorsOf(mb.id)
        .map((id) => this.model.mitigativeBarriers.find((m) => m.id === id))
        .filter(Boolean)
        .map((upstream) => this._mcDepth(upstream, cache));
      const depth = upstreamDepths.length > 0 ? 1 + Math.max(...upstreamDepths) : 1;
      cache.set(mb.id, depth);
      return depth;
    }

    // One entry per barrier in `barriers` with 2+ Lines through it
    // (`linesThrough` — regardless of how many other stops separate each
    // Line from that barrier): `{ members: Set<originId> }`, the exact set
    // of origins that must end up contiguous for buildConsecutiveOrder, or
    // that barrier's grown box (spanning from its shallowest to its
    // deepest participating lane) will visually intercept whatever
    // unrelated Cause/Outcome's row ends up caught inside that span.
    _hyperedges(barriers) {
      return barriers
        .map((barrier) => new Set(this.model.linesThrough(barrier.id).map((l) => l.originId)))
        .filter((members) => members.size >= 2)
        .map((members) => ({ members }));
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
      // Outcomes need to go through buildConsecutiveOrder.
      const causeCluster = buildConsecutiveOrder(model.causes, this._hyperedges(model.preventativeBarriers));
      const outcomeCluster = buildConsecutiveOrder(model.outcomes, this._hyperedges(model.mitigativeBarriers));

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
