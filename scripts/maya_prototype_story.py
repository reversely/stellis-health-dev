"""Three-period, source-backed Maya story for the optional Dash prototype.

All clinical content comes from the canonical fictional-patient manifest. User
choices and notes live in the browser demo store, never in a real account.
"""
from __future__ import annotations
import datetime as dt
import json
from pathlib import Path
import dash_mantine_components as dmc
from dash import dcc, html

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / 'stellis-synthetic-patient'
MANIFEST = json.loads((CORPUS / 'manifest.json').read_text())
DOCS = {d['document_id']: d for d in MANIFEST}
MEDS = json.loads((CORPUS / 'fixtures/medications.json').read_text())
STORY = json.loads((CORPUS / 'fixtures/yearly_story.json').read_text())
APPOINTMENTS = json.loads((CORPUS / 'fixtures/appointments.json').read_text())
CHAPTERS = [
    dict(key='2022', date='2022-12-06', title='Making sense of a first concern', need="I'm tired after work. I want my records, periods and follow-up plan in one place.", records=['D001','D002','D003','D005','D006','D007','D008'], source='D002', notebooks=['Preventive Care','Menstrual Health','Blood Health'], meds=['MED-IRON-1','MED-FOLATE'], day='2022-02-02'),
    dict(key='2024–25', date='2025-12-31', title='Coordinating care as life changes', need="From fertility tests to IVF and becoming a parent, I need my changing care to stay connected.", records=['D012','D018','D022','D025','D027','D028','D034','D035','D041','D052','D053','D055'], source='D027', notebooks=['Preventive Care','Menstrual Health','Blood Health','Fertility','IVF','Pregnancy','Postpartum Recovery'], meds=['MED-FSH','MED-HMG','MED-ANT'], day='2024-06-07'),
    dict(key='2026', date='2026-12-18', title='Finding a routine that fits life now', need="My periods have returned. I want to see the longer view and keep everyday follow-up manageable.", records=['D061','D062','D063','D064','D065','D066','D067','D068','D069','D070'], source='D070', notebooks=['Preventive Care','Menstrual Health','Blood Health','Fertility','IVF','Pregnancy','Postpartum Recovery'], meds=['MED-IRON-3'], day='2026-12-18'),
]


def initial_state():
    return dict(notebooks=[], dates={}, entries=[], snoozed=[], notes={}, uploads=[], goals=[], appointments=[], periods=[])


def source_link(document_id, text='Open original'):
    doc = DOCS[document_id]
    return dmc.Anchor(text, href='/demo-sources/' + doc['path'].removeprefix('documents/'), target='_blank', className='maya-source-link')


def rows(items):
    return dmc.Stack([dmc.Group([dmc.Text(left), dmc.Text(right, size='sm', c='dimmed')], justify='space-between', className='maya-plain-row') for left, right in items], gap=0)


def panel(title, children):
    return dmc.Paper([dmc.Title(title, order=3, mb='md'), children], p='lg', withBorder=True, className='maya-panel')


def lab_graph(chapter,dark=True):
    data=[]
    for doc in MANIFEST:
        if doc['clinical_date'] > chapter['date']: continue
        for lab in doc['required_clinical_information']['laboratory_values']:
            if lab['test'].lower() == 'ferritin':
                data.append((doc['clinical_date'],lab['value'],doc['document_id']))
    graph=dcc.Graph(id={'kind':'graph','key':'maya-ferritin'},clear_on_unhover=True,figure={'data':[{'type':'scatter','mode':'lines+markers','x':[d for d,v,i in data],'y':[v for d,v,i in data],'line':{'color':'#55B8B6','width':2},'marker':{'size':7},'customdata':[[dt.date.fromisoformat(d).strftime('%d %b %Y'),f'{v} ug/L'] for d,v,i in data],'hoverinfo':'none','hovertemplate':None}], 'layout':{'template':'none','paper_bgcolor':'rgba(0,0,0,0)','plot_bgcolor':'rgba(0,0,0,0)','font':{'color':'#DED5DE' if dark else '#635B65','family':'Inter'},'height':230,'margin':{'l':42,'r':16,'t':12,'b':38},'xaxis':{'showgrid':False},'yaxis':{'title':'Ferritin (ug/L)','gridcolor':'#51415C','zeroline':False},'showlegend':False}}, config={'displayModeBar':False},responsive=True,style={'height':230})
    return html.Div([graph,dcc.Tooltip(id={'kind':'reading-tooltip','key':'maya-ferritin'},show=False,background_color='#44364E',border_color='#44364E',className='preview-reading-tooltip')],className='preview-plot')


def overview(chapter, state,dark=True):
    events=[e for e in STORY['life_events'] if e['date'] <= chapter['date']]
    timeline=dmc.Timeline([dmc.TimelineItem(title=e['label'],children=dmc.Text(e['date'],size='sm',c='dimmed')) for e in events],active=len(events)-1,bulletSize=12,lineWidth=1,color='var(--ink)')
    retained = sorted(set(state['notebooks']))
    return dmc.Stack([
        dmc.SimpleGrid([
            panel('Her history stays together',dmc.Stack([dmc.Text(f"{sum(d['clinical_date'] <= chapter['date'] for d in MANIFEST)} source records in this period's sample package",c='dimmed'),dmc.Group([dmc.Badge(n,variant='light',color='gray') for n in retained],gap=8),dmc.Text('Earlier records remain available as new care is added.',size='sm',c='dimmed')])),
            panel('Her next steps',rows([('Understand the source','Review dates and findings'),('Keep the right context','Choose shared notebooks'),('Follow through','Confirm a manageable plan')])),
        ],cols={'base':1,'md':2},spacing='lg'),
        dmc.SimpleGrid([panel('A continuous timeline',timeline),panel('Iron follow-up across records',dmc.Stack([lab_graph(chapter,dark),source_link('D006' if chapter['key']=='2022' else 'D070' if chapter['key']=='2026' else 'D053','Inspect the dated source')]))],cols={'base':1,'md':2},spacing='lg'),
    ],gap='lg')


def record_body(doc_id, state):
    doc=DOCS[doc_id]; clinical=doc['required_clinical_information']
    fields=[dmc.Title(doc['purpose'],order=3), dmc.Text(f"{doc['clinical_date']}  {doc_id}",c='dimmed',size='sm')]
    fields += [dmc.Stack([dmc.Text(s['heading'],fw=600),dmc.Text(s['text'],size='sm')],gap=4) for s in clinical['sections'][:3]]
    if clinical['laboratory_values']:
        fields.append(dmc.Table(data={'head':['Measure','Value','Unit'],'body':[[x['test'],str(x['value']),x['unit']] for x in clinical['laboratory_values']]},horizontalSpacing='sm',verticalSpacing='sm'))
    fields += [dmc.Accordion(dmc.AccordionItem([dmc.AccordionControl('Inspect original source'),dmc.AccordionPanel(html.Iframe(src='/demo-sources/'+doc['path'].removeprefix('documents/')+'#toolbar=0',title=doc['purpose'],className='maya-pdf'))],value='source'))]
    return dmc.Stack(fields,gap='md')


def records(chapter, state):
    available=[d for d in MANIFEST if d['clinical_date'] <= chapter['date']]
    return dmc.SimpleGrid([
        panel('Records and evidence',dmc.Stack([
            dmc.Select(id='maya-record',label='Source record',data=[{'value':d['document_id'],'label':f"{d['clinical_date']}  {d['purpose']}"} for d in available],value=chapter['source'],searchable=True,allowDeselect=False),
            html.Div(record_body(chapter['source'],state),id='maya-record-body'),
            dcc.Upload(id='maya-upload',children=dmc.Button('Add a PDF record',variant='default'),accept='application/pdf',multiple=False),
            dmc.Text('Only synthetic demo files belong in this prototype.',size='xs',c='dimmed'),
            *[dmc.Accordion(dmc.AccordionItem([dmc.AccordionControl('Uploaded: '+item['name']),dmc.AccordionPanel(html.Iframe(src=item['contents'],title=item['name'],className='maya-pdf'))],value=item['id'])) for item in state['uploads']],
        ],gap='md')),
        panel('Review before filing',dmc.Stack([
            dmc.Text('Confirm the visit or test date against the original. Choose the notebooks that should share the same record.',c='dimmed'),
            dmc.TextInput(id='maya-record-date',label='Visit or test date',inputProps={'type':'date'},value=state['dates'].get(chapter['source'],DOCS[chapter['source']]['clinical_date'])),
            dmc.MultiSelect(id='maya-notebook-choices',label='Notebooks',data=chapter['notebooks'],value=[n for n in state['notebooks'] if n in chapter['notebooks']],searchable=True),
            dmc.Button('Confirm and file',id='maya-file',n_clicks=0,color='var(--ink)'),
            dmc.Text('One original, shared across the notebooks you select.',size='sm',c='dimmed'),
            html.Div(rows([(n,'Selected') for n in state['notebooks']]),id='maya-library'),
        ],gap='md')),
    ],cols={'base':1,'md':2},spacing='lg')


def care(chapter,state):
    meds=[m for m in MEDS if m['medication_id'] in chapter['meds']]
    medrows=[]
    for med in meds:
        dose=med['dose']
        for change in med.get('adjustments',[]):
            if change['date'] <= chapter['day'] and change.get('dose'):dose=change['dose']
        medrows.append([med['name'],dose,med['frequency'],med['start'],med['end']])
    options=[{'label':m['name'],'value':m['medication_id']} for m in meds]
    period_days=['2022-01-08','2022-01-09','2022-01-10','2022-01-11'] if chapter['key']=='2022' else ['2026-01-12','2026-01-13','2026-01-14','2026-01-15','2026-01-16'] if chapter['key']=='2026' else []
    appointments=[a for a in APPOINTMENTS if a['date'] <= chapter['date']][-3:]
    refill=[]
    if chapter['key']=='2026':
        prescription=next(x['text'] for x in DOCS['D066']['required_clinical_information']['sections'] if x['heading']=='Prescription')
        import re
        quantity=int(re.search(r'Quantity (\d+) tablets',prescription)[1])
        start=dt.date.fromisoformat(next(m['start'] for m in meds if m['medication_id']=='MED-IRON-3'))
        runout=start+dt.timedelta(days=(quantity-1)*2)
        refill=[panel('Course supply and end date',dmc.Stack([
            rows([('Calculated first-fill run-out',runout.isoformat()),('Planned last dose','2026-12-18'),('Supply recorded',f'{quantity} tablets, one repeat')]),
            source_link('D066','Inspect the prescription'),dmc.Text('Run-out assumes the recorded alternate-day schedule, before skipped doses. It is a calculation, not a booked appointment.',size='sm',c='dimmed')],gap='sm'))]
    return dmc.Stack([
        *refill,
        panel('Care plan from the records',dmc.TableScrollContainer(dmc.Table(data={'head':['Medicine','Recorded dose','Schedule','Starts','Last dose'],'body':medrows},verticalSpacing='sm'),minWidth=600,type='native')),
        dmc.SimpleGrid([
            panel('Log together, then confirm',dmc.Stack([
                dmc.CheckboxGroup(id='maya-log-items',children=dmc.Stack([dmc.Checkbox(label=o['label'],value=o['value']) for o in options],gap='sm'),value=[]),
                dmc.TextInput(id='maya-log-date',label='Date for this entry',inputProps={'type':'date'},value=chapter['day']),
                dmc.SegmentedControl(id='maya-log-outcome',data=['Taken','Skipped'],value='Taken'),
                dmc.Button('Review entries',id='maya-log-review',n_clicks=0,color='var(--ink)'),
                html.Div(id='maya-review-summary'),
                dcc.Store(id='maya-pending-log',data=None),
                dmc.Button('Confirm entries',id='maya-log-confirm',n_clicks=0,variant='default',disabled=True),
                rows([(e['name'],f"{e['date']}  {e['outcome']}") for e in state['entries'] if e['date'] <= chapter['date']]),
            ],gap='md')),
            panel('A check-in that respects her time',dmc.Stack([
                dmc.Text('Review how the current routine is going. A typed note is not a saved entry.'),
                dmc.Textarea(id='maya-checkin-text',label='Check-in note',placeholder='What changed, or what needs attention?',minRows=3),
                dmc.Group([dmc.Button('Confirm dated note',id='maya-checkin-confirm',n_clicks=0,variant='default'),dmc.Button('Snooze until tomorrow',id='maya-snooze',n_clicks=0,variant='default')]),
                dmc.Text('Snoozed items stay pending; no action is marked as done.',size='sm',c='dimmed'),
                rows([(x,'Pending') for x in state['snoozed']]),
            ],gap='md')),
        ],cols={'base':1,'md':2},spacing='lg'),
        dmc.SimpleGrid([
            panel('Appointments and care dates',dmc.Stack([
                rows([(a['title'],f"{a['date']}  {a['status'].replace('_',' ')}") for a in appointments]+[(a['name'],f"{a['date']}  {a['status']}") for a in state.get('appointments',[]) if a['date'] <= chapter['date']]),
                dmc.TextInput(id='maya-appointment-title',label='Appointment'),
                dmc.TextInput(id='maya-appointment-date',label='Appointment date',inputProps={'type':'date'},value=chapter['day']),
                dmc.Checkbox(id='maya-appointment-confirmed',label='The provider has confirmed this appointment',checked=False),
                dmc.Button('Save appointment',id='maya-appointment-save',n_clicks=0,variant='default'),
            ],gap='md')),
            panel('Periods and milestones', dmc.Stack([
                rows([('Period dates','8–11 Jan 2022')] if chapter['key']=='2022' else [('Estimated due date','3 Aug 2025'),('Confirmed birth','29 Jul 2025')] if chapter['key']=='2024–25' else [('Periods resumed','12–16 Jan 2026'),('Last iron dose','18 Dec 2026'),('Stop iron from','19 Dec 2026')]),
                dmc.CheckboxGroup(id='maya-period-days',children=dmc.Group([dmc.Checkbox(label=day,value=day) for day in period_days],gap='md'),value=[]),
                dmc.Button('Confirm period dates',id='maya-period-save',n_clicks=0,variant='default',disabled=not bool(period_days)),
                rows([(day,'Flow recorded') for day in state.get('periods',[])]),
                dmc.Text('Estimated, scheduled and confirmed dates remain distinct. Postpartum bleeding is not a period.',size='sm',c='dimmed'),
            ],gap='sm')),
        ],cols={'base':1,'md':2},spacing='lg'),
        panel('A routine she chooses',dmc.Stack([
            dmc.TextInput(id='maya-goal-text',label='Personal goal',placeholder='For example, walk after lunch'),
            dmc.Select(id='maya-goal-frequency',label='How often',data=['Every day','Three times a week','Once a week'],value='Three times a week',allowDeselect=False),
            dmc.Button('Add goal',id='maya-goal-save',n_clicks=0,variant='default'),
            rows([(g['name'],g['frequency']) for g in state.get('goals',[]) if g.get('created_story_date','') <= chapter['date']]),
        ],gap='md')),
    ],gap='lg')


def notes(chapter,state):
    doc_id='D003' if chapter['key']=='2022' else 'D028' if chapter['key']=='2024–25' else 'D070'
    transcript=json.loads((CORPUS/f'fixtures/transcripts/{doc_id}.json').read_text())
    return dmc.SimpleGrid([
        panel('Visit notes and transcript',dmc.Stack([
            dmc.Text('Saved scripted visit. This is a fictional source artifact, not new speech recognition.',size='sm',c='dimmed'),
            html.Audio(src='/demo-audio/D003.ogg',controls=True,id='maya-visit-audio') if doc_id=='D003' else dmc.Text('Written visit transcript',c='dimmed'),
            dmc.ScrollArea(dmc.Stack([dmc.Stack([dmc.Text(t['speaker'],fw=600,size='sm'),dmc.Text(t['text'],size='sm')],gap=4) for t in transcript['turns']],gap='md'),h=300),
            source_link(doc_id,'Open the linked visit record'),
        ],gap='md')),
        panel('My notes',dmc.Stack([
            dmc.Textarea(id='maya-notes-text',label='Notes for this part of the story',minRows=10,value=state['notes'].get(chapter['key'],'')),
            dmc.Button('Save notes',id='maya-notes-save',n_clicks=0,color='var(--ink)'),
            dmc.Text('Notes stay in this browser’s demo history when you move between chapters.',size='sm',c='dimmed'),
        ],gap='md')),
    ],cols={'base':1,'md':2},spacing='lg')


def explanation(chapter,state):
    if chapter['key']=='2024–25':
        title='What happened at each stage?'
        text='The retrieval and embryology records describe different stages: 12 oocytes retrieved, 10 mature, 8 normally fertilized and 4 blastocysts frozen. The four counts are not interchangeable.'
        ids=['D025','D027','D028']
    elif chapter['key']=='2022':
        title='What changed in the follow-up?'
        text='The January result records ferritin 11 ug/L with hemoglobin 124 g/L. The follow-up reports an improvement in ferritin. Low iron stores and anemia are different findings; inspect the dated laboratory reports before drawing a conclusion.'
        ids=['D002','D006','D007']
    else:
        title='What does the latest plan say?'
        text='The December 18 annual review cites ferritin 48 ug/L and hemoglobin 131 g/L from December 11. It documents the last iron dose on December 18, with stopping from December 19. The instruction is a dated source fact, not a new recommendation.'
        ids=['D069','D070']
    return panel(title,dmc.Stack([
        dmc.Text('Saved source-based explanation for this fictional story. No live chatbot response is being represented.',size='sm',c='dimmed'),
        dmc.Text(text),dmc.Group([source_link(i,i) for i in ids]),
        dmc.Accordion(dmc.AccordionItem([dmc.AccordionControl('How the explanation is grounded'),dmc.AccordionPanel(dmc.Stack([dmc.Text('1. Identify the dated source records.'),dmc.Text('2. Keep stages, dates and qualifiers separate.'),dmc.Text('3. Link each count or instruction to its original record.'),dmc.Text('This is a source map for the saved explanation, not an inference-execution trace.',size='sm',c='dimmed')],gap='sm'))],value='trace')),
    ],gap='md'))


def content(index,state,tab='overview',dark=True):
    chapter=CHAPTERS[int(index)]
    tools=[('Overview','overview',overview),('Records','records',records),('Care','care',care),('Notes','notes',notes),('Explanation','explanation',explanation)]
    return dmc.Stack([
        dmc.Group([dmc.Title(chapter['title'],order=2),dmc.Text(chapter['key'],c='dimmed')],justify='space-between'),
        dmc.Text(chapter['need'],size='lg',className='maya-need'),
        dmc.Tabs([dmc.TabsList([dmc.TabsTab(label,value=value) for label,value,fn in tools]),*[dmc.TabsPanel(fn(chapter,state,dark) if fn==overview else fn(chapter,state),value=value,pt='lg') for label,value,fn in tools]],id='maya-tools',value=tab,keepMounted=True),
    ],gap='lg',**{'data-story-theme':'dark' if dark else 'light'})


def layout():
    state=initial_state()
    return html.Div([
        dcc.Store(id='maya-demo-state',data=state,storage_type='session'),
        dmc.Group([dmc.Stack([dmc.Title('Maya grows with Stellis',order=1),dmc.Text('One history, changing needs.',c='dimmed')],gap=4),dmc.Button('Reset Maya demo',id='maya-reset',variant='default',n_clicks=0)],justify='space-between',mb='lg'),
        dmc.SegmentedControl(id='maya-chapter',value='0',data=[{'label':f"{x['key']}  {label}",'value':str(i)} for i,(x,label) in enumerate(zip(CHAPTERS,['First concerns','Changing care','A new routine']))],fullWidth=True,size='md',transitionDuration=0,className='maya-chapters'),
        dmc.Text('Maya is a fictional patient. Demo choices and notes remain in this browser.',size='xs',c='dimmed',mt='sm'),
        html.Div(content(0,state),id='maya-chapter-content',className='maya-chapter-content'),
        html.P('',id='maya-feedback',role='status',className='maya-feedback'),
    ],id='maya-journey')
