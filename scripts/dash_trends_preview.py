"""Historical standalone Dash/Mantine prototype, superseded by the integrated app.

Run with the optional dependencies in dash-trends-requirements.txt. The page uses
Dash's native FastAPI backend. Original PDFs use embedded viewers; the app shell
is native Dash, without a Flask bridge or hosted service. No account data is read.
"""
from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import dash_mantine_components as dmc
from dash import Dash, Input, Output, State, MATCH, ALL, ClientsideFunction, ctx, dcc, html, no_update
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import maya_prototype_story as maya

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


def sample_series(cutoff="2026-12-18"):
    """Project Maya's documented sample observations; never invent camera metrics."""
    import re
    from stellis.readings import match_measure
    data={key:dict(key=key,label=m.label,unit=m.unit,decimals=m.decimals,points=[],usual=None) for key,m in MEASURES.items()}
    for doc in maya.MANIFEST:
        if doc['clinical_date'] > cutoff:continue
        clinical=doc['required_clinical_information']
        values=[]
        for section in clinical['sections']:
            if section['heading'].lower() not in {'objective','examination','vitals','observations'}:continue
            text=section['text']
            for key,pattern in [('pulse',r'(?i)\bpulse\s*(\d+)\s*(?:/min|bpm)'),('weight',r'(?i)\bweight\s*(\d+(?:\.\d+)?)\s*kg'),('blood_pressure',r'(?i)\bBP\s*(\d+)\s*/\s*(\d+)')]:
                match=re.search(pattern,text)
                if match:values.append((key,float(match[1]),float(match[2]) if key=='blood_pressure' else None))
        for lab in clinical['laboratory_values']:
            measure=match_measure(lab['test'])
            if measure and isinstance(lab['value'],(int,float)):
                value=lab['value']
                if measure.key=='blood_glucose' and lab['unit'].lower()=='mmol/l':value*=18.0182
                values.append((measure.key,round(value,measure.decimals),None))
        for key,value,value2 in values:
            data[key]['points'].append(dict(time=doc['clinical_date'],value=value,value2=value2,source='record',title=doc['purpose'],document_id=doc['document_id']))
    for item in data.values():
        item['points'].sort(key=lambda p:p['time']);item['usual']=usual_range(item['points'])
    return data


def table_data(measure, points, query="", order="newest"):
    columns = ["Date", f"Reading ({measure['unit']})"]
    paired = MEASURES[measure["key"]].paired
    if paired:
        columns = ["Date", "Systolic (mmHg)", "Diastolic (mmHg)"]
    columns.append("Source")
    filtered = [p for p in points if query.lower() in " ".join(str(v) for v in [p["time"], p["value"], p.get("value2", ""), (p.get("title") or SOURCE_LABELS[p["source"]])]).lower()]
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
                   hoverinfo="none", hovertemplate=None,
                   customdata=[[dt.date.fromisoformat(p["time"]).strftime("%d %b %Y"), f"{p['value']:.{measure['decimals']}f} {measure['unit']}"] for p in points])]
    if MEASURES[measure["key"]].paired:
        traces.append(dict(x=[p["time"] for p in points], y=[p["value2"] for p in points],
                           type="scatter", mode="lines+markers", name="Diastolic", line={"color": series, "dash": "dot"}, hoverinfo="none", hovertemplate=None,
                           customdata=[[dt.date.fromisoformat(p["time"]).strftime("%d %b %Y"), f"{p['value2']:.0f} {measure['unit']}"] for p in points]))
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
        hovermode="closest",
        showlegend=MEASURES[measure["key"]].paired, legend={"orientation": "h", "y": 1.15}, shapes=shapes,
    )}
    # Avoid exaggerating small day-to-day changes, matching the production charts.
    span = {"pulse": 30, "breathing_rate": 8, "hrv": 20, "weight": 6, "blood_glucose": 30, "blood_pressure": 60}.get(measure["key"], max(1, max(p["value"] for p in points)*.1))
    values = [p["value"] for p in points] + [p["value2"] for p in points if p.get("value2") is not None]
    centre = (min(values) + max(values)) / 2
    half = max(span, max(values) - min(values)) * .6
    figure["layout"]["yaxis"]["range"] = [centre - half, centre + half]
    children = [
        dcc.Graph(id={"kind": "graph", "key": measure["key"]}, figure=figure, responsive=True, clear_on_unhover=True,
                  config={"displayModeBar": False, "scrollZoom": False}, style={"height": 240}),
        dcc.Tooltip(id={"kind": "reading-tooltip", "key": measure["key"]}, show=False,
                    background_color="#44364E", border_color="#44364E", className="preview-reading-tooltip"),
    ]
    if shapes:
        bounds = f"{usual['low']:.{measure['decimals']}f}–{usual['high']:.{measure['decimals']}f} {measure['unit']}"
        children.append(dmc.Group([html.Span(className="preview-range-key", **{"aria-hidden": "true"}),
                                   dmc.Text(f"Usual range {bounds}", size="xs", c="dimmed")], gap=8, className="preview-range-legend"))
    return html.Div(children, className="preview-plot")


def content(measure, table, period, dark):
    points = measure["points"]
    if period != "all":
        cutoff = (dt.date.fromisoformat(points[-1]["time"]) - dt.timedelta(days=int(period) - 1)).isoformat()
        points = [p for p in points if p["time"] >= cutoff]
    return grid(measure, points) if table else chart(measure, points, dark)


def reading_head(measure):
    last=measure['points'][-1]
    value=f"{last['value']:.{measure['decimals']}f}"
    if last.get('value2') is not None:value+=f"/{last['value2']:.0f}"
    return [
        dmc.Group([dmc.Text(value,className='preview-value'),dmc.Text(measure['unit'],c='dimmed')],gap=6,align='baseline'),
        dmc.Group([html.Time(dt.date.fromisoformat(last['time']).strftime('%d %b %Y'),dateTime=last['time']),dmc.Text(SOURCE_LABELS[last['source']],size='sm',c='dimmed')],gap=12,className='preview-meta'),
    ]


def card(measure):
    return dmc.Paper([
        dmc.Group([
            dmc.Text(measure['label'],fw=600,c='dimmed',size='sm'),
            dmc.ActionIcon(html.Span(className='table-view-glyph',**{'aria-hidden':'true'}),id={'kind':'table','key':measure['key']},n_clicks=0,variant='subtle',size=44,className='preview-table-control',**{'aria-label':'Table view','aria-pressed':'false'}),
        ],justify='space-between',wrap='nowrap',mih=44),
        html.Div(reading_head(measure),id={'kind':'reading-head','key':measure['key']}),
        html.Div(id={'kind':'view','key':measure['key']}),
    ],withBorder=True,radius='sm',p='lg',className='preview-card')


def create_preview():
    server = FastAPI(docs_url=None, redoc_url=None)
    server.mount("/static", StaticFiles(directory=ROOT / "src/stellis/static"), name="static")
    server.mount("/demo-sources", StaticFiles(directory=ROOT / "stellis-synthetic-patient/documents"), name="demo-sources")
    server.mount("/demo-audio", StaticFiles(directory=ROOT / "scripts/dash_trends_assets/audio"), name="demo-audio")
    @server.get("/accuracy")
    def accuracy():
        return FileResponse(ROOT / "src/stellis/static/accuracy.html")
    app = Dash(server=server, external_scripts=["/static/notebook-dom.js", "/static/vitals-math.js", "/static/camera-pulse.js"], external_stylesheets=["/static/camera-pulse.css"], assets_folder=str(ROOT / "scripts/dash_trends_assets"), title="Trends | Stellis preview", suppress_callback_exceptions=True)
    data = sample_series(maya.CHAPTERS[0]["date"])
    app.layout = dmc.MantineProvider(
        id="preview-theme", forceColorScheme="dark",
        theme={"fontFamily": "Inter, sans-serif", "headings": {"fontFamily": "Piazzolla, Georgia, serif", "fontWeight": "300"},
               "primaryColor": "dark", "defaultRadius": "sm", "respectReducedMotion": True,
               "colors": {"dark": ["#F9F5FC", "#DED5DE", "#C4B6C6", "#6E5B79", "#51415C", "#44364E", "#382C42", "#302638", "#2C2234", "#2C2234"]}},
        children=[
            dcc.Store(id="preview-data", data=data),
            dcc.Store(id="preview-camera-data", data=[], storage_type="session"),
            dmc.AppShell([
                dmc.AppShellHeader(dmc.Group([
                    html.A([html.Span(className="preview-brand-mark"), "stellis health"], href="#", className="preview-brand"),
                    dmc.Group([dmc.Text("Preview with sample readings", size="sm", c="dimmed", visibleFrom="sm"),
                               dmc.ActionIcon(html.Span(className="story-view-glyph", **{"aria-hidden":"true"}),id="preview-open-story-mobile",variant="subtle",size=44,hiddenFrom="md",**{"aria-label":"Maya's timeline"}),
                               dmc.ActionIcon(html.Span(className="table-view-glyph", **{"aria-hidden":"true"}),id="preview-open-measurements-mobile",variant="subtle",size=44,hiddenFrom="md",**{"aria-label":"Measurements"}),
                               dmc.ActionIcon(html.Span("☼", **{"aria-hidden": "true"}), id="preview-theme-toggle", variant="subtle", size=44,
                                              **{"aria-label": "Switch to light mode"})], gap="sm"),
                ], justify="space-between", h="100%", px="lg")),
                dmc.AppShellNavbar([
                    dmc.Button("Maya's timeline", id="preview-open-story", n_clicks=0, variant="subtle", color="var(--ink)", fullWidth=True, className="preview-category", mb="lg", **{"aria-pressed":"true"}),
                    dmc.Text("Measurements", fw=600, size="sm", mb="sm"),
                    *[dmc.Button(name, id={"kind": "category", "key": index}, n_clicks=0, variant="subtle", color="var(--ink)", fullWidth=True, className="preview-category", **{"aria-pressed": str(index == 0).lower()}) for index, (name, _) in enumerate(GROUPS)],
                    dmc.Text("Sample readings only", size="xs", c="dimmed", mt="auto"),
                ], p="lg"),
                dmc.AppShellMain([
                    html.Div(maya.layout(), id="preview-story-space"),
                    html.Div([
                    dmc.Group([dmc.Title("Trends", order=1),
                        dmc.SegmentedControl(id="preview-range", value="all", transitionDuration=0, data=[{"label": "1 week", "value": "7"}, {"label": "1 month", "value": "31"}, {"label": "3 months", "value": "92"}, {"label": "All", "value": "all"}], size="md"),
                    ], justify="space-between", mb="xl", gap="md", className="preview-heading"),
                    dmc.Select(id="preview-mobile-category", label="Measurements", data=[{"label": name, "value": str(index)} for index, (name, _) in enumerate(GROUPS)], value="0", allowDeselect=False, hiddenFrom="md", mb="lg"),
                    html.Section([
                        dmc.Group([dmc.Title("Live camera test",order=2),dmc.Button("Open camera test",id="preview-live-camera",n_clicks=0,color="var(--ink)",className="maya-primary")],justify="space-between"),
                        dmc.SimpleGrid([
                            dmc.Stack([dmc.Text("A fresh reading, when you are ready.",size="lg"),dmc.Text("Rest for a minute, face the light and keep still for about 30 seconds. Camera access starts only after you choose Start."),dmc.Text("Video is processed on this device. Only pulse, breathing rate and HRV estimates that the signal supports can be kept for this test session.",size="sm",c="dimmed"),dmc.Text("Your camera test is separate from Maya's sample history.",size="sm",c="dimmed")],gap="md"),
                            dmc.Stack([html.Div(id="preview-live-results"),dmc.Button("Clear camera test results",id="preview-clear-camera",n_clicks=0,variant="default")],gap="md"),
                        ],cols={"base":1,"md":2},spacing="xl",mt="lg"),
                    ],id="preview-live-test",className="preview-live-test"),
                    *[html.Section([
                        dmc.Title(name, order=2, mb="md"),
                        dmc.SimpleGrid([card(data[key]) for key in keys if data[key]["points"]], cols={"base": 1, "md": 2, "xl": 3}, spacing="lg"),
                        dmc.Stack([dmc.Group([dmc.Text(MEASURES[key].label), dmc.Text("No readings", c="dimmed", size="sm")], justify="space-between", className="preview-empty-row") for key in keys if not data[key]["points"]], gap=0, mt="sm"),
                    ], id={"kind": "category-panel", "key": index}, style={"display": "block" if index == 0 else "none"}, className="preview-section") for index, (name, keys) in enumerate(GROUPS)],
                    ], id="preview-measurement-space", hidden=True),
                ]),
            ], transitionDuration=0, header={"height": 72}, navbar={"width": 220, "breakpoint": "md", "collapsed": {"mobile": True}}, padding="xl", className="dash-preview"),
        ],
    )

    @app.callback(Output("preview-theme", "forceColorScheme"), Output("preview-theme-toggle", "aria-label"),
                  Input("preview-theme-toggle", "n_clicks"), prevent_initial_call=True)
    def toggle_theme(clicks):
        dark = not ((clicks or 0) % 2)
        return ("dark" if dark else "light", "Switch to light mode" if dark else "Switch to dark mode")

    @app.callback(Output({"kind": "view", "key": MATCH}, "children"), Output({"kind": "table", "key": MATCH}, "aria-pressed"),Output({"kind":"reading-head","key":MATCH},"children"),
                  Input({"kind": "table", "key": MATCH}, "n_clicks"), Input("preview-range", "value"),
                  Input("preview-theme", "forceColorScheme"), Input("preview-data", "data"), State({"kind": "table", "key": MATCH}, "id"))
    def render(table, period, theme, data, identity):
        selected = bool((table or 0) % 2)
        return content(data[identity["key"]], selected, period, theme == "dark"), str(selected).lower(), reading_head(data[identity["key"]])

    @app.callback(Output({"kind": "readings-table", "key": MATCH}, "data"),
                  Input({"kind": "filter", "key": MATCH}, "value"), Input({"kind": "order", "key": MATCH}, "value"),
                  State({"kind": "table-points", "key": MATCH}, "data"), State({"kind": "filter", "key": MATCH}, "id"), State("preview-data", "data"))
    def filter_table(query, order, points, identity, data):
        return table_data(data[identity["key"]], points, query or "", order)

    @app.callback(Output({"kind": "category", "key": ALL}, "aria-pressed"),
                  Output({"kind": "category-panel", "key": ALL}, "style"), Output("preview-mobile-category", "value"),Output("preview-live-test", "hidden"),
                  Input({"kind": "category", "key": ALL}, "n_clicks"), Input("preview-mobile-category", "value"),Input("preview-open-story", "n_clicks"),Input("preview-open-story-mobile", "n_clicks"),Input("preview-open-measurements-mobile", "n_clicks"))
    def select_category(clicks, mobile, story_click, mobile_story, mobile_measurements):
        selected = ctx.triggered_id["key"] if isinstance(ctx.triggered_id, dict) else int(mobile or 0)
        story=ctx.triggered_id in {None,"preview-open-story","preview-open-story-mobile"} if not isinstance(ctx.triggered_id,dict) else False
        return ([str(index == selected and not story).lower() for index in range(len(GROUPS))],
                [{"display": "block" if index == selected else "none"} for index in range(len(GROUPS))], str(selected), selected != 0)

    app.clientside_callback(
        ClientsideFunction(namespace="stellisPreview", function_name="readingTooltip"),
        Output({"kind": "reading-tooltip", "key": MATCH}, "show"),
        Output({"kind": "reading-tooltip", "key": MATCH}, "bbox"),
        Output({"kind": "reading-tooltip", "key": MATCH}, "children"),
        Output({"kind": "reading-tooltip", "key": MATCH}, "direction"),
        Input({"kind": "graph", "key": MATCH}, "hoverData"),
    )

    @app.callback(Output("preview-data", "data"), Input("maya-chapter", "value"))
    def story_measurements(chapter):
        return sample_series(maya.CHAPTERS[int(chapter)]["date"])

    @app.callback(Output("preview-story-space", "hidden"), Output("preview-measurement-space", "hidden"),Output("preview-open-story", "aria-pressed"),
                  Input("preview-open-story", "n_clicks"),Input("preview-open-story-mobile", "n_clicks"),Input("preview-open-measurements-mobile", "n_clicks"), Input({"kind": "category", "key": ALL}, "n_clicks"), prevent_initial_call=True)
    def choose_workspace(story_clicks, mobile_story, mobile_measurements, categories):
        story = ctx.triggered_id in {"preview-open-story","preview-open-story-mobile"} if not isinstance(ctx.triggered_id,dict) else False
        return not story, story, str(story).lower()

    @app.callback(Output("preview-live-results", "children"), Input("preview-camera-data", "data"))
    def live_results(points):
        if not points:
            return dmc.Stack([dmc.Text("No camera readings yet",fw=600),dmc.Text("Open the test, then choose Start. Review any result before saving it here.",c="dimmed",size="sm")],gap="sm")
        labels={"pulse": ("Pulse","bpm"),"breathing_rate": ("Breathing rate","breaths/min"),"hrv": ("Heart rate variability","ms")}
        return dmc.Stack([dmc.Title("This camera session",order=3),*[dmc.Group([dmc.Text(labels[p["measure"]][0]),dmc.Stack([dmc.Text(f"{p['value']} {labels[p['measure']][1]}",fw=600),dmc.Text(p.get("note") or "Camera estimate",size="xs",c="dimmed")],gap=0)],justify="space-between") for p in points[-3:]],dmc.Text("Camera estimates, kept in this browser session only.",size="sm",c="dimmed")],gap="sm")

    @app.callback(Output("maya-chapter-content", "children"), Input("maya-chapter", "value"), Input("maya-demo-state", "data"), Input("preview-theme", "forceColorScheme"), State("maya-tools", "value"))
    def render_story(chapter, state, theme, tab):
        return maya.content(chapter, state or maya.initial_state(), 'overview' if ctx.triggered_id == 'maya-chapter' else (tab or 'overview'),theme=='dark')

    @app.callback(Output("maya-record-body", "children"), Output("maya-record-date", "value"), Input("maya-record", "value"), State("maya-demo-state", "data"))
    def show_record(key,state):
        return maya.record_body(key,state or maya.initial_state()), (state or {}).get('dates',{}).get(key,maya.DOCS[key]['clinical_date'])

    @app.callback(Output("maya-review-summary", "children"),Output("maya-pending-log", "data"),Output("maya-log-confirm", "disabled"),Input("maya-log-review", "n_clicks"), State("maya-log-items", "value"),State("maya-log-date", "value"),State("maya-log-outcome", "value"),prevent_initial_call=True)
    def review_entries(clicks,items,day,outcome):
        if not clicks:return "",None,True
        selected=[m['name'] for m in maya.MEDS if m['medication_id'] in (items or [])]
        return dmc.Text(f"Review: {', '.join(selected)}. {outcome} on {day}. Nothing is saved until Confirm entries." if selected else "Choose at least one item.",size="sm"), {"items":items,"day":day,"outcome":outcome}, not bool(selected)

    @app.callback(Output("maya-demo-state", "data"), Output("maya-feedback", "children"),
                  Input("maya-file", "n_clicks"), Input("maya-log-confirm", "n_clicks"), Input("maya-checkin-confirm", "n_clicks"), Input("maya-snooze", "n_clicks"), Input("maya-notes-save", "n_clicks"), Input("maya-reset", "n_clicks"), Input("maya-goal-save", "n_clicks"),Input("maya-appointment-save", "n_clicks"),Input("maya-upload", "contents"),Input("maya-period-save", "n_clicks"),
                  State("maya-demo-state", "data"),State("maya-chapter", "value"), State("maya-record", "value"), State("maya-record-date", "value"), State("maya-notebook-choices", "value"),
                  State("maya-log-items", "value"), State("maya-log-date", "value"), State("maya-log-outcome", "value"),State("maya-checkin-text", "value"),State("maya-notes-text", "value"),State("maya-pending-log", "data"),State("maya-goal-text", "value"),State("maya-goal-frequency", "value"),State("maya-appointment-title", "value"),State("maya-appointment-date", "value"),State("maya-appointment-confirmed", "checked"),State("maya-upload", "filename"),State("maya-period-days", "value"),prevent_initial_call=True)
    def save_story(file_click,log_click,check_click,snooze_click,note_click,reset_click,goal_click,appointment_click,upload,period_click,state,chapter,doc_id,doc_date,notebooks,items,day,outcome,check_text,note_text,pending,goal_text,goal_frequency,appointment_title,appointment_date,appointment_confirmed,upload_name,period_days):
        import copy
        state=copy.deepcopy(state or maya.initial_state());action=ctx.triggered_id
        clicks={'maya-file':file_click,'maya-log-confirm':log_click,'maya-checkin-confirm':check_click,'maya-snooze':snooze_click,'maya-notes-save':note_click,'maya-reset':reset_click,'maya-goal-save':goal_click,'maya-appointment-save':appointment_click,'maya-period-save':period_click}
        if action!='maya-upload' and not clicks.get(action):return no_update,no_update
        if action=='maya-upload' and not upload:return no_update,no_update
        if action=='maya-reset':return maya.initial_state(),"Maya's demo choices and notes were reset. Your camera session was not changed."
        dates={'maya-file':doc_date,'maya-log-confirm':day,'maya-checkin-confirm':day,'maya-snooze':day,'maya-appointment-save':appointment_date}
        if action in dates:
            try:dt.date.fromisoformat(dates[action])
            except (ValueError,TypeError):return state,'Choose a valid date before confirming.'
        if action=='maya-upload':
            import base64,hashlib
            if not upload or not upload.startswith('data:application/pdf;base64,'):return state,'Choose a PDF record.'
            raw=base64.b64decode(upload.split(',',1)[1],validate=True)
            if not raw.startswith(b'%PDF-') or len(raw)>5_000_000:return state,'Choose a PDF smaller than 5 MB.'
            identity=hashlib.sha256(raw).hexdigest()
            if any(item['id']==identity for item in state['uploads']):return state,'This original is already in the demo inbox.'
            state['uploads'].append({'id':identity,'name':upload_name,'contents':upload})
            message=f'Added {upload_name} to this browser demo inbox. Inspect the original before filing.'
        elif action=='maya-period-save':
            if not period_days:return state,'Choose the actual period days first.'
            state['periods']=sorted(set(state.get('periods',[]))|set(period_days));message=f'Confirmed flow on {len(period_days)} selected dates.'
        elif action=='maya-goal-save':
            if not (goal_text or '').strip():return state,'Name the personal goal first.'
            goal={'name':goal_text.strip(),'frequency':goal_frequency,'created_story_date':maya.CHAPTERS[int(chapter)]['date']}
            if goal not in state.setdefault('goals',[]):state['goals'].append(goal)
            message='Personal goal added to this demo routine.'
        elif action=='maya-appointment-save':
            if not (appointment_title or '').strip():return state,'Name the appointment first.'
            dt.date.fromisoformat(appointment_date)
            state.setdefault('appointments',[]).append({'name':appointment_title.strip(),'date':appointment_date,'status':'Confirmed' if appointment_confirmed else 'Planned'})
            message='Appointment saved as '+('Confirmed' if appointment_confirmed else 'Planned')+'.'
        elif action=='maya-file':
            dt.date.fromisoformat(doc_date)
            state['dates'][doc_id]=doc_date;state['notebooks']=sorted(set(state['notebooks'])|set(notebooks or []))
            message=f"Confirmed {doc_id} on {doc_date}; filed to {len(notebooks or [])} selected notebooks."
        elif action=='maya-log-confirm':
            if not items or pending!={'items':items,'day':day,'outcome':outcome}:return state,'Review these entries before confirming.'
            dt.date.fromisoformat(day)
            for med in maya.MEDS:
                if med['medication_id'] in items:
                    entry={'name':med['name'],'date':day,'outcome':outcome}
                    if entry not in state['entries']:state['entries'].append(entry)
            message=f"Confirmed {len(items)} entries for {day}."
        elif action=='maya-checkin-confirm':
            if not (check_text or '').strip():return state,'Write a note before confirming.'
            state['entries'].append({'name':check_text.strip(),'date':day,'outcome':'Check-in'})
            message=f'Check-in note confirmed for {day}.'
        elif action=='maya-snooze':
            tomorrow=(dt.date.fromisoformat(day)+dt.timedelta(days=1)).isoformat()
            state['snoozed'].append(f'Check-in until {tomorrow}');message=f'Check-in is pending until {tomorrow}.'
        else:
            state['notes'][maya.CHAPTERS[int(chapter)]['key']]=note_text or '';message='Notes saved in this browser demo.'
        return state,message

    return server


if __name__ == "__main__":
    raise SystemExit("The standalone prototype is superseded. Start the actual app with: uv run stellis serve --port 8840, then open /demo.")
