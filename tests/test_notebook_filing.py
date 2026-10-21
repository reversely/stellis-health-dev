"""Filing reversal preserves edits, later moves, deletes and import identity."""
import os
import tempfile
import unittest
from unittest.mock import patch
from stellis import notebooks, notebook_filing, notebook_work, pages, storage


class FilingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'STELLIS_DATA_DIR':self.tmp.name}, clear=True)
        self.env.start()
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.env.stop)
        self.book = notebooks.create('Source review')['id']

    def source(self, number):
        return {'id':f'note:{number}', 'title':f'Source {number}', 'kind':'Note', 'date':'2026-10-21', 'excerpt':'Evidence', 'url':''}

    def test_undo_preserves_edits_moves_deletes_and_retries(self):
        sources = [self.source(n) for n in range(3)]
        identifier = notebook_filing.file_sources(self.book, sources)
        items = notebook_filing.history(self.book)[0]['items']
        edited, moved, deleted = [i['page_id'] for i in items]
        with storage.connect() as conn:
            conn.execute('UPDATE pages SET markdown=?,revision=revision+1 WHERE id=?', ('My subsequent edits', edited))
        other = notebooks.create('Other')['id']
        pages.assign_notebook(moved, other)
        pages.move_to_trash(deleted)
        result = notebook_filing.undo(self.book, identifier)
        self.assertEqual(result['unfiled'], [edited])
        self.assertEqual(result['unchanged'], [moved, deleted])
        self.assertEqual(pages.get(edited)['markdown'], 'My subsequent edits')
        self.assertIsNone(pages.get(edited)['notebook_id'])
        self.assertEqual(pages.get(moved)['notebook_id'], other)
        self.assertEqual(notebook_filing.undo(self.book, identifier), result)
        self.assertIsNone(notebook_filing.file_sources(self.book, sources))
        self.assertEqual(len(pages.list_pages()), 2)
        activity = notebook_work.activity(self.book)['items'][0]
        self.assertEqual(activity['kind'], 'filing')
        self.assertEqual(activity['filing']['result'], result)
        with self.assertRaises(LookupError):
            notebook_filing.undo(other, identifier)

    def test_failure_rolls_back_sources_and_filing_record(self):
        invalid = self.source(2); invalid['title'] = 'x'*201
        with self.assertRaises(ValueError):
            notebook_filing.file_sources(self.book, [self.source(1), invalid])
        self.assertEqual(pages.list_pages(), [])
        self.assertEqual(notebook_filing.history(self.book), [])
        self.assertIsNotNone(notebook_filing.file_sources(self.book, [self.source(1)]))
        self.assertIsNone(notebook_filing.file_sources(self.book, [self.source(1)]))
        self.assertEqual(len(notebook_filing.history(self.book)), 1)

    def test_legacy_marker_matches_whole_identity_without_false_history(self):
        old = pages.create('Older import', self.book, 'Source reference: note:10')
        self.assertIsNotNone(notebook_filing.file_sources(self.book, [self.source(1)]))
        self.assertIsNone(notebook_filing.file_sources(self.book, [self.source(10)]))
        self.assertEqual(len(pages.list_pages(self.book)), 2)
        record = notebook_filing.history(self.book)[0]
        self.assertEqual(len(record['items']), 1)
        notebook_filing.undo(self.book, record['id'])
        self.assertEqual(pages.get(old['id'])['notebook_id'], self.book)
