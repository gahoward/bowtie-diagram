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
  // v10 -> v11 (proposals/11): Causes became Threats and Outcomes became
  // Consequences. Type keys, collection names, library/idCounters/
  // retiredIds keys and Line.originType all rename -- but the part that
  // forced a schema bump rather than a cosmetic change is that the id
  // prefixes ROTATE: `C_` meant Cause in v10 and means Consequence in
  // v11, while a Threat is now `T_`. Read a v10 file as v11 without this
  // and every Cause would come back labelled as a Consequence.
  //
  // The rotation is done from the LIBRARY outward rather than by
  // rewriting the text of the document: each node's new id is decided by
  // which collection it was in, then every reference to it is looked up
  // in that map. A regex over the whole file would have to get the order
  // exactly right to avoid mapping both sides onto `C_`, and would
  // silently rewrite any user-typed name that happened to contain "C_1".
  function migrateV10ToV11(doc) {
    const rotate = (id, from, to) => (
      typeof id === 'string' && id.startsWith(`${from}_`) ? `${to}_${id.slice(from.length + 1)}` : id
    );
    const library = doc.library || {};
    const idMap = new Map();
    (library.cause || []).forEach((node) => idMap.set(node.id, rotate(node.id, 'C', 'T')));
    (library.outcome || []).forEach((node) => idMap.set(node.id, rotate(node.id, 'O', 'C')));
    const newId = (id) => (idMap.has(id) ? idMap.get(id) : id);

    const renameNodes = (nodes, type) => (nodes || []).map((node) => ({
      ...node, id: newId(node.id), type,
    }));
    const renamePlacements = (placements) => (placements || []).map((placement) => ({
      ...placement, nodeId: newId(placement.nodeId),
    }));

    const migrated = { ...doc };
    migrated.library = {
      ...library,
      threat: renameNodes(library.cause, 'threat'),
      consequence: renameNodes(library.outcome, 'consequence'),
    };
    delete migrated.library.cause;
    delete migrated.library.outcome;

    migrated.threats = renamePlacements(doc.causes);
    migrated.consequences = renamePlacements(doc.outcomes);
    delete migrated.causes;
    delete migrated.outcomes;
    // Barrier placements keep their own PB_/MB_ ids, but they are in the
    // same id space, so they go through the same lookup rather than being
    // assumed unaffected.
    migrated.preventativeBarriers = renamePlacements(doc.preventativeBarriers);
    migrated.mitigativeBarriers = renamePlacements(doc.mitigativeBarriers);

    const ORIGIN_TYPES = { cause: 'threat', outcome: 'consequence' };
    migrated.lines = (doc.lines || []).map((line) => ({
      ...line, originType: ORIGIN_TYPES[line.originType] || line.originType,
    }));

    // `idCounters` and `retiredIds` are keyed by type; the retired ids
    // themselves are node ids from the same rotating space, so they
    // rotate with their collection -- an id retired as C_3 (a Cause) must
    // come back as T_3, or the next Threat would be handed an id a
    // previous one still owns.
    const renameKeyed = (obj, transform) => {
      if (!obj) return obj;
      const out = { ...obj };
      out.threat = transform(obj.cause, 'C', 'T');
      out.consequence = transform(obj.outcome, 'O', 'C');
      delete out.cause;
      delete out.outcome;
      return out;
    };
    migrated.idCounters = renameKeyed(doc.idCounters, (value) => value);
    migrated.retiredIds = renameKeyed(
      doc.retiredIds,
      (ids, from, to) => (ids || []).map((id) => rotate(id, from, to)),
    );

    return migrated;
  }

  // v11 -> v12 (proposals/08): escalation factors. Additive only -- the
  // new collections start empty and every existing key keeps its meaning
  // -- so this fills in the shape rather than rewriting anything. It is
  // still a real step: without it a v11 file would not reach the current
  // version at all, and `fromJSON` would be left to guess at missing
  // arrays it should be able to rely on.
  function migrateV11ToV12(doc) {
    const withKeys = (obj, empty) => ({
      ...(obj || {}),
      escalationFactor: (obj && obj.escalationFactor) || empty(),
      escalationBarrier: (obj && obj.escalationBarrier) || empty(),
    });
    return {
      ...doc,
      library: withKeys(doc.library, () => []),
      retiredIds: withKeys(doc.retiredIds, () => []),
      idCounters: {
        ...(doc.idCounters || {}),
        escalationFactor: (doc.idCounters && doc.idCounters.escalationFactor) || 0,
        escalationBarrier: (doc.idCounters && doc.idCounters.escalationBarrier) || 0,
      },
      escalationFactors: doc.escalationFactors || [],
      escalationBarriers: doc.escalationBarriers || [],
    };
  }

  // v12 -> v13 (proposals/20): the document gained an identity block --
  // reference, revision, status, date, author, checkedBy, approvedBy,
  // organisation, notes and a revision history.
  //
  // Nothing existing changes, and every field defaults to empty, so this
  // is the gentlest migration in the chain. It bumps the version anyway
  // because the policy is about the OTHER direction: without a bump, a
  // v12 editor would open a v13 file, silently drop the whole block, and
  // hand back an export that has quietly lost who approved the analysis.
  // Of everything in this document, that is the worst thing to lose
  // without saying so.
  function migrateV12ToV13(doc) {
    return { ...doc, document: Bowtie.BowtieModel.emptyDocumentMetadata() };
  }

  // v13 -> v14 (proposals/21): escalation factors can now carry a
  // `degradation` that changes the barrier they are anchored to.
  //
  // Structurally this is the emptiest migration in the chain -- the
  // field lives on a Node and defaults to null, so a v13 document needs
  // no rewriting at all. It bumps because the MEANING of an existing
  // document is now different in one direction: a v13 editor opening a
  // v14 file would drop every stated degradation and silently report
  // figures that are too optimistic, which is the wrong way for a safety
  // tool to be wrong.
  //
  // Existing documents' numbers do NOT change on upgrade. `degradation`
  // defaults to null, so an analysis reports exactly what it reported
  // before until an analyst states a degradation -- a decision they
  // make, rather than one the tool makes for them.
  function migrateV13ToV14(doc) {
    return { ...doc };
  }

  // v14 -> v15 (proposals/22): a page may record that its top event IS a
  // consequence on another page. Additive in the gentlest possible way --
  // `derivedFrom` arrives absent, meaning "an ordinary page", which is
  // what every existing page is. No figure moves on upgrade, in this
  // step or by design: the link records the relationship, and the
  // arithmetic that will read it is a later change.
  //
  // The bump is still real. A v14 editor handed a v15 file drops the
  // field, and hands back a document where the escalation hierarchy an
  // analyst built has quietly ceased to exist.
  function migrateV14ToV15(doc) {
    return { ...doc };
  }

  const MIGRATIONS = [
    {
      from: 10,
      to: 11,
      describe: 'Renamed Causes to Threats and Outcomes to Consequences (ids C_n became T_n, O_n became C_n)',
      migrate: migrateV10ToV11,
    },
    {
      from: 11,
      to: 12,
      describe: 'Added escalation factors and escalation barriers (nothing existing changed)',
      migrate: migrateV11ToV12,
    },
    {
      from: 12,
      to: 13,
      describe: 'Added the document identity block — reference, revision, date, author, approvals (nothing existing changed)',
      migrate: migrateV12ToV13,
    },
    {
      from: 13,
      to: 14,
      describe: 'Escalation factors can now degrade the barrier they are anchored to (existing figures unchanged until a degradation is stated)',
      migrate: migrateV13ToV14,
    },
    {
      from: 14,
      to: 15,
      describe: 'A page can now record that its top event is a consequence on another page (nothing existing changed)',
      migrate: migrateV14ToV15,
    },
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
