# Dash and Mantine Trends comparison

Issue #176. This is an executable evaluation with sample readings, not a production migration. See [the assessment](../../../plans/dash-trends-evaluation.md).

## Run locally

Create a separate optional environment; do not install the preview dependencies into the production runtime:

```sh
uv venv /tmp/stellis-dash-preview-venv
uv pip sync --python /tmp/stellis-dash-preview-venv/bin/python scripts/dash-trends-requirements.txt
/tmp/stellis-dash-preview-venv/bin/python scripts/dash_trends_preview.py --port 8856
```

Open `http://127.0.0.1:8856/`. The preview binds only to loopback and uses synthetic values. It needs no credentials, production database, model service or cloud connection.

## Verified

`tests/browser/dash_trends_preview.mjs` passes twelve layouts: 360, 390, 768, 1280, 1440 and 1920px, in dark-purple and light themes. Desktop cards share a row; phone cards stack. Checks cover actual Mantine Switch and Table components, shared search, newest/oldest ordering, range callbacks, theme switching, mobile tables, no page overflow after chart resize, no application/console errors, and local-only asset/callback requests.

The screenshot pairs show charts and a table at 1440px and 390px. They were visually inspected. Table rows come from measurement data, not per-measure HTML templates. Horizontal scrolling is retained when a paired reading needs more columns. `checks.json` records geometry; `dependency-licenses.json` lists 42 optional Python dependency licenses. The preview does not use AG Grid, paid components or hosted embedding.

Not yet established: authenticated account/generation isolation, production data/source links, add/delete/camera capture, shared-shell continuity, persistence across reload, production performance, or recording/editor/chat parity. The prototype cannot establish these from screenshots.
