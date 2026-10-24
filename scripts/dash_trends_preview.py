"""Standalone Dash/Mantine comparison using synthetic readings, never account data.

Run with the optional dependencies in dash-trends-requirements.txt. The page uses
Dash's native FastAPI backend. No Flask bridge, iframe or hosted service is used.
"""
from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import dash_mantine_components as dmc
from dash import Dash, Input, Output, State, MATCH, dcc, html
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from stellis.readings import MEASURES, usual_range

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ("Vital signs", ["pulse", "breathing_rate", "hrv", "blood_pressure", "temperature"]),
    ("Body measurements", ["weight"]),
    ("Blood sugar", ["blood_glucose", "hba1c"]),
    ("Sleep", ["sleep"]),
    ("Symptoms", ["pain"]),
]
SOURCE_LABELS = {"self": "Manual entry", "camera": "Camera reading", "record": "From records"}


def sample_series():
    """Use production measure metadata, with explicitly synthetic values."""
    values = {
        "pulse": [77, 75, 76, 74, 73, 72, 74, 73, 72],
        "breathing_rate": [15, 14, 15, 14, 14, 15, 14, 14, 14],
        "hrv": [38, 40, 39, 42, 41, 44, 43, 45, 44],
        "blood_pressure": [123, 122, 125, 121, 120, 122, 119, 121, 120],
        "weight": [71, 70.9, 70.8, 70.6, 70.5, 70.4, 70.2, 70.1, 70],
        "blood_glucose": [96, 99, 97, 95, 96, 94, 96, 95, 94],
    }
    today = dt.date.today()
    data = {}
    for key, measure in MEASURES.items():
        readings = values.get(key, [])
        points = [dict(time=(today - dt.timedelta(days=len(readings) - 1 - index)).isoformat(),
                       value=value, value2=80 - index % 3 if measure.paired else None,
                       source="self") for index, value in enumerate(readings)]
        data[key] = dict(key=key, label=measure.label, unit=measure.unit, decimals=measure.decimals,
                         points=points, usual=usual_range(points))
    return data


def table_data(measure, points, query="", order="newest"):
    columns = ["Date", f"Reading ({measure['unit']})"]
    paired = MEASURES[measure["key"]].paired
    if paired:
        columns = ["Date", "Systolic (mmHg)", "Diastolic (mmHg)"]
    columns.append("Source")
    filtered = [p for p in points if query.lower() in " ".join(str(v) for v in [p["time"], p["value"], p.get("value2", ""), SOURCE_LABELS[p["source"]]]).lower()]
    filtered.sort(key=lambda p: p["value"] if order in {"highest", "lowest"} else p["time"], reverse=order in {"newest", "highest"})
    rows = [[p["time"], p["value"], *([p["value2"]] if paired else []), SOURCE_LABELS[p["source"]]] for p in filtered]
    return {"head": columns, "body": rows}


def grid(measure, points):
    """Mantine's data-driven table, reused across all measurement schemas."""
    key = measure["key"]
    return dmc.Stack([
        dcc.Store(id={"kind": "table-points", "key": key}, data=points),
        dmc.Group([
            dmc.TextInput(id={"kind": "filter", "key": key}, label="Search readings", placeholder="Date, value or source", debounce=200),
            dmc.Select(id={"kind": "order", "key": key}, label="Order", value="newest", allowDeselect=False,
                       data=[{"label": label, "value": value} for label, value in [("Newest first", "newest"), ("Oldest first", "oldest"), ("Highest first", "highest"), ("Lowest first", "lowest")]]),
        ], grow=True, wrap="nowrap", className="preview-table-tools"),
        dmc.TableScrollContainer(dmc.Table(id={"kind": "readings-table", "key": key}, data=table_data(measure, points),
                                          highlightOnHover=True, horizontalSpacing="sm", verticalSpacing="sm", stickyHeader=True),
                                 minWidth=420 if MEASURES[key].paired else 300, maxHeight=220, type="native"),
    ], gap="sm", mt="md", className="preview-grid")


def chart(measure, points, dark):
    ink, muted, line = ("#F9F5FC", "#DED5DE", "#51415C") if dark else ("#2A252F", "#635B65", "#E7E7E3")
    series = "#55B8B6" if dark else "#167E85"
    traces = [dict(x=[p["time"] for p in points], y=[p["value"] for p in points],
                   type="scatter", mode="lines+markers", name=measure["label"],
                   line={"color": series, "width": 2}, marker={"size": 6},
                   hovertemplate=f"%{{x|%d %b %Y}}<br>%{{y}} {measure['unit']}<extra></extra>")]
    if MEASURES[measure["key"]].paired:
        traces.append(dict(x=[p["time"] for p in points], y=[p["value2"] for p in points],
                           type="scatter", mode="lines+markers", name="Diastolic", line={"color": series, "dash": "dot"}))
    usual = measure.get("usual")
    shapes = []
    if usual and not MEASURES[measure["key"]].paired:
        shapes.append(dict(type="rect", xref="paper", x0=0, x1=1, y0=usual["low"], y1=usual["high"],
                           fillcolor=series, opacity=.12, line={"width": 0}, layer="below"))
    figure = {"data": traces, "layout": dict(
        template="none", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font={"family": "Inter, sans-serif", "color": ink, "size": 12},
        margin={"l": 40, "r": 12, "t": 18, "b": 40}, height=240,
        xaxis={"type": "date", "showgrid": False, "tickformat": "%d %b", "tickfont": {"color": muted}, "nticks": 4},
        yaxis={"gridcolor": line, "zeroline": False, "tickfont": {"color": muted}, "nticks": 4},
        hovermode="x unified", hoverlabel={"bgcolor": "#382C42" if dark else "#FFFFFF", "font": {"color": ink}},
        showlegend=MEASURES[measure["key"]].paired, legend={"orientation": "h", "y": 1.15}, shapes=shapes,
    )}
    # Avoid exaggerating small day-to-day changes, matching the production charts.
    span = {"pulse": 30, "breathing_rate": 8, "hrv": 20, "weight": 6, "blood_glucose": 30, "blood_pressure": 60}[measure["key"]]
    values = [p["value"] for p in points] + [p["value2"] for p in points if p.get("value2") is not None]
    centre = (min(values) + max(values)) / 2
    half = max(span, max(values) - min(values)) * .6
    figure["layout"]["yaxis"]["range"] = [centre - half, centre + half]
    return dcc.Graph(figure=figure, responsive=True, config={"displayModeBar": False, "scrollZoom": False}, style={"height": 240})


def content(measure, table, period, dark):
    points = measure["points"]
    if period != "all":
        cutoff = (dt.date.today() - dt.timedelta(days=int(period) - 1)).isoformat()
        points = [p for p in points if p["time"] >= cutoff]
    return grid(measure, points) if table else chart(measure, points, dark)


def card(measure):
    last = measure["points"][-1]
    value = f"{last['value']:.{measure['decimals']}f}"
    if last.get("value2") is not None:
        value += f"/{last['value2']:.0f}"
    return dmc.Paper([
        dmc.Group([
            dmc.Text(measure["label"], fw=600, c="dimmed", size="sm"),
            dmc.Switch(id={"kind": "table", "key": measure["key"]}, label="Table", labelPosition="left", checked=False,
                       size="sm", color="var(--ink)", className="preview-table-switch"),
        ], justify="space-between", wrap="nowrap", mih=44),
        dmc.Group([dmc.Text(value, className="preview-value"), dmc.Text(measure["unit"], c="dimmed")], gap=6, align="baseline"),
        dmc.Group([html.Time(dt.date.fromisoformat(last["time"]).strftime("%d %b %Y"), dateTime=last["time"]), dmc.Text("Manual entry", size="sm", c="dimmed")], gap=12, className="preview-meta"),
        html.Div(id={"kind": "view", "key": measure["key"]}),
        dmc.Text("Usual range" if measure.get("usual") else "More readings will establish a usual range", size="xs", c="dimmed"),
    ], withBorder=True, radius="sm", p="lg", className="preview-card")


def create_preview():
    server = FastAPI(docs_url=None, redoc_url=None)
    server.mount("/static", StaticFiles(directory=ROOT / "src/stellis/static"), name="static")
    app = Dash(server=server, assets_folder=str(ROOT / "scripts/dash_trends_assets"), title="Trends | Stellis preview", suppress_callback_exceptions=True)
    data = sample_series()
    app.layout = dmc.MantineProvider(
        id="preview-theme", forceColorScheme="dark",
        theme={"fontFamily": "Inter, sans-serif", "headings": {"fontFamily": "Piazzolla, Georgia, serif", "fontWeight": "300"},
               "primaryColor": "grape", "defaultRadius": "sm", "respectReducedMotion": True,
               "colors": {"dark": ["#F9F5FC", "#DED5DE", "#C4B6C6", "#6E5B79", "#51415C", "#44364E", "#382C42", "#302638", "#2C2234", "#2C2234"]}},
        children=[
            dcc.Store(id="preview-data", data=data),
            dmc.AppShell([
                dmc.AppShellHeader(dmc.Group([
                    html.A([html.Span(className="preview-brand-mark"), "stellis health"], href="#", className="preview-brand"),
                    dmc.Group([dmc.Text("Preview with sample readings", size="sm", c="dimmed", visibleFrom="sm"),
                               dmc.ActionIcon(html.Span("☼", **{"aria-hidden": "true"}), id="preview-theme-toggle", variant="subtle", size=44,
                                              **{"aria-label": "Switch to light mode"})], gap="sm"),
                ], justify="space-between", h="100%", px="lg")),
                dmc.AppShellNavbar([
                    dmc.Text("Measurements", fw=600, size="sm", mb="sm"),
                    *[dmc.NavLink(label=name, href="#group-"+str(index), active=index == 0, variant="light") for index, (name, _) in enumerate(GROUPS)],
                    dmc.Text("Sample readings only", size="xs", c="dimmed", mt="auto"),
                ], p="lg"),
                dmc.AppShellMain([
                    dmc.Group([dmc.Title("Trends", order=1),
                        dmc.SegmentedControl(id="preview-range", value="all", transitionDuration=0, data=[{"label": "1 week", "value": "7"}, {"label": "1 month", "value": "31"}, {"label": "3 months", "value": "92"}, {"label": "All", "value": "all"}], size="md"),
                    ], justify="space-between", mb="xl", gap="md", className="preview-heading"),
                    *[html.Section([
                        dmc.Title(name, order=2, mb="md"),
                        dmc.SimpleGrid([card(data[key]) for key in keys if data[key]["points"]], cols={"base": 1, "md": 2, "xl": 3}, spacing="lg"),
                        dmc.Stack([dmc.Group([dmc.Text(MEASURES[key].label), dmc.Text("No readings", c="dimmed", size="sm")], justify="space-between", className="preview-empty-row") for key in keys if not data[key]["points"]], gap=0, mt="sm"),
                    ], id="group-"+str(index), className="preview-section") for index, (name, keys) in enumerate(GROUPS)],
                ]),
            ], header={"height": 72}, navbar={"width": 220, "breakpoint": "md", "collapsed": {"mobile": True}}, padding="xl", className="dash-preview"),
        ],
    )

    @app.callback(Output("preview-theme", "forceColorScheme"), Output("preview-theme-toggle", "aria-label"),
                  Input("preview-theme-toggle", "n_clicks"), prevent_initial_call=True)
    def toggle_theme(clicks):
        dark = not ((clicks or 0) % 2)
        return ("dark" if dark else "light", "Switch to light mode" if dark else "Switch to dark mode")

    @app.callback(Output({"kind": "view", "key": MATCH}, "children"),
                  Input({"kind": "table", "key": MATCH}, "checked"), Input("preview-range", "value"),
                  Input("preview-theme", "forceColorScheme"), State({"kind": "table", "key": MATCH}, "id"), State("preview-data", "data"))
    def render(table, period, theme, identity, data):
        return content(data[identity["key"]], table, period, theme == "dark")

    @app.callback(Output({"kind": "readings-table", "key": MATCH}, "data"),
                  Input({"kind": "filter", "key": MATCH}, "value"), Input({"kind": "order", "key": MATCH}, "value"),
                  State({"kind": "table-points", "key": MATCH}, "data"), State({"kind": "filter", "key": MATCH}, "id"), State("preview-data", "data"))
    def filter_table(query, order, points, identity, data):
        return table_data(data[identity["key"]], points, query or "", order)

    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8856)
    args = parser.parse_args()
    import uvicorn
    uvicorn.run(create_preview(), host="127.0.0.1", port=args.port)
