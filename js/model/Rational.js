(function (Bowtie) {
  // An exact quotient of two Decimals, used to carry a computed likelihood
  // through the quantitative pipeline without ever dividing.
  //
  // Why this exists: a barrier's Risk Reduction Factor is >= 1 (IEC 61511:
  // RRF = 1/PFD, so SIL 1 is RRF 10-100), and applying one DIVIDES the
  // frequency. Division is the one arithmetic operation Decimal can't do
  // exactly -- 1/3 doesn't terminate in base 10 -- so dividing inside the
  // calculation would put a rounding step in the middle of the pipeline,
  // against Decimal.js's own rule that hour<->year conversion is the ONE
  // place rounding is unavoidable.
  //
  // Instead a contribution accumulates as numerator/denominator: the
  // frequency stays the numerator, every RRF multiplies into the
  // denominator (exact), and the two places that need to *compare* values
  // -- picking the largest threat contribution, and banding against the
  // risk matrix -- cross-multiply instead of dividing, which is also
  // exact. The single division happens in toDisplayNumber, at the point
  // where floating point is already sanctioned.
  //
  // INVARIANT: the denominator is always > 0. Cross-multiplication below
  // compares `a.num * b.den` against `b.num * a.den` without tracking sign,
  // which is only valid for positive denominators. This holds by
  // construction -- denominators are products of RRFs, and RRF >= 1 is
  // enforced at the input boundary (see RiskFieldsForm's validation).
  class Rational {
    constructor(numerator, denominator) {
      this.numerator = numerator;
      this.denominator = denominator;
    }

    static fromDecimal(decimal) {
      return new Rational(decimal, Bowtie.Decimal.parse('1'));
    }

    // Applying a barrier: frequency / (rrf1 * rrf2 * ...). Exact -- the
    // denominator just grows by another exact multiplication.
    divideBy(decimal) {
      return new Rational(this.numerator, this.denominator.multiply(decimal));
    }

    // Used for the exact events/hour -> events/year display conversion
    // (x 8760): scaling the numerator keeps the value exact, where the
    // Decimal-based convertHourYear would have rounded to 12 significant
    // figures.
    multiplyNumerator(decimal) {
      return new Rational(this.numerator.multiply(decimal), this.denominator);
    }

    isZero() {
      return this.numerator.isZero();
    }

    // a/b + c/d -> (a*d + c*b) / (b*d). Exact -- built from Decimal.multiply
    // and the Decimal.add design review finding 11 added, the same way
    // divideBy is built from Decimal.multiply alone -- so summing several
    // threats' contributions (the conventional LOPA treatment of
    // independent initiating events, an alternative to the original
    // max-of-contributions aggregation) never rounds any more than picking
    // the largest one does.
    add(other) {
      const numerator = this.numerator.multiply(other.denominator).add(other.numerator.multiply(this.denominator));
      const denominator = this.denominator.multiply(other.denominator);
      return new Rational(numerator, denominator);
    }

    // a/b vs c/d  ->  a*d vs c*b. Exact, and valid because both
    // denominators are positive (see the invariant above).
    compare(other) {
      return this.numerator.multiply(other.denominator)
        .compare(other.numerator.multiply(this.denominator));
    }

    // a/b vs d  ->  a vs d*b. The comparison risk-matrix banding runs on,
    // so a computed likelihood sitting exactly on a band boundary lands in
    // the right band rather than being nudged across it by rounding.
    compareToDecimal(decimal) {
      return this.numerator.compare(decimal.multiply(this.denominator));
    }

    greaterThan(other) { return this.compare(other) > 0; }

    greaterThanOrEqualToDecimal(decimal) { return this.compareToDecimal(decimal) >= 0; }

    // min(this, operand). Exact: `compare` already cross-multiplies rather
    // than dividing, so this needs nothing new but a select -- the "limit"
    // composition rule barrier_measures_proposal.md adds for PFH and
    // rate-based frequency-limiting barriers (F_out = min(F_in, lambda)),
    // where naive multiplication stops being commutative with the fold and
    // order along a Line starts to matter. `operand` may be a plain
    // Decimal (PFH, already canonical events/hour) or itself a Rational
    // (an MTBF/MTTF-derived rate, kept as an exact df/MTBF_h quotient
    // rather than a computed reciprocal -- see BarrierMeasures.js).
    clampTo(operand) {
      const asRational = operand instanceof Rational ? operand : Rational.fromDecimal(operand);
      return this.compare(asRational) > 0 ? asRational : this;
    }

    static max(values) {
      return values.reduce((best, v) => (best === null || v.greaterThan(best) ? v : best), null);
    }

    // Design review finding 11's alternative aggregation -- see `add`
    // above and BowtieModel.tleAggregation/Quantitative.computeTleLikelihood.
    static sum(values) {
      return values.reduce((total, v) => (total === null ? v : total.add(v)), null);
    }

    // The exact decimal value when this quotient terminates in base 10,
    // or null when it doesn't (1/3, 1/7, ...). value = (mn/md) * 10^(en-ed),
    // so it terminates exactly when md, after cancelling the common factor
    // with mn, is built only from 2s and 5s. Callers use this to show or
    // assert a real value where one exists, and fall back to
    // toDisplayNumber otherwise.
    toExactDecimal() {
      if (this.numerator.isZero()) return Bowtie.Decimal.zero();
      let mn = this.numerator.mantissa;
      let md = this.denominator.mantissa;
      if (md === 0n) return null;
      if (md < 0n) { mn = -mn; md = -md; }

      const gcd = (a, b) => {
        let x = a < 0n ? -a : a;
        let y = b;
        while (y !== 0n) { const t = x % y; x = y; y = t; }
        return x;
      };
      const g = gcd(mn, md);
      mn /= g;
      md /= g;

      // Strip the factors of 2 and 5 that a terminating quotient is made
      // of, counting how many tenths we need to scale the numerator by.
      let twos = 0;
      let fives = 0;
      let rest = md;
      while (rest % 2n === 0n) { rest /= 2n; twos += 1; }
      while (rest % 5n === 0n) { rest /= 5n; fives += 1; }
      if (rest !== 1n) return null; // non-terminating

      const k = Math.max(twos, fives);
      const scale = (10n ** BigInt(k)) / md; // exact by construction
      return Bowtie.Decimal.fromBigIntExponent(
        mn * scale,
        this.numerator.exponent - this.denominator.exponent - k,
      );
    }

    // The ONE division in the pipeline, and display-only -- never fed back
    // into a comparison or stored (the same rule Decimal.toDisplayNumber
    // follows). Prefers the exact value where the quotient terminates so
    // the common case -- an RRF of 10 or 100 -- rounds only once, here.
    toDisplayNumber(sigFigs = 6) {
      const exact = this.toExactDecimal();
      if (exact) return exact.toDisplayNumber(sigFigs);
      const asNumber = Number(this.numerator.toDecimalString()) / Number(this.denominator.toDecimalString());
      if (!Number.isFinite(asNumber) || asNumber === 0) return asNumber;
      const digitsBeforeRound = Math.floor(Math.log10(Math.abs(asNumber))) + 1;
      const factor = 10 ** (sigFigs - digitsBeforeRound);
      return Math.round(asNumber * factor) / factor;
    }
  }

  Bowtie.Rational = Rational;
})(window.Bowtie = window.Bowtie || {});
