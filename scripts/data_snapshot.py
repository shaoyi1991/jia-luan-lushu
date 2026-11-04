#!/usr/bin/env python3
"""Read-only export audit; writes a compact JSON snapshot to stdout only."""

import argparse
from collections import Counter
from datetime import date, datetime
import hashlib
import json
import math
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]


def snapshot(path):
    raw = path.read_bytes()
    rows = json.loads(raw)
    if not isinstance(rows, list) or not rows:
        raise ValueError("记录必须为非空数组；空导出需先核实，不能作为正常更新")
    ids = []
    days = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"第 {index + 1} 条记录不是对象")
        run_id = row.get("run_id")
        if not isinstance(run_id, str) or not run_id:
            raise ValueError(f"第 {index + 1} 条 run_id 必须为非空字符串")
        ids.append(run_id)
        if not isinstance(row.get("type"), str) or not row["type"]:
            raise ValueError(f"第 {index + 1} 条缺少运动类型")
        local = row.get("start_date_local")
        if not isinstance(local, str) or len(local) < 19:
            raise ValueError(f"第 {index + 1} 条缺少完整本地时间")
        datetime.fromisoformat(local)
        days.append(date.fromisoformat(local[:10]))
        distance = row.get("distance")
        if isinstance(distance, bool) or not isinstance(distance, (int, float)):
            raise ValueError(f"第 {index + 1} 条距离不是数值")
        if not math.isfinite(distance) or distance <= 0.1:
            raise ValueError(f"第 {index + 1} 条距离不满足当前导出规则")
    if len(ids) != len(set(ids)):
        raise ValueError("存在重复 run_id；这与跨设备重复候选不是同一个问题")
    runs = [r for r in rows if r["type"] in {"Run", "VirtualRun"}]
    run_days = sorted({date.fromisoformat(r["start_date_local"][:10]) for r in runs})
    longest = current = 0
    start = best_from = best_to = previous = None
    for day in run_days:
        if previous is not None and (day - previous).days == 1:
            current += 1
        else:
            current = 1
            start = day
        if current > longest:
            longest, best_from, best_to = current, start, day
        previous = day
    return {
        "checked_at": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds"),
        "source": str(path.resolve().relative_to(ROOT)) if path.resolve().is_relative_to(ROOT) else path.name,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "scope": "export as-is; Run + VirtualRun; no cross-device deduplication",
        "total_records": len(rows),
        "types": dict(sorted(Counter(r["type"] for r in rows).items())),
        "date_from": min(days).isoformat(),
        "data_through": max(days).isoformat(),
        "run_records": len(runs),
        "run_km": round(sum(r["distance"] for r in runs) / 1000, 3),
        "run_days": len(run_days),
        "run_longest_streak": {
            "days": longest,
            "from": best_from.isoformat() if best_from else None,
            "to": best_to.isoformat() if best_to else None,
        },
        "records_with_track": sum(bool(r.get("summary_polyline")) for r in rows),
        "duplicate_ids": 0,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=ROOT / "src/static/activities.json")
    args = parser.parse_args()
    try:
        result = snapshot(args.path)
    except (OSError, ValueError, TypeError) as exc:
        print(f"数据检查失败：{exc}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))
