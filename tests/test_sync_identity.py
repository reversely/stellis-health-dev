"""Separate identity origin isolation and session checks."""

import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import sync_identity
from stellis.sync_server import app


class SyncIdentityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_SYNC_DATA_DIR": self.temp.name})
        self.env.start()
        self.alice = TestClient(app)
        self.bob = TestClient(app)
        self.a = {"username": "alice", "password": "correct horse battery staple"}
        self.b = {"username": "bob", "password": "another secure test password"}

    def tearDown(self):
        self.alice.close()
        self.bob.close()
        self.env.stop()
        self.temp.cleanup()

    def test_two_accounts_and_device_isolation(self):
        self.assertEqual(self.alice.get('/sync/v1/me').status_code, 401)
        self.assertEqual(self.alice.post('/sync/v1/auth/register', json=self.a).status_code, 200)
        self.assertEqual(self.bob.post('/sync/v1/auth/register', json=self.b).status_code, 200)
        self.assertEqual(self.bob.post('/sync/v1/auth/register', json=self.a).status_code, 409)
        device = self.alice.post('/sync/v1/devices', json={'name':'Alice Mac'}).json()
        self.assertEqual([x['id'] for x in self.alice.get('/sync/v1/devices').json()], [device['id']])
        self.assertEqual(self.bob.get('/sync/v1/devices').json(), [])
        self.assertEqual(self.bob.delete(f"/sync/v1/devices/{device['id']}").status_code, 404)
        self.assertEqual(len(self.alice.get('/sync/v1/devices').json()), 1)
        self.assertEqual(self.alice.get('/api/v1/conversations').status_code, 404)
        self.assertEqual(self.alice.get('/api/v1/conversations/anything/audio').status_code, 404)
        self.assertEqual(self.alice.post('/sync/v1/auth/logout').status_code, 200)
        self.assertEqual(self.alice.get('/sync/v1/devices').status_code, 401)
        self.assertEqual(self.alice.post('/sync/v1/auth/login', json={**self.a,'password':self.b['password']}).status_code, 401)
        self.assertEqual(self.alice.post('/sync/v1/auth/login', json=self.a).status_code, 200)
        self.assertEqual(self.alice.delete(f"/sync/v1/devices/{device['id']}").status_code, 200)
        self.assertEqual(self.alice.get('/sync/v1/devices').json(), [])

    def test_cookie_expiry_origin_and_session_revocation(self):
        self.alice.post('/sync/v1/auth/register', json=self.a)
        with sqlite3.connect(sync_identity.root()/'identity.sqlite3') as conn:
            stored = conn.execute('SELECT verifier FROM users WHERE username = ?', (self.a['username'],)).fetchone()[0]
        self.assertNotIn(self.a['password'].encode(), stored)
        token = self.alice.cookies.get(sync_identity.COOKIE)
        self.assertEqual(self.alice.post('/sync/v1/devices', json={'name':'Denied'},
            headers={'Origin':'https://other.example'}).status_code, 403)
        self.assertEqual(self.alice.get('/sync/v1/me', headers={'Cookie':'stellis_sync_session=forged'}).status_code, 401)
        with sqlite3.connect(sync_identity.root()/'identity.sqlite3') as conn:
            conn.execute('UPDATE sessions SET expires_at = ? WHERE token_hash = ?',
                         ((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(),
                          sync_identity._digest(token)))
        self.assertEqual(self.alice.get('/sync/v1/me').status_code, 401)
        self.alice.post('/sync/v1/auth/login', json=self.a)
        self.assertEqual(self.alice.post('/sync/v1/sessions/revoke-all').status_code, 200)
        self.assertEqual(self.alice.get('/sync/v1/me').status_code, 401)
