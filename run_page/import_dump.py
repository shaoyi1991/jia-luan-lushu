"""Import a running_page / Keep SQLite dump and optional GPX folder.

This does not log into Keep. Point it at the database produced by
``keep_sync.py`` (table ``activities``) and the matching ``GPX_OUT``.

Keep run ids are larger than JavaScript's safe integer range, so
``run_id`` is written to activities.json as a string. GPX files are named
``<run_id>.gpx``.
"""

import argparse
import ast
import json
import os
import re
import shutil
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import gpxpy
import polyline
from config import GPX_FOLDER, JSON_FILE, SQL_FILE, SVG_FILE
from gen_svg import write_poster
from polyline_processor import filter_out

ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "import"

REQUIRED_COLUMNS = ("run_id", "distance", "type", "start_date_local")
COPY_COLUMNS = (
    "run_id",
    "name",
    "distance",
    "moving_time",
    "elapsed_time",
    "type",
    "subtype",
    "start_date",
    "start_date_local",
    "location_country",
    "summary_polyline",
    "average_heartrate",
    "average_speed",
    "elevation_gain",
)
POLYLINE_POINT_CAP = 800


def resolve_db(explicit):
    if explicit:
        return Path(explicit)
    env = os.environ.get("ACTIVITIES_DB", "").strip()
    if env:
        return Path(env)
    for candidate in (
        IMPORT_DIR / "activities.db",
        IMPORT_DIR / "data.db",
        ROOT / "activities.db",
        Path(SQL_FILE),
    ):
        if candidate.is_file():
            return candidate
    return None


def resolve_gpx(explicit):
    if explicit:
        return Path(explicit)
    env = os.environ.get("GPX_DIR", "").strip()
    if env:
        return Path(env)
    bundled = IMPORT_DIR / "GPX_OUT"
    if bundled.is_dir():
        return bundled
    return None


def connect(db_path):
    if not Path(db_path).is_file():
        raise SystemExit(f"找不到数据库：{db_path}")
    uri = Path(db_path).resolve().as_uri() + "?mode=ro"
    try:
        return sqlite3.connect(uri, uri=True)
    except sqlite3.Error as exc:
        raise SystemExit(f"无法打开 SQLite：{exc}") from exc


def read_rows(db_path):
    with connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        if "activities" not in tables:
            raise SystemExit(
                "这个库里没有 activities 表。需要 running_page / keep_sync 写出的 SQLite。"
            )
        columns = [row[1] for row in conn.execute("PRAGMA table_info(activities)")]
        missing = [name for name in REQUIRED_COLUMNS if name not in columns]
        if missing:
            raise SystemExit(f"activities 表缺少列：{', '.join(missing)}")
        present = [name for name in COPY_COLUMNS if name in columns]
        sql = "SELECT " + ", ".join(present) + " FROM activities"
        rows = [dict(row) for row in conn.execute(sql)]
    return columns, rows


def as_text(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return str(value)


_EPOCH_DURATION = re.compile(
    r"^1970-01-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$"
)


def as_duration(value):
    """Normalize SQLAlchemy Interval values stored on SQLite.

    Upstream running_page writes timedeltas as datetimes offset from
    1970-01-01, so ``1970-01-01 00:25:27`` is 25 minutes 27 seconds.
    """
    if value is None or value == "":
        return None
    if isinstance(value, timedelta):
        return str(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(timedelta(seconds=int(value)))
    text = as_text(value)
    if not text:
        return None
    match = _EPOCH_DURATION.match(text.strip())
    if match:
        extra_days = int(match.group(1)) - 1
        return str(
            timedelta(
                days=extra_days,
                hours=int(match.group(2)),
                minutes=int(match.group(3)),
                seconds=int(match.group(4)),
            )
        )
    return text


def place_label(value):
    """Turn Keep's region payload into a city label.

    The dumped ``location_country`` values are Python dict strings that also
    contain coordinates. The page shows city / province only.
    """
    text = as_text(value)
    if not text:
        return ""
    stripped = text.strip()
    if not (stripped.startswith("{") and "latitude" in stripped):
        return stripped
    try:
        data = ast.literal_eval(stripped)
    except (ValueError, SyntaxError, MemoryError):
        return ""
    if not isinstance(data, dict):
        return ""
    city = str(data.get("city") or "").strip()
    province = str(data.get("province") or "").strip()
    country = str(data.get("country") or "").strip()
    if city and province and city != province:
        return f"{province}{city}" if province not in city else city
    return city or province or country


def as_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def as_id(value):
    text = as_text(value)
    if text is None:
        return None
    text = text.strip()
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text or None


def simplify(points):
    if len(points) <= POLYLINE_POINT_CAP:
        return points
    step = max(1, len(points) // POLYLINE_POINT_CAP)
    trimmed = points[::step]
    last = points[-1]
    if trimmed[-1] != last:
        trimmed.append(last)
    return trimmed


def polyline_from_gpx(path):
    with open(path, encoding="utf-8") as handle:
        gpx = gpxpy.parse(handle)
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                if point.latitude is None or point.longitude is None:
                    continue
                points.append((point.latitude, point.longitude))
    if len(points) < 2:
        return ""
    return polyline.encode(simplify(points))


def find_gpx(gpx_dir, run_id):
    if not gpx_dir or not run_id:
        return None
    folder = Path(gpx_dir)
    direct = folder / f"{run_id}.gpx"
    if direct.is_file():
        return direct
    return None


def export_activities(rows, gpx_dir):
    exported = []
    skipped = 0
    filled_from_gpx = 0
    missing_track = 0
    for row in rows:
        distance = as_float(row.get("distance")) or 0.0
        if distance <= 0.1:
            skipped += 1
            continue
        run_id = as_id(row.get("run_id"))
        if not run_id:
            skipped += 1
            continue
        local = as_text(row.get("start_date_local")) or as_text(row.get("start_date")) or ""
        encoded = as_text(row.get("summary_polyline")) or ""
        if not encoded:
            gpx_path = find_gpx(gpx_dir, run_id)
            if gpx_path:
                try:
                    encoded = polyline_from_gpx(gpx_path)
                    if encoded:
                        filled_from_gpx += 1
                except Exception as exc:  # noqa: BLE001
                    print(f"GPX {gpx_path.name} 没有读成轨迹：{exc}", file=sys.stderr)
        if encoded:
            encoded = filter_out(encoded) or ""
        elif gpx_dir:
            missing_track += 1
        item = {
            "run_id": run_id,
            "name": as_text(row.get("name")) or "",
            "distance": distance,
            "moving_time": as_duration(row.get("moving_time")) or "0:00:00",
            "elapsed_time": as_duration(row.get("elapsed_time")),
            "type": as_text(row.get("type")) or "",
            "subtype": as_text(row.get("subtype")) or as_text(row.get("type")) or "",
            "start_date": as_text(row.get("start_date")) or local,
            "start_date_local": local,
            "location_country": place_label(row.get("location_country")),
            "summary_polyline": encoded,
            "average_heartrate": as_float(row.get("average_heartrate")),
            "average_speed": as_float(row.get("average_speed")),
            "elevation_gain": as_float(row.get("elevation_gain")),
        }
        exported.append(item)

    exported.sort(key=lambda item: item["start_date_local"])
    streak = 0
    last_day = None
    for item in exported:
        day = item["start_date_local"][:10]
        try:
            current = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            item["streak"] = 1
            continue
        if last_day is None or current == last_day:
            streak = 1 if last_day is None else streak
        elif current == last_day + timedelta(days=1):
            streak += 1
        else:
            streak = 1
        item["streak"] = streak
        last_day = current
    return exported, {
        "skipped": skipped,
        "filled_from_gpx": filled_from_gpx,
        "missing_track": missing_track,
    }


def install_db(src, dest):
    src = Path(src).resolve()
    dest = Path(dest).resolve()
    if src == dest:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return True


def link_gpx(src_dir, dest_dir):
    src_dir = Path(src_dir).resolve()
    dest_dir = Path(dest_dir).resolve()
    files = sorted(path for path in src_dir.glob("*.gpx") if path.is_file())
    if src_dir == dest_dir:
        return len(files), 0
    dest_dir.mkdir(parents=True, exist_ok=True)
    linked = 0
    for path in files:
        dest = dest_dir / path.name
        if dest.is_symlink() or dest.exists():
            try:
                same = dest.resolve() == path.resolve()
            except OSError:
                same = False
            if same:
                continue
            dest.unlink()
        dest.symlink_to(path)
        linked += 1
    return len(files), linked


def summarize_export(activities, stats):
    counts = Counter(item["type"] or "未知" for item in activities)
    dates = [item["start_date_local"][:10] for item in activities if item["start_date_local"]]
    lines = [f"记录 {len(activities)} 条"]
    for name, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])):
        lines.append(f"  {name}  {count}")
    if dates:
        lines.append(f"日期 {min(dates)} — {max(dates)}")
    with_line = sum(1 for item in activities if item.get("summary_polyline"))
    lines.append(f"有轨迹 {with_line} 条，无轨迹 {len(activities) - with_line} 条")
    if stats["filled_from_gpx"]:
        lines.append(f"其中 {stats['filled_from_gpx']} 条轨迹由 GPX 补进 JSON")
    if stats["skipped"]:
        lines.append(f"跳过 {stats['skipped']} 条（没有距离或没有 id）")
    return "\n".join(lines)


def import_dump(
    db_path,
    gpx_dir=None,
    *,
    sql_dest=SQL_FILE,
    json_file=JSON_FILE,
    gpx_dest=GPX_FOLDER,
    svg_file=SVG_FILE,
    dry_run=False,
):
    columns, rows = read_rows(db_path)
    activities, stats = export_activities(rows, gpx_dir)
    report = summarize_export(activities, stats)
    print(report)
    print(f"源库列：{', '.join(columns)}")
    if dry_run:
        print("dry-run：没有写入 JSON、数据库副本或 GPX 链接。")
        return activities
    copied = install_db(db_path, sql_dest)
    print(f"数据库{'已是' if not copied else '复制到'} {sql_dest}")
    if gpx_dir:
        total, linked = link_gpx(gpx_dir, gpx_dest)
        print(f"GPX {total} 个，新链接 {linked} 个 → {gpx_dest}")
    else:
        print("没有提供 GPX 目录。已有 summary_polyline 的记录仍可画在地图上。")
    Path(json_file).parent.mkdir(parents=True, exist_ok=True)
    with open(json_file, "w", encoding="utf-8") as handle:
        json.dump(activities, handle, ensure_ascii=False)
        handle.write("\n")
    print(f"写出 {json_file}")
    write_poster(svg_file, activities)
    print(f"写出 {svg_file}")
    return activities


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="把 Keep / running_page 的 activities.db 和 GPX_OUT 导入路书，不登录 Keep。"
    )
    parser.add_argument("--db", help="activities.db 或 data.db。默认查找 import/ 和环境变量 ACTIVITIES_DB")
    parser.add_argument("--gpx", help="GPX 目录。默认 import/GPX_OUT 或环境变量 GPX_DIR")
    parser.add_argument("--dry-run", action="store_true", help="只打印条数和类型，不写文件")
    options = parser.parse_args(argv)
    db_path = resolve_db(options.db)
    if db_path is None:
        raise SystemExit(
            "没有找到 activities.db。\n"
            "  ./scripts/import_dump.sh /path/to/activities.db /path/to/GPX_OUT\n"
            "或把文件放到 import/activities.db 与 import/GPX_OUT/ 后再运行。\n"
            "也可以设置 ACTIVITIES_DB 与 GPX_DIR。"
        )
    gpx_dir = resolve_gpx(options.gpx)
    print(f"读取 {Path(db_path).resolve()}")
    if gpx_dir:
        print(f"GPX 目录 {Path(gpx_dir).resolve()}")
    import_dump(db_path, gpx_dir, dry_run=options.dry_run)


if __name__ == "__main__":
    main()
