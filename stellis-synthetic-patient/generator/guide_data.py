"""Publish original corpus downloads and chronological guide data for the app."""
import hashlib
import json
import re
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT.parent/'src/stellis/static/maya'
CHAPTERS={
 '2022':('Routine health','Maya tracks her periods and investigates fatigue','How did Maya\'s iron results change during 2022? Cite the records'),
 '2023':('Fertility evaluation','Maya seeks advice while trying to conceive','What fertility investigations are documented so far? Separate suspected conditions from confirmed findings'),
 '2024':('IVF treatment','One retrieval cycle leads to a single frozen transfer','Reconstruct the IVF counts and pregnancy dating from the uploaded records with source links'),
 '2025':('Pregnancy and postpartum','Maya receives prenatal care and gives birth','Summarize the pregnancy and delivery using the source records and distinguish screening from diagnosis'),
 '2026':('Routine care','Maya returns to menstrual and preventive care','What are Maya\'s current care priorities and which treatments have ended? Cite dates and records'),
}
NOTEBOOKS={
 'General health':('preventive-care--preventive-care','Preventive Care'),
 'Iron deficiency':('blood-health--blood-health','Blood Health'),
 'Menstrual health':('reproductive-health--menstrual-health','Menstrual Health'),
 'Fertility':('reproductive-health--fertility','Fertility'),
 'IVF':('reproductive-health--ivf','IVF'),
 'Pregnancy':('pregnancy-postpartum--pregnancy','Pregnancy'),
 'Birth':('pregnancy-postpartum--birth-preparation','Birth Preparation'),
 'Postpartum':('pregnancy-postpartum--postpartum-recovery','Postpartum Recovery'),
}
MILESTONES={'D007','D015','D027','D035','D041','D054','D060','D070'}

QUESTIONS={
 'D007':'Iron repletion follow-up: compare the January and May 2022 ferritin and hemoglobin values and the August treatment decision with source links',
 'D015':'Mid-luteal progesterone: what result was documented and which fertility investigations are still pending? Cite the records',
 'D027':'Cryopreservation report: give the numbers of retrieved oocytes, mature oocytes, normally fertilized oocytes and frozen blastocysts with source links',
 'D035':'Viability ultrasound: state the embryo transfer date, gestational age, estimated due date and documented pregnancy findings with source links',
 'D041':'Fetal anatomy ultrasound: summarize its findings and distinguish prenatal screening results from confirmed diagnoses with source links',
 'D054':'Maternal hospital discharge: state delivery date, gestational age, mode, infant weight and maternal recovery findings with source links',
 'D060':'Postpartum iron review: state current ferritin, hemoglobin and the documented iron treatment decision with source links',
 'D070':'Annual longitudinal care review: state the latest ferritin and the iron treatment plan including the last-dose date with source links',
}

def main():
    facts=json.loads((ROOT/'patient/canonical_facts.json').read_text());manifest=json.loads((ROOT/'manifest.json').read_text());gt={x['document_id']:x for x in json.loads((ROOT/'ground_truth/documents.json').read_text())}
    DEST.mkdir(parents=True,exist_ok=True)
    steps=[]
    for d,m in zip(facts['documents'],manifest):
        year=d['clinical_date'][:4];chapter,summary,prompt=CHAPTERS[year]
        path=DEST/m['path'];path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/m['path'],path)
        steps.append(dict(document_id=d['document_id'],date=d['clinical_date'],title=d['title'],filename=m['filename'],download='/static/maya/'+m['path'],sha256=gt[d['document_id']]['pdf_sha256'],year=year,chapter=chapter,chapter_summary=summary,story=' '.join(re.split(r'(?<=[.!?])\s+(?=[A-Z])',d['sections'][0]['text'])[:2]),notebooks=[dict(template_id=NOTEBOOKS[n][0],name=NOTEBOOKS[n][1]) for n in gt[d['document_id']]['expected_notebook_associations']],question=QUESTIONS.get(d['document_id'],prompt),milestone=d['document_id'] in MILESTONES))
    data=dict(version='maya-v1',patient=dict(name='Maya Chen',date_of_birth='1993-03-14',patient_id='SYN-MAYA-001',synthetic=True),steps=steps,chapters=[dict(year=y,title=a,summary=b) for y,(a,b,c) in CHAPTERS.items()])
    (DEST/'guide.json').write_text(json.dumps(data,indent=2)+'\n');(ROOT/'fixtures/ui_guide.json').write_text(json.dumps(data,indent=2)+'\n')

if __name__=='__main__':main()
