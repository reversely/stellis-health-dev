"""Derive longitudinal fixtures and record explicit gaps in patient tracking."""
from datetime import date, timedelta
import json


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False)+'\n')


def build(root, facts, manifests):
    starts_2022=['2022-01-08','2022-02-05','2022-03-07','2022-04-04','2022-05-03','2022-06-01','2022-06-30','2022-07-28','2022-08-27','2022-09-24','2022-10-23','2022-11-21','2022-12-20']
    starts_2023=['2023-01-18','2023-02-16','2023-03-17','2023-04-15','2023-05-14','2023-06-12','2023-07-11','2023-08-09','2023-09-06','2023-10-04','2023-11-01','2023-11-28','2023-12-27']
    starts_2024=['2024-01-24','2024-02-22','2024-03-22','2024-04-20','2024-06-01','2024-06-20','2024-07-18','2024-08-16','2024-09-14','2024-10-27']
    # June 1 is a stimulation-cycle start; June 20 is withdrawal bleeding.
    starts_2026=['2026-01-12','2026-02-15','2026-03-19','2026-04-19','2026-05-19','2026-06-18','2026-07-17','2026-08-16','2026-09-14','2026-10-14','2026-11-12','2026-12-12']
    all_starts=starts_2022+starts_2023+starts_2024+starts_2026
    # Patient logs are selected windows, not a claim of complete daily tracking.
    selected=set(starts_2022[:7]+starts_2023[5:]+['2024-01-24','2024-02-22','2024-06-01','2024-06-20','2024-10-27']+starts_2026)
    cycles=[]
    for i,start in enumerate(all_starts):
        if start not in selected:continue
        a=date.fromisoformat(start)
        next_start=all_starts[i+1] if i+1<len(all_starts) else None
        # Pregnancy and lactational amenorrhea terminate the October 2024 cycle.
        pregnant=start=='2024-10-27'
        if pregnant:next_start=None
        length=(date.fromisoformat(next_start)-a).days if next_start else None
        if length and (length>40 or start=='2024-03-22'):
            length=None;next_start=None
        flow_days=5 if len(cycles)%3 else 4
        end=a+timedelta(days=flow_days-1)
        cycle_end=(date.fromisoformat(next_start)-timedelta(days=1)).isoformat() if next_start else ('2024-11-14' if pregnant else (a+timedelta(days=30)).isoformat() if start<'2026' else '2026-12-31')
        category='withdrawal_bleeding' if start=='2024-06-20' else 'stimulation_cycle' if start=='2024-06-01' else 'programmed_fet_cycle' if pregnant else 'natural_cycle'
        cycles.append(dict(cycle_id=f'CYC-{len(cycles)+1:03}',patient_id=facts['patient']['patient_id'],start_date=start,bleeding_end_date=end.isoformat(),cycle_end_date=cycle_end,next_start_date=next_start,cycle_length_days=length,flow='light to moderate' if start=='2026-01-12' else 'moderate',daily_flow=['moderate','moderate']+['light']*(flow_days-2),symptoms=['mild cramps on day 1']+(['breast tenderness before bleeding'] if len(cycles)%4==0 else []),source='synthetic patient-reported cycle log',category=category,completed=next_start is not None,cycle_end_reason='transition to ART-dated pregnancy' if pregnant else 'observation window ends' if not next_start else 'next cycle starts',notes='Not evidence of spontaneous ovulation' if category!='natural_cycle' else 'Reported menstrual bleeding; ovulation is not inferred from dates alone'))
    dump(root/'fixtures/menstrual_cycles.json',dict(patient_id=facts['patient']['patient_id'],cycles=cycles,known_start_dates=all_starts,tracking_gaps=[dict(start='2022-07-01',end='2023-05-31',reason='Only selected cycle records retained'),dict(start='2024-03-01',end='2024-10-26',reason='Selected treatment and natural cycles retained')],amenorrhea=[dict(start='2024-11-15',end='2025-07-29',reason='Pregnancy'),dict(start='2025-07-30',end='2026-01-11',reason='Lactation-associated amenorrhea; postpartum lochia is separate')],postpartum_lochia=dict(start='2025-07-29',end='2025-08-23',category='postpartum bleeding, not menstruation')))
    appointments=[]
    # Result-only documents have no invented face-to-face appointment.
    for d in facts['documents']:
        if d['document_type'] in {'lab','cytology','screen','embryology','discharge'}:continue
        aid='APT-'+d['document_id']
        local_time='09:30' if d['document_id']=='D025' else '09:00' if d['document_id']=='D032' else '02:10' if d['document_id']=='D052' else '10:00'
        end_time='10:00' if d['document_id']=='D025' else '09:30' if d['document_id']=='D032' else '12:30' if d['document_id']=='D052' else '10:30'
        booked=(date.fromisoformat(d['clinical_date'])-timedelta(days=14)).isoformat()
        booked={'D009':d['clinical_date'],'D024':d['clinical_date'],'D025':'2024-06-11','D032':'2024-11-08','D052':d['clinical_date'],'D055':'2025-07-31'}.get(d['document_id'],booked)
        history=[dict(changed_on=booked,status='arrived' if d['document_id']=='D052' else 'scheduled',scheduled_date=d['clinical_date'],time=local_time)]
        if d['document_id']=='D014':history=[dict(changed_on='2023-11-14',status='scheduled',scheduled_date='2023-11-30',time='14:00'),dict(changed_on='2023-11-20',status='rescheduled',scheduled_date='2023-12-01',time='10:00',reason='Clinic scheduling change')]
        if d['document_id']=='D041':history=[dict(changed_on='2025-02-14',status='scheduled',scheduled_date='2025-03-13',time='10:00'),dict(changed_on='2025-02-28',status='rescheduled',scheduled_date='2025-03-14',time='10:00',reason='Patient work conflict')]
        appointments.append(dict(appointment_id=aid,patient_id=facts['patient']['patient_id'],title=d['title'],date=d['clinical_date'],start_time=local_time,end_time=end_time,timezone='America/Toronto',status='completed',mode='unscheduled_hospital_admission' if d['document_id']=='D052' else 'telephone' if d['document_id'] in {'D005','D024','D055'} else 'in_person',facility_id=facts['facilities'][d['facility_key']]['facility_id'],provider_id=facts['providers'][d['provider_key']]['provider_id'],document_ids=[d['document_id']],episode_id=d['episode_id'],schedule_history=history))
    appointments.append(dict(appointment_id='APT-CANCEL-01',patient_id=facts['patient']['patient_id'],title='Prenatal review if undelivered',date='2025-07-31',start_time='10:00',end_time='10:30',timezone='America/Toronto',status='cancelled',mode='in_person',facility_id=facts['facilities']['ob']['facility_id'],provider_id=facts['providers']['ob']['provider_id'],document_ids=['D051','D052'],episode_id='pregnancy',schedule_history=[dict(changed_on='2025-07-25',status='scheduled',scheduled_date='2025-07-31',time='10:00'),dict(changed_on='2025-07-29',status='cancelled',reason='Delivery occurred July 29')]))
    dump(root/'fixtures/appointments.json',appointments)
    transcripts={
      'D003':[('Maya Chen','I feel tired after work. My periods seem normal for me.'),('Dr Elara Vale','Your ferritin is 11 and your hemoglobin is 124. This supports low iron stores without anemia.'),('Maya Chen','Should I take iron every day?'),('Dr Elara Vale','For this course take the 300 mg ferrous sulfate tablet every other day. It contains 60 mg elemental iron. Tell me if nausea or constipation makes it hard to continue.'),('Maya Chen','I will record the dose and bring up any side effects.')],
      'D018':[('Dr Neri Solan','The tube study shows both tubes are open. Taken with ovulation evidence and the semen assessment this supports unexplained infertility.'),('Maya Chen','Does that mean something was missed?'),('Dr Neri Solan','It means the standard assessment has not found an explanation. It does not prove every possible condition is absent.'),('Maya Chen','Can we discuss IVF as well as insemination?'),('Dr Neri Solan','Yes. A usual first treatment is several cycles of oral stimulation with IUI. We can also discuss IVF costs and risks.'),('Maya Chen','After that discussion we would prefer IVF. I understand it might not work.')],
      'D028':[('Maya Chen','My bloating has gone away and the bleeding finished yesterday.'),('Dr Neri Solan','The final laboratory report records 12 retrieved oocytes and 10 mature. Eight fertilized normally and four blastocysts were frozen.'),('Maya Chen','I want a break before transfer.'),('Dr Neri Solan','We can plan for November and review preparation in October. No embryo has been transferred yet.')],
      'D036':[('Maya Chen','I stopped the estradiol and injections yesterday as the clinic instructed.'),('Dr Orin Lark','That matches the planned stop at ten weeks. Keep taking the prenatal vitamin.'),('Maya Chen','How did you calculate the due date?'),('Dr Orin Lark','A day-five embryo was transferred on November 15. That gives August 3 as the estimated due date.'),('Maya Chen','I would like the blood screening after we discuss what it can and cannot tell us.')],
      'D056':[('Maya Chen','The tear feels healed. I sometimes leak a little when I cough.'),('Dr Orin Lark','The examination shows that the repair has healed. Pelvic health physiotherapy can help with coordination and strength.'),('Maya Chen','I am breastfeeding and have not had a period.'),('Dr Orin Lark','We discussed contraception because ovulation can return before the first period. You plan to use condoms.'),('Maya Chen','I would prefer to do the cervical screening in January.')],
      'D070':[('Maya Chen','My energy is better and my cycles feel regular again.'),('Dr Elara Vale','The December blood test shows hemoglobin 131 and ferritin 48. Today is the last planned iron dose.'),('Maya Chen','Are there still three embryos stored?'),('Dr Elara Vale','The fertility records show three remaining after the single transfer. No later transfer is in this record.'),('Maya Chen','We are not planning another pregnancy now.')],
    }
    by_id={d['document_id']:d for d in facts['documents']}
    for key,turns in transcripts.items():
        d=by_id[key]
        dump(root/f'fixtures/transcripts/{key}.json',dict(transcript_id='TX-'+key,synthetic=True,patient_id=facts['patient']['patient_id'],document_id=key,appointment_id='APT-'+key,date=d['clinical_date'],source='Original scripted fictional dialogue; no recording or real transcript used',turns=[dict(speaker=s,text=t,start_ms=i*12000,end_ms=(i+1)*12000) for i,(s,t) in enumerate(turns)]))
    observations=[dict(observation_id='OBS-001',date='2022-02-16',type='medication_tolerability',value='Mild nausea with morning iron',document_ids=['D005']),dict(observation_id='OBS-002',date='2023-12-12',type='urinary_LH',value='Positive, patient-reported',document_ids=['D015']),dict(observation_id='OBS-003',date='2024-06-07',type='symptom',value='Mild bloating without dyspnea or reduced urine',document_ids=['D022']),dict(observation_id='OBS-004',date='2025-08-03',type='medication_stop',value='Stopped PRN postpartum analgesia',available_on='2025-08-05',document_ids=['D055']),dict(observation_id='OBS-005',date='2026-01-12',type='menstrual_return',value='First postpartum period',document_ids=['D061'])]
    for d in facts['documents']:
        for section in d['sections']:
            if 'BP ' in section['text']:
                import re
                match=re.search(r'BP (\d+)/(\d+)',section['text'])
                if match:observations.append(dict(observation_id='OBS-BP-'+d['document_id'],date=d['clinical_date'],type='blood_pressure',systolic=int(match[1]),diastolic=int(match[2]),unit='mmHg',source='clinician measurement',document_ids=[d['document_id']]))
    dump(root/'fixtures/observations.json',observations)
    dump(root/'fixtures/medications.json',facts['medication_history'])
