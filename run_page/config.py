import os
from collections import namedtuple

current = os.path.dirname(os.path.realpath(__file__))
parent = os.path.dirname(current)

GPX_FOLDER = os.path.join(parent, "GPX_OUT")
TCX_FOLDER = os.path.join(parent, "TCX_OUT")
SQL_FILE = os.path.join(current, "data.db")
JSON_FILE = os.path.join(parent, "src", "static", "activities.json")
SVG_FILE = os.path.join(parent, "public", "totals.svg")

ATHLETE_NAME = "贾栾"
ATHLETE_EN = "Jia Luan"

BASE_TIMEZONE = "Asia/Shanghai"

start_point = namedtuple("start_point", "lat lon")
run_map = namedtuple("polyline", "summary_polyline")
