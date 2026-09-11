"""Design review finding 04: PageScopedModel is a hand-maintained facade
over BowtieModel with no completeness check. Before `DOCUMENT_SCOPED`
existed (see PageScopedModel.js), nothing distinguished "deliberately
document-scoped" from "forgot to add" -- and that gap produced two real
bugs: `renameNode` was missing from the facade entirely (every risk-field
save from the real UI threw), and `renameElement` silently dropped its
third argument (descriptions never saved on the TLE or Hazard).

This asserts the actual runtime claim, not a hand-maintained parallel
list: every BowtieModel method that mutates document state -- directly
(calls `this._emitChange()` in its own body) or by delegating one level
into a NodeLibrary/LineTopology collaborator (BowtieModel.js's own
delegation pattern -- see e.g. `insertBarrier`) -- must appear either on
PageScopedModel's own prototype or in its `DOCUMENT_SCOPED` allowlist. A
newly-added mutating method that lands in neither is exactly the kind of
gap that produced both bugs above, and this test fails the moment it's
introduced rather than waiting for someone to click the precise path.
"""


def test_every_mutating_bowtie_model_method_is_on_the_facade_or_document_scoped(page):
    result = page.evaluate("""() => {
      // Walks the whole prototype chain (down to, but excluding,
      // Object.prototype) rather than just Bowtie.BowtieModel.prototype's
      // OWN properties -- conftest.py's INIT_SCRIPT wraps BowtieModel in a
      // `class Wrapped extends Orig` subclass (purely to stash instances on
      // window.__lastModel for other tests), so the real methods this test
      // cares about live one level up, on Orig.prototype.
      // Reads each property's descriptor rather than accessing `proto[name]`
      // directly -- BowtieModel.prototype has real getters (library,
      // retiredIds, tleAggregation's sibling accessors, ...) that throw
      // when invoked on the bare prototype object (no `this._nodeLibrary`
      // etc. to read from), not just methods.
      function allMethodNames(cls) {
        const names = new Set();
        let proto = cls.prototype;
        while (proto && proto !== Object.prototype) {
          Object.getOwnPropertyNames(proto).forEach((name) => {
            const descriptor = Object.getOwnPropertyDescriptor(proto, name);
            if (name !== 'constructor' && descriptor && typeof descriptor.value === 'function') names.add(name);
          });
          proto = Object.getPrototypeOf(proto);
        }
        return names;
      }

      const collaboratorProtos = {
        _quantitative: Bowtie.Quantitative.prototype,
        _warnings: Bowtie.Warnings.prototype,
        _nodeLibrary: Bowtie.NodeLibrary.prototype,
        _lineTopology: Bowtie.LineTopology.prototype,
      };

      // Direct call, or a one-level delegation into a collaborator (this
      // codebase's own delegation pattern -- BowtieModel's public methods
      // are thin `return this._xyz.method(...)` wrappers; see BowtieModel.js).
      function mutatesDocumentState(fn) {
        const src = fn.toString();
        if (/\\b_emitChange\\s*\\(/.test(src)) return true;
        const m = src.match(/this\\.(_quantitative|_warnings|_nodeLibrary|_lineTopology)\\.(\\w+)\\(/);
        if (!m) return false;
        const delegate = collaboratorProtos[m[1]] && collaboratorProtos[m[1]][m[2]];
        return typeof delegate === 'function' && /_emitChange\\s*\\(/.test(delegate.toString());
      }

      // `_emitChange` itself is excluded: it's the notification primitive
      // every other check here is built on, not a mutating action -- and
      // its own declaration (`_emitChange() { ... }`) trivially matches the
      // "calls _emitChange(" pattern against itself.
      const ownMethods = [...allMethodNames(Bowtie.BowtieModel)].filter((name) => name !== '_emitChange');
      const mutating = ownMethods.filter((name) => mutatesDocumentState(Bowtie.BowtieModel.prototype[name]));

      const onFacade = new Set(Object.getOwnPropertyNames(Bowtie.PageScopedModel.prototype));
      const documentScoped = new Set(Bowtie.PageScopedModel.DOCUMENT_SCOPED);
      const missing = mutating.filter((name) => !onFacade.has(name) && !documentScoped.has(name));

      return { mutating, missing };
    }""")

    # Sanity check on the detector itself -- if this drifts to zero, the
    # regex above stopped matching anything real and the test would pass
    # vacuously, the same failure mode finding 08 caught in the round-trip
    # test.
    assert len(result["mutating"]) > 10, f"detector found suspiciously few mutating methods: {result['mutating']}"
    assert result["missing"] == [], (
        f"{result['missing']} mutate document state but are neither on PageScopedModel's own "
        "prototype nor listed in its DOCUMENT_SCOPED allowlist -- add whichever fits."
    )


def test_document_scoped_entries_are_real_bowtie_model_methods_not_typos(page):
    """The inverse check: every name in DOCUMENT_SCOPED must actually name a
    real BowtieModel method, and must NOT also exist on the facade -- a
    method the facade already provides has no business in this list too."""
    result = page.evaluate("""() => {
      const proto = Bowtie.BowtieModel.prototype;
      const onFacade = new Set(Object.getOwnPropertyNames(Bowtie.PageScopedModel.prototype));
      const documentScoped = Bowtie.PageScopedModel.DOCUMENT_SCOPED;
      return {
        unknown: documentScoped.filter((name) => typeof proto[name] !== 'function'),
        duplicated: documentScoped.filter((name) => onFacade.has(name)),
      };
    }""")
    assert result["unknown"] == [], f"DOCUMENT_SCOPED names methods BowtieModel doesn't have: {result['unknown']}"
    assert result["duplicated"] == [], f"DOCUMENT_SCOPED duplicates facade methods: {result['duplicated']}"
