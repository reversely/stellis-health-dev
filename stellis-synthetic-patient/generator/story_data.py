"""Authored first-person story turns whose actions use existing health controls."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def step(kind,maya,stellis,**details):return dict(kind=kind,maya=maya,stellis=stellis,**details)
def main():
    years=[
      dict(year=2022,age=28,title='Getting to know my health',summary='Fatigue, periods and low iron',turns=[
        step('cycle',"I'm Maya. I'm 28 and live in Toronto. I've been tired lately, and I'd like to understand my periods better.","Start with the Cycle tracker so your period dates and flow have a home.",start='2022-01-08',end='2022-01-11',note='Mild cramps on day 1'),
        step('appointment',"I'd like to see my family doctor about the tiredness.","Add your primary-care appointment to the calendar.",title='Maya: primary-care appointment',starts_at='2022-01-18T10:00:00-05:00'),
        step('upload',"I've seen my doctor and collected my 2022 reports. Can you help me keep them together?","Upload the 2022 demo ZIP in the demo box.",),
        step('dates',"These are visits and tests from different days. I want them in the right order.","The dates of your visits and tests are filled from the reports."),
        step('notebooks',"My reports cover low iron and period health as well as routine care.","Review the suggested notebooks before adding them to Maya’s empty library."),
        step('timeline',"My hemoglobin was normal but my ferritin was low. I'd like to see the follow-up results together.","Open the timeline and compare January and May with the August review.",document_id='D007'),
        step('chat',"My iron repletion follow-up says my ferritin improved. Can you explain what changed during 2022 using my reports?","Ask Stellis with Preventive Care selected and inspect the source links.",template_id='preventive-care--preventive-care'),
        step('overview',"I'm feeling better, and we're thinking about trying for a baby next year.","Return to My Health to see the notebooks, cycle log and records you added.")]),
      dict(year=2023,age=30,title='Trying for a baby',summary='Cycle history and fertility investigations',turns=[
        step('cycle',"We've been trying for a baby since January. I'm still tracking my periods.","Add the June period to the same Cycle history.",start='2023-06-12',end='2023-06-16',note='Mild cramps on day 1'),
        step('appointment',"My family doctor has referred me to a fertility clinic. I'd like help getting ready.","Add the fertility intake appointment to your calendar.",title='Maya: fertility intake',starts_at='2023-11-14T10:00:00-05:00'),
        step('upload',"I've now had the intake, blood tests and an ultrasound. Here are my 2023 records.","Upload the 2023 demo ZIP alongside the earlier demo history."),
        step('dates',"Can we separate the test dates from the dates I reviewed them with the clinic?","Review the visit and test dates found in the reports."),
        step('notebooks',"I'd like a place for fertility care without losing my general health history.","Add Fertility and reuse Menstrual Health where the reports overlap."),
        step('timeline',"I want to take the hormone results and ultrasound findings to my next visit.","Use the timeline’s document and notebook filters to review the investigations.",document_id='D015'),
        step('chat',"My mid-luteal progesterone was tested. What does my report document, and what investigations were still pending?","Ask from the Fertility notebook and follow the citations.",template_id='reproductive-health--fertility')]),
      dict(year=2024,age=31,title='Starting IVF',summary='Treatment, retrieval and frozen transfer',turns=[
        step('appointment',"We've decided to go ahead with IVF. The clinic confirmed my retrieval after the trigger instructions.","Add the confirmed retrieval time to the calendar.",title='Maya: egg retrieval',starts_at='2024-06-13T09:30:00-04:00'),
        step('upload',"One treatment cycle is a lot to keep track of. I've collected the monitoring, retrieval and transfer records from 2024.","Upload the 2024 demo ZIP to extend the existing history."),
        step('dates',"Some reports were written after the procedure. Please help me keep the clinical dates straight.","Review the visit and procedure dates filled from your reports."),
        step('notebooks',"Can I keep IVF together while retaining the connection to my fertility investigations?","Review the new IVF notebook and the existing Fertility notebook."),
        step('timeline',"The retrieval and embryology reports describe different stages. I'd like to see them in sequence.","Open the embryo culture report from the timeline.",document_id='D027'),
        step('chat',"My cryopreservation report is here. How many eggs were retrieved, mature and normally fertilized, and how many blastocysts were frozen?","Ask Stellis from Fertility and check the four counts against the report.",template_id='reproductive-health--fertility'),
        step('milestone',"The November transfer led to a positive pregnancy test and then an ultrasound. The clinic gave me a due date.","Add the estimated due date as a milestone with its estimated status.",title='Maya: estimated due date',target_date='2025-08-03'),
        step('overview',"My priorities are changing from fertility treatment to pregnancy care.","Review how My Health has grown while keeping the earlier history available.")]),
      dict(year=2025,age=32,title='Pregnancy and becoming a parent',summary='Prenatal care, birth and recovery',turns=[
        step('appointment',"I'm pregnant and have an anatomy ultrasound booked. I'd like to keep the appointment with my other care.","Add the March ultrasound appointment to the calendar.",title='Maya: anatomy ultrasound',starts_at='2025-03-14T10:00:00-04:00'),
        step('upload',"I've collected my prenatal, birth and postpartum reports from 2025. I'd like to make sense of this year.","Upload the 2025 demo ZIP to bring these records into the same demo history."),
        step('dates',"There are screening dates, visits, the birth and later follow-ups.","Confirm the dates filled from your reports."),
        step('notebooks',"Pregnancy and recovery now deserve their own places, but my iron history still matters.","Review Pregnancy, Birth Preparation and Postpartum Recovery alongside the existing notebooks."),
        step('timeline',"My anatomy scan was reassuring. I want to understand the difference between screening and a diagnosis.","Review the scan and prenatal screening sources from the timeline.",document_id='D041'),
        step('chat',"My maternal discharge summary is here. Can you help me review the birth and my recovery using that report?","Ask from Postpartum Recovery and inspect the discharge citation.",template_id='pregnancy-postpartum--postpartum-recovery'),
        step('birth',"My baby was born on July 29. I'd like the calendar to distinguish the actual birth from the estimated due date.","Confirm the birth date in the existing milestone instead of changing the estimate.",actual_date='2025-07-29'),
        step('overview',"I'm recovering after birth and following up on iron and pelvic health. I haven't resumed periods yet.","Review postpartum care in My Health while keeping lochia separate from period tracking.")]),
      dict(year=2026,age=33,title='Finding a new routine',summary='Periods return and routine care resumes',turns=[
        step('cycle',"My first period after birth started on January 12. I'd like to resume tracking without counting postpartum bleeding as a period.","Log the January period in Cycle with its actual start and end.",start='2026-01-12',end='2026-01-16',note='First postpartum period; light to moderate flow'),
        step('appointment',"I've felt tired again and want to discuss my periods and iron with my family doctor.","Add the June review to the calendar.",title='Maya: fatigue and menstrual review',starts_at='2026-06-16T10:00:00-04:00'),
        step('upload',"I've collected my screening, repeat iron tests and annual review from 2026.","Upload the final yearly demo ZIP."),
        step('dates',"I'd like this year’s tests and treatment reviews to stay in clinical date order.","Confirm the extracted dates from the reports."),
        step('notebooks',"These records belong with the health history I've already built.","Review the existing notebooks and file the new items without making duplicates."),
        step('timeline',"My ferritin fell again and improved with follow-up. I want to compare the results across years.","Open the annual review and compare it with earlier iron results.",document_id='D070'),
        step('chat',"My annual review says my latest ferritin is 48. What is the documented iron plan and the last-dose date?","Ask from Preventive Care and check the dated source.",template_id='preventive-care--preventive-care'),
        step('overview',"I can now see five years of my health together, from routine care through fertility treatment and becoming a parent.","Review the complete demo history or clear it in one action when you finish.")]),
    ]
    manifest=json.loads((ROOT/'manifest.json').read_text())
    cycles=json.loads((ROOT/'fixtures/menstrual_cycles.json').read_text())['cycles']
    payload={'patient':{'name':'Maya Chen','dob':'1993-03-14','location':'Toronto','synthetic':True},'years':years,
        'life_events':[
            {'date':'2022-01-18','label':'Seeking help for fatigue'},
            {'date':'2023-11-14','label':'Fertility assessment'},
            {'date':'2024-06-13','label':'Egg retrieval'},
            {'date':'2024-11-15','label':'Frozen embryo transfer'},
            {'date':'2025-07-29','label':'Becoming a parent'},
            {'date':'2026-01-12','label':'Periods resume'}],
        'care_dates':[d['clinical_date'] for d in manifest],
        'cycle_dates':[c['start_date'] for c in cycles if c['category']=='natural_cycle']}
    for year in years:year['record_count']=sum(d['clinical_date'].startswith(str(year['year'])) for d in manifest)
    text=json.dumps(payload,indent=2)+'\n';(ROOT/'fixtures/yearly_story.json').write_text(text)
    (ROOT.parent/'src/stellis/static/maya/story.json').write_text(text)

if __name__=='__main__':main()
