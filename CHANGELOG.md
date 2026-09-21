# Changelog

## Unreleased

- **One analysis can now escalate into another** (`proposals/22`,
  **schema v15**). Standard bowtie practice escalates: a consequence on
  one page is the top event of another — "loss of containment" is a
  consequence of the pipework analysis and the top event of the
  pool-fire one. The document could already hold both diagrams and had
  no way to say they were the same event. Right-click a consequence to
  **Escalate to a New Page** (which creates it, names it and links it in
  one undoable step) or **Link to an Existing Page**. A derived page
  says where its top event came from, on the canvas and in the status
  strip, and the strip's segment takes you there.
  - **It changes no figure yet, in any mode.** This step records the
    relationship. Carrying the source consequence's likelihood into the
    derived page's top event is a separate change, held back on purpose:
    a cross-page cycle would not produce a wrong number, it would hang
    the tab, so the link and its defences ship first and get exercised
    before anything computes through them.
  - Cycles are refused when you make one and again when a file
    containing one is opened — the second because a hand-edited or
    badly merged file can carry a cycle the app would never create.
  - Deleting a consequence, or a whole page, clears any link that named
    it. The dependent page stays; it just stops being derived.

- **A stale-element race in the test suite, and 95 sleeps that were
  hiding it** (`proposals/17`). Eleven places measured a node's bounding
  box and then clicked those coordinates. The canvas replaces its whole
  node layer on every render, so a box measured just after a change can
  describe an element that no longer exists — the test then dies on
  `'NoneType' object is not subscriptable` rather than on what it was
  checking. CI caught one; the rest were the same pattern waiting. All
  are locator clicks now, which re-resolve at click time, and the sleeps
  that were standing in for that waiting are gone.

- **A new table: which barriers is the analysis leaning on?**
  (`proposals/23`). The Barrier Register says what state each barrier is
  in. View › **Barrier Criticality** answers the other question a safety
  engineer asks — which barriers carry the most paths, which appear on
  the most pages, and, the one that earns the table, **which are the
  sole protection on some path**. A line whose only stop is one barrier
  has nothing behind it, and until now that was visible only by looking
  at the picture and counting.
  - One row per barrier, not per placement: a barrier standing on four
    pages is one barrier four analyses depend on.
  - A sole-protection path is stated under the table, not raised as a
    warning. It is a finding, not a defect — plenty of legitimate
    analyses have one — and an advisory that fires on most documents
    would only teach people to ignore the badge.
  - No "criticality score". One blended number would read as an
    assessment this tool is not entitled to make; the columns are there
    to be weighed by the person reading them.

- **Escalation factors now change the numbers** (`proposals/21`, **schema
  v14**). `proposals/08` drew them and warned about them, and stopped
  there: a barrier with three uncontrolled escalation factors and a
  barrier with none produced identical likelihoods, identical risk
  classes and identical Barrier Register rows. The diagram said one
  barrier was degraded; every figure in the document said it was not.
  An escalation factor's Properties now carries a **Degradation** —
  either "multiply the barrier's measure by" or "the barrier can do no
  better than" — and an **uncontrolled** factor's degradation is
  composed into its barrier before the barrier is applied.
  - **Which factors apply is the same question the warning already
    asked.** A factor with an escalation barrier on it does not degrade,
    by the same predicate that raises the existing uncontrolled-factor
    advisory, so the warning and the arithmetic cannot disagree about a
    diagram.
  - **Nothing became approximate.** A multiplier is an exact `Rational`
    multiply and a floor is a clamp; the app still has exactly one
    sanctioned rounding point.
  - It is visible wherever the barrier is: a second line under the
    barrier on the canvas (`×10 worse`), a claimed-and-effective hover
    title, a **"Degraded by"** column in the Barrier Register and its
    CSV export, and the factor's dashed line drawn more heavily when it
    is actually moving the numbers.
  - Putting the **Properties** dialog under the accessibility gate for
    the first time immediately found an unrelated defect: the barrier
    measure picker had no accessible name at all. It does now, and both
    Properties states are checked in CI from here on.
  - **This can change the figures in a document you already have.** A
    file with escalation factors reports different likelihoods once a
    degradation is stated on one — because the factors were always
    drawn there and were always being ignored. That is a correction, not
    a regression, and it is why the field defaults to *no degradation*:
    your numbers move when you say they should, not when you upgrade.
    The bump itself exists for the other direction — a v13 editor handed
    a v14 file drops the field and re-exports an analysis whose
    likelihoods have quietly become less conservative than you made
    them.

- **Large diagrams are usable again** (`proposals/16`). Every render is
  now coalesced into one animation frame, so a burst of changes costs one
  render rather than one each. Building a 1000-placement document through
  the model API went from **148 seconds to 0.72**; 500 placements from 31
  seconds to 0.23. Only drags were coalesced before, which covered the
  case that had been measured and none of the others — a cascading
  delete, an auto-arrange, an import. `BowtieModel` also gained a
  placement-id index for `findById`, worth about a third off a
  500-placement render; the coalescing is the part that mattered.
- **A document can now say who produced it** (`proposals/20`, **schema
  v13**). `README.md` and `DESIGN_NOTES.md` both describe an exported
  bowtie as something that may be an audit artifact — and the document
  itself carried no identity at all. There is now a **Document** tab in
  Project Settings holding reference, revision, status, date, prepared
  by, checked by, approved by, organisation, notes and a revision
  history, and a **printed cover sheet** carrying all of it, with
  `reference · revision · date · page` at the foot of every diagram
  sheet. Both CSV exports can optionally carry the same block above the
  table.
  - **The tool records what the user states; it does not enforce a
    process.** Every field is optional free text, nothing is validated,
    no sign-off order exists, and a missing revision produces no warning
    and blocks no export. Anything stronger belongs in whatever system
    actually governs your documents — faking it in an offline browser
    tool would look like assurance it cannot provide.
  - Old files upgrade automatically. The bump exists for the other
    direction: a v12 editor handed a v13 file would silently drop the
    whole block, and of everything in the document that is the worst
    thing to lose quietly.
- **The app now says when something has gone wrong** (`proposals/19`).
  Two silent failures, both in the part of the app whose whole job is not
  losing work. An uncaught exception used to leave the editor wedged with
  no message at all — and the user's instinctive next move, reloading, is
  exactly the one that loses everything since the last export. There is
  now a dialog that says so plainly and offers **Export to JSON now**,
  alongside Reload and Continue anyway, with the stack collapsed
  underneath for a bug report. Separately, automatic crash recovery used
  to switch itself off on a full browser quota **and delete the snapshot
  it already had** — silently, on exactly the large documents most worth
  protecting. It now keeps the last good snapshot, says once that it has
  stopped and why, and leaves a standing "Recovery off" warning in the
  status strip.
- **The application chrome is now usable with a screen reader**
  (`proposals/18`). `proposals/13` did the hard surface — the canvas —
  and the easy one had been left behind: every modal in the app,
  including the welcome gate that blocks all use of it, was an anonymous
  `<div>` with no dialog role or name; the toolbar menus never announced
  that they opened a menu or whether they were open; and the Project
  Settings and Node Library tab strips set `role="tab"` while
  implementing no arrow keys at all, promising navigation that silently
  did nothing. All three are now complete widgets with proper keyboard
  behaviour, the page has landmarks and a heading, icon-only buttons have
  names, and a viewport meta tag stops tablets rendering an emulated
  980px page. **axe-core now runs over ten app states in CI**, which is
  what stops the next modal shipping without a role.
  - It immediately found a real defect nobody had noticed: every text
    field in Project Settings was completely unlabelled, because the row
    builder used a `<span>` rather than a `<label>`.
  - The Firefox job found another: the new crash dialog showed **no error
    message at all on Firefox**, because Chromium's `Error.stack` begins
    with the message and Firefox's is the frames alone.
- **Controllers out of the rendering business** (`proposals/15`). Three
  screens that a controller used to build inline — the welcome flow, the
  Node Library and Project Settings — now live in `js/view/` as
  `WelcomeView.js`, `NodeLibraryView.js` and `SettingsFormView.js`, each
  taking plain data and handler callbacks. Between them those three
  controllers went from **123 DOM-construction calls to 7**, and the
  seven that remain each build a one-paragraph dialog. No test changed,
  which for a pure extraction is the whole argument.
- **Three copies of a control became one** (`proposals/15`). `function
  el(…)` had been defined eleven times in three mutually incompatible
  shapes, all sharing the name — moving element-building code between an
  HTML file and an SVG one passed lint and then failed silently at
  runtime; there is now one of each in `js/view/Dom.js` and
  `js/view/Svg.js`. The same pattern turned up a level up:
  `js/view/FormControls.js` now owns the tablist that Project Settings
  and the Node Library had each grown privately, and the radio row that
  had three copies. The Risk Summary and Barrier Register likewise share
  one modal shell, which fixed a real inconsistency in CSV filenames
  that the duplication had hidden.

- **The canvas is now keyboard-operable and screen-reader navigable**
  (`proposals/13`) — until now every surface but the canvas was, so a
  keyboard-only user could start a bowtie and then do nothing with it.
  Tab enters the canvas once; arrows move between nodes *along the
  diagram* (left/right walk a threat's row through its barriers to the
  top event and on to its consequences, up/down move between lanes,
  Home jumps to the top event, and down from a barrier drops into its
  escalation stack). Enter opens Properties, Shift+F10 opens that node's
  own menu, Ctrl+arrows nudge it in single undo steps, Delete removes it,
  Escape leaves for the toolbar. Context menus became real `role=menu`
  widgets with arrow navigation that return focus where they came from.
  Every node announces what it is, what it is called and the figures
  drawn beside it — built from the same strings the canvas prints, so the
  spoken and drawn versions cannot drift — and keyboard actions are
  announced in a live region. The minimap is hidden from assistive
  technology, being a duplicate view.
- Added **escalation factors** and **escalation barriers**
  (`proposals/08`, schema v12) — the largest remaining gap between "a
  bowtie diagram" and "a bowtie". An escalation factor is a condition
  that degrades one specific barrier ("the ESDV isn't proof tested"); an
  escalation barrier is the control on that ("a quarterly partial-stroke
  test"). Add one from any barrier's context menu; it hangs below that
  barrier, joined by a dashed line with its controls as bars across it.
  Both are library node types, so the same factor can degrade barriers on
  several pages. Two new warnings: an escalation barrier connected to
  nothing blocks export, while a factor with no control is advisory —
  "this barrier can be degraded and nothing is stopping that" is often
  exactly what an analyst means to record. Auto-arrange reserves room for
  the stack and pushes lower rows down; the demo ships with a worked
  example. Escalation factors are structural only for now: they change no
  computed figure, and the quantitative treatment is a separate proposal.

- **Causes are now Threats and Outcomes are now Consequences**
  (`proposals/11`), the bowtie method's own terms, everywhere: labels,
  menus, the node library, model and JSON keys, CSS classes, and the
  visible id prefixes — a Threat is `T_n`, and `C_n` has rotated from
  Cause to Consequence. That rotation is why this is **schema v11**: a
  v10 `C_1` and a v11 `C_1` name different sides of the diagram. Existing
  files are not stranded — the first entry in the migration chain
  upgrades a v10 export on load, rotating its ids, and marks the document
  unsaved so it gets re-exported in the new schema. The codemod that
  performed the rename is checked in as `scripts/rename-terms.js`.
- Fixed a latent bug in the single-file build surfaced by that rename:
  the bundle was inserted with a string replacement, which treats `$&` in
  the replacement as a substitution pattern — and minified output can
  contain exactly that, so `dist/bowtie-diagram.html` came out truncated
  mid-module. The dist smoke test caught it; the build now inserts the
  bundle verbatim.
- Added View > "Barrier Register…" (`proposals/09`): one table per page of
  every barrier on it, with its side, type, owner, effectiveness, measure,
  the demand rate reaching it, which threats or consequences it protects, and
  any warnings against it — the barrier owner's view, where the Risk
  Summary is the consequence owner's. Ranked worst-first: anything warned
  about, then anything unknown about it, then the weakest assessed
  effectiveness, then whatever is holding back the most. Works in every
  mode (a barrier has an owner and an effectiveness whether or not the
  document does arithmetic), dropping the measure and demand columns when
  there are no figures for them, and carries the same Copy as table /
  Export CSV… / Print… actions as the Risk Summary. Model API:
  `computeBarrierRegister(pageId)`.
- Added a second bundled risk matrix, **MIL-STD-882E** (`proposals/10`),
  selectable in the New Bowtie wizard and Project Settings like Leaflet 5.
  Its probability levels are stated per item life rather than per unit
  time, so matrices can now be authored with `authoringUnit: "lifetime"`
  plus the item life they assume (`authoringExposureHours`, 100,000 h in
  the preset); the build converts through it at the same single rounding
  point as the hour/year conversion, and the validator requires the field
  rather than defaulting it, so the assumption stays visible and editable.
  The standard's Eliminated (F) level is a state rather than a band and is
  described in Improbable's text instead of being listed as a class no
  computed value could reach. The preset's own `source` records that its
  tables are a transcription to be checked against a controlled copy of
  the standard.
- Files from an older schema version are now upgraded on load rather than
  refused (`proposals/12`). `js/model/Migrations.js` holds a forward-only
  chain of pure JSON→JSON steps; a file newer than the editor is still
  refused (a future field can't be guessed at), and one older than v10
  still is too (those versions predate the chain and have no fixture to
  test a migration against). An upgraded document is marked unsaved and
  announced with an "Upgraded" notice listing what changed — the original
  file is never rewritten. Recovery snapshots come through the same path,
  so a schema bump no longer strands unsaved work either. The chain ships
  empty: it exists ahead of the two bumps that need it (escalation
  factors, and the Threats/Consequences rename).
- Added View > "Keyboard shortcuts…" and the keys it lists
  (`proposals/03`): Ctrl/⌘+S export to JSON, +O import, +Shift+E/P the
  SVG and PNG exports, +P print, +Shift+A auto-arrange, +0 reset view,
  +Shift+R the Risk Summary, Delete to remove the selected node from the
  page, Escape to clear the selection, and `?` for the sheet listing all
  of it. Each key activates the menu item it names, so a disabled action
  (a blocking warning disables every export) disables its key too, and
  the menu tooltips now advertise their keys. Clicking a node selects it
  (a blue outline) -- the seed of the canvas focus model.
- Unsaved work now survives a crash or a closed tab (`proposals/04`):
  while the document is dirty its JSON is kept in this browser's
  localStorage on a 2 s debounce, and the start screen offers it back
  with the analysis name, its page and node counts and when it was last
  edited -- Recover loads it through the ordinary import validation and
  leaves it dirty (it still isn't on disk), Discard drops it. A completed
  export or import clears it.
- The start screen also lists "Recently opened" where the browser
  supports it: the file handles of the last five documents opened or
  saved through a native dialog, kept in IndexedDB, each re-opening that
  exact file. Absent the File System Access API (Firefox, Safari,
  `file://`) the list simply isn't shown.
- Added File > "Export all pages as SVG…/PNG…" and File > "Print…"
  (`proposals/02`). Both render every page off-screen, so a multi-page
  document no longer has to be exported a tab at a time and the live
  canvas is never disturbed: the all-pages exports write one file per
  page into a chosen folder (sequential downloads where the File System
  Access API is absent), and Print lays out one landscape sheet per page
  followed by the Risk Summary tables. Single-page exports are now named
  after the analysis rather than a fixed "bowtie-diagram".
- The Risk Summary gained Copy as table, Export CSV… and Print…
  (`proposals/01`) -- the CSV carries one row per consequence with its page,
  rank, severity, pre- and post-mitigation likelihood (with unit) and
  risk class, plus any threats excluded from the figures.
- Added a status strip beside the page tabs (`proposals/07`): the
  document's mode, its risk matrix and that matrix's class letters, the
  display unit and how the top event combines its threats -- each
  segment opening the setting it names.
- Risk classes now carry an explicit `rank` (`proposals/05`), so "worse
  than" no longer depends on the order classes happen to appear in the
  matrix JSON. Ranks must run 0..n-1 with no gaps, all classes or none;
  a matrix without them (an older export) is back-filled from array
  order on load, so no existing document changes meaning.
- The quantitative demo now loads with no warnings (`proposals/06`): its
  threat frequencies were rebased onto documented LOPA-style figures, and
  its residual classes span A through D rather than bunching at one.

- Reworked the Settings menu and the modals behind it
  (ui_fitness_proposal.md). Settings now holds exactly two items:
  "Project Settings…" (everything saved with the document — name,
  identifier display, risk mode as the wizard's cards, matrix with an
  inline summary and legend, TLE aggregation, quantitative defaults — as
  General / Risk analysis / Quantitative tabs, nothing scrolling) and
  "Preferences…" (everything per browser — display unit, line
  annotations, auto-arrange spacing and pull-closer — applied immediately
  and remembered in localStorage; replaces Visual Settings). "Node
  Library…" moved to the Add menu and became a wide, tabbed manager with a
  real table, Edit opening the shared Properties modal and retired
  identifiers under a disclosure. The toolbar title now opens Project
  Settings with the name focused instead of its own Rename dialog.
- Warnings are one row each (id, name, page, a **Show** that switches to
  the page and focuses the node) in Blocking / Advisory groups.
- Properties: the risk-class chip no longer prints its letter twice, the
  barrier value field is labelled "Value" under the measure it belongs
  to, and barrier type/owner/effectiveness have their own section.
- Context menus group create / inspect / destroy with separators and colour
  the destructive items; page-tab edit/delete affordances show on the
  active tab and on hover; "Jump to page" appears only once the tab strip
  overflows; the Add-node modal lists "Choose existing" first, keeps
  Create in the footer and disables it until a name is typed.
- Reworked the first-load screen and New Bowtie wizard
  (landing_page_proposal.md). The start screen now leads with a labelled
  picture of a bowtie and one primary "Start a new bowtie"; the worked
  demo sits behind a Simple/Qualitative/Quantitative chooser that explains
  each mode; and "browse for a file" and "drag and drop" are one Open
  zone (the whole screen accepts a drop). The wizard is two steps: the
  names (analysis title, top-level event, hazard — empty by design with
  example placeholders, so a placeholder can never become a name, with a
  live preview of where the names land; page name/description and
  identifier display moved under "More options", page name defaulting to
  the top-level event), then the risk mode and matrix preset, previously
  only reachable in Project Settings after the fact.
- Every Consequence now shows its pre-mitigation risk class alongside the
  post-mitigation one (quantitative_mode_proposal.md's inherent/residual
  ALARP pair): the pre-mitigation figure is the same calculation with
  every barrier -- preventative and mitigative -- removed. On the canvas
  this is a "pre → post" badge pair (dashed ring for pre-mitigation) plus
  a "Pre-mitigation" likelihood line; the Consequence's Properties modal shows
  both classes and both likelihoods. Quantitative mode only -- a
  Qualitative likelihood is a manual pick with no barrier arithmetic to
  remove, so it keeps its single badge. Model API: `assessConsequence`.
- Added View > "Risk Summary…": one table per page, each ranking that
  page's Consequences worst-first by post-mitigation risk class (then pre-
  mitigation class, severity, likelihood), with severity and the pre- and
  post-mitigation likelihood and risk class side by side. Model API:
  `computeRiskSummary(pageId)`.
- The browser now asks for confirmation before the tab or window closes
  with unsaved changes (edits since the last JSON export/import).

## v1.0.0 - 2026-09-12

- Reworked Quantitative mode's barrier treatment (`barrier_measures_
  proposal.md`, `bowtie-diagram-docs`): a barrier's `protection` (renamed
  from `riskReductionFactor`; schema v9 → v10, no migration) is now a
  measure-tagged quantity rather than a bare RRF, supporting PFD_avg, raw
  probability, unavailability, PFH, SIL bands (worst case), and three
  rate-based forms (running, running-repairable with MTTR, and standby
  with a proof-test interval), each with its own rate unit and an
  optional per-barrier dangerous-fraction/test-interval override falling
  back to new document-wide Project Settings defaults. Every measure
  normalises to one of three exact composition operations on the running
  frequency (`attenuate`/`divide`/existing multiplication, plus a new
  frequency-LIMITING `min()` rule for PFH and non-repairable running
  rates) — never to a converted value — so no division or transcendental
  function enters the calculation pipeline; an MTBF/MTTF-derived rate is
  carried as an exact `Rational` all the way through rather than ever
  computing its reciprocal.
- Fixed a real (previously harmless) bug this surfaced: mitigative
  barriers were folded in the order an Consequence's Line stores them
  (nearest-Consequence-first), the opposite of how a computed likelihood
  actually propagates outward from the TLE. Multiplication is
  commutative, so this never produced a wrong number until the new
  frequency-limiting `min()` rule made barrier order along a Line
  genuinely significant — now walked TLE-first, matching the preventative
  side.
- Added two advisory warnings (informational only — unlike the existing
  orphan checks, they never block export): a frequency-limiting barrier
  whose own rate isn't actually below the demand reaching it (crediting
  zero risk reduction silently), and a low-demand measure applied where
  the local demand rate exceeds IEC 61511's ~1/year low/high-demand
  boundary. The Properties modal now also shows a barrier's own computed
  demand rate read-only, the number that decides which of the two regimes
  applies.
- Fixed a click-focus regression: clicking a Threat or Consequence dimmed
  every barrier on its own side, including the one actually on its path.
  `FocusController` compared `Line.originId`/`.stops` (internal placement
  ids) directly against each node's `data-id`, which the earlier node-
  library rework had made the visible NODE id instead — `FocusController`
  itself was never updated for that. Fixed by resolving each placement id
  to its owning node's id before comparing; added the click-focus dimming
  test coverage that would have caught this (only hover was covered
  before).
- Fixed a `PFD_avg` label typo (the pseudo-subscript "g" wasn't a real
  Unicode subscript glyph) and rationalised the barrier measure picker
  into two groups — probability-based (RRF, PFD_avg, raw probability,
  unavailability, SIL) and rate-based (PFH, and the three rate forms) —
  with a hint noting the probability-based measures all apply identically,
  so a user picks whichever name matches their own source document.
- First release tagged 1.0.0: the app, its quantitative-mode calculation
  pipeline (Simple/Qualitative/Quantitative, barrier measures, risk
  matrices), and its test suite are considered stable.

## v0.2.1 - 2026-09-07

- Added a randomized/generative auto-arrange test (30 seeded random
  Threat/Consequence + shared-barrier topologies per run) alongside the existing
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
  e.g. one Threat sharing a barrier with the FRONT of an already-3-way-
  shared block, while a different Threat shares another barrier with a
  member further inside that same block, could leave the first Threat's own
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
  overlapping shared-barrier pairs (e.g. two Consequences sharing one barrier,
  which then diverge into two further barriers, each itself shared with a
  third and fourth Consequence) could still leave two of those further
  barriers' boxes overlapping each other, even though neither shares an
  Consequence with the other. Re-positioning an already-built shared group
  next to a new neighbour now also promotes the actual shared member to
  that group's own edge, not just the group as a whole, so every barrier
  in the chain keeps its own dedicated row(s).

- Added multi-page support: an analysis document can now contain multiple
  pages (tabs), each with its own TopLevelEvent, Hazard, and independent
  diagram content (Threats, Consequences, Barriers, and Lines).
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
  (e.g. PB_3 in the demo, ticking both T_1 and T_2): the immediate
  position feedback used to corrupt the barrier onto the exact same spot
  as an unrelated one before Auto-arrange even ran, and Auto-arrange
  itself then let one barrier's label overlap the very next barrier's box
  — both because the code assumed two Threats sharing a first barrier
  never diverge into separate barriers afterward, which this feature
  makes possible for the first time.
- Fixed auto-arrange placing an unrelated Threat/Consequence's row between two
  others that privately share a barrier, whenever all of them also share
  a LATER barrier further down the line (e.g. attaching a bare Threat to
  an existing barrier that a different Threat also uses) — the shared
  barrier's box then grew tall enough to visually swallow the unrelated
  row in between. Two rows sharing a barrier with few participants are
  now clustered strictly adjacent, ahead of a looser, many-participant
  relationship they might also both be part of.
- "Attach to Existing Preventative/Mitigative Barrier…" now asks whether
  to follow that barrier's existing continuation toward the TLE (only
  when it actually has one) instead of always silently inheriting it —
  declining keeps whatever the attaching Threat/Consequence's own line already
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
- Fixed auto-arrange still letting an unrelated Threat/Consequence's row land
  inside a shared barrier's grown box in cases the previous fix (v0.1.3)
  didn't cover — e.g. attaching a bare Threat to one barrier of a chain and
  declining to inherit its further continuation ("Stop Here") could leave
  that Threat sandwiched inside a separate, larger barrier's box it was
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
  a second Threat to an existing barrier ahead of that Threat's own further
  barrier) — depth is now ranked by the longest remaining chain through the
  barrier, not whichever chain happened to be found first.
- Added "Shift Toward TLE" / "Shift Away From TLE" on a barrier's
  right-click menu: reorders it one step within its own path toward or
  away from the TLE — a real change to the chain, not a cosmetic nudge, so
  it's exactly what every future Auto-arrange reflects. Prompts for which
  path to reorder when a shared barrier's lines disagree on its neighbor.
- Fixed auto-arrange spacing rows far apart vertically (regardless of
  Loose/Tight mode) when several Threats or Consequences had few or no
  barriers between them — two Threats/Consequences with no barrier at all now
  sit as close together as two that share one, since there's no barrier
  box or label between them to protect against.

## v0.1.2 - 2026-09-06

- Fixed depth-based auto-arrange regression.

## v0.1.1 - 2026-09-06

- Changed the Load Demo button colour to make it more visually appealing.

## v0.1.0 - 2026-09-06

- Initial release.
