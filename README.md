# Bowtie Diagram Editor

A browser-based editor for [bowtie diagrams](https://en.wikipedia.org/wiki/Bow-tie_diagram) — the risk-analysis diagram that connects Threats, a Top-Level Event, and Consequences through Preventative and Mitigative Barriers.

No install, no server, no account. Open `index.html` directly in a browser and start editing.

## Getting started

Clone the repo and open `index.html` in a browser (Chrome/Edge get the nicest experience — native Save/Open dialogs — but it works in Firefox and Safari too). From the welcome screen you can start a new diagram, upload a previously-exported `.json` file, or click **Load Demo** (or press `Ctrl+Alt+D`) to see a worked example with shared barriers and multiple causes/outcomes.

A packaged single-file release (`bowtie-diagram.html`, everything inlined, still no server needed) is planned but not yet published — for now, running from a clone of this repo is the way to use it.

## Development

No build step for day-to-day editing — `js/`, `css/`, and `index.html` are plain scripts loaded directly.

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
