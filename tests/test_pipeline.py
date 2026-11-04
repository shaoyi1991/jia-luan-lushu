import json
import os
import subprocess
import sys
import tempfile
import unittest
from collections import namedtuple
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE = ROOT / "run_page"
sys.path.insert(0, str(RUN_PAGE))

import polyline  # noqa: E402
from config import run_map  # noqa: E402
from generator import Generator  # noqa: E402
from gen_svg import render, summarize  # noqa: E402
from polyline_processor import filter_out  # noqa: E402

TRACK = namedtuple(
    "Track",
    [
        "id",
        "name",
        "distance",
        "moving_time",
        "elapsed_time",
        "type",
        "subtype",
        "start_date",
        "start_date_local",
        "location_country",
        "average_heartrate",
        "average_speed",
        "elevation_gain",
        "map",
    ],
)


class PipelineTest(unittest.TestCase):
    def test_checked_in_activities_are_a_list(self):
        payload = json.loads((ROOT / "src" / "static" / "activities.json").read_text())
        self.assertIsInstance(payload, list)
        self.assertFalse(any(item.get("name") == "IMPORT_FIXTURE" for item in payload))

    def test_filter_keeps_points_when_privacy_off(self):
        encoded = polyline.encode([(31.2, 121.4), (31.21, 121.41), (31.22, 121.42)])
        decoded = polyline.decode(filter_out(encoded))
        self.assertEqual(len(decoded), 3)

    def test_sqlite_roundtrip_uses_fixture_not_a_real_workout(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "data.db")
            generator = Generator(db_path)
            track = TRACK(
                id=9223370441312156007,
                name="PIPELINE_FIXTURE",
                distance=1500,
                moving_time=timedelta(minutes=8),
                elapsed_time=timedelta(minutes=9),
                type="Run",
                subtype="Run",
                start_date="2020-01-02 00:00:00",
                start_date_local="2020-01-02 08:00:00",
                location_country="测试",
                average_heartrate=140,
                average_speed=3.1,
                elevation_gain=12,
                map=run_map(polyline.encode([(31.2, 121.4), (31.21, 121.41)])),
            )
            generator.sync_from_app([track, None])
            self.assertEqual(generator.get_old_tracks_ids(), ["9223370441312156007"])
            rows = generator.load()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["name"], "PIPELINE_FIXTURE")
            self.assertEqual(rows[0]["type"], "Run")
            self.assertIn(":", rows[0]["moving_time"])
            self.assertTrue(rows[0]["summary_polyline"])
            generator.sync_from_app([track])
            self.assertEqual(len(generator.load()), 1)

    def test_empty_poster_does_not_invent_distance(self):
        svg = render(summarize([]))
        self.assertIn("尚无记录", svg)
        self.assertIn("贾栾", svg)
        self.assertNotIn("42.00", svg)
        self.assertNotIn("PIPELINE_FIXTURE", svg)

    def test_cli_refuses_inline_secrets(self):
        env = os.environ.copy()
        env.pop("KEEP_MOBILE", None)
        env.pop("KEEP_PASSWORD", None)
        secret = "not-a-real-keep-password"
        result = subprocess.run(
            [sys.executable, str(RUN_PAGE / "keep_sync.py"), "13800000000", secret],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertNotIn(secret, result.stderr + result.stdout)
        self.assertIn("KEEP_PASSWORD", result.stderr)

    def test_cli_requires_env(self):
        env = os.environ.copy()
        env.pop("KEEP_MOBILE", None)
        env.pop("KEEP_PASSWORD", None)
        result = subprocess.run(
            [sys.executable, str(RUN_PAGE / "keep_sync.py"), "--with-gpx", "--sync-types", "running", "cycling", "hiking"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("KEEP_MOBILE", result.stderr)

    def test_help_describes_full_history(self):
        result = subprocess.run(
            [sys.executable, str(RUN_PAGE / "keep_sync.py"), "--help"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("全部历史", result.stdout)
        self.assertIn("--with-gpx", result.stdout)
        self.assertIn("running", result.stdout)


if __name__ == "__main__":
    unittest.main()
