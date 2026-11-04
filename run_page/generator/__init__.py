"""SQLite activity store used by keep_sync.

Schema and export fields follow yihong0618/running_page so the Keep pipeline
stays familiar: run_id, summary_polyline, moving_time, start_date_local.
Geocoding and Strava are intentionally not pulled in.
"""

import datetime
import sys

from polyline_processor import filter_out
from sqlalchemy import func

from .db import Activity, init_db, update_or_create_activity


class Generator:
    def __init__(self, db_path):
        self.session = init_db(db_path)
        self.only_run = False

    def sync_from_app(self, app_tracks):
        tracks = [t for t in app_tracks or [] if t is not None]
        if not tracks:
            print("No tracks found.")
            return
        print("Syncing tracks '+' means new track '.' means update tracks")
        for track in tracks:
            created = update_or_create_activity(self.session, track)
            sys.stdout.write("+" if created else ".")
            sys.stdout.flush()
        self.session.commit()
        print()

    def load(self):
        query = self.session.query(Activity).filter(Activity.distance > 0.1)
        if self.only_run:
            query = query.filter(Activity.type == "Run")

        activities = query.order_by(Activity.start_date_local)
        activity_list = []

        streak = 0
        last_date = None
        for activity in activities:
            date = datetime.datetime.strptime(
                activity.start_date_local, "%Y-%m-%d %H:%M:%S"
            ).date()
            if last_date is None:
                streak = 1
            elif date == last_date:
                pass
            elif date == last_date + datetime.timedelta(days=1):
                streak += 1
            else:
                streak = 1
            activity.streak = streak
            last_date = date
            exported = activity.to_dict()
            exported["summary_polyline"] = filter_out(exported.get("summary_polyline"))
            activity_list.append(exported)
        return activity_list

    def get_old_tracks_ids(self):
        try:
            activities = self.session.query(Activity).all()
            return [str(a.run_id) for a in activities]
        except Exception as exc:  # noqa: BLE001
            print(f"something wrong with {exc!s}")
            return []

    def latest_start(self):
        return self.session.query(func.max(Activity.start_date_local)).scalar()
