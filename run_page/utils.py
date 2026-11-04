"""Time helpers used by the Keep sync. Adapted from running_page."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def adjust_time(moment, tz_name):
    """Shift a UTC datetime by the zone's current offset, matching running_page."""
    name = tz_name or "Asia/Shanghai"
    try:
        tz = ZoneInfo(name)
    except Exception:  # noqa: BLE001
        tz = ZoneInfo("Asia/Shanghai")
    offset = datetime.now(tz).utcoffset() or timedelta(0)
    return moment + offset
