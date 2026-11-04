"""Write a career-totals SVG from activities.json.

The page draws the same poster live. This file is the static export, in the
spirit of running_page's gen_svg.py, without inventing workouts.
"""

import json
import os
from collections import defaultdict
from datetime import datetime
from xml.sax.saxutils import escape

from config import ATHLETE_EN, ATHLETE_NAME, JSON_FILE, SVG_FILE

RUN = {"Run", "VirtualRun"}
WALK = {"Walk"}
RIDE = {"Ride", "Cycling"}
HIKE = {"Hiking", "Hike"}


def load_activities():
    if not os.path.exists(JSON_FILE):
        return []
    with open(JSON_FILE, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def parse_seconds(value):
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    days = 0
    if "day" in text:
        days = int(text.split("day", 1)[0].strip().split()[-1])
        text = text.split(",", 1)[-1].strip()
    parts = text.split(":")
    if len(parts) != 3:
        try:
            return int(float(text))
        except ValueError:
            return 0
    hours, minutes, seconds = parts
    return days * 86400 + int(float(hours)) * 3600 + int(minutes) * 60 + int(float(seconds))


def bucket(activity_type):
    if activity_type in RUN:
        return "run"
    if activity_type in WALK:
        return "walk"
    if activity_type in RIDE:
        return "ride"
    if activity_type in HIKE:
        return "hike"
    return "other"


def summarize(activities):
    activities = [item for item in activities if item.get("type") in RUN]
    sports = {key: {"count": 0, "distance": 0.0} for key in ("run", "walk", "ride", "hike", "other")}
    years = defaultdict(float)
    total_distance = 0.0
    total_seconds = 0
    dates = []
    for activity in activities:
        distance = float(activity.get("distance") or 0)
        if distance <= 0.1:
            continue
        kind = bucket(activity.get("type"))
        sports[kind]["count"] += 1
        sports[kind]["distance"] += distance
        total_distance += distance
        total_seconds += parse_seconds(activity.get("moving_time"))
        local = str(activity.get("start_date_local") or "")
        if len(local) >= 4 and local[:4].isdigit():
            years[int(local[:4])] += distance
            if len(local) >= 10:
                dates.append(local[:10])
    return {
        "count": sum(item["count"] for item in sports.values()),
        "distance": total_distance,
        "seconds": total_seconds,
        "sports": sports,
        "years": dict(years),
        "dates": sorted(set(dates)),
    }


def km_text(meters):
    km = meters / 1000
    if km >= 100:
        return f"{km:.0f}"
    if km >= 10:
        return f"{km:.1f}"
    return f"{km:.2f}"


def longest_streak(dates):
    if not dates:
        return 0
    best = current = 1
    previous = datetime.strptime(dates[0], "%Y-%m-%d")
    for key in dates[1:]:
        day = datetime.strptime(key, "%Y-%m-%d")
        gap = (day - previous).days
        if gap == 1:
            current += 1
        elif gap > 1:
            current = 1
        best = max(best, current)
        previous = day
    return best


def render(summary):
    now_year = datetime.now().year
    present = sorted(summary["years"])
    if present:
        start = present[0]
        end = max(present[-1], now_year)
    else:
        start, end = now_year - 9, now_year
    year_list = list(range(start, end + 1))
    peak = max((summary["years"].get(year, 0) for year in year_list), default=0)
    empty = summary["count"] == 0
    headline = "尚无记录" if empty else km_text(summary["distance"])
    headline_size = 42 if empty else 60
    unit = "" if empty else "公里"
    streak = longest_streak(summary["dates"])
    streak_label = "—" if streak == 0 else str(streak)

    bars = []
    slot = 760 / max(len(year_list), 1)
    for index, year in enumerate(year_list):
        meters = summary["years"].get(year, 0)
        height = 0 if peak <= 0 else 150 * (meters / peak)
        x = 160 + index * slot
        y = 470 - height
        color = "#e4d8c4" if meters <= 0 else "#c24b34"
        bars.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(slot - 14, 8):.1f}" '
            f'height="{height:.1f}" rx="3" fill="{color}"/>'
        )
        bars.append(
            f'<text x="{x + max(slot - 14, 8) / 2:.1f}" y="492" text-anchor="middle" '
            f'font-size="12" fill="#6e6256">{year}</text>'
        )

    def sport_block(label, key, color, x):
        item = summary["sports"][key]
        value = "—" if item["count"] == 0 else km_text(item["distance"])
        return (
            f'<text x="{x}" y="250" font-size="15" fill="{color}">{escape(label)}</text>'
            f'<text x="{x}" y="286" font-size="28" fill="#1f1a16" '
            f'font-family="Fraunces, Palatino, serif">{escape(value)}</text>'
            f'<text x="{x}" y="310" font-size="13" fill="#6e6256">{item["count"]} 次</text>'
        )

    span = "同步全量历史之后，第一天和最近一天会写在这里。"
    if summary["dates"]:
        span = f"{summary['dates'][0]}  —  {summary['dates'][-1]}"

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 640" role="img" aria-labelledby="title desc">
  <title id="title">{escape(ATHLETE_NAME)}的路书</title>
  <desc id="desc">Keep 累计里程、运动构成与年份。没有同步数据时不显示成绩。</desc>
  <rect width="1080" height="640" fill="#f6f1e6"/>
  <rect x="28" y="28" width="1024" height="584" fill="none" stroke="#1f1a16" stroke-opacity="0.18"/>
  <rect x="64" y="64" width="72" height="72" fill="none" stroke="#a33b32" stroke-width="2" transform="rotate(-8 100 100)"/>
  <text x="100" y="112" text-anchor="middle" font-size="36" fill="#a33b32" font-family="Songti SC, Noto Serif SC, serif">栾</text>
  <text x="168" y="92" font-size="16" letter-spacing="4" fill="#6e6256">{escape(ATHLETE_EN.upper())} · KEEP</text>
  <text x="168" y="136" font-size="42" fill="#1f1a16" font-family="Songti SC, Noto Serif SC, serif">{escape(ATHLETE_NAME)}的路书</text>
  <text x="1000" y="124" text-anchor="end" font-size="{headline_size}" fill="#1f1a16" font-family="Fraunces, Palatino, serif">{escape(headline)}</text>
  <text x="1000" y="152" text-anchor="end" font-size="16" fill="#6e6256">{escape(unit if unit else "等待 Keep 同步")}</text>
  <text x="64" y="196" font-size="15" fill="#6e6256">{escape(span)}</text>
  {sport_block("跑步", "run", "#c24b34", 64)}
  <text x="808" y="250" font-size="15" fill="#9a7844">最长连续</text>
  <text x="808" y="286" font-size="28" fill="#1f1a16" font-family="Fraunces, Palatino, serif">{streak_label}</text>
  <text x="808" y="310" font-size="13" fill="#6e6256">天</text>
  <text x="64" y="360" font-size="14" letter-spacing="3" fill="#6e6256">年份</text>
  <line x1="64" y1="470" x2="1016" y2="470" stroke="#1f1a16" stroke-opacity="0.2"/>
  {''.join(bars)}
  <text x="64" y="560" font-size="13" fill="#6e6256">{"空海报。数字只会在真实同步之后出现。" if empty else "由本地 activities.json 导出，轨迹不画在这张海报上。"}</text>
</svg>
'''


def write_poster(path, activities=None):
    summary = summarize(load_activities() if activities is None else activities)
    svg = render(summary)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(svg)
    return summary


def main():
    summary = write_poster(SVG_FILE)
    print(f"wrote {SVG_FILE} ({summary['count']} activities)")


if __name__ == "__main__":
    main()
