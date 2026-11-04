import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDuration } from '../src/lib/format.ts'
import { computeStreak, filterActivities, summarize, yearWeeks } from '../src/lib/stats.ts'
import type { Activity } from '../src/types.ts'

function activity(partial: Partial<Activity> & Pick<Activity, 'run_id' | 'start_date_local' | 'type'>): Activity {
  return {
    name: 'fixture',
    distance: 1000,
    moving_time: '0:10:00',
    summary_polyline: '',
    ...partial,
  }
}

test('duration parses sqlalchemy interval strings', () => {
  assert.equal(parseDuration('0:01:30'), 90)
  assert.equal(parseDuration('1 day, 2:00:00'), 93600)
  assert.equal(parseDuration('2 days, 0:00:01'), 172801)
  assert.equal(parseDuration('1970-01-01 00:25:27.000000'), 25 * 60 + 27)
  assert.equal(parseDuration('1970-01-02 01:00:00.000000'), 86400 + 3600)
})

test('streaks ignore same-day doubles and stop when the chain breaks', () => {
  const days = ['2024-01-01', '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-05']
  const streak = computeStreak(days, '2024-01-05')
  assert.equal(streak.longest, 3)
  assert.equal(streak.from, '2024-01-01')
  assert.equal(streak.to, '2024-01-03')
  assert.equal(streak.current, 1)
  assert.equal(computeStreak(days, '2024-01-08').current, 0)
})

test('summary buckets sports and does not treat an empty list as a total', () => {
  const empty = summarize([])
  assert.equal(empty.count, 0)
  assert.equal(empty.distance, 0)
  assert.equal(empty.span, null)

  const rows = summarize([
    activity({ run_id: 1, type: 'Run', start_date_local: '2024-05-01 08:00:00', distance: 5000, moving_time: '0:30:00' }),
    activity({ run_id: 2, type: 'Ride', start_date_local: '2024-05-02 08:00:00', distance: 20000, moving_time: '1:00:00' }),
    activity({ run_id: 3, type: 'Hiking', start_date_local: '2024-06-01 08:00:00', distance: 8000, moving_time: '2:00:00' }),
  ])
  assert.equal(rows.sports.run.count, 1)
  assert.equal(rows.sports.ride.distance, 20000)
  assert.equal(rows.sports.hike.count, 1)
  assert.equal(rows.count, 3)
  const filtered = filterActivities(
    [
      activity({ run_id: 1, type: 'Run', start_date_local: '2024-05-01 08:00:00' }),
      activity({ run_id: 2, type: 'Ride', start_date_local: '2024-05-02 08:00:00' }),
    ],
    'run',
    2024,
  )
  assert.deepEqual(filtered.map((item) => item.run_id), [1])
})

test('year grids keep every civil day', () => {
  const count = (year: number) => yearWeeks(year).flat().filter(Boolean).length
  assert.equal(count(2023), 365)
  assert.equal(count(2024), 366)
  assert.equal(count(2026), 365)
})
