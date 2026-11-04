import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "run_page"))

from import_dump import as_duration, import_dump, place_label, read_rows  # noqa: E402

BIG_ID = 9223370441312156007


def write_gpx(path):
    path.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="import-test">
  <trk><trkseg>
    <trkpt lat="31.2000" lon="121.4000"></trkpt>
    <trkpt lat="31.2100" lon="121.4100"></trkpt>
    <trkpt lat="31.2200" lon="121.4200"></trkpt>
  </trkseg></trk>
</gpx>
""",
        encoding="utf-8",
    )


class ImportDumpTest(unittest.TestCase):
    def test_sqlite_interval_and_region_dict(self):
        self.assertEqual(as_duration("1970-01-01 00:25:27.000000"), "0:25:27")
        self.assertEqual(as_duration("1970-01-02 01:00:00.000000"), "1 day, 1:00:00")
        label = place_label(
            "{'latitude': 36.06, 'longitude': 120.37, 'country': '中国', "
            "'province': '山东省', 'city': '青岛市'}"
        )
        self.assertEqual(label, "山东省青岛市")
        self.assertNotIn("latitude", label)

    def make_db(self, folder):
        db_path = Path(folder) / "activities.db"
        conn = sqlite3.connect(db_path)
        conn.execute(
            """
            CREATE TABLE activities (
                run_id INTEGER PRIMARY KEY,
                name TEXT,
                distance REAL,
                moving_time TEXT,
                elapsed_time TEXT,
                type TEXT,
                subtype TEXT,
                start_date TEXT,
                start_date_local TEXT,
                location_country TEXT,
                summary_polyline TEXT,
                average_heartrate REAL,
                average_speed REAL,
                elevation_gain REAL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO activities (
                run_id, name, distance, moving_time, elapsed_time, type, subtype,
                start_date, start_date_local, location_country, summary_polyline,
                average_heartrate, average_speed, elevation_gain
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                BIG_ID,
                "IMPORT_FIXTURE",
                5000,
                "0:40:00",
                "0:42:00",
                "Run",
                "Run",
                "2020-01-02 00:00:00",
                "2020-01-02 08:00:00",
                "测试",
                "",
                140,
                2.08,
                12,
            ),
        )
        conn.execute(
            """
            INSERT INTO activities (
                run_id, name, distance, moving_time, elapsed_time, type, subtype,
                start_date, start_date_local, location_country, summary_polyline,
                average_heartrate, average_speed, elevation_gain
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                88,
                "IMPORT_FIXTURE_RIDE",
                12000,
                "0:30:00",
                "0:31:00",
                "Ride",
                "Ride",
                "2020-01-03 00:00:00",
                "2020-01-03 09:00:00",
                "",
                "",
                None,
                6.6,
                20,
            ),
        )
        conn.commit()
        conn.close()
        return db_path

    def test_import_preserves_run_id_and_backfills_gpx(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            db_path = self.make_db(folder)
            gpx_dir = folder / "GPX_OUT"
            gpx_dir.mkdir()
            write_gpx(gpx_dir / f"{BIG_ID}.gpx")
            json_file = folder / "activities.json"
            sql_dest = folder / "copy.db"
            gpx_dest = folder / "linked"
            svg_file = folder / "totals.svg"
            activities = import_dump(
                db_path,
                gpx_dir,
                sql_dest=sql_dest,
                json_file=json_file,
                gpx_dest=gpx_dest,
                svg_file=svg_file,
            )
            self.assertEqual(activities[0]["run_id"], str(BIG_ID))
            self.assertEqual(activities[0]["name"], "IMPORT_FIXTURE")
            self.assertEqual(activities[0]["type"], "Run")
            self.assertEqual(activities[0]["elapsed_time"], "0:42:00")
            self.assertTrue(activities[0]["summary_polyline"])
            self.assertEqual(activities[1]["type"], "Ride")
            self.assertEqual(activities[1]["summary_polyline"], "")
            written = json.loads(json_file.read_text(encoding="utf-8"))
            self.assertEqual(written[0]["run_id"], str(BIG_ID))
            self.assertTrue((gpx_dest / f"{BIG_ID}.gpx").is_symlink())
            poster = svg_file.read_text(encoding="utf-8")
            self.assertNotIn("尚无记录", poster)
            self.assertNotIn("IMPORT_FIXTURE", poster)

        checked_in = json.loads((ROOT / "src" / "static" / "activities.json").read_text())
        self.assertIsInstance(checked_in, list)
        self.assertFalse(any(item.get("name") == "IMPORT_FIXTURE" for item in checked_in))

    def test_missing_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "empty.db"
            conn = sqlite3.connect(db_path)
            conn.execute("CREATE TABLE notes (id INTEGER)")
            conn.commit()
            conn.close()
            with self.assertRaises(SystemExit):
                read_rows(db_path)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            db_path = self.make_db(folder)
            json_file = folder / "activities.json"
            import_dump(
                db_path,
                None,
                sql_dest=folder / "copy.db",
                json_file=json_file,
                gpx_dest=folder / "gpx",
                svg_file=folder / "totals.svg",
                dry_run=True,
            )
            self.assertFalse(json_file.exists())
            self.assertFalse((folder / "copy.db").exists())


if __name__ == "__main__":
    unittest.main()
