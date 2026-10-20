"""Persisted role isolation and inference guards without simulated providers."""
import os
import tempfile
import unittest
from unittest.mock import patch
from stellis import categorization, model_routes, runtime_profile, runtime_settings, runtime_trace, screen_tutor, storage

class ModelRoutesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'STELLIS_DATA_DIR': self.temp.name,
            'STELLIS_RUNTIME_PROFILE': 'local', 'STELLIS_ACCOUNT_ID': '1'}, clear=True)
        self.env.start()
    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()
    def test_independent_roles_profiles_and_accounts(self):
        model_routes.save({'transcript':'text:one','categories':'classify:two','planning':'plan:three','vision':'eyes:four'})
        self.assertEqual(runtime_profile.model_id(), 'text:one')
        self.assertEqual(categorization._model_id(), 'classify:two')
        self.assertEqual(runtime_profile.model_id('planning'), 'plan:three')
        self.assertEqual(screen_tutor.model_id(), 'eyes:four')
        self.assertEqual(runtime_profile.model_id('agent'), 'nemotron-3-nano:latest')
        self.assertEqual(model_routes.path().stat().st_mode & 0o777, 0o600)
        with patch.dict(os.environ, {'STELLIS_RUNTIME_PROFILE':'cloud'}):
            self.assertEqual(model_routes.choices(), {})
            model_routes.save({'agent':'provider/cloud-model'})
            self.assertEqual(runtime_profile.model_id('agent'), 'provider/cloud-model')
            self.assertEqual(runtime_profile.model_id(), 'nvidia/Nemotron-3_5-Lightning')
        self.assertEqual(runtime_profile.model_id(), 'text:one')
        with tempfile.TemporaryDirectory() as other, patch.dict(os.environ, {'STELLIS_DATA_DIR':other}):
            self.assertEqual(model_routes.choices(), {})
    def test_invalid_routes_do_not_replace_saved_settings(self):
        model_routes.save({'transcript':'installed:model'})
        for invalid in [{'unknown':'model'}, {'vision':'../bad model'}, {'agent':None}, []]:
            with self.assertRaises(ValueError): model_routes.save(invalid)
            self.assertEqual(model_routes.choices(), {'transcript':'installed:model'})
    def test_active_request_prevents_save_before_provider_access(self):
        with runtime_trace.span('answer'):
            with self.assertRaisesRegex(ValueError, 'active requests'):
                runtime_settings.save_routes({'transcript':'text:new'})
        self.assertEqual(model_routes.choices(), {})
    def test_legacy_default_is_preserved_only_until_role_override(self):
        (storage.data_dir()/'local-inference-model').write_text('previous:model')
        model_routes.save({'transcript':'selected:model'})
        self.assertEqual(runtime_profile.model_id(), 'selected:model')
        self.assertEqual(runtime_profile.model_id('agent'), 'previous:model')

    def test_runtime_guard_also_covers_another_account(self):
        with runtime_trace.span('answer'):
            with tempfile.TemporaryDirectory() as other, patch.dict(os.environ, {'STELLIS_DATA_DIR':other}):
                with self.assertRaisesRegex(ValueError, 'active requests'):
                    with runtime_trace.model_change(): pass
