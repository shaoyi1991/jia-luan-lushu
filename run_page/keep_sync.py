"""Keep → SQLite / GPX / activities.json.

Adapted from yihong0618/running_page (MIT). Credentials come only from the
environment (KEEP_MOBILE, KEEP_PASSWORD). The script always pages through
full history (`dateUnit=all`), not a recent-day window.

The AES key and IV below are Keep client constants carried over from
running_page so a logged-in user can decode their own tracks. They are not
account secrets.
"""

import argparse
import base64
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
import zlib
from collections import namedtuple
from datetime import UTC, datetime, timedelta
from xml.dom import minidom

import eviltransform
import gpxpy
import polyline
import requests
from config import (
    GPX_FOLDER,
    JSON_FILE,
    SQL_FILE,
    TCX_FOLDER,
    run_map,
    start_point,
)
from Crypto.Cipher import AES
from generator import Generator

from utils import adjust_time

KEEP_SPORT_TYPES = ["running", "hiking", "cycling"]
KEEP2STRAVA = {
    "outdoorWalking": "Walk",
    "outdoorRunning": "Run",
    "outdoorCycling": "Ride",
    "indoorRunning": "VirtualRun",
    "mountaineering": "Hiking",
}
KEEP2TCX = {
    "outdoorWalking": "Walking",
    "outdoorRunning": "Running",
    "outdoorCycling": "Biking",
    "indoorRunning": "Running",
    "mountaineering": "Hiking",
}
DISPLAY_NAME = {
    "Run": "跑步",
    "VirtualRun": "室内跑",
    "Ride": "骑行",
    "Hiking": "徒步",
    "Walk": "行走",
}

# need to test
LOGIN_API = "https://api.gotokeep.com/v1.1/users/login"
RUN_DATA_API = "https://api.gotokeep.com/pd/v3/stats/detail?dateUnit=all&type={sport_type}&lastDate={last_date}"
RUN_LOG_API = "https://api.gotokeep.com/pd/v3/{sport_type}log/{run_id}"

HR_FRAME_THRESHOLD_IN_DECISECOND = 100  # Maximum time difference to consider a data point as the nearest, the unit is decisecond(分秒)

TIMESTAMP_THRESHOLD_IN_DECISECOND = 3_600_000  # Threshold for target timestamp adjustment, the unit of timestamp is decisecond(分秒), so the 3_600_000 stands for 100 hours sports time. 100h = 100 * 60 * 60 * 10

# If your points need trans from gcj02 to wgs84 coordinate which use by Mapbox
TRANS_GCJ02_TO_WGS84 = True


def login(session, mobile, password):
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0",
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    }
    data = {"mobile": mobile, "password": password}
    try:
        r = session.post(LOGIN_API, headers=headers, data=data, timeout=30)
    except requests.RequestException as exc:
        raise SystemExit(f"无法连接 Keep 登录接口：{exc}") from exc
    if not r.ok:
        snippet = " ".join(r.text[:180].split())
        raise SystemExit(
            "Keep 登录失败（HTTP "
            f"{r.status_code}）。请确认账号能用手机号 + 密码登录，"
            "而不是只能微信或验证码。海外号码通常要换成 +86 手机号。"
            f"响应摘要：{snippet}"
        )
    try:
        token = r.json()["data"]["token"]
    except (ValueError, KeyError, TypeError) as exc:
        raise SystemExit(
            "Keep 登录响应里没有 token。接口可能已变更，或触发了验证码 / 风控。"
            f"（{exc}）"
        ) from exc
    headers["Authorization"] = f"Bearer {token}"
    return session, headers


def get_to_download_runs_ids(session, headers, sport_type):
    """Page with dateUnit=all until Keep stops returning an older cursor.

    This is the full-history path. There is no "last N days" mode.
    """
    last_date = 0
    seen_cursors = set()
    result = []
    pages = 0

    while True:
        if last_date in seen_cursors:
            print(f"{sport_type} 分页游标重复，停止。")
            break
        seen_cursors.add(last_date)
        pages += 1
        if pages > 500:
            print(f"{sport_type} 已翻过 500 页，停止以免死循环。请检查接口是否变更。")
            break
        try:
            r = session.get(
                RUN_DATA_API.format(sport_type=sport_type, last_date=last_date),
                headers=headers,
                timeout=30,
            )
        except requests.RequestException as exc:
            print(f"拉取 {sport_type} 列表失败：{exc}")
            break
        if not r.ok:
            print(f"拉取 {sport_type} 列表失败 HTTP {r.status_code}，停止这一类。")
            break
        try:
            payload = r.json().get("data") or {}
            run_logs = payload.get("records") or []
        except (ValueError, AttributeError) as exc:
            print(f"Keep 列表不是预期的 JSON（{exc}）。可能被风控或接口已变更。")
            break

        for i in run_logs:
            logs = [j.get("stats") or {} for j in i.get("logs") or []]
            result.extend(k["id"] for k in logs if k.get("id") and not k.get("isDoubtful"))
        last_date = payload.get("lastTimestamp") or 0
        if last_date:
            since_time = datetime.fromtimestamp(last_date // 1000, tz=UTC)
            print(f"parsed keep ids data since {since_time}")
        else:
            print(f"{sport_type} 已翻到最早一页。")
            break
        time.sleep(1)  # spider rule
    return result


def get_single_run_data(session, headers, run_id, sport_type):
    r = session.get(
        RUN_LOG_API.format(sport_type=sport_type, run_id=run_id),
        headers=headers,
        timeout=30,
    )
    if r.ok:
        return r.json()
    print(f"ID {run_id} 详情请求失败 HTTP {r.status_code}")
    return None


def decode_runmap_data(text, is_geo=False):
    _bytes = base64.b64decode(text)
    key = "NTZmZTU5OzgyZzpkODczYw=="
    iv = "MjM0Njg5MjQzMjkyMDMwMA=="
    if is_geo:
        cipher = AES.new(base64.b64decode(key), AES.MODE_CBC, base64.b64decode(iv))
        _bytes = cipher.decrypt(_bytes)
    run_points_data = zlib.decompress(_bytes, 16 + zlib.MAX_WBITS)
    run_points_data = json.loads(run_points_data)
    return run_points_data


def parse_raw_data_to_nametuple(
    run_data, old_gpx_ids, old_tcx_ids, with_gpx=False, with_tcx=False
):
    run_data = run_data["data"]
    run_points_data = []

    # 5898009e387e28303988f3b7_9223370441312156007_rn middle
    parts = str(run_data.get("id") or "").split("_")
    if len(parts) < 2 or not parts[1].isdigit():
        print(f"unexpected keep id {run_data.get('id')}")
        return None
    keep_id = parts[1]

    start_time = run_data["startTime"]
    avg_heart_rate = None
    elevation_gain = None
    decoded_hr_data = []
    if run_data.get("heartRate"):
        avg_heart_rate = run_data["heartRate"].get("averageHeartRate", None)
        heart_rate_data = run_data["heartRate"].get("heartRates", None)
        if heart_rate_data:
            decoded_hr_data = decode_runmap_data(heart_rate_data)
        # fix #66
        if avg_heart_rate and avg_heart_rate < 0:
            avg_heart_rate = None

    if run_data.get("geoPoints"):
        run_points_data = decode_runmap_data(run_data["geoPoints"], True)
        run_points_data_gpx = run_points_data
        if TRANS_GCJ02_TO_WGS84:
            run_points_data = [
                list(eviltransform.gcj2wgs(p["latitude"], p["longitude"]))
                for p in run_points_data
            ]
            for i, p in enumerate(run_points_data_gpx):
                p["latitude"] = run_points_data[i][0]
                p["longitude"] = run_points_data[i][1]

        for p in run_points_data_gpx:
            if "timestamp" not in p:
                if "unixTimestamp" in p:
                    p["timestamp"] = p["unixTimestamp"]
                else:
                    p["timestamp"] = 0
            p_hr = find_nearest_hr(decoded_hr_data, int(p["timestamp"]), start_time)
            if p_hr:
                p["hr"] = p_hr

        data_type = run_data.get("dataType") or ""
        if data_type.startswith("outdoor") or data_type == "mountaineering":
            if with_gpx:
                gpx_data = parse_points_to_gpx(
                    run_points_data_gpx,
                    start_time,
                    KEEP2STRAVA.get(data_type, data_type),
                )
                elevation_gain = gpx_data.get_uphill_downhill().uphill
                if str(keep_id) not in old_gpx_ids:
                    download_keep_gpx(gpx_data.to_xml(), str(keep_id))
            if with_tcx:
                tcx_data = parse_points_to_tcx(
                    run_data,
                    run_points_data_gpx,
                    KEEP2TCX.get(data_type, "Other"),
                )
                # elevation_gain = tcx_data.get_uphill_downhill().uphill
                if str(keep_id) not in old_tcx_ids:
                    download_keep_tcx(tcx_data.toprettyxml(), str(keep_id))
    else:
        print(f"ID {keep_id} no gps data")
    polyline_str = polyline.encode(run_points_data) if run_points_data else ""
    if not run_points_data:
        start_latlng = None
    elif isinstance(run_points_data[0], dict):
        start_latlng = start_point(
            run_points_data[0]["latitude"], run_points_data[0]["longitude"]
        )
    else:
        start_latlng = start_point(*run_points_data[0])
    start_date = datetime.fromtimestamp(start_time // 1000, tz=UTC)
    tz_name = run_data.get("timezone", "")
    start_date_local = adjust_time(start_date, tz_name)
    end = datetime.fromtimestamp(run_data["endTime"] // 1000, tz=UTC)
    end_local = adjust_time(end, tz_name)
    duration = run_data.get("duration") or 0
    distance = run_data.get("distance") or 0
    if not duration:
        print(f"ID {keep_id} has no total time just ignore please check")
        return None
    sport = KEEP2STRAVA.get(run_data.get("dataType"), run_data.get("dataType") or "Workout")
    d = {
        "id": int(keep_id),
        "name": f"{DISPLAY_NAME.get(sport, sport)} · Keep",
        "type": sport,
        "subtype": sport,
        "start_date": datetime.strftime(start_date, "%Y-%m-%d %H:%M:%S"),
        "end": datetime.strftime(end, "%Y-%m-%d %H:%M:%S"),
        "start_date_local": datetime.strftime(start_date_local, "%Y-%m-%d %H:%M:%S"),
        "end_local": datetime.strftime(end_local, "%Y-%m-%d %H:%M:%S"),
        "length": distance,
        "average_heartrate": int(avg_heart_rate) if avg_heart_rate else None,
        "map": run_map(polyline_str),
        "start_latlng": start_latlng,
        "distance": distance,
        "moving_time": timedelta(seconds=duration),
        "elapsed_time": timedelta(
            seconds=int((run_data["endTime"] - run_data["startTime"]) // 1000)
        ),
        "average_speed": distance / duration,
        "elevation_gain": elevation_gain,
        "location_country": str(run_data.get("region", "")),
    }
    return namedtuple("x", d.keys())(*d.values())


def get_all_keep_tracks(
    email,
    password,
    old_tracks_ids,
    keep_sports_data_api,
    with_gpx=False,
    with_tcx=False,
):
    if with_gpx and not os.path.exists(GPX_FOLDER):
        os.mkdir(GPX_FOLDER)
    if with_tcx and not os.path.exists(TCX_FOLDER):
        os.mkdir(TCX_FOLDER)
    s = requests.Session()
    s, headers = login(s, email, password)
    tracks = []
    for api in keep_sports_data_api:
        runs = get_to_download_runs_ids(s, headers, api)
        runs = [run for run in runs if run.split("_")[1] not in old_tracks_ids]
        print(f"{len(runs)} new keep {api} data to generate")
        old_gpx_ids = []
        if with_gpx:
            old_gpx_ids = os.listdir(GPX_FOLDER)
            old_gpx_ids = [
                i.split(".")[0] for i in old_gpx_ids if not i.startswith(".")
            ]
        old_tcx_ids = []
        if with_tcx:
            old_tcx_ids = os.listdir(TCX_FOLDER)
            old_tcx_ids = [
                i.split(".")[0] for i in old_tcx_ids if not i.startswith(".")
            ]
        for run in runs:
            print(f"parsing keep id {run}")
            try:
                run_data = get_single_run_data(s, headers, run, api)
                if not run_data:
                    continue
                track = parse_raw_data_to_nametuple(
                    run_data, old_gpx_ids, old_tcx_ids, with_gpx, with_tcx
                )
                if track:
                    tracks.append(track)
            except Exception as e:  # noqa: BLE001
                print(f"Something wrong paring keep id {run}: " + str(e))
    return tracks


def parse_points_to_gpx(run_points_data, start_time, sport_type):
    """
    Convert run points data to GPX format.

    Args:
        run_id (str): The ID of the run.
        run_points_data (list of dict): A list of run data points.
        start_time (int): The start time for adjusting timestamps. Note that the unit of the start_time is millisecond

    Returns:
        gpx_data (str): GPX data in string format.
    """
    points_dict_list = []
    # early timestamp fields in keep's data stands for delta time, but in newly data timestamp field stands for exactly time,
    # so it doesn't need to plus extra start_time
    if (
        run_points_data
        and run_points_data[0]["timestamp"] > TIMESTAMP_THRESHOLD_IN_DECISECOND
    ):
        start_time = 0

    for point in run_points_data:
        points_dict = {
            "latitude": point["latitude"],
            "longitude": point["longitude"],
            # note that the timestamp of a point is decisecond(分秒)
            "time": datetime.fromtimestamp(
                (start_time // 1000 + point["timestamp"] // 10),
                tz=UTC,
            ),
            "elevation": point.get("altitude"),
            "hr": point.get("hr"),
        }
        points_dict_list.append(points_dict)
    gpx = gpxpy.gpx.GPX()
    gpx.nsmap["gpxtpx"] = "http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
    gpx_track = gpxpy.gpx.GPXTrack()
    gpx_track.name = "gpx from keep"
    gpx_track.type = sport_type
    gpx.tracks.append(gpx_track)

    # Create first segment in our GPX track:
    gpx_segment = gpxpy.gpx.GPXTrackSegment()
    gpx_track.segments.append(gpx_segment)
    for p in points_dict_list:
        point = gpxpy.gpx.GPXTrackPoint(
            latitude=p["latitude"],
            longitude=p["longitude"],
            time=p["time"],
            elevation=p.get("elevation"),
        )
        if p.get("hr") is not None:
            gpx_extension_hr = ET.fromstring(
                f"""<gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
                    <gpxtpx:hr>{p["hr"]}</gpxtpx:hr>
                    </gpxtpx:TrackPointExtension>
                    """
            )
            point.extensions.append(gpx_extension_hr)
        gpx_segment.points.append(point)
    return gpx


def parse_points_to_tcx(run_data, run_points_data, sport_type):
    """
    Convert run points data to TCX format.

    Args:
        run_points_data (list of dict): A list of run data points.

    Returns:
        tcx_data (str): TCX data in string format.
    """

    # note that the timestamp of a point is decisecond(分秒)
    fit_start_time = datetime.fromtimestamp(
        run_data.get("startTime") // 1000, tz=UTC
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Root node
    training_center_database = ET.Element(
        "TrainingCenterDatabase",
        {
            "xmlns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
            "xmlns:ns5": "http://www.garmin.com/xmlschemas/ActivityGoals/v1",
            "xmlns:ns3": "http://www.garmin.com/xmlschemas/ActivityExtension/v2",
            "xmlns:ns2": "http://www.garmin.com/xmlschemas/UserProfile/v2",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xmlns:ns4": "http://www.garmin.com/xmlschemas/ProfileExtension/v1",
            "xsi:schemaLocation": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd",
        },
    )
    # xml tree
    ET.ElementTree(training_center_database)
    # Activities
    activities = ET.Element("Activities")
    training_center_database.append(activities)
    # activity
    activity = ET.Element("Activity", {"Sport": sport_type})
    activities.append(activity)
    # Id
    activity_id = ET.Element("Id")
    activity_id.text = fit_start_time  # Keep use start_time as ID
    activity.append(activity_id)
    # Lap
    activity_lap = ET.Element("Lap", {"StartTime": fit_start_time})
    activity.append(activity_lap)
    # TotalTimeSeconds
    activity_total_time = ET.Element("TotalTimeSeconds")
    activity_total_time.text = str(run_data.get("duration"))
    activity_lap.append(activity_total_time)
    # DistanceMeters
    activity_distance = ET.Element("DistanceMeters")
    activity_distance.text = str(run_data.get("distance"))
    activity_lap.append(activity_distance)
    #       Calories
    activity_calories = ET.Element("Calories")
    activity_calories.text = str(run_data.get("calorie"))
    activity_lap.append(activity_calories)
    # Track
    track = ET.Element("Track")
    activity_lap.append(track)
    for point in run_points_data:
        tp = ET.Element("Trackpoint")
        track.append(tp)
        # Time
        # note that the timestamp of a point is decisecond(分秒)
        time_stamp = datetime.fromtimestamp(
            (run_data.get("startTime") // 1000 + point.get("timestamp") // 10),
            tz=UTC,
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        time_label = ET.Element("Time")
        time_label.text = time_stamp
        tp.append(time_label)
        # Position
        try:
            position = ET.Element("Position")
            tp.append(position)
            #   LatitudeDegrees
            lati = ET.Element("LatitudeDegrees")
            lati.text = str(point["latitude"])
            position.append(lati)
            #   LongitudeDegrees
            longi = ET.Element("LongitudeDegrees")
            longi.text = str(point["longitude"])
            position.append(longi)
            #  AltitudeMeters
            altitude_meters = ET.Element("AltitudeMeters")
            altitude_meters.text = str(point.get("altitude"))
            tp.append(altitude_meters)
        except KeyError:
            pass
        # HeartRateBpm
        try:
            bpm = ET.Element("HeartRateBpm")
            bpm_value = ET.Element("Value")
            bpm.append(bpm_value)
            bpm_value.text = str(point["hr"])
            tp.append(bpm)
        except KeyError:
            pass
    # write to TCX file
    xml_str = minidom.parseString(ET.tostring(training_center_database))
    return xml_str


def find_nearest_hr(
    hr_data_list, target_time, start_time, threshold=HR_FRAME_THRESHOLD_IN_DECISECOND
):
    """
    Find the nearest heart rate data point to the target time.
    if cannot found suitable HR data within the specified time frame (within 10 seconds by default), there will be no hr data return
    Args:
        heart_rate_data (list of dict): A list of heart rate data points, where each point is a dictionary
            containing at least "timestamp" and "beatsPerMinute" keys.
        target_time (float): The target timestamp for which to find the nearest heart rate data point. Please Note that the unit of target_time is decisecond(分秒),
            means 1/10 of a second ,this is very unusual!! so when we convert a target_time to second we need to divide by 10, and when we convert a target time to millisecond
            we need to times 100.
        start_time (float): The reference start time. the unit of start_time is normal millisecond timestamp
        threshold (float, optional): The maximum allowed time difference to consider a data point as the nearest.
            Default is HR_THRESHOLD, the unit is decisecond(分秒)

    Returns:
        int or None: The heart rate value of the nearest data point, or None if no suitable data point is found.
    """
    closest_element = None
    # init difference value
    min_difference = float("inf")
    if target_time > TIMESTAMP_THRESHOLD_IN_DECISECOND:
        # note that the unit of target_time is decisecond and the unit of start_time is normal millisecond
        target_time = target_time - start_time // 100

    for item in hr_data_list:
        timestamp = item.get("timestamp")

        if not timestamp:
            continue

        difference = abs(timestamp - target_time)

        if difference <= threshold and difference < min_difference:
            closest_element = item
            min_difference = difference

    if closest_element:
        hr = closest_element.get("beatsPerMinute")
        if hr and hr > 0:
            return hr

    return None


def download_keep_gpx(gpx_data, keep_id):
    try:
        print(f"downloading keep_id {keep_id!s} gpx")
        file_path = os.path.join(GPX_FOLDER, str(keep_id) + ".gpx")
        with open(file_path, "w") as fb:
            fb.write(gpx_data)
        return file_path
    except Exception as e:  # noqa: BLE001
        print(f"Something wrong to download keep gpx {e!s}")
        print(f"wrong id {keep_id}")


def download_keep_tcx(tcx_data, keep_id):
    try:
        print(f"downloading keep_id {keep_id!s} tcx")
        file_path = os.path.join(TCX_FOLDER, str(keep_id) + ".tcx")
        with open(file_path, "w") as fb:
            fb.write(tcx_data)
        return file_path
    except Exception as e:  # noqa: BLE001
        print(f"Something wrong to download keep tcx {e!s}")
        print(f"wrong id {keep_id}")


def run_keep_sync(
    email, password, keep_sports_data_api, with_gpx=False, with_tcx=False
):
    generator = Generator(SQL_FILE)
    old_tracks_ids = generator.get_old_tracks_ids()
    new_tracks = get_all_keep_tracks(
        email, password, old_tracks_ids, keep_sports_data_api, with_gpx, with_tcx
    )
    generator.sync_from_app(new_tracks)

    activities_list = generator.load()
    os.makedirs(os.path.dirname(JSON_FILE), exist_ok=True)
    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(activities_list, f, ensure_ascii=False)
        f.write("\n")


def credentials_from_env():
    mobile = os.environ.get("KEEP_MOBILE", "").strip()
    password = os.environ.get("KEEP_PASSWORD", "")
    if not mobile or not password:
        print(
            "请设置环境变量 KEEP_MOBILE 和 KEEP_PASSWORD。\n"
            "不要把手机号或密码写进命令行、代码或提交到仓库。\n"
            "示例：\n"
            "  export KEEP_MOBILE='13800000000'\n"
            "  export KEEP_PASSWORD='你的密码'\n"
            "  python3 run_page/keep_sync.py --with-gpx --sync-types running cycling hiking",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return mobile, password


if __name__ == "__main__":
    if any(arg and not arg.startswith("-") for arg in sys.argv[1:]):
        print(
            "不要把手机号或密码放在命令行参数里。请使用环境变量 KEEP_MOBILE 与 KEEP_PASSWORD。",
            file=sys.stderr,
        )
        raise SystemExit(2)
    parser = argparse.ArgumentParser(
        description=(
            "从 Keep 同步全部历史（running / cycling / hiking）到 SQLite、"
            "activities.json，并可用 --with-gpx 写出轨迹。"
            "账号只从环境变量 KEEP_MOBILE、KEEP_PASSWORD 读取。"
        )
    )
    parser.add_argument(
        "--sync-types",
        dest="sync_types",
        nargs="+",
        default=KEEP_SPORT_TYPES,
        help="运动类型，默认 running hiking cycling 全部。可选：running cycling hiking",
    )
    parser.add_argument(
        "--with-gpx",
        dest="with_gpx",
        action="store_true",
        help="把有轨迹的记录写成 GPX_OUT/<id>.gpx（推荐）",
    )
    parser.add_argument(
        "--with-tcx",
        dest="with_tcx",
        action="store_true",
        help="同时写出 TCX_OUT/<id>.tcx",
    )
    options = parser.parse_args()
    for _tpye in options.sync_types:
        if _tpye not in KEEP_SPORT_TYPES:
            parser.error(
                f"{_tpye} 不支持。可选：{', '.join(KEEP_SPORT_TYPES)}"
            )
    mobile, password = credentials_from_env()
    run_keep_sync(
        mobile,
        password,
        options.sync_types,
        options.with_gpx,
        options.with_tcx,
    )
