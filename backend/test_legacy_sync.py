import unittest
from unittest.mock import patch, MagicMock
from supabase_sync import sync_all_from_local_db


class LegacySyncTests(unittest.TestCase):
    @patch('supabase_sync.sync_plagiarism_scan')
    @patch('sqlite3.connect')
    @patch('supabase_sync.os.path.exists', return_value=True)
    def test_startup_reads_scans_but_never_replays_grades(self, exists, connect, sync):
        connection = MagicMock()
        connect.return_value = connection
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = [{'scan_id': 'existing-scan'}]
        result = sync_all_from_local_db()
        cursor.execute.assert_called_once_with('SELECT * FROM plagiarism_scans')
        sync.assert_called_once_with({'scan_id': 'existing-scan'}, async_mode=False)
        self.assertEqual(result['grades_synced'], 0)
        connection.close.assert_called_once()
