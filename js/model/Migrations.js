(function (Bowtie) {
  // Forward-only schema migrations (proposals/12).
  //
  // Until now `loadDocument` rejected any file whose `version` wasn't
  // exactly SCHEMA_VERSION, deliberately: v7 through v10 each changed the
  // MEANING of a field (see DESIGN_NOTES.md "Schema"), and with one user
  // and no files in the wild, refusing was safer than guessing. That stops
  // being true the moment a second person has an export: every later bump
  // would strand their file with "Unsupported File Version" and no way
  // forward but editing JSON by hand.
  //
  // So, from v10 on, a bump ships with an entry here. Three rules keep
  // this honest:
  //
  // 1. **Plain JSON in, plain JSON out.** A migration never touches
  //    BowtieModel -- a v10 document cannot be loaded into a v11 model in
  //    order to be migrated, which is the whole problem. Each `migrate`
  //    is a pure function of the document object.
  // 2. **Forward only, one step at a time.** Entries chain (10 -> 11 ->
  //    12); there is no downgrade path, and a gap in the chain is a
  //    rejection rather than a leap of faith.
  // 3. **Each entry has a checked-in fixture** (tests/fixtures/
  //    schema-vN.json) so a migration is always tested against what an
  //    export of that version ACTUALLY looked like, not against what the
  //    current code thinks it looked like.
  //
  // v7-v9 predate all of this and stay rejected: writing migrations for
  // versions whose files nobody has would be guesswork with no fixture to
  // check it against.
  //
  // Each entry: { from, to, describe, migrate(doc) -> doc }.
  const MIGRATIONS = [
    // The chain is empty until the next schema bump -- proposals 08
    // (escalation factors) and 11 (the Threats/Consequences rename) each
    // add their 10 -> 11 entry when they land. The framework ships first
    // on purpose: both of those bumps are the reason it exists, and
    // neither should have to invent the mechanism as a side-quest.
  ];

  // The steps from `version` up to SCHEMA_VERSION, or null when no
  // contiguous chain reaches it.
  function chainFrom(version) {
    const target = Bowtie.BowtieModel.SCHEMA_VERSION;
    const steps = [];
    let at = version;
    while (at < target) {
      const step = MIGRATIONS.find((m) => m.from === at);
      // A step that doesn't actually advance (a malformed entry with
      // `to <= from`) would loop here forever -- refuse instead, which
      // surfaces as the ordinary "can't open this" rather than a hung
      // tab.
      if (!step || step.to <= at) return null;
      steps.push(step);
      at = step.to;
    }
    return at === target ? steps : null;
  }

  // Returns `{ ok, doc, applied }`. `ok: false` means no chain reaches
  // the current version -- the caller rejects the file, rather than
  // loading something half-upgraded. The input is never mutated: it is
  // the caller's parsed file, and on a failed load it must still be
  // exactly what was read, so the chain runs against a deep copy and
  // each step is free to mutate what it is handed.
  function migrateDocument(doc) {
    const from = doc && doc.version;
    if (typeof from !== 'number') return { ok: false, doc, applied: [] };
    const steps = chainFrom(from);
    if (!steps) return { ok: false, doc, applied: [] };

    let current = JSON.parse(JSON.stringify(doc));
    const applied = [];
    steps.forEach((step) => {
      current = step.migrate(current);
      current.version = step.to;
      applied.push(`v${step.from} → v${step.to}: ${step.describe}`);
    });
    return { ok: true, doc: current, applied };
  }

  // Whether a document this old can be upgraded at all -- what the
  // import path asks before deciding between migrating and explaining.
  function canMigrate(version) {
    return typeof version === 'number'
      && version < Bowtie.BowtieModel.SCHEMA_VERSION
      && chainFrom(version) !== null;
  }

  Bowtie.Migrations = { MIGRATIONS, migrateDocument, canMigrate, chainFrom };
})(window.Bowtie = window.Bowtie || {});
