# Changelog

## Unreleased

- Fixed "Shift Toward TLE" / "Shift Away From TLE" (added in v0.1.3): they
  previously only nudged a barrier's on-screen position, which the very
  next Auto-arrange silently undid. They now actually reorder the barrier
  within its path — swapping it with its neighbor in the underlying chain
  — so the new order is permanent and is exactly what Auto-arrange reflects
  from then on. A barrier shared by lines that disagree on its neighbor now
  prompts for which path(s) to reorder.

## v0.1.3 - 2026-09-07

- Fixed auto-arrange placing a barrier on top of another when it's shared
  by two chains whose remaining length to the TLE differs (e.g. connecting
  a second Cause to an existing barrier ahead of that Cause's own further
  barrier) — depth is now ranked by the longest remaining chain through the
  barrier, not whichever chain happened to be found first.
- Added a manual per-barrier column shunt: right-click a Preventative or
  Mitigative Barrier and choose "Shift Toward TLE" / "Shift Away From TLE"
  to nudge it one auto-arrange column in either direction by hand.

## v0.1.2 - 2026-09-06

- Fixed depth-based auto-arrange regression.

## v0.1.1 - 2026-09-06

- Changed the Load Demo button colour to make it more visually appealing.

## v0.1.0 - 2026-09-06

- Initial release.
