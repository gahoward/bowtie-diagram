# Design notes

The architecture rationale for this codebase — `DESIGN_NOTES.md` — lives in
the separate `bowtie-diagram-docs` repository alongside the requirements
and other design/planning documents, not in this one. Read it before
making further changes.

This one-line pointer exists so the several files in this repo that cite
`DESIGN_NOTES.md` by name (`.github/workflows/pages.yml`, `scripts/build.js`,
`css/styles.css`, `tests/README.md`, `tests/test_warnings_controller.py`,
and others) have somewhere in-repo to point back to, rather than nothing at
all — a gap a structural review flagged directly: "the document lives in a
different repo from the [files] citing it... the code repo doesn't even
contain a copy or a pointer to where it lives."
