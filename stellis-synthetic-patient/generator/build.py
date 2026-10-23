"""Render the corpus and derive fixtures and ground truth from its locked ledger."""
import argparse
from datetime import date, datetime, timedelta
import hashlib
from html import escape
import json
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT = Path(__file__).resolve().parents[1]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def read_json(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def age_on(day, dob):
    day, dob = date.fromisoformat(day), date.fromisoformat(dob)
    return day.year - dob.year - ((day.month, day.day) < (dob.month, dob.day))


def manifest(facts, refs, ledger_hash):
    result = []
    for d in facts['documents']:
        selected = [refs[k] for k in d['reference_ids']]
        assert any(r['primary_eligible'] for r in selected)
        slug = re.sub('[^a-z0-9]+', '-', d['title'].lower()).strip('-')
        filename = f"{d['document_id']}_{d['clinical_date']}_{slug}.pdf"
        result.append(dict(document_id=d['document_id'],filename=filename,path=f"documents/{d['clinical_date'][:4]}/{filename}",clinical_date=d['clinical_date'],document_type=d['document_type'],purpose=d['title'],required_clinical_information=dict(sections=d['sections'],laboratory_values=d['laboratory_values'],findings=d['findings'],procedures=d['procedures'],medication_ids=d['medication_ids'],tables=d['tables']),related_events=[dict(document_id=x,relation='prior') for x in d['prior_document_ids']],subsequent_events_policy='Forward plans may be mentioned as plans; future outcomes are prohibited',synthetic_pdf_reference_urls=[r['direct_pdf_url'] for r in selected if r['primary_eligible']],supplemental_demo_reference_urls=[r['direct_pdf_url'] for r in selected if not r['primary_eligible']],formatting_requirements=[r['layout'] for r in selected],reference_limitations=[r['limitation'] for r in selected],source_roles={r['reference_id']:r['role'] for r in selected},canonical_ledger_sha256=ledger_hash,renderer_family=d['document_type']))
    write_json(ROOT/'manifest.json',result)
    write_json(ROOT/'research/document_reference_inventory.json',[{k:m[k] for k in ['document_id','clinical_date','document_type','purpose','synthetic_pdf_reference_urls','supplemental_demo_reference_urls','formatting_requirements','reference_limitations']} for m in result])
    lines=['# Document reference inventory','','Each proposed PDF has at least one verified synthetic or test-account PDF reference. Supplemental demo reports are identified separately. This inventory is written before rendering.','', '| ID | Date | Document | References |','| --- | --- | --- | --- |']
    for m in result:
        lines.append(f"| {m['document_id']} | {m['clinical_date']} | {m['purpose']} | "+' '.join(f'[{k}]({refs[k]["direct_pdf_url"]})' for k in facts['documents'][result.index(m)]['reference_ids'])+' |')
    (ROOT/'research/document_reference_inventory.md').write_text('\n'.join(lines)+'\n')
    return result


PALETTE={'note':'#424b66','letter':'#3a4d58','lab':'#495466','cytology':'#315e72','screen':'#315e72','imaging':'#28736c','procedure':'#334d73','embryology':'#4e6650','prescription':'#52617b','discharge':'#334d73','assessment':'#62546e'}
STYLES=getSampleStyleSheet()
STYLES.add(ParagraphStyle(name='Clinical',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=8))
STYLES.add(ParagraphStyle(name='SmallClinical',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=4))
STYLES.add(ParagraphStyle(name='ReportTitle',fontName='Helvetica-Bold',fontSize=18,leading=22,spaceAfter=12))
STYLES.add(ParagraphStyle(name='SectionClinical',fontName='Helvetica-Bold',fontSize=10,leading=13,spaceBefore=10,spaceAfter=6))


def paragraph(text, style='Clinical'):
    return Paragraph(escape(str(text)).replace('\n','<br/>'),STYLES[style])


def grid(headers, rows, widths, accent):
    cells=[[paragraph(c,'SmallClinical') for c in row] for row in [headers]+rows]
    t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),accent),('TEXTCOLOR',(0,0),(-1,0),colors.white),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),5),('LINEBELOW',(0,0),(-1,0),0.8,accent),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f1f3f5'),colors.white]),('LINEBELOW',(0,1),(-1,-1),0.25,colors.HexColor('#d7dce0'))]))
    # Paragraph text colour is independent of Table's TEXTCOLOR.
    for cell in cells[0]: cell.style=ParagraphStyle(name='WhiteCell',parent=STYLES['SmallClinical'],textColor=colors.white,fontName='Helvetica-Bold')
    return t


def medication_status(m, day):
    if day < m['start']:return 'Planned'
    if day > m['end']:return 'Completed'
    return 'Active'


def render(d,m,facts):
    patient=facts['patient']; facility=facts['facilities'][d['facility_key']]; provider=facts['providers'][d['provider_key']]
    accent=colors.HexColor(PALETTE[d['document_type']]);w=504
    path=ROOT/m['path'];path.parent.mkdir(parents=True,exist_ok=True)
    story=[]
    header=Table([[paragraph(facility['name'],'SectionClinical'),paragraph(d['document_type'].upper(),'SmallClinical')]],colWidths=[366,138])
    header.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,-1),1.5,accent),('LEFTPADDING',(0,0),(-1,-1),0),('VALIGN',(0,0),(-1,-1),'TOP')]))
    story += [header,paragraph(facility['address']+' | '+facility['phone'],'SmallClinical'),Spacer(1,14),paragraph(d['title'],'ReportTitle')]
    demo=[['Patient',f"{patient['name']} | {patient['patient_id']}",'Clinical date',d['clinical_date']],['DOB / age',f"{patient['date_of_birth']} / {age_on(d['clinical_date'],patient['date_of_birth'])} years",'Record',d['document_id']],['Provider',provider['name'],'Status','Final']]
    pt=Table([[paragraph(c,'SmallClinical') for c in row] for row in demo],colWidths=[65,210,69,160])
    pt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#eef1f3')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story += [pt,Spacer(1,12)]
    if 'gestational_age' in d:story += [paragraph(f"Gestation {d['gestational_age']['display']} by ART | EDD {facts['pregnancy']['estimated_due_date']}",'SmallClinical')]
    if d['specimen']:
        story += [paragraph(f"Specimen: {d['specimen']} | Collected: {d['collection_date']} | Reported: {d['created_date']}",'SmallClinical'),paragraph('Accession: SYN-ACC-'+d['document_id'],'SmallClinical')]
    kind=d['document_type']
    # Families change both information order and visual structure.
    if kind=='lab':
        story += [grid(['Test','Result','Units','Reference interval','Indicator'],[[v['test'],v['value'],v['unit'],v['reference_interval'],v['indicator']] for v in d['laboratory_values']],[160,65,66,160,53],accent),Spacer(1,8)]
    if kind=='prescription':
        med_map={x['medication_id']:x for x in facts['medication_history']}
        rows=[]
        for key in d['medication_ids']:
            med=med_map[key];rows.append([med['name']+' '+med['dose'],med['route']+'; '+med['frequency'],medication_status(med,d['clinical_date'])])
        story += [grid(['Medication / strength','Route / schedule','Order status'],rows,[210,210,84],accent),Spacer(1,8)]
    for section in d['sections']:
        h=section['heading'];text=section['text']
        if kind=='letter' and h=='Recipient':
            story += [paragraph(d['clinical_date']),paragraph(text),Spacer(1,8),paragraph(f"Re: {patient['name']}, DOB {patient['date_of_birth']}"),Spacer(1,5)]
            continue
        if kind=='letter':story += [paragraph(h,'SectionClinical'),paragraph(text)]
        elif kind in {'cytology','screen'}:
            story += [paragraph(h.upper(),'SectionClinical'),paragraph(text)]
        else:
            label=Table([[paragraph(h.upper(),'SmallClinical')]],colWidths=[w]);label.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#e7ebee')),('LINEBEFORE',(0,0),(0,0),3,accent),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
            story += [KeepTogether([Spacer(1,8),label,Spacer(1,5),paragraph(text)])]
    if kind != 'lab' and d['laboratory_values']:
        story += [Spacer(1,8),grid(['Analyte','Result','Units','Reference / context'],[[v['test'],v['value'],v['unit'],v['reference_interval']+'; '+v['reference_context']] for v in d['laboratory_values']],[155,85,60,204],accent)]
    for table in d['tables']:
        story += [paragraph(table['title'],'SectionClinical'),grid(table['headers'],table['rows'],[w/len(table['headers'])]*len(table['headers']),accent)]
    if kind=='discharge':
        meds={x['medication_id']:x for x in facts['medication_history']}
        story += [paragraph('Medication reconciliation','SectionClinical'),grid(['Medication','Discharge directions'],[[meds[k]['name'],meds[k]['dose']+'; '+meds[k]['route']+'; '+meds[k]['frequency']] for k in d['medication_ids']],[150,354],accent)]
    if d['prior_document_ids']:story += [Spacer(1,10),paragraph('Related records: '+', '.join(d['prior_document_ids']),'SmallClinical')]
    story += [Spacer(1,12),paragraph(f"Electronically authorized by {provider['name']} | {provider['role']} | {provider['registration']}",'SmallClinical'),paragraph('Signed '+d['created_date'],'SmallClinical')]
    def footer(canvas, doc):
        canvas.saveState();canvas.setStrokeColor(accent);canvas.line(54,42,558,42);canvas.setFont('Helvetica',7);canvas.setFillColor(colors.HexColor('#525a61'))
        canvas.drawString(54,31,'SYNTHETIC TEST DATA | Fictional patient and providers | Not for clinical use')
        canvas.drawRightString(558,31,f"{d['document_id']} | Page {doc.page}");canvas.drawString(54,20,patient['patient_id']+' | '+patient['name']);canvas.restoreState()
    class DeterministicCanvas(Canvas):
        def __init__(self,*args,**kwargs):
            kwargs['invariant']=1
            super().__init__(*args,**kwargs)
    doc=SimpleDocTemplate(str(path),pagesize=letter,rightMargin=54,leftMargin=54,topMargin=40,bottomMargin=58,title=d['title'],author=facility['name'],subject='Fully synthetic Stellis evaluation record')
    doc.build(story,onFirstPage=footer,onLaterPages=footer,canvasmaker=DeterministicCanvas)


def fixtures(facts, manifests):
    import fixtures_data
    fixtures_data.build(ROOT,facts,manifests)


def ground_truth(facts, manifests, ledger_hash):
    med_map={x['medication_id']:x for x in facts['medication_history']}
    episode_notebooks={'routine':['General health','Menstrual health'],'iron':['General health','Iron deficiency'],'fertility':['Fertility','Menstrual health'],'ivf':['Fertility','IVF'],'pregnancy':['Pregnancy','Fertility'],'delivery':['Pregnancy','Birth'],'postpartum':['Postpartum','General health']}
    entries=[];relationships=[];events=[]
    by_id={m['document_id']:m for m in manifests}
    appointments=read_json(ROOT/'fixtures/appointments.json')
    for d in facts['documents']:
        m=by_id[d['document_id']];relations=d['prior_document_ids']
        medications=[]
        for k in d['medication_ids']:
            med=med_map[k]
            # Expose only history known on document date; future orders are separate plans.
            item={key:value for key,value in med.items() if key!='adjustments'}
            item['status_at_document']=medication_status(med,d['clinical_date'])
            item['adjustments']=[a for a in med.get('adjustments',[]) if a['date']<=d['clinical_date']]
            # Actual later course boundaries belong to the ledger, not extracted facts.
            item['start'] = med['start'] if med['start'] <= d['created_date'] else None
            item['end'] = med['end'] if med['end'] <= d['created_date'] else None
            for adjustment in item['adjustments']:
                if 'dose' in adjustment:
                    item['dose'] = adjustment['dose']
            item['known_on'] = d['created_date']
            medications.append(item)
        expected=[dict(fact_id=f"{d['document_id']}-F{i+1:02}",kind='narrative',text=s['text'],source_section=s['heading'],known_on=d['created_date']) for i,s in enumerate(d['sections'])]
        expected += [dict(fact_id=f"{d['document_id']}-LAB{i+1:02}",kind='laboratory',**v,clinical_date=d['collection_date'],known_on=d['created_date']) for i,v in enumerate(d['laboratory_values'])]
        record=dict(patient_id=facts['patient']['patient_id'],document_id=d['document_id'],document_type=d['document_type'],title=d['title'],encounter_date=d['encounter_date'],clinical_date=d['clinical_date'],collection_date=d['collection_date'],created_date=d['created_date'],age_years=age_on(d['clinical_date'],facts['patient']['date_of_birth']),provider=facts['providers'][d['provider_key']],facility=facts['facilities'][d['facility_key']],diagnoses_and_findings=d['findings'],laboratory_values=d['laboratory_values'],medications=medications,procedures=d['procedures'],appointment_ids=[a['appointment_id'] for a in appointments if d['document_id'] in a['document_ids']],care_episode_ids=[d['episode_id']],related_document_ids=relations,expected_extracted_facts=expected,expected_notebook_associations=episode_notebooks[d['episode_id']],original_pdf_reference_urls=m['synthetic_pdf_reference_urls'],supplemental_demo_reference_urls=m['supplemental_demo_reference_urls'],gestational_age=d.get('gestational_age'),pdf_path=m['path'],pdf_sha256=digest(ROOT/m['path']),canonical_ledger_sha256=ledger_hash)
        entries.append(record)
        events.append(dict(event_id='EV-'+d['document_id'],date=d['clinical_date'],available_on=d['created_date'],title=d['title'],patient_id=facts['patient']['patient_id'],document_ids=[d['document_id']],episode_id=d['episode_id'],findings=d['findings'],laboratory_values=d['laboratory_values'],procedures=d['procedures']))
        for p in relations:relationships.append(dict(from_document_id=d['document_id'],to_document_id=p,type='references_prior_record'))
        for p in d['procedures']:
            if p.get('name')=='Frozen embryo transfer':relationships.append(dict(from_document_id=d['document_id'],to_document_id='D027',type='uses_embryo',entity_id='SYN-E01'))
    write_json(ROOT/'ground_truth/documents.json',entries)
    write_json(ROOT/'ground_truth/events.json',events)
    write_json(ROOT/'ground_truth/relationships.json',relationships)


def validate(facts, manifests, ledger_hash):
    checks=[]
    def check(name,success,detail):checks.append(dict(check=name,passed=bool(success),detail=detail))
    docs=facts['documents'];by_id={d['document_id']:d for d in docs};ids=set(by_id)
    check('minimum_document_count',len(docs)>=40,f'{len(docs)} individual PDFs')
    check('unique_document_ids',len(ids)==len(docs),'Unique stable IDs')
    check('canonical_ledger_unchanged',digest(ROOT/'patient/canonical_facts.json')==ledger_hash,'Renderer and ground truth share fixed SHA-256')
    check('canonical_lock_matches',ledger_hash==(ROOT/'patient/ledger.sha256').read_text().split()[0],'Canonical ledger matches its stored lock')
    check('five_year_coverage',{d['clinical_date'][:4] for d in docs}==set(map(str,range(2022,2027))),'2022-2026')
    check('transfer_due_date',date.fromisoformat(facts['pregnancy']['transfer_date'])+timedelta(days=261)==date.fromisoformat(facts['pregnancy']['estimated_due_date']),'Day-5 embryo: transfer +261 days')
    check('transfer_gestational_age',(date.fromisoformat(facts['pregnancy']['transfer_date'])-date.fromisoformat(facts['pregnancy']['art_equivalent_lmp'])).days==19,'Transfer GA 2+5')
    check('delivery_dating',(date.fromisoformat(facts['pregnancy']['delivery_date'])-date.fromisoformat(facts['pregnancy']['art_equivalent_lmp'])).days==275,'39+2, five days before EDD')
    trigger=datetime.fromisoformat('2024-06-11T21:30');retrieval=datetime.fromisoformat('2024-06-13T09:30')
    check('trigger_retrieval_interval',(retrieval-trigger).total_seconds()==36*3600,'36 hours')
    check('progesterone_transfer_interval',(datetime.fromisoformat('2024-11-15T09:00')-datetime.fromisoformat('2024-11-10T09:00')).total_seconds()==5*86400,'Five completed days of progesterone')
    ivf=facts['ivf'];check('ivf_accounting',(ivf['oocytes_retrieved'],ivf['mature_oocytes'],ivf['normally_fertilized'],ivf['blastocysts_cryopreserved'])==(12,10,8,4) and ivf['remaining']+ivf['transferred']==4,'12 retrieved, 10 MII, 8 2PN, 4 stored, then 1 transferred and 3 remaining')
    check('embryo_culture_ages',all((date.fromisoformat(e['frozen_date'])-date.fromisoformat(ivf['retrieval_date'])).days==e['culture_day'] for e in ivf['embryos']),'Day 5 and day 6 freezing dates')
    med_ids={m['medication_id'] for m in facts['medication_history']}
    check('medication_intervals',all(m['start']<=m['end'] and all(m['start']<=a['date']<=m['end'] for a in m.get('adjustments',[])) for m in facts['medication_history']),'Inclusive course dates and within-course dose adjustments')
    check('medication_references',all(set(d['medication_ids'])<=med_ids for d in docs),'Every medication reference resolves')
    truth=read_json(ROOT/'ground_truth/documents.json')
    check('medication_knowledge_dates',all(
        (not med['start'] or med['start']<=record['created_date']) and
        (not med['end'] or med['end']<=record['created_date']) and
        all(change['date']<=record['created_date'] for change in med['adjustments'])
        for record in truth for med in record['medications']),
        'Extracted medication history contains no later actual start, stop or adjustment')
    verified={item['url'] for item in read_json(ROOT/'validation/source_verification.json')
              if item['verified'] and item['matches_research']}
    check('verified_manifest_references',all(set(item['synthetic_pdf_reference_urls'])<=verified
          for item in manifests),'Every assigned primary source URL has a matching verified PDF digest')
    extracted=[];total_pages=0;box_failures=[]
    for d in docs:
        m=next(m for m in manifests if m['document_id']==d['document_id']);p=ROOT/m['path']
        content=subprocess.check_output(['pdftotext','-layout',str(p),'-']).decode()
        normalized=' '.join(content.split());extracted.append(dict(document_id=d['document_id'],characters=len(content),pages=content.count('\f'),sha256=digest(p)))
        total_pages+=content.count('\f')
        check(d['document_id']+'_pdf_identity',all(x in content for x in [d['document_id'],'Maya Chen','SYN-MAYA-001','SYNTHETIC TEST DATA','1993-03-14']),m['path'])
        check(d['document_id']+'_age',f"{age_on(d['clinical_date'],facts['patient']['date_of_birth'])} years" in content,'Age calculated at clinical date')
        check(d['document_id']+'_clinical_text',all(' '.join(s['text'].split()) in normalized for s in d['sections']),f"{len(d['sections'])} complete clinical sections extractable")
        check(d['document_id']+'_lab_values',all(str(v['value']) in content and v['test'] in normalized for v in d['laboratory_values']),'Every analyte and value extracts')
        check(d['document_id']+'_past_references',all(x in ids and by_id[x]['created_date']<=d['created_date'] for x in d['prior_document_ids']),'All outcome references available at document creation')
        check(d['document_id']+'_date_range','2022-01-01'<=d['clinical_date']<='2026-12-31' and d['collection_date']<=d['created_date'],'Clinical and specimen dates valid')
        if 'gestational_age' in d:
            n=(date.fromisoformat(d['clinical_date'])-date.fromisoformat(facts['pregnancy']['art_equivalent_lmp'])).days
            check(d['document_id']+'_gestation',d['gestational_age']['days']==n and d['gestational_age']['display']==f'{n//7}+{n%7}',d['gestational_age']['display'])
        bbox=subprocess.check_output(['pdftotext','-bbox',str(p),'-']).decode();xml=ET.fromstring(bbox);ns={'x':'http://www.w3.org/1999/xhtml'}
        for page in xml.findall('.//x:page',ns):
            for word in page.findall('.//x:word',ns):
                if float(word.attrib['xMin'])<45 or float(word.attrib['xMax'])>563 or float(word.attrib['yMin'])<10 or float(word.attrib['yMax'])>780:box_failures.append((d['document_id'],word.text,word.attrib))
        check(d['document_id']+'_has_primary_synthetic_source',bool(m['synthetic_pdf_reference_urls']),'Every entry has verified primary reference')
    write_json(ROOT/'validation/pdf_extraction_results.json',extracted)
    check('pdf_text_within_page_bounds',not box_failures,str(box_failures[:10]))
    # Check explicit repeated laboratory claims against dated source values.
    repeated=[('D003','D002','Ferritin',11),('D003','D002','Hemoglobin',124),('D007','D006','Ferritin',34),('D016','D015','Progesterone',38),('D034','D033','Beta-hCG',286),('D044','D043','Hemoglobin',103),('D044','D043','Ferritin',9),('D048','D046','Hemoglobin',112),('D060','D058','Ferritin',42),('D066','D065','Ferritin',13),('D068','D067','Ferritin',35),('D070','D069','Ferritin',48)]
    check('repeated_laboratory_claims',all(any(v['test']==test and v['value']==val for v in by_id[source]['laboratory_values']) and str(val) in ' '.join(s['text'] for s in by_id[target]['sections']) for target,source,test,val in repeated),'Twelve clinical follow-up claims checked against original result ledger')
    check('historical_embryology_knowledge','blastocyst counts are not yet known' in by_id['D025']['sections'][2]['text'] and 'remain pending' in by_id['D026']['sections'][1]['text'],'Retrieval does not know fertilization; day 1 does not know final embryo outcome')
    check('pregnancy_evidence_states',facts['diagnostic_states'][2]['biochemical']<'2024-12-13' and 'not yet confirmed' in by_id['D032']['sections'][2]['text'],'Biochemical versus ultrasound confirmation distinguished')
    check('no_pgt_or_ploidy_claim',ivf['pgt_performed'] is False and 'does not confirm chromosomal status' in by_id['D027']['sections'][1]['text'],'Morphology never establishes euploidy')
    cycles=read_json(ROOT/'fixtures/menstrual_cycles.json');c=cycles['cycles']
    check('menstrual_cycle_count',24<=len(c)<=36,f'{len(c)} tracked cycles; coverage gaps explicitly untracked')
    check('no_pregnancy_menses',all(not ('2024-11-15'<=x['start_date']<'2026-01-12') for x in c),'No cycles during pregnancy or lactational amenorrhea')
    check('cycle_intervals',all(x['start_date']<=x['bleeding_end_date']<x['cycle_end_date'] for x in c),'Bleeding and cycle boundaries ordered')
    check('cycle_continuity',all(x['next_start_date'] is None or x['cycle_length_days']==(date.fromisoformat(x['next_start_date'])-date.fromisoformat(x['start_date'])).days for x in c),'Lengths reflect next actual start, not next tracked row')
    appts=read_json(ROOT/'fixtures/appointments.json');aids={a['appointment_id'] for a in appts}
    admission=next(a for a in appts if a['appointment_id']=='APT-D052')
    check('spontaneous_admission_not_prescheduled',admission['mode']=='unscheduled_hospital_admission' and admission['schedule_history'][0]['changed_on']==admission['date'] and admission['schedule_history'][0]['status']=='arrived','Spontaneous labour arrival is recorded on admission rather than booked beforehand')
    check('appointment_links',all(set(a['document_ids'])<=ids for a in appts),'Appointment records resolve to documents')
    check('appointment_scheduling_history',any(len(a['schedule_history'])>1 for a in appts) and any(a['status']=='cancelled' for a in appts),'Rescheduling and cancellation represented separately')
    gt=read_json(ROOT/'ground_truth/documents.json');check('ground_truth_coverage',{x['document_id'] for x in gt}==ids,'One record per PDF')
    check('ground_truth_hashes',all(x['pdf_sha256']==digest(ROOT/x['pdf_path']) for x in gt),'Actual PDF SHA-256')
    check('synthetic_provider_facility_namespace',all(x['registration'].startswith('SYN-') for x in facts['providers'].values()) and all(x['name'].startswith('Example ') for x in facts['facilities'].values()),'Reserved test identifiers and explicitly fictional facilities')
    check('synthetic_contacts',all('555-01' in x['phone'] and 'TEST ONLY' in x['address'] for x in facts['facilities'].values()) and facts['patient']['email'].endswith('.invalid'),'Reserved fiction telephone range, invalid email domain, test-only addresses')
    result=dict(schema_version='1.0',passed=all(c['passed'] for c in checks),document_count=len(docs),pdf_page_count=total_pages,checks=checks,passed_count=sum(c['passed'] for c in checks),failed_count=sum(not c['passed'] for c in checks),limitations=['Automated checks and authored clinical review are not independent clinician certification.','PDF text and bounds validated; all pages also rasterized for contact-sheet review. No scanned/OCR challenge variants are included.','No fully synthetic specialty ultrasound, delivery or postpartum source located. Explicit source limitations remain.','External source verification records downloads and hashes at research time; later URL availability may change.','No real patient records are used. Coincidental name overlap with real people cannot be excluded.'],canonical_ledger_sha256=ledger_hash)
    write_json(ROOT/'validation/validation_results.json',result)
    lines=['# Corpus validation','',f"Result: {'PASS' if result['passed'] else 'FAIL'}. {result['passed_count']} checks passed; {result['failed_count']} failed. {len(docs)} PDFs, {total_pages} pages.",'', '## Automated checks','','Checks cover age, record/collection dates, prior-record availability, laboratory follow-ups, medication intervals and identifiers, embryo counts and culture days, 36-hour trigger timing, five progesterone days, transfer dating, every prenatal gestation, birth timing, cycles, appointment links, text extraction, page boundaries and file hashes.','', '## Clinical review','','Authoritative clinical references and their precise scope are in research/clinical_references.json. ART dating uses ACOG; assessment timing and infertility alternatives use ASRM; Ontario cervical-screening changes use provincial guidance; antenatal glucose screening uses SOGC patient guidance. Those references validate clinical rules rather than certify this fictional case. All local assay intervals, fetal measurements and centiles are synthetic.','', '## Limitations','']+['- '+x for x in result['limitations']]
    failed=[c for c in checks if not c['passed']]
    if failed:lines+=['','## Failed checks','']+['- '+x['check']+': '+str(x['detail']) for x in failed]
    (ROOT/'validation/report.md').write_text('\n'.join(lines)+'\n')
    return result


def package():
    archive=ROOT.with_suffix('.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for path in sorted(ROOT.rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                info=zipfile.ZipInfo(str(Path(ROOT.name)/path.relative_to(ROOT)),date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,path.read_bytes())
    return archive


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--validate-only',action='store_true');parser.add_argument('--package-only',action='store_true');args=parser.parse_args()
    if args.package_only:print(package());return
    facts=read_json(ROOT/'patient/canonical_facts.json');ledger_hash=digest(ROOT/'patient/canonical_facts.json')
    refs={r['reference_id']:r for r in read_json(ROOT/'research/reference_catalog.json')}
    if not args.validate_only:
        manifests=manifest(facts,refs,ledger_hash)
        for d,m in zip(facts['documents'],manifests):render(d,m,facts)
        fixtures(facts,manifests);ground_truth(facts,manifests,ledger_hash)
    else:manifests=read_json(ROOT/'manifest.json')
    result=validate(facts,manifests,ledger_hash)
    print(json.dumps({k:result[k] for k in ['passed','document_count','pdf_page_count','passed_count','failed_count']}))
    if not result['passed']:raise SystemExit(1)
    if not args.validate_only:
        from guide_data import main as build_guide
        from story_data import main as build_story
        from year_packages import main as build_years
        build_guide();build_story();build_years()
    print(package())

if __name__=='__main__':main()
