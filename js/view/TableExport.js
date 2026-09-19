(function (Bowtie) {
  // Turning a table of rows into text the rest of the world can read --
  // CSV for a spreadsheet, TSV for a paste straight into Excel/Word --
  // plus the clipboard write. Pure functions over `{ columns: [string],
  // rows: [[cell]] }`; no DOM, no model, so the Risk Summary and (later)
  // the barrier register share one implementation.
  //
  // RFC 4180 quoting: a field is quoted when it contains the delimiter, a
  // double quote, CR or LF, and every embedded quote is doubled. Values
  // are stringified first (`null`/`undefined` → empty) so a caller can
  // hand over numbers or nulls without pre-formatting.
  function escapeField(value, delimiter) {
    const text = value === null || value === undefined ? '' : String(value);
    const needsQuotes = text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text);
    return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toDelimited({ columns, rows }, delimiter) {
    const line = (cells) => cells.map((c) => escapeField(c, delimiter)).join(delimiter);
    return [line(columns), ...rows.map(line)].join('\r\n');
  }

  function toCsv(table) {
    return toDelimited(table, ',');
  }

  // Tabs, not commas, for the clipboard: every spreadsheet and word
  // processor pastes tab-separated text as a real table, whereas CSV on
  // the clipboard arrives as one column of text.
  function toTsv(table) {
    return toDelimited(table, '\t');
  }

  // The async clipboard API needs a secure context and a permission that
  // `file://` never grants, so the execCommand path isn't legacy cruft
  // here -- it's the only one that works for the single-file build. Both
  // are best-effort; the caller reports success/failure to the user.
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to the textarea path below
      }
    }
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but focusable: execCommand('copy') copies the selection,
    // and a `hidden`/`display: none` element can't hold one.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  Bowtie.TableExport = { toCsv, toTsv, copyText };
})(window.Bowtie = window.Bowtie || {});
