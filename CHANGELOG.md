# Changelog

## v0.2.1 - 2026-09-07

- Added a randomized/generative auto-arrange test (30 seeded random
  Cause/Outcome + shared-barrier topologies per run) alongside the existing
  hand-written scenario tests, checking the same general invariant every
  reported overlap bug in this file has violated: a barrier's rendered box
  must only ever span rows whose line actually passes through it. It
  immediately found a further real gap (below).
- Fixed another gap in auto-arrange's row ordering, found by the new
  generative test: merging a hyperedge whose members are split across more
  than one already-built block always pushed the LAST touched block's
  shared member to that block's own tail end, when it needed to be pushed
  to the block's front (the edge actually facing its neighbor in the
  merged run) whenever that block wasn't the first of the touched group —
  e.g. one Cause sharing a barrier with the FRONT of an already-3-way-
  shared block, while a different Cause shares another barrier with a
  member further inside that same block, could leave the first Cause's own
  barrier separated from its actual shared partner by two unrelated rows,
  and its box ended up overlapping a second, unrelated barrier's box as a
  result.
- Auto-arrange now runs automatically right after "Shift Toward TLE",
  "Shift Away From TLE", "Attach to Existing Preventative/Mitigative
  Barrier…", and "Connect Directly to TLE" — each of these changes a
  barrier's position in the underlying chain without moving anything on
  screen itself, which used to leave the diagram showing stale positions
  (including, in the worst case, one barrier visually overlapping another)
  until the user remembered to press Auto-arrange themselves.
- Fixed a further gap in auto-arrange's row ordering: a chain of two
  overlapping shared-barrier pairs (e.g. two Outcomes sharing one barrier,
  which then diverge into two further barriers, each itself shared with a
  third and fourth Outcome) could still leave two of those further
  barriers' boxes overlapping each other, even though neither shares an
  Outcome with the other. Re-positioning an already-built shared group
  next to a new neighbour now also promotes the actual shared member to
  that group's own edge, not just the group as a whole, so every barrier
  in the chain keeps its own dedicated row(s).

- Added multi-page support: an analysis document can now contain multiple
  pages (tabs), each with its own TopLevelEvent, Hazard, and independent
  diagram content (Causes, Outcomes, Barriers, and Lines).
- Added bottom tab bar UI with tab selection, page creation, renaming,
  description editing, deletion with fallback, and a "Jump to page ▾"
  quick navigation dropdown.
- Implemented two-tier undo/redo architecture: independent per-page undo
  stacks for diagram content edits, and a document-level undo stack for
  page structure mutations (add, delete, rename), ensuring edits on one
  page never affect or revert undo history on another.
- Updated New Bowtie Wizard to configure Analysis title, Page name, and
  optional Page description alongside the Top Level Event and Hazard.
- Updated Identifier Manager: retired IDs and warnings now display and
  track the page they originated from.
- Upgraded file format schema to version 7 to support multi-page documents,
  and updated built-in demo data to a two-page bowtie diagram.
- Fixed two compounding bugs when "Shift Away From TLE" (or Toward) is
  applied to a shared barrier on more than one of its paths at once
  (e.g. PB_3 in the demo, ticking both C_1 and C_2): the immediate
  position feedback used to corrupt the barrier onto the exact same spot
  as an unrelated one before Auto-arrange even ran, and Auto-arrange
  itself then let one barrier's label overlap the very next barrier's box
  — both because the code assumed two Causes sharing a first barrier
  never diverge into separate barriers afterward, which this feature
  makes possible for the first time.
- Fixed auto-arrange placing an unrelated Cause/Outcome's row between two
  others that privately share a barrier, whenever all of them also share
  a LATER barrier further down the line (e.g. attaching a bare Cause to
  an existing barrier that a different Cause also uses) — the shared
  barrier's box then grew tall enough to visually swallow the unrelated
  row in between. Two rows sharing a barrier with few participants are
  now clustered strictly adjacent, ahead of a looser, many-participant
  relationship they might also both be part of.
- "Attach to Existing Preventative/Mitigative Barrier…" now asks whether
  to follow that barrier's existing continuation toward the TLE (only
  when it actually has one) instead of always silently inheriting it —
  declining keeps whatever the attaching Cause/Outcome's own line already
  had, or connects straight to the TLE if it had nothing of its own.
- Fixed a line's final bend toward the TLE starting right at its own last
  barrier's edge even when that barrier sits short of the diagram's true
  TLE-adjacent column (reachable via the options above, or by truncating
  one of several lines sharing a barrier that others still continue
  past) — the bend cut across the intervening column at a sharp angle.
  Also affected fully bare lines, whose fixed clearance margin could fall
  short of where the diagram's actual barrier columns are. Every line's
  flat run now extends to at least the shallowest occupied barrier
  column on its side before turning, matching every other line.
- Fixed auto-arrange still letting an unrelated Cause/Outcome's row land
  inside a shared barrier's grown box in cases the previous fix (v0.1.3)
  didn't cover — e.g. attaching a bare Cause to one barrier of a chain and
  declining to inherit its further continuation ("Stop Here") could leave
  that Cause sandwiched inside a separate, larger barrier's box it was
  never attached to at all. Row ordering is now built from each barrier's
  full shared-participant set directly (largest shared groups first, so a
  smaller, tighter pair can always still pull its members together even
  from inside an already-placed larger group) instead of a pairwise
  adjacency heuristic, which could not always express that a node needs a
  private neighbour without being absorbed into that neighbour's larger
  group.

## v0.1.3 - 2026-09-07

- Fixed auto-arrange placing a barrier on top of another when it's shared
  by two chains whose remaining length to the TLE differs (e.g. connecting
  a second Cause to an existing barrier ahead of that Cause's own further
  barrier) — depth is now ranked by the longest remaining chain through the
  barrier, not whichever chain happened to be found first.
- Added "Shift Toward TLE" / "Shift Away From TLE" on a barrier's
  right-click menu: reorders it one step within its own path toward or
  away from the TLE — a real change to the chain, not a cosmetic nudge, so
  it's exactly what every future Auto-arrange reflects. Prompts for which
  path to reorder when a shared barrier's lines disagree on its neighbor.
- Fixed auto-arrange spacing rows far apart vertically (regardless of
  Loose/Tight mode) when several Causes or Outcomes had few or no
  barriers between them — two Causes/Outcomes with no barrier at all now
  sit as close together as two that share one, since there's no barrier
  box or label between them to protect against.

## v0.1.2 - 2026-09-06

- Fixed depth-based auto-arrange regression.

## v0.1.1 - 2026-09-06

- Changed the Load Demo button colour to make it more visually appealing.

## v0.1.0 - 2026-09-06

- Initial release.
