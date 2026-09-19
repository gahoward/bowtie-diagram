(function (Bowtie) {
  const el = Bowtie.Dom.el;

  // The dialog behind the global error handler (proposals/19).
  //
  // Before this, an uncaught exception left the app wedged -- a stale
  // canvas, a button that does nothing, a half-applied operation -- with
  // no message and no prompt. The user's next move is to reload, and
  // reloading is precisely the move that loses everything since the last
  // export. For an offline single-document tool holding hours of
  // unexported work, that is the worst available failure mode.
  //
  // So the dialog's job is not to apologise. It is to convert a lost
  // session into a saved file, which is why Export is the primary action
  // and why the wording says plainly that the app may now be unreliable.

  // `err` is whatever arrived -- an Error from `window.onerror`, or a
  // promise rejection value, which can be anything at all including a
  // string or `undefined`. Nothing here may throw on a malformed one:
  // if this builder fails, the user gets no dialog and no export.
  function describe(err) {
    if (!err) return 'No error detail was available.';
    if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
    try {
      return typeof err === 'string' ? err : JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  function body(err) {
    const wrap = el('div', 'fatal-error');
    wrap.appendChild(el('p', null,
      'The editor hit an unexpected error. It may not behave correctly until you reload.'));
    wrap.appendChild(el('p', null,
      'Your work is still here, but only in this tab. Export it to a file before reloading.'));

    // Collapsed, not hidden: a bug report needs something to carry, and
    // a stack trace shouted at someone who has just lost their footing
    // is not help. This is the whole reporting mechanism -- the app is
    // for environments with no web access, so there is nowhere to send
    // anything (proposals/19, open question 3).
    const details = el('details', 'fatal-error-details');
    details.appendChild(el('summary', null, 'Technical details'));
    details.appendChild(el('pre', 'fatal-error-stack', describe(err)));
    wrap.appendChild(details);
    return wrap;
  }

  Bowtie.FatalErrorView = { body, describe };
})(window.Bowtie = window.Bowtie || {});
