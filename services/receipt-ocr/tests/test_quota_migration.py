import sqlite3
import unittest
from pathlib import Path


MIGRATION = Path(__file__).parents[3] / "migrations" / "0001_receipt_scan_quota.sql"


class QuotaMigrationTests(unittest.TestCase):
    def test_schema_and_indexes_apply_cleanly(self):
        database = sqlite3.connect(":memory:")
        try:
            database.executescript(MIGRATION.read_text(encoding="utf-8"))
            indexes = {
                row[0]
                for row in database.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'receipt_scan_reservations'"
                )
            }
            self.assertIn("receipt_scan_device_day", indexes)
            self.assertIn("receipt_scan_global_month", indexes)
        finally:
            database.close()


if __name__ == "__main__":
    unittest.main()
