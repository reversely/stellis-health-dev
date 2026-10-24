"""Component transport authentication and parent/child policy boundaries."""
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from stellis import auth
from stellis.server import app

class DashIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'STELLIS_DATA_DIR':self.temp.name,'STELLIS_AUTH_MODE':'required','STELLIS_DEV_ACCOUNT':'0'})
        self.env.start();self.client=TestClient(app,follow_redirects=False)
    def tearDown(self):
        self.client.close();self.env.stop();self.temp.cleanup()
    def test_visible_source_search_and_stale_time_window(self):
        from stellis.dash_measurements import table_data, content
        measure={'key':'pulse','unit':'bpm','points':[]}
        point={'id':'manual','time':'1999-01-01','value':72,'value2':None,'source':'self','title':'You'}
        self.assertEqual(len(table_data(measure,[point],'Manual entry')['body']),1)
        photo={**point,'id':'photo','title':'Source photo','document_id':'photo-record'}
        self.assertEqual(table_data(measure,[photo],'Source photo')['body'][0][-2],'Source photo')
        empty=content({**measure,'points':[point]},False,'31',True,'2026-10-24')
        self.assertEqual(empty.children,'No readings in this period')

    def test_unauthenticated_transports_do_not_enter_component(self):
        self.assertEqual(self.client.get('/components/measurements/_dash-layout').status_code,303)
        self.assertEqual(self.client.post('/components/measurements/_dash-update-component',json={}).status_code,303)
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect('/components/measurements/_dash-ws-callback',headers={'origin':'http://testserver'}):pass
    def test_authenticated_component_and_native_unknown_routes(self):
        self.client.post('/api/v1/auth/register',json={'username':'MayaTest','password':'correct horse battery staple'})
        account=auth.current_account_id(self.client.cookies.get(auth.COOKIE_NAME));auth.complete_onboarding(account)
        self.assertEqual(self.client.get('/components/measurements/_dash-layout').status_code,200)
        with self.client.websocket_connect('/components/measurements/_dash-ws-callback',headers={'origin':'http://testserver'}):pass
        with TestClient(app) as running:
            self.assertEqual(running.post('/api/v1/auth/recover',json={}).status_code,404)

    def test_component_policy_is_contained_and_callbacks_are_stateless(self):
        with patch.dict(os.environ,{'STELLIS_AUTH_MODE':'disabled'}):
            parent=self.client.get('/')
            child=self.client.get('/components/measurements/')
            self.assertEqual(child.status_code,200)
            self.assertNotIn("style-src 'self' 'unsafe-inline'",parent.headers['content-security-policy'])
            self.assertIn("style-src 'self' 'unsafe-inline'",child.headers['content-security-policy'])
            self.assertIn("frame-ancestors 'self'",child.headers['content-security-policy'])
            self.assertIn("frame-ancestors 'none'",parent.headers['content-security-policy'])
            self.assertNotIn("'unsafe-eval'",child.headers['content-security-policy'])
            layout=self.client.get('/components/measurements/_dash-layout').text
            self.assertNotIn('Maya grows with Stellis',layout)
            self.assertIn('measure-data',layout)
            self.assertEqual(child.headers['cache-control'],'no-store')
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect('/components/measurements/_dash-ws-callback',headers={'origin':'https://unrelated.example'}):pass

if __name__=='__main__':unittest.main()
