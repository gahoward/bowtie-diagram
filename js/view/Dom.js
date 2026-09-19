(function (Bowtie) {
  // The HTML element helper (proposals/15). Nothing clever -- its whole
  // job is to exist exactly once.
  //
  // This was previously copy-pasted into eight files, and its SVG
  // counterpart (Svg.js) into three more, under THE SAME NAME `el` with
  // an incompatible second argument: `className` here, an attribute bag
  // there. Moving a block of element-building code between an HTML file
  // and an SVG one -- exactly what a refactor does -- passed lint, passed
  // `no-undef`, and then either stringified an object into a `class`
  // attribute or dropped every attribute, at runtime, silently.
  //
  // Consumers bind it once at the top of the file:
  //
  //   const el = Bowtie.Dom.el;     // an HTML-building file
  //   const el = Bowtie.Svg.el;     // an SVG-building file
  //
  // so the flavour is stated where it can be read, and a file that gets
  // the wrong one now fails at a line you can see rather than in the
  // middle of a render.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // `type="button"` matters: a bare <button> inside a <form> submits it.
  // Every button in this app is an action, never a submit.
  function button(label, className) {
    const btn = el('button', className, label);
    btn.type = 'button';
    return btn;
  }

  Bowtie.Dom = { el, button };
})(window.Bowtie = window.Bowtie || {});
