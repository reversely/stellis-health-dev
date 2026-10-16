"""Local login gate and session lifecycle checks."""

import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import auth, storage
from stellis import cli
from stellis.server import app
from test_import import wav_bytes


class LocalAuthTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name,
                                        "STELLIS_AUTH_MODE": "required"})
        self.env.start()
        self.client = TestClient(app, follow_redirects=False)
        self.credentials = {"username": "Shereen", "password": "correct horse battery staple"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_registration_login_logout_and_protected_routes(self):
        self.assertEqual(self.client.get('/').status_code, 303)
        self.assertEqual(self.client.get('/auth').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/conversations').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/sync-config').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/ai-runs/test').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/conversations/import', files={
            'file': ('talk.wav', wav_bytes(), 'audio/wav')}).status_code, 401)
        self.assertTrue(self.client.get('/api/v1/auth/status').json()['registration_open'])
        registered = self.client.post('/api/v1/auth/register', json=self.credentials)
        self.assertEqual(registered.status_code, 200)
        self.assertIn('HttpOnly', registered.headers['set-cookie'])
        self.assertIn('samesite=strict', registered.headers['set-cookie'].lower())
        self.assertEqual(self.client.post('/api/v1/auth/register', json=self.credentials).status_code, 409)
        imported = self.client.post('/api/v1/conversations/import', files={
            'file': ('talk.wav', wav_bytes(), 'audio/wav')})
        self.assertEqual(imported.status_code, 200)
        conversation_id = imported.json()['conversation']['id']
        self.assertEqual(self.client.get(f'/api/v1/conversations/{conversation_id}/audio').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/logout').status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/conversations/{conversation_id}/audio').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/auth/login', json={**self.credentials,
            'password': 'wrong password'}).status_code, 401)
        self.assertEqual(self.client.post('/api/v1/auth/login', json=self.credentials).status_code, 200)
        self.assertEqual(len(self.client.get('/api/v1/conversations').json()), 1)

    def test_sync_origin_is_explicit_loopback_only(self):
        self.client.post('/api/v1/auth/register', json=self.credentials)
        with patch.dict(os.environ, {'STELLIS_SYNC_ORIGIN': ''}):
            self.assertIsNone(self.client.get('/api/v1/sync-config').json()['origin'])
        with patch.dict(os.environ, {'STELLIS_SYNC_ORIGIN': 'http://127.0.0.1:8769'}):
            self.assertEqual(self.client.get('/api/v1/sync-config').json()['origin'],
                             'http://127.0.0.1:8769')
        with patch.dict(os.environ, {'STELLIS_SYNC_ORIGIN': 'https://example.com'}):
            self.assertEqual(self.client.get('/api/v1/sync-config').status_code, 500)

    def test_expiry_forgery_and_origin_rejection(self):
        self.client.post('/api/v1/auth/register', json=self.credentials)
        self.assertEqual(self.client.post('/api/v1/categories', json={'name':'Blocked'},
            headers={'Origin':'https://another.example'}).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/conversations',
            headers={'Cookie': f'{auth.COOKIE_NAME}=forged-token'}).status_code, 401)
        token = self.client.cookies.get(auth.COOKIE_NAME)
        with sqlite3.connect(storage.data_dir() / 'auth.sqlite3') as conn:
            conn.execute('UPDATE sessions SET expires_at = ? WHERE token_hash = ?',
                         ((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(),
                          auth._token_hash(token)))
        self.assertEqual(self.client.get('/api/v1/conversations').status_code, 401)

    def test_single_use_recovery_revokes_sessions(self):
        registered = self.client.post('/api/v1/auth/register', json=self.credentials)
        code = registered.json()['recovery_code']
        self.assertGreaterEqual(len(code), 40)
        second = TestClient(app, follow_redirects=False)
        try:
            self.assertEqual(second.post('/api/v1/auth/login', json=self.credentials).status_code, 200)
            reset = {'username': self.credentials['username'], 'recovery_code': code,
                     'new_password': 'a different correct password'}
            self.assertEqual(self.client.post('/api/v1/auth/recover', json={**reset,
                'recovery_code': 'A' * len(code)}).status_code, 401)
            self.assertEqual(self.client.get('/api/v1/conversations').status_code, 200)
            self.assertEqual(self.client.post('/api/v1/auth/recover', json=reset).status_code, 200)
            self.assertEqual(self.client.get('/api/v1/conversations').status_code, 401)
            self.assertEqual(second.get('/api/v1/conversations').status_code, 401)
            self.assertEqual(self.client.post('/api/v1/auth/recover', json=reset).status_code, 401)
            self.assertEqual(self.client.post('/api/v1/auth/login', json=self.credentials).status_code, 401)
            self.assertEqual(self.client.post('/api/v1/auth/login', json={**self.credentials,
                'password': reset['new_password']}).status_code, 200)
        finally:
            second.close()

    def test_existing_account_receives_recovery_code_on_login(self):
        self.client.post('/api/v1/auth/register', json=self.credentials)
        with sqlite3.connect(storage.data_dir() / 'auth.sqlite3') as conn:
            conn.execute('DELETE FROM recovery_codes')
        self.client.post('/api/v1/auth/logout')
        first = self.client.post('/api/v1/auth/login', json=self.credentials)
        self.assertIn('recovery_code', first.json())
        second = self.client.post('/api/v1/auth/login', json=self.credentials)
        self.assertNotIn('recovery_code', second.json())

    def test_cli_serve_requires_login_by_default(self):
        with patch.dict(os.environ):
            os.environ.pop('STELLIS_AUTH_MODE', None)
            with patch('sys.argv', ['stellis', 'serve', '--port', '8899']), patch.object(cli.uvicorn, 'run') as run:
                cli.main()
                self.assertEqual(os.environ['STELLIS_AUTH_MODE'], 'required')
                run.assert_called_once()
