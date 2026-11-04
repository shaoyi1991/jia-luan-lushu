import type { Activity, SportFilter } from '../types'
import {
  dateKey,
  dateKeyFromDate,
  dayNumber,
  monthKey,
  parseDuration,
  yearOf,
} from './format.ts'

export type SportSlice = {
  count: number
  distance: number
  movingSeconds: number
}

export type Streak = {
  longest: number
  from: string
  to: string
  current: number
}

export type Summary = {
  count: number
  distance: number
  movingSeconds: number
  elevation: number
  sports: Record<'run' | 'walk' | 'hike' | 'ride' | 'other', SportSlice>
  streak: Streak
  span: { from: string; to: string } | null
  years: number[]
  yearDistance: Record<number, number>
  yearCount: Record<number, number>
  monthDistance: Record<string, number>
  dayDistance: Record<string, number>
  farthest: Activity | null
  heartrateSamples: number
  heartrateTotal: number
}

const EMPTY_SLICE = (): SportSlice => ({ count: 0, distance: 0, movingSeconds: 0 })

export function sportOf(type: string | null | undefined): 'run' | 'walk' | 'hike' | 'ride' | 'other' {
  if (type === 'Run' || type === 'VirtualRun') return 'run'
  if (type === 'Walk') return 'walk'
  if (type === 'Ride' || type === 'Cycling') return 'ride'
  if (type === 'Hiking' || type === 'Hike') return 'hike'
  return 'other'
}

const STOCK_NAME: Record<string, string> = {
  'Run from keep': '跑步',
  'Walk from keep': '行走',
  'Hiking from keep': '徒步',
  'Ride from keep': '骑行',
  'VirtualRun from keep': '室内跑',
}

export function activityTitle(activity: { name?: string | null; type?: string | null }): string {
  if (activity.name && STOCK_NAME[activity.name]) return STOCK_NAME[activity.name]
  return activity.name || sportLabel(activity.type)
}

export function sportLabel(type: string | null | undefined): string {
  if (type === 'VirtualRun') return '室内跑'
  if (type === 'Walk') return '行走'
  const group = sportOf(type)
  if (group === 'run') return '跑步'
  if (group === 'ride') return '骑行'
  if (group === 'hike') return '徒步'
  return type || '其他'
}

export function sportColor(type: string | null | undefined): string {
  const group = sportOf(type)
  if (group === 'run') return '#1c1915'
  if (group === 'ride') return '#1f4e79'
  if (group === 'hike') return '#2f6b4a'
  return '#8d6232'
}

export function distanceOf(activity: Activity): number {
  const value = Number(activity.distance)
  return Number.isFinite(value) ? value : 0
}

export function filterActivities(
  list: Activity[],
  sport: SportFilter,
  year: number | 'all',
): Activity[] {
  return list.filter((activity) => {
    if (sport !== 'all' && sportOf(activity.type) !== sport) return false
    if (year !== 'all' && yearOf(activity.start_date_local) !== year) return false
    return true
  })
}

export function computeStreak(days: string[], todayKey: string): Streak {
  const unique = [...new Set(days.filter(Boolean))].sort()
  if (unique.length === 0) return { longest: 0, from: '', to: '', current: 0 }
  let longest = 1
  let from = unique[0]
  let runFrom = unique[0]
  let run = 1
  for (let index = 1; index < unique.length; index += 1) {
    const gap = dayNumber(unique[index]) - dayNumber(unique[index - 1])
    if (gap === 1) {
      run += 1
    } else if (gap > 1) {
      run = 1
      runFrom = unique[index]
    }
    if (run > longest) {
      longest = run
      from = runFrom
    }
  }
  let to = from
  if (longest > 1) {
    const start = dayNumber(from)
    to = unique.find((day) => dayNumber(day) === start + longest - 1) ?? unique[unique.length - 1]
  }
  const yesterday = shiftDay(todayKey, -1)
  const last = unique[unique.length - 1]
  let current = 0
  if (last === todayKey || last === yesterday) {
    current = 1
    for (let index = unique.length - 1; index > 0; index -= 1) {
      const gap = dayNumber(unique[index]) - dayNumber(unique[index - 1])
      if (gap === 1) current += 1
      else if (gap > 1) break
    }
  }
  return { longest, from, to, current }
}

function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + delta))
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${m}-${d}`
}

export function summarize(activities: Activity[], now = new Date()): Summary {
  const sports: Summary['sports'] = {
    run: EMPTY_SLICE(),
    ride: EMPTY_SLICE(),
    walk: EMPTY_SLICE(),
    hike: EMPTY_SLICE(),
    other: EMPTY_SLICE(),
  }
  const yearDistance: Record<number, number> = {}
  const yearCount: Record<number, number> = {}
  const monthDistance: Record<string, number> = {}
  const dayDistance: Record<string, number> = {}
  const years = new Set<number>()
  let distance = 0
  let movingSeconds = 0
  let elevation = 0
  let farthest: Activity | null = null
  let heartrateSamples = 0
  let heartrateTotal = 0
  const days: string[] = []

  for (const activity of activities) {
    const meters = distanceOf(activity)
    if (meters <= 0.1) continue
    const seconds = parseDuration(activity.moving_time)
    const group = sportOf(activity.type)
    const bucket = sports[group]
    bucket.count += 1
    bucket.distance += meters
    bucket.movingSeconds += seconds
    distance += meters
    movingSeconds += seconds
    elevation += Number(activity.elevation_gain) || 0
    if (!farthest || meters > distanceOf(farthest)) farthest = activity
    const hr = Number(activity.average_heartrate)
    if (Number.isFinite(hr) && hr > 0) {
      heartrateSamples += 1
      heartrateTotal += hr
    }
    const key = dateKey(activity.start_date_local)
    if (!key) continue
    days.push(key)
    dayDistance[key] = (dayDistance[key] ?? 0) + meters
    const month = monthKey(activity.start_date_local)
    monthDistance[month] = (monthDistance[month] ?? 0) + meters
    const year = Number(key.slice(0, 4))
    years.add(year)
    yearDistance[year] = (yearDistance[year] ?? 0) + meters
    yearCount[year] = (yearCount[year] ?? 0) + 1
  }

  const sortedDays = [...new Set(days)].sort()
  return {
    count:
      sports.run.count +
      sports.walk.count +
      sports.hike.count +
      sports.ride.count +
      sports.other.count,
    distance,
    movingSeconds,
    elevation,
    sports,
    streak: computeStreak(sortedDays, dateKeyFromDate(now)),
    span: sortedDays.length
      ? { from: sortedDays[0], to: sortedDays[sortedDays.length - 1] }
      : null,
    years: [...years].sort((a, b) => a - b),
    yearDistance,
    yearCount,
    monthDistance,
    dayDistance,
    farthest,
    heartrateSamples,
    heartrateTotal,
  }
}

export function decadeYears(summary: Summary, now = new Date()): number[] {
  const nowYear = now.getFullYear()
  if (summary.years.length === 0) {
    return Array.from({ length: 10 }, (_, index) => nowYear - 9 + index)
  }
  const min = Math.min(...summary.years)
  const max = Math.max(nowYear, ...summary.years)
  const years: number[] = []
  for (let year = min; year <= max; year += 1) years.push(year)
  return years
}

export function yearWeeks(year: number): Array<Array<string | null>> {
  const weeks: Array<Array<string | null>> = []
  const cursor = new Date(year, 0, 1)
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
  for (let guard = 0; guard < 54; guard += 1) {
    const week: Array<string | null> = []
    let inYear = false
    for (let day = 0; day < 7; day += 1) {
      if (cursor.getFullYear() === year) {
        inYear = true
        week.push(dateKeyFromDate(cursor))
      } else {
        week.push(null)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (!inYear) break
    weeks.push(week)
  }
  return weeks
}

const HEAT: Record<SportFilter, string[]> = {
  all: ['rgba(28,25,21,0.06)', '#e6e0d6', '#b7aea3', '#6d655c', '#1c1915'],
  run: ['rgba(28,25,21,0.06)', '#e6e0d6', '#b7aea3', '#6d655c', '#1c1915'],
  ride: ['rgba(34,28,23,0.07)', '#d5e2ef', '#8eafd0', '#3d6d99', '#1f4e79'],
  walk: ['rgba(34,28,23,0.07)', '#f0e0c4', '#d7b57a', '#b4843c', '#8d6232'],
  hike: ['rgba(34,28,23,0.07)', '#d5e8dc', '#8fbfa4', '#4e8b68', '#2f6b4a'],
}

export function heatFill(km: number, maxKm: number, sport: SportFilter): string {
  const scale = HEAT[sport]
  if (km <= 0) return scale[0]
  const ratio = km / Math.max(maxKm, 0.001)
  if (ratio < 0.25) return scale[1]
  if (ratio < 0.5) return scale[2]
  if (ratio < 0.75) return scale[3]
  return scale[4]
}
