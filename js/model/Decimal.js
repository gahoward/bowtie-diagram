(function (Bowtie) {
  // Exact decimal arithmetic for quantitative-mode frequencies/reduction
  // factors — see quantitative_mode_proposal.md "Numeric precision
  // strategy" for why a native JS Number is wrong here: a typed decimal
  // literal like "0.001" is already lossy the instant it becomes a float,
  // long before any log/pow call, and different engines aren't required to
  // agree bit-for-bit on transcendental results anyway. This type never
  // touches floating point except at the one explicit, unavoidable
  // rounding step (hour<->year conversion, dividing by 8760) and the final
  // human-readable display conversion — both documented below.
  //
  // Representation: value = mantissa * 10^exponent, mantissa a BigInt.
  // Multiplication and comparison are then exact BigInt operations with no
  // rounding anywhere in the chain, however many barriers are multiplied.
  const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

  class Decimal {
    constructor(mantissa, exponent) {
      this.mantissa = mantissa;
      this.exponent = exponent;
    }

    // Parses plain decimal ("0.00042") or scientific ("4.2E-4", "1E-3")
    // notation, exactly, with no binary rounding step. Throws on anything
    // that doesn't match — callers (UI input handlers) should catch this
    // and surface a validation message rather than let a NaN-like value
    // silently enter the calculation pipeline.
    static parse(str) {
      const s = String(str).trim();
      const m = DECIMAL_RE.exec(s);
      if (!m) throw new Error(`Not a valid decimal: "${str}"`);
      const [, sign, intPart, fracPart, expPart] = m;
      const fracDigits = fracPart || '';
      const mantissaDigits = `${intPart}${fracDigits}`;
      let mantissa = BigInt(mantissaDigits);
      if (sign === '-') mantissa = -mantissa;
      const exponent = (expPart ? parseInt(expPart, 10) : 0) - fracDigits.length;
      return new Decimal(mantissa, exponent).normalize();
    }

    static fromBigIntExponent(mantissa, exponent) {
      return new Decimal(mantissa, exponent).normalize();
    }

    static zero() {
      return new Decimal(0n, 0);
    }

    // Strips trailing zero digits from the mantissa, folding them into the
    // exponent instead -- purely cosmetic/canonicalization (keeps
    // toString output and equality checks predictable), never changes the
    // represented value.
    normalize() {
      if (this.mantissa === 0n) return new Decimal(0n, 0);
      let { mantissa, exponent } = this;
      while (mantissa % 10n === 0n) {
        mantissa /= 10n;
        exponent += 1;
      }
      return new Decimal(mantissa, exponent);
    }

    isZero() {
      return this.mantissa === 0n;
    }

    negate() {
      return new Decimal(-this.mantissa, this.exponent);
    }

    // Exact: BigInt x BigInt never overflows or loses precision, and
    // exponents simply add.
    multiply(other) {
      return Decimal.fromBigIntExponent(this.mantissa * other.mantissa, this.exponent + other.exponent);
    }

    // Exact: align to the smaller (more negative) exponent -- the same
    // alignment _alignedMantissas already does for comparison -- then a
    // plain BigInt sum. Added for design review finding 11 (top-event
    // likelihood as a sum of independent threats' contributions, an
    // alternative to the original max-only aggregation); see Rational.add,
    // which is what the quantitative pipeline actually calls, for why a
    // Decimal-level add was the missing primitive.
    add(other) {
      const [a, b] = this._alignedMantissas(other);
      const exponent = this.exponent < other.exponent ? this.exponent : other.exponent;
      return Decimal.fromBigIntExponent(a + b, exponent);
    }

    // Aligns both values to the smaller (more negative) exponent by scaling
    // the other mantissa up by an exact power of ten (BigInt, exact), then
    // returns the two aligned mantissas for an exact integer comparison —
    // no epsilon needed anywhere.
    _alignedMantissas(other) {
      if (this.exponent === other.exponent) return [this.mantissa, other.mantissa];
      if (this.exponent < other.exponent) {
        return [this.mantissa, other.mantissa * (10n ** BigInt(other.exponent - this.exponent))];
      }
      return [this.mantissa * (10n ** BigInt(this.exponent - other.exponent)), other.mantissa];
    }

    compare(other) {
      const [a, b] = this._alignedMantissas(other);
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }

    lessThan(other) { return this.compare(other) < 0; }

    lessThanOrEqual(other) { return this.compare(other) <= 0; }

    greaterThan(other) { return this.compare(other) > 0; }

    greaterThanOrEqual(other) { return this.compare(other) >= 0; }

    equals(other) { return this.compare(other) === 0; }

    static max(values) {
      return values.reduce((best, v) => (best === null || v.greaterThan(best) ? v : best), null);
    }

    // Exact decimal string round-trip -- the JSON representation
    // (quantitative_mode_proposal.md "JSON representation"): plain decimal
    // notation, no scientific notation, no trailing garbage. Used for
    // storage, never for calculation.
    toDecimalString() {
      if (this.mantissa === 0n) return '0';
      const neg = this.mantissa < 0n;
      const digits = (neg ? -this.mantissa : this.mantissa).toString();
      const { exponent } = this;
      let out;
      if (exponent >= 0) {
        out = digits + '0'.repeat(exponent);
      } else {
        const pointPos = digits.length + exponent;
        if (pointPos <= 0) {
          out = `0.${'0'.repeat(-pointPos)}${digits}`;
        } else {
          out = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
        }
      }
      return neg ? `-${out}` : out;
    }

    // Only ever used for on-screen display, rounded to `sigFigs` significant
    // figures -- this is the one place (besides unit conversion) floating
    // point is allowed to appear, and the result is never fed back into a
    // calculation or comparison (quantitative_mode_proposal.md "Only
    // converting to a native Number for on-screen display").
    toDisplayNumber(sigFigs = 6) {
      const asNumber = Number(this.toDecimalString());
      if (!Number.isFinite(asNumber) || asNumber === 0) return asNumber;
      const digitsBeforeRound = Math.floor(Math.log10(Math.abs(asNumber))) + 1;
      const factor = 10 ** (sigFigs - digitsBeforeRound);
      return Math.round(asNumber * factor) / factor;
    }
  }

  // The single named constant every hour<->year conversion in the app must
  // go through -- see "The one place rounding is unavoidable: unit
  // conversion" in quantitative_mode_proposal.md. 8760 = 2^3 x 3 x 5 x 73,
  // so division by it is not a terminating decimal in base 10; an explicit,
  // generous fixed-precision rounding step is unavoidable here, and ONLY
  // here -- never inside the TLE/consequence calculation pipeline, which
  // always operates on canonical events/hour Decimals with no rounding.
  const HOURS_PER_YEAR = 8760;
  const CONVERSION_SIG_FIGS = 12;

  function roundToSigFigs(value, sigFigs) {
    if (value === 0) return Decimal.zero();
    const asNumber = value;
    const digitsBeforeRound = Math.floor(Math.log10(Math.abs(asNumber))) + 1;
    const scale = sigFigs - digitsBeforeRound;
    // Build the rounded decimal string ourselves (rather than trusting
    // Number's own default stringification) so the sig-fig count is exact.
    const rounded = Number(asNumber.toFixed(Math.max(0, scale)));
    return Decimal.parse(rounded.toExponential(sigFigs - 1));
  }

  // Converts a canonical events/hour Decimal into an events/year Decimal
  // for display, or accepts a freshly-typed events/year value and converts
  // it into canonical events/hour for storage -- always starting fresh
  // from the canonical stored value, never from a previously-displayed
  // number, so repeated open/edit/save cycles can't compound rounding
  // across generations (see "Always convert fresh from the canonical
  // stored value" in the design doc).
  function convertHourYear(decimal, direction) {
    const asNumber = Number(decimal.toDecimalString());
    const converted = direction === 'hourToYear' ? asNumber * HOURS_PER_YEAR : asNumber / HOURS_PER_YEAR;
    return roundToSigFigs(converted, CONVERSION_SIG_FIGS);
  }

  Bowtie.Decimal = Decimal;
  Bowtie.HOURS_PER_YEAR = HOURS_PER_YEAR;
  Bowtie.convertHourYear = convertHourYear;
})(window.Bowtie = window.Bowtie || {});
