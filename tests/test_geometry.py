"""Structural review finding 05: TopLevelEvent's default radius, Hazard's
default size, Cause/Outcome's fixed box width, and a barrier's fixed size
all used to be hand-copied literals scattered across the model, render, and
AutoArrangeController layers, each carrying a comment promising to keep in
sync with whichever file actually owned the real number. `js/model/
Geometry.js` is now the one place those numbers live; every consumer reads
it live rather than carrying its own copy. Verified here by mutating
Bowtie.Geometry at runtime and checking that newly-created elements pick up
the change -- proof the wiring is real, not just a coincidentally-matching
literal left behind by the refactor.
"""


def test_new_page_tle_and_hazard_size_come_from_geometry(page):
    page.evaluate("""() => {
      window.Bowtie.Geometry.TLE_DEFAULT_R = 999;
      window.Bowtie.Geometry.HAZARD_W = 555;
      window.Bowtie.Geometry.HAZARD_H = 444;
    }""")
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      const p = m.addPage({ name: 'Geometry check' });
      return { r: p.topLevelEvent.r, w: p.hazard.w, h: p.hazard.h };
    }""")
    assert result == {"r": 999, "w": 555, "h": 444}


def test_new_cause_and_outcome_width_comes_from_geometry(page):
    page.evaluate("() => { window.Bowtie.Geometry.CAUSE_OUTCOME_W = 321; }")
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      m.addOutcome({x: 1200, y: 200});
      return { causeW: m.causes[0].w, outcomeW: m.outcomes[0].w };
    }""")
    assert result == {"causeW": 321, "outcomeW": 321}


def test_new_barrier_size_comes_from_geometry(page):
    """Covers both of LineTopology's barrier-creation paths -- attaching the
    very first control off a Cause/Outcome (_makeBarrierNear via anchor ==
    origin) and inserting a second one into an existing chain (anchor ==
    the first barrier) -- since both used to carry their own separate
    hardcoded w:36/h:110 literal before this refactor."""
    page.evaluate("() => { window.Bowtie.Geometry.BARRIER_W = 77; window.Bowtie.Geometry.BARRIER_H = 88; }")
    result = page.evaluate("""() => {
      const m = window.__lastModel;
      m.addCause({x: 150, y: 200});
      const first = m.addPreventativeControl(m.causes[0].id);
      const second = m.insertBarrier('preventativeBarrier', 'after', first.id);
      return {
        firstW: first.w, firstH: first.h,
        secondW: second.w, secondH: second.h,
      };
    }""")
    assert result == {"firstW": 77, "firstH": 88, "secondW": 77, "secondH": 88}
