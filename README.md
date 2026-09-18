# Bowtie Diagram Editor

A browser-based editor for [bowtie diagrams](https://en.wikipedia.org/wiki/Bow-tie_diagram) — the risk-analysis diagram that connects Threats, a Top-Level Event, and Consequences through Preventative and Mitigative Barriers.

No install, no server, no account.

## Getting started

Download the latest release from the **[Releases page](https://github.com/gahoward/bowtie-diagram/releases/latest)** — there are two options:

- **`bowtie-diagram.html`** — a single file. Download it and open it in your browser. Nothing else is needed.
- **`bowtie-diagram-web.zip`** — the plain, unminified site (`index.html`/`css`/`js`), for anyone who wants to host it themselves instead (a local `python -m http.server`, an intranet server, GitHub Pages, S3, wherever) rather than open it as a local file.

Either way, Chrome/Edge get the nicest experience (native Save/Open dialogs), but the app works fully in Firefox and Safari too — saving there just always lands in your Downloads folder unless your browser is set to ask where to save each file. From the welcome screen you can start a new diagram, upload a previously-exported `.json` file, or click **Load Demo** (or press `Ctrl+Alt+D`) to see a worked example with shared barriers and multiple causes/outcomes.

Prefer not to download anything? **[Try it live](https://gahoward.github.io/bowtie-diagram/)** — same app, hosted on GitHub Pages. On a Chromium browser this is actually the *best* experience: being served over HTTPS (unlike a downloaded file) unlocks the native Save/Open dialogs. Nothing you do there is saved on our end — it's the same local-only editor, just running from a URL instead of a file.

## Risk matrices

Two are bundled: **Leaflet 5 (Ships) Annex D** (DE&S S&EP Leaflet 5,
Issue 3) and **MIL-STD-882E** (DoD Standard Practice: System Safety,
11 May 2012). Pick one when you start a new analysis, or change it later
in Settings › Project Settings, where you can also import your own as
JSON. Selecting a preset embeds a copy in the document, so a later change
to the bundled one never alters an analysis you have already saved.

Both presets transcribe published tables. Check them against a
controlled copy of the standard — and, for 882E, check the risk
acceptance authorities against your programme's own tailoring — before
relying on either for a real assessment. 882E's probability levels are
stated per item life rather than per unit time, so its preset declares
the item life it assumes (100,000 hours); edit that one field and
re-import if your programme uses a different figure.

## Development

To run from source instead of a downloaded release — e.g. to contribute — clone the repo and open `index.html` directly; there's no build step for day-to-day editing, `js/`, `css/`, and `index.html` are plain scripts loaded directly.

```
pip install -r tests/requirements.txt
playwright install chromium
pytest tests/
```

See `tests/README.md` for how the test suite is structured, and
`DESIGN_NOTES_POINTER.md` for where to find the architecture rationale
behind why the code is shaped the way it is.

There's also a linter, run separately from the tests (and as its own CI job, so testing the app still needs no Node toolchain):

```
npm install
npm run lint
```

It's deliberately correctness-only — no formatting rules — so it won't reformat anything you write. The rule that earns its keep here is `no-undef`: `index.html` loads its scripts in a hand-maintained order onto one shared `Bowtie` global, so a typo'd global or a load-order mistake would otherwise only surface if a test happened to exercise that exact path.

### Updating the demo diagram

"Load Demo" offers three variants — one per document mode (Simple/Qualitative/Quantitative) — generated from `js/data/demo-simple.json`, `demo-qualitative.json`, and `demo-quantitative.json` (plain schema-matching exports; edit these directly). After editing any of them, regenerate the loaded script with:

```
node scripts/build-demo-data.js
```

## License

MIT — see [LICENSE](LICENSE).
