# Bowtie Diagram Editor

A browser-based editor for [bowtie diagrams](https://en.wikipedia.org/wiki/Bow-tie_diagram) — the risk-analysis diagram that connects Threats, a Top-Level Event, and Consequences through Preventative and Mitigative Barriers.

No install, no server, no account.

## Getting started

Download the latest release from the **[Releases page](https://github.com/gahoward/bowtie-diagram/releases/latest)** — there are two options:

- **`bowtie-diagram.html`** — a single file. Download it and open it in your browser. Nothing else is needed.
- **`bowtie-diagram-web.zip`** — the plain, unminified site (`index.html`/`css`/`js`), for anyone who wants to host it themselves instead (a local `python -m http.server`, an intranet server, GitHub Pages, S3, wherever) rather than open it as a local file.

Either way, Chrome/Edge get the nicest experience (native Save/Open dialogs), but the app works fully in Firefox and Safari too — saving there just always lands in your Downloads folder unless your browser is set to ask where to save each file. From the welcome screen you can start a new diagram, upload a previously-exported `.json` file, or click **Load Demo** (or press `Ctrl+Alt+D`) to see a worked example with shared barriers and multiple causes/outcomes.

## Development

To run from source instead of a downloaded release — e.g. to contribute — clone the repo and open `index.html` directly; there's no build step for day-to-day editing, `js/`, `css/`, and `index.html` are plain scripts loaded directly.

```
pip install -r tests/requirements.txt
playwright install chromium
pytest tests/
```

See `tests/README.md` for how the test suite is structured.

### Updating the demo diagram

The "Load Demo" scenario is generated from `js/data/demo-bowtie.json` (a plain schema-matching export). After editing that file, regenerate the loaded script with:

```
node scripts/build-demo-data.js
```

## License

MIT — see [LICENSE](LICENSE).
