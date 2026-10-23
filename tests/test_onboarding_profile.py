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
