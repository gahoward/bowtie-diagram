(function (Bowtie) {
  // Extracted from BowtieModel (design review finding 06, phase 3):
  // toJSON/fromJSON/loadFromJSON, the per-page JSON slice used by
  // UndoController's page-tier undo, and (finding 03) the referential-
  // integrity check a document import never had before.
  //
  // Unlike Quantitative/Warnings, this isn't a per-model-instance
  // collaborator -- `fromJSON` is a factory that BUILDS a model, so there's
  // no single instance to hold onto. Every function here takes the model
  // (or page, or data) it operates on explicitly. None of them call
  // `_emitChange` -- that stays BowtieModel's job, so this file has no
  // notion of listeners at all.
  const DocumentSerializer = {
    // --- Per-page header (name/description/TLE/Hazard) -------------------

    pageHeaderToJSON(page) {
      return {
        id: page.id,
        name: page.name,
        description: page.description,
        topLevelEvent: {
          id: page.topLevelEvent.id,
          name: page.topLevelEvent.name,
          description: page.topLevelEvent.description,
          x: page.topLevelEvent.x,
          y: page.topLevelEvent.y,
          r: page.topLevelEvent.r,
        },
        hazard: { id: page.hazard.id, name: page.hazard.name, description: page.hazard.description },
      };
    },

    pageHeaderFromJSON(data) {
      return {
        id: data.id,
        name: data.name,
        description: data.description || '',
        topLevelEvent: new Bowtie.TopLevelEvent(data.topLevelEvent),
        hazard: new Bowtie.Hazard(data.hazard),
      };
    },

    // --- Per-page serialization --------------------------------------------
    //
    // Used by UndoController's per-page undo/redo tier: a snapshot/restore
    // scoped to exactly one page's own header (name/description/TLE/Hazard)
    // plus its content subset, leaving every other page, idCounters,
    // retiredIds, the node library, and the document name untouched.
    // Deliberately NOT the shape a whole-document toJSON()/fromJSON()
    // produces (that nests only the header per page, with content flat
    // across the whole document) — this is a page-scoped slice of the same
    // data, for a different caller. The node library is intentionally OUT
    // of scope here: node identity is document-wide (node_library_
    // proposal.md), so a node edit is always a document-level undo step
    // (see UndoController.js's DOCUMENT_METHODS), never a per-page one.

    getPageJSON(model, pageId) {
      const page = model.getPage(pageId);
      if (!page) throw new Error(`Unknown page id: ${pageId}`);
      return {
        ...this.pageHeaderToJSON(page),
        causes: model.causesForPage(pageId).map((c) => ({
          id: c.id, nodeId: c.nodeId, x: c.x, y: c.y, w: c.w, h: c.h, pageId: c.pageId,
        })),
        outcomes: model.outcomesForPage(pageId).map((o) => ({
          id: o.id, nodeId: o.nodeId, x: o.x, y: o.y, w: o.w, h: o.h, pageId: o.pageId,
        })),
        preventativeBarriers: model.preventativeBarriersForPage(pageId).map((p) => ({
          id: p.id, nodeId: p.nodeId, x: p.x, y: p.y, w: p.w, h: p.h, pageId: p.pageId,
        })),
        mitigativeBarriers: model.mitigativeBarriersForPage(pageId).map((m) => ({
          id: m.id, nodeId: m.nodeId, x: m.x, y: m.y, w: m.w, h: m.h, pageId: m.pageId,
        })),
        lines: model.linesForPage(pageId).map((l) => ({
          id: l.id, originType: l.originType, originId: l.originId, stops: l.stops.slice(), pageId: l.pageId,
        })),
      };
    },

    // Replaces exactly one page's header and content subset in place.
    loadPageFromJSON(model, pageId, data) {
      const idx = model.pages.findIndex((p) => p.id === pageId);
      if (idx === -1) throw new Error(`Unknown page id: ${pageId}`);
      model.pages[idx] = this.pageHeaderFromJSON(data);
      model.causes = model.causes.filter((c) => c.pageId !== pageId)
        .concat((data.causes || []).map((c) => new Bowtie.Placement({ ...c, type: 'cause' })));
      model.outcomes = model.outcomes.filter((o) => o.pageId !== pageId)
        .concat((data.outcomes || []).map((o) => new Bowtie.Placement({ ...o, type: 'outcome' })));
      model.preventativeBarriers = model.preventativeBarriers.filter((p) => p.pageId !== pageId)
        .concat((data.preventativeBarriers || []).map(
          (p) => new Bowtie.Placement({ ...p, type: 'preventativeBarrier' }),
        ));
      model.mitigativeBarriers = model.mitigativeBarriers.filter((m) => m.pageId !== pageId)
        .concat((data.mitigativeBarriers || []).map(
          (m) => new Bowtie.Placement({ ...m, type: 'mitigativeBarrier' }),
        ));
      model.lines = model.lines.filter((l) => l.pageId !== pageId)
        .concat((data.lines || []).map((l) => new Bowtie.Line(l)));
    },

    // --- Whole-document serialization ---------------------------------

    toJSON(model) {
      return {
        version: Bowtie.BowtieModel.SCHEMA_VERSION,
        name: model.name,
        mode: model.mode,
        riskMatrix: model.riskMatrix,
        identifierDisplayMode: model.identifierDisplayMode,
        idCounters: { ...model.idCounters },
        retiredIds: {
          cause: model.retiredIds.cause.map((e) => ({ ...e })),
          outcome: model.retiredIds.outcome.map((e) => ({ ...e })),
          preventativeBarrier: model.retiredIds.preventativeBarrier.map((e) => ({ ...e })),
          mitigativeBarrier: model.retiredIds.mitigativeBarrier.map((e) => ({ ...e })),
        },
        library: {
          cause: model.library.cause.map((n) => ({ ...n })),
          outcome: model.library.outcome.map((n) => ({ ...n })),
          preventativeBarrier: model.library.preventativeBarrier.map((n) => ({ ...n })),
          mitigativeBarrier: model.library.mitigativeBarrier.map((n) => ({ ...n })),
        },
        pages: model.pages.map((p) => this.pageHeaderToJSON(p)),
        causes: model.causes.map((c) => ({
          id: c.id, nodeId: c.nodeId, x: c.x, y: c.y, w: c.w, h: c.h, pageId: c.pageId,
        })),
        outcomes: model.outcomes.map((o) => ({
          id: o.id, nodeId: o.nodeId, x: o.x, y: o.y, w: o.w, h: o.h, pageId: o.pageId,
        })),
        preventativeBarriers: model.preventativeBarriers.map((p) => ({
          id: p.id, nodeId: p.nodeId, x: p.x, y: p.y, w: p.w, h: p.h, pageId: p.pageId,
        })),
        mitigativeBarriers: model.mitigativeBarriers.map((m) => ({
          id: m.id, nodeId: m.nodeId, x: m.x, y: m.y, w: m.w, h: m.h, pageId: m.pageId,
        })),
        lines: model.lines.map((l) => ({
          id: l.id, originType: l.originType, originId: l.originId, stops: l.stops.slice(), pageId: l.pageId,
        })),
      };
    },

    // Loads a schema-v9 export into a brand-new BowtieModel. There is no
    // migration path for older schema versions — ImportExportController
    // rejects a version mismatch before this is ever called, so this only
    // ever needs to read the current shape.
    //
    // `ModelCtor` is passed in by BowtieModel.fromJSON as the closure-local
    // `BowtieModel` class, rather than reached for here as
    // `Bowtie.BowtieModel` — the test harness (conftest.py's INIT_SCRIPT)
    // wraps `Bowtie.BowtieModel` in a subclass that re-stamps
    // `window.__lastModel` onto every instance constructed from it, purely
    // so tests can reach the live model without the app exposing it. Since
    // this method's whole job is to build a THROWAWAY model to parse into
    // (and, per finding 03, possibly validate and discard), calling
    // `new Bowtie.BowtieModel()` here would silently hijack that global
    // out from under whatever the app is actually rendering, every time a
    // document is imported. Taking the constructor as a parameter keeps
    // this identical to what a same-file `new BowtieModel()` always did.
    fromJSON(data, ModelCtor) {
      const model = new ModelCtor();
      model.idCounters = { ...model.idCounters, ...(data.idCounters || {}) };
      model.name = data.name || 'Untitled Bowtie';
      model.mode = data.mode || 'simple';
      model.riskMatrix = data.riskMatrix || null;
      model.identifierDisplayMode = data.identifierDisplayMode || 'internal';
      if (data.pages && data.pages.length > 0) {
        model.pages = data.pages.map((p) => this.pageHeaderFromJSON(p));
      } else if (data.topLevelEvent && data.hazard) {
        // Back-compat for a pre-multi-page (schema-v6-shaped) document
        // handed straight to fromJSON: hazard/topLevelEvent used to be
        // top-level keys instead of nested under `pages`. A real v6 export
        // never reaches here — ImportExportController's version check
        // rejects it first — this only matters for hand-built
        // fixtures/tests still using the old top-level shape.
        model.pages = [this.pageHeaderFromJSON({
          id: 'PAGE_1', name: 'Untitled Page', description: '',
          topLevelEvent: data.topLevelEvent, hazard: data.hazard,
        })];
      }
      model.causes = (data.causes || []).map((c) => new Bowtie.Placement({ ...c, type: 'cause' }));
      model.outcomes = (data.outcomes || []).map((o) => new Bowtie.Placement({ ...o, type: 'outcome' }));
      model.preventativeBarriers = (data.preventativeBarriers || []).map(
        (p) => new Bowtie.Placement({ ...p, type: 'preventativeBarrier' }),
      );
      model.mitigativeBarriers = (data.mitigativeBarriers || []).map(
        (m) => new Bowtie.Placement({ ...m, type: 'mitigativeBarrier' }),
      );
      model.lines = (data.lines || []).map((l) => new Bowtie.Line(l));
      model.library = {
        cause: ((data.library && data.library.cause) || []).map((n) => new Bowtie.Node(n)),
        outcome: ((data.library && data.library.outcome) || []).map((n) => new Bowtie.Node(n)),
        preventativeBarrier: ((data.library && data.library.preventativeBarrier) || []).map((n) => new Bowtie.Node(n)),
        mitigativeBarrier: ((data.library && data.library.mitigativeBarrier) || []).map((n) => new Bowtie.Node(n)),
      };
      model.retiredIds = {
        cause: (data.retiredIds && data.retiredIds.cause) || [],
        outcome: (data.retiredIds && data.retiredIds.outcome) || [],
        preventativeBarrier: (data.retiredIds && data.retiredIds.preventativeBarrier) || [],
        mitigativeBarrier: (data.retiredIds && data.retiredIds.mitigativeBarrier) || [],
      };
      return model;
    },

    // --- Referential integrity (design review finding 03) -----------------
    //
    // A version-correct export can still be internally broken -- e.g. a
    // placement whose nodeId no longer exists in the library, or a line
    // stop that doesn't resolve on that line's own page. Before this
    // existed, that case produced an uncaught render error, no message to
    // the user, and a half-mutated model (loadFromJSON assigns each field
    // in turn, so a crash partway through leaves some fields updated and
    // others stale). This runs against the fully-built `fresh` model
    // fromJSON just produced, BEFORE loadFromJSON assigns any of its
    // fields onto the live model -- so a bad file changes nothing at all,
    // and the caller can show a message instead of a page crash.
    //
    // Deliberately narrow: it checks that every reference resolves, not
    // that the document is otherwise sensible (e.g. it doesn't re-validate
    // riskMatrix -- RiskMatrixValidator already owns that, independently,
    // for the risk-matrix-only import path in Project Settings).
    validate(model) {
      const fail = (error) => ({ ok: false, error });

      const checkPlacements = (placements, kind, label) => {
        for (const p of placements) {
          if (!model.getPage(p.pageId)) {
            return fail(`${label} ${p.id} references a page that doesn't exist (${p.pageId}).`);
          }
          if (!model.getNodeOfType(kind, p.nodeId)) {
            return fail(`${label} ${p.id} references a node that doesn't exist in the library (${p.nodeId}).`);
          }
        }
        return null;
      };

      const placementChecks = [
        checkPlacements(model.causes, 'cause', 'Cause'),
        checkPlacements(model.outcomes, 'outcome', 'Outcome'),
        checkPlacements(model.preventativeBarriers, 'preventativeBarrier', 'Preventative barrier'),
        checkPlacements(model.mitigativeBarriers, 'mitigativeBarrier', 'Mitigative barrier'),
      ].find((r) => r !== null);
      if (placementChecks) return placementChecks;

      for (const line of model.lines) {
        if (!model.getPage(line.pageId)) {
          return fail(`Line ${line.id} references a page that doesn't exist (${line.pageId}).`);
        }
        const originCollection = line.originType === 'cause' ? model.causes : model.outcomes;
        const origin = originCollection.find((p) => p.id === line.originId && p.pageId === line.pageId);
        if (!origin) {
          return fail(`Line ${line.id} doesn't connect to a live ${line.originType} on its own page.`);
        }
        const barrierCollection = line.originType === 'cause' ? model.preventativeBarriers : model.mitigativeBarriers;
        for (const stopId of line.stops) {
          const stop = barrierCollection.find((b) => b.id === stopId && b.pageId === line.pageId);
          if (!stop) {
            return fail(`Line ${line.id} passes through a barrier that doesn't exist on its page (${stopId}).`);
          }
        }
      }

      return { ok: true };
    },

    // Builds a fresh model from `data`, validates it, and — only if valid —
    // copies every field onto `model` in place (rather than swapping the
    // model reference, so controllers holding a reference to this model
    // keep working). Throws, changing nothing on `model`, when `data`
    // fails validation.
    loadFromJSON(model, data, ModelCtor) {
      const fresh = this.fromJSON(data, ModelCtor);
      const result = this.validate(fresh);
      if (!result.ok) throw new Error(result.error);
      model.name = fresh.name;
      model.pages = fresh.pages;
      model.causes = fresh.causes;
      model.outcomes = fresh.outcomes;
      model.preventativeBarriers = fresh.preventativeBarriers;
      model.mitigativeBarriers = fresh.mitigativeBarriers;
      model.lines = fresh.lines;
      model.library = fresh.library;
      model.identifierDisplayMode = fresh.identifierDisplayMode;
      model.mode = fresh.mode;
      model.riskMatrix = fresh.riskMatrix;
      model.idCounters = fresh.idCounters;
      model.retiredIds = fresh.retiredIds;
    },
  };

  Bowtie.DocumentSerializer = DocumentSerializer;
})(window.Bowtie = window.Bowtie || {});
