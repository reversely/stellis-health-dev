"""Local setup receipts disclose stages, not host paths or raw installer output."""
import argparse
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import setup_local_agents as setup
from stellis import local_setup


class LocalSetupTest(unittest.TestCase):
    def args(self,root):
        return argparse.Namespace(root=root,name='isolated-proof',model='model:latest',gateway_port=8992,
                                  control_port=18892,image=setup.IMAGE,nemoclaw='/missing/nemoclaw',apply=True,resume=False)

    def test_existing_directory_and_production_ports_are_preserved(self):
        with tempfile.TemporaryDirectory() as root:
            file=Path(root)/'keep';file.write_text('untouched')
            with self.assertRaises(ValueError):setup.run(self.args(root))
            self.assertEqual(file.read_text(),'untouched')
            args=self.args(root);args.gateway_port=8990
            with self.assertRaises(ValueError):setup.configuration(args)

    def test_missing_binary_records_failure_and_resume_requires_same_configuration(self):
        with tempfile.TemporaryDirectory() as root:
            args=self.args(root)
            with self.assertRaises(ValueError):setup.run(args)
            receipt=Path(root)/'setup.json'
            self.assertEqual(json.loads(receipt.read_text())['state'],'failed')
            self.assertEqual(receipt.stat().st_mode & 0o777,0o600)
            args.resume=True;args.model='different:latest'
            with self.assertRaises(ValueError):setup.run(args)
            self.assertEqual(json.loads(receipt.read_text())['configuration']['model'],'model:latest')

    def test_public_progress_never_returns_config_or_logs(self):
        with tempfile.TemporaryDirectory() as root:
            receipt=Path(root)/'status.json'
            receipt.write_text(json.dumps({'stage':'sandbox','state':'running','pid':os.getpid(),
                                           'configuration':{'root':'private-path'},'log':'private-output'}))
            with patch.dict(os.environ,{'STELLIS_RUNTIME_PROFILE':'local','STELLIS_LOCAL_SETUP_STATUS':str(receipt)}):
                self.assertEqual(set(local_setup.status()),{'state','stage','message'})
                self.assertEqual(local_setup.status()['state'],'running')
                receipt.write_text(json.dumps({'stage':'sandbox','state':'running','pid':999999999}))
                self.assertEqual(local_setup.status()['stage'],'interrupted')
                receipt.write_text('broken')
                self.assertEqual(local_setup.status()['state'],'failed')
            with patch.dict(os.environ,{'STELLIS_RUNTIME_PROFILE':'cloud','STELLIS_LOCAL_SETUP_STATUS':str(receipt)}):
                self.assertIsNone(local_setup.status())
