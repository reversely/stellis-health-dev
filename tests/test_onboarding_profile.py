"""Confirmed profile fields, local suggestions and editable speech candidates."""
import asyncio
import datetime
import os
import tempfile
import unittest
from unittest.mock import patch

from stellis import auth, intake, onboarding_profile as profile, health_catalogue, health_preferences


class ProfileTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        env = patch.dict(os.environ, {'STELLIS_DATA_DIR':self.temp.name,'STELLIS_AUTH_DB_DIR':self.temp.name}, clear=True)
        env.start(); self.addCleanup(env.stop)
        auth.register('profile-user','profile-test-password')

    def test_name_is_saved_only_after_confirmation_and_survives_reload(self):
        voice=profile.VoiceField('name'); voice.add_person_turn('My name is Alex')
        async def collect():return [item async for item in voice.reply({})]
        result=asyncio.run(collect())
        self.assertEqual(result[0]['value'],'Alex')
        self.assertNotIn('name',profile.status()['answers'])
        profile.save(1,'name','Alexandria')
        self.assertEqual(profile.status()['answers']['name'],'Alexandria')
        self.assertEqual(auth.profile(1)['name'],'Alexandria')
        self.assertIn('Alexandria',profile.VoiceField('gender').opening())

    def test_period_answers_control_the_cycle_question_without_assuming_from_gender(self):
        profile.save(1,'gender','Man');profile.save(1,'period','No')
        self.assertNotIn('cycle_tracking',[f['id'] for f in profile.status()['fields']])
        profile.save(1,'period','Yes')
        self.assertIn('cycle_tracking',[f['id'] for f in profile.status()['fields']])
        profile.save(1,'period','Prefer not to say');profile.save(1,'gender','Woman')
        self.assertIn('cycle_tracking',[f['id'] for f in profile.status()['fields']])
        profile.save(1,'gender',None)
        self.assertNotIn('cycle_tracking',[f['id'] for f in profile.status()['fields']])

    def test_period_answer_uses_shared_tracker_preference_without_inventing_records(self):
        profile.save(1, 'gender', 'Woman')
        self.assertIsNone(health_preferences.preferences()['experiences_periods'])
        for answer, expected in [('Yes', True), ('No', False), ('Not currently', None), ('Prefer not to say', None), (None, None)]:
            profile.save(1, 'period', answer)
            self.assertIs(health_preferences.preferences()['experiences_periods'], expected)
        health_preferences.save(False)
        self.assertEqual(profile.status()['answers']['period'], 'No')
        health_preferences.save(None)
        profile.save(1, 'cycle_tracking', 'Yes')
        self.assertIsNone(health_preferences.preferences()['experiences_periods'])

    def test_invalid_dates_and_unlisted_interests_are_rejected(self):
        for date in ['2025-02-30',(datetime.date.today()+datetime.timedelta(days=1)).isoformat()]:
            with self.assertRaises(ValueError):profile.save(1,'birth_date',date)
        with self.assertRaises(ValueError):profile.save(1,'interests',['invented'])
        with self.assertRaises(ValueError):profile.save(1,'period','invented')
        with self.assertRaises(ValueError):profile.save(1,'name','x'*101)

    def test_plural_goals_and_wellness_choices_create_reviewable_suggestions(self):
        profile.save(1,'goals','Navigate pregnancy\nSleep better')
        profile.save(1,'interests',['nutrition','wellness','sleep','nutrition'])
        self.assertEqual(profile.status()['answers']['interests'],['nutrition','wellness','sleep'])
        notes=intake.load()['notes']
        goals=next(s['items'] for s in notes if s['heading']=='Goals')
        self.assertIn('Navigate pregnancy',goals);self.assertIn('Sleep better',goals)
        suggestions=health_catalogue.recommend()['groups']
        self.assertTrue({'nutrition--nutrition','sleep--sleep','preventive-care--preventive-care'}.issubset({g['template_id'] for g in suggestions}))
        from stellis import notebooks
        self.assertEqual(notebooks.list_notebooks(),[])

    def test_corrected_profile_notes_replace_the_previous_projection(self):
        profile.save(1,'conditions','Asthma')
        profile.save(1,'conditions','No confirmed conditions')
        text=str(intake.load()['notes'])
        self.assertNotIn('Asthma',text);self.assertIn('No confirmed conditions',text)

    def test_speech_parses_multi_select_and_dates_as_unconfirmed_candidates(self):
        self.assertEqual(profile.candidate('interests','Nutrition and general wellness'),['wellness','nutrition'])
        self.assertEqual(profile.candidate('birth_date','June 12th, 1990'),'1990-06-12')
        self.assertEqual(profile.candidate('gender',"I'm a woman"),'Woman')
        self.assertEqual(profile.candidate('birth_date','Not sure'),'')

    def test_clarifications_and_pauses_keep_the_current_answer_unconfirmed(self):
        async def reply(voice, text):
            voice.add_person_turn(text)
            return [piece async for piece in voice.reply({})]
        voice=profile.VoiceField('goals')
        for text in ['What do you usually offer?', 'Can you give examples?', 'Give me a moment', 'What options are there?']:
            pieces=asyncio.run(reply(voice,text))
            self.assertTrue(pieces)
            self.assertFalse(any(isinstance(piece,dict) for piece in pieces))
            self.assertNotIn(intake.END_MARK,pieces)
        self.assertNotIn('goals',profile.status()['answers'])
        pieces=asyncio.run(reply(voice,'Improve sleep and nutrition'))
        self.assertEqual(pieces[0]['action'],'profile_answer')
        self.assertNotIn('goals',profile.status()['answers'])

    def test_greeting_correction_and_explicit_stop(self):
        self.assertEqual(profile.candidate('name', "Hi, I'm Maya"),'Maya')
        voice=profile.VoiceField('name')
        async def collect(text):
            voice.add_person_turn(text)
            return [item async for item in voice.reply({})]
        result=asyncio.run(collect('Goodbye'))
        self.assertEqual(result[-1],intake.END_MARK)
        self.assertIn('Return to setup',result[0])
        self.assertNotIn('name',profile.status()['answers'])

    def test_text_confirmation_has_a_reply_and_no_transport_error(self):
        from stellis.intake_voice import Call
        messages=[]
        async def capture(message): messages.append(message)
        async def ignore(data): pass
        async def run():
            call=Call(capture,ignore,None,profile.VoiceField('name'))
            try:
                await call.start()
                await call.text('My name is Maya')
                await call.replying
                await call.text('Yes')
                await call.replying
            finally:
                await call.close()
        asyncio.run(run())
        self.assertFalse([message for message in messages if message['type']=='error'])
        self.assertTrue(any(message.get('action')=='profile_confirm' for message in messages))
        self.assertTrue(any(message.get('text')=='Thank you.' for message in messages))
