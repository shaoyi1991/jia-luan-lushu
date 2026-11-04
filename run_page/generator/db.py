"""Activity table. Column names match running_page's activities schema."""

import datetime

from sqlalchemy import Column, Float, Integer, Interval, String, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


ACTIVITY_KEYS = [
    "run_id",
    "name",
    "distance",
    "moving_time",
    "type",
    "subtype",
    "start_date",
    "start_date_local",
    "location_country",
    "summary_polyline",
    "average_heartrate",
    "average_speed",
    "elevation_gain",
    "elapsed_time",
]


class Activity(Base):
    __tablename__ = "activities"

    run_id = Column(Integer, primary_key=True)
    name = Column(String)
    distance = Column(Float)
    moving_time = Column(Interval)
    elapsed_time = Column(Interval)
    type = Column(String)
    subtype = Column(String)
    start_date = Column(String)
    start_date_local = Column(String)
    location_country = Column(String)
    summary_polyline = Column(String)
    average_heartrate = Column(Float)
    average_speed = Column(Float)
    elevation_gain = Column(Float)
    streak = None

    def to_dict(self):
        out = {}
        for key in ACTIVITY_KEYS:
            attr = getattr(self, key)
            if key == "run_id" and attr is not None:
                # Keep ids exceed Number.MAX_SAFE_INTEGER.
                out[key] = str(attr)
            elif isinstance(attr, (datetime.timedelta, datetime.datetime)):
                out[key] = str(attr)
            else:
                out[key] = attr
        if self.streak:
            out["streak"] = self.streak
        return out


def update_or_create_activity(session, run_activity):
    created = False
    try:
        with session.begin_nested():
            activity = (
                session.query(Activity).filter_by(run_id=int(run_activity.id)).first()
            )
            elevation = getattr(run_activity, "elevation_gain", None)
            if elevation is None:
                elevation = getattr(run_activity, "total_elevation_gain", None)
            elevation = float(elevation or 0.0)
            polyline = ""
            if getattr(run_activity, "map", None) is not None:
                polyline = run_activity.map.summary_polyline or ""

            if not activity:
                activity = Activity(
                    run_id=int(run_activity.id),
                    name=run_activity.name,
                    distance=float(run_activity.distance or 0),
                    moving_time=run_activity.moving_time,
                    elapsed_time=run_activity.elapsed_time,
                    type=run_activity.type,
                    subtype=getattr(run_activity, "subtype", None) or run_activity.type,
                    start_date=run_activity.start_date,
                    start_date_local=run_activity.start_date_local,
                    location_country=str(getattr(run_activity, "location_country", "") or ""),
                    average_heartrate=run_activity.average_heartrate,
                    average_speed=float(run_activity.average_speed or 0),
                    elevation_gain=elevation,
                    summary_polyline=polyline,
                )
                session.add(activity)
                created = True
            else:
                activity.name = run_activity.name
                activity.distance = float(run_activity.distance or 0)
                activity.moving_time = run_activity.moving_time
                activity.elapsed_time = run_activity.elapsed_time
                activity.type = run_activity.type
                activity.subtype = getattr(run_activity, "subtype", None) or run_activity.type
                activity.start_date = run_activity.start_date
                activity.start_date_local = run_activity.start_date_local
                activity.location_country = str(
                    getattr(run_activity, "location_country", "") or activity.location_country or ""
                )
                activity.average_heartrate = run_activity.average_heartrate
                activity.average_speed = float(run_activity.average_speed or 0)
                activity.elevation_gain = elevation
                activity.summary_polyline = polyline
    except Exception as exc:  # noqa: BLE001
        print(f"something wrong with {getattr(run_activity, 'id', '?')}")
        print(str(exc))
        return False
    return created


def add_missing_columns(engine, model):
    inspector = inspect(engine)
    if not inspector.has_table(model.__tablename__):
        return
    columns = {col["name"] for col in inspector.get_columns(model.__tablename__)}
    missing = [column for column in model.__table__.columns if column.name not in columns]
    if not missing:
        return
    with engine.connect() as conn:
        for column in missing:
            conn.execute(
                text(
                    f"ALTER TABLE {model.__tablename__} "
                    f"ADD COLUMN {column.name} {column.type}"
                )
            )
        conn.commit()


def init_db(db_path):
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    add_missing_columns(engine, Activity)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    return session
