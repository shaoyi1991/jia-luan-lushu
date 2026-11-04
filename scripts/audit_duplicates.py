#!/usr/bin/env python3
"""Print review candidates only. Never remove or rewrite source activities."""
from collections import defaultdict
from datetime import datetime
from itertools import combinations
from pathlib import Path
import hashlib
import json


def candidates(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['start_date_local'][:10], row['type'])].append(row)
    result = []
    for group in groups.values():
        for a, b in combinations(sorted(group, key=lambda r: r['start_date_local']), 2):
            gap = (datetime.fromisoformat(b['start_date_local']) - datetime.fromisoformat(a['start_date_local'])).total_seconds()
            max_distance = max(a['distance'], b['distance'])
            if max_distance <= 0:
                continue
            ratio = abs(a['distance'] - b['distance']) / max_distance
            if gap <= 2700 and ratio <= .1:
                fields = ('run_id', 'start_date_local', 'type', 'distance', 'moving_time', 'elapsed_time')
                result.append({'records': [{k: r.get(k) for k in fields} for r in (a,b)], 'start_gap_seconds': gap, 'distance_difference_ratio': round(ratio,4), 'decision':'retain-both-pending-evidence'})
    return result


if __name__ == '__main__':
    source = Path(__file__).resolve().parents[1] / 'src/static/activities.json'
    raw = source.read_bytes()
    result = candidates(json.loads(raw))
    print(json.dumps({'source_sha256':hashlib.sha256(raw).hexdigest(), 'rule':'same local day and type; start gap <=45 minutes; distance difference / maximum distance <=10%; candidates only', 'candidate_pairs':len(result), 'excluded_ids':[], 'candidates':result},ensure_ascii=False,indent=2))
