# Changelog

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
