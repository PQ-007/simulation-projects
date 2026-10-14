# Simulation Projects

Interactive showcase of algorithms and simulations. The `site/` folder is only the UI; each project lives in `projects/<id>/` and is built with whatever tool suits it.

## Run locally

Serve the repo root (the site reads `../projects/`):

```
python3 -m http.server 8000
# open http://localhost:8000/
```

## Add a project

1. Copy `projects/_template/` to `projects/<id>/` and write its `README.md` (shown in the **Docs** tab).
2. Add an entry to `site/projects.json`. Set `demo` to a JS module path exporting `mount(el)` when a demo exists; leave `null` for a placeholder.

## Deploy

Pushing to `main` publishes the site via GitHub Pages (enable Pages with source "GitHub Actions" in repo settings).
