import type { Activity } from '../types'
import { decodeTrack } from './geo.ts'

export type LoopStroke = {
  year: number
  points: [number, number][]
}

export type HabitLoop = {
  id: string
  place: string
  chapter: string
  km: number
  count: number
  years: { year: number; count: number }[]
  strokes: LoopStroke[]
}

type ChapterRule = {
  id: string
  place: string
  chapter: string
  kmMin: number
  kmMax: number
  test: (city: string, lat: number) => boolean
}

const CHAPTERS: ChapterRule[] = [
  {
    id: 'qd-main',
    place: '青岛',
    chapter: '主圈',
    kmMin: 4.6,
    kmMax: 6.4,
    test: (city, lat) => city.includes('青岛') && lat >= 36.19,
  },
  {
    id: 'qd-early',
    place: '青岛',
    chapter: '旧圈',
    kmMin: 4.6,
    kmMax: 6.6,
    test: (city, lat) => city.includes('青岛') && lat >= 36.1 && lat < 36.19,
  },
  {
    id: 'qd-long',
    place: '青岛',
    chapter: '长圈',
    kmMin: 9,
    kmMax: 12,
    test: (city, lat) => city.includes('青岛') && lat >= 36.19,
  },
  {
    id: 'jining',
    place: '济宁',
    chapter: '一圈',
    kmMin: 4.5,
    kmMax: 7.2,
    test: (city) => city.includes('济宁'),
  },
  {
    id: 'luoyang',
    place: '洛阳',
    chapter: '一圈',
    kmMin: 4,
    kmMax: 9,
    test: (city) => city.includes('洛阳'),
  },
]

const PER_YEAR = 16

type Candidate = LoopStroke & { km: number }

export function buildHabits(activities: Activity[]): HabitLoop[] {
  const buckets = new Map<string, Candidate[]>()

  for (const activity of activities) {
    if (activity.type !== 'Run' && activity.type !== 'VirtualRun') continue
    const km = Number(activity.distance) / 1000
    if (!Number.isFinite(km) || km <= 0.2) continue
    const city = activity.location_country || ''
    const decoded = trimJumps(decodeTrack(activity.summary_polyline, 36))
    if (decoded.length < 6) continue
    const year = Number(activity.start_date_local.slice(0, 4))
    if (!year) continue
    const rule = CHAPTERS.find((item) => item.test(city, decoded[0][0]) && km >= item.kmMin && km <= item.kmMax)
    if (!rule) continue
    const list = buckets.get(rule.id) || []
    list.push({ year, km, points: decoded })
    buckets.set(rule.id, list)
  }

  const habits: HabitLoop[] = []
  for (const rule of CHAPTERS) {
    const sameLoop = keepSameLoop(buckets.get(rule.id) || [])
    if (sameLoop.length < 8) continue
    const byYear = new Map<number, Candidate[]>()
    for (const stroke of sameLoop) {
      const list = byYear.get(stroke.year) || []
      list.push(stroke)
      byYear.set(stroke.year, list)
    }
    const years = [...byYear.keys()].sort((a, b) => a - b).map((year) => ({
      year,
      count: byYear.get(year)?.length || 0,
    }))
    const strokes: LoopStroke[] = []
    for (const year of years) {
      const list = byYear.get(year.year) || []
      const step = Math.max(1, Math.ceil(list.length / PER_YEAR))
      for (let index = 0; index < list.length; index += step) strokes.push(list[index])
    }
    const km = sameLoop.reduce((sum, stroke) => sum + stroke.km, 0) / sameLoop.length
    habits.push({
      id: rule.id,
      place: rule.place,
      chapter: rule.chapter,
      km,
      count: sameLoop.length,
      years,
      strokes,
    })
  }
  return habits
}

function keepSameLoop(candidates: Candidate[]): Candidate[] {
  if (candidates.length < 8) return []
  const starts = new Map<string, number>()
  for (const stroke of candidates) {
    const key = `${Math.round(stroke.points[0][0] * 200) / 200},${Math.round(stroke.points[0][1] * 200) / 200}`
    starts.set(key, (starts.get(key) || 0) + 1)
  }
  const mode = [...starts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const [modeLat, modeLon] = mode.split(',').map(Number)
  const near = candidates.filter((stroke) => {
    const [lat, lon] = stroke.points[0]
    return Math.abs(lat - modeLat) <= 0.008 && Math.abs(lon - modeLon) <= 0.01
  })
  const spans = near.map(spanOf).sort((a, b) => a - b)
  const median = spans[Math.floor(spans.length / 2)] || 0.01
  const limit = Math.max(median * 1.8, 0.008)
  return near.filter((stroke) => spanOf(stroke) <= limit)
}

function spanOf(stroke: Candidate): number {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const [lat, lon] of stroke.points) {
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
  }
  return Math.max(maxLat - minLat, maxLon - minLon)
}

export function projectStrokes(
  strokes: LoopStroke[],
  frame: { x: number; y: number; width: number; height: number },
): { year: number; points: string }[] {
  const cloud = strokes.flatMap((stroke) => stroke.points)
  if (cloud.length < 2) return []
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const [lat, lon] of cloud) {
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
  }
  const latSpan = Math.max(0.004, maxLat - minLat)
  const lonSpan = Math.max(0.004, maxLon - minLon)
  const padLat = latSpan * 0.12
  const padLon = lonSpan * 0.12
  minLat -= padLat
  maxLat += padLat
  minLon -= padLon
  maxLon += padLon
  return strokes.map((stroke) => ({
    year: stroke.year,
    points: stroke.points
      .map(([lat, lon]) => {
        const x = frame.x + ((lon - minLon) / (maxLon - minLon)) * frame.width
        const y = frame.y + ((maxLat - lat) / (maxLat - minLat)) * frame.height
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' '),
  }))
}

function trimJumps(track: [number, number][]): [number, number][] {
  const kept: [number, number][] = [track[0]]
  for (let index = 1; index < track.length; index += 1) {
    const prev = kept[kept.length - 1]
    const point = track[index]
    if (Math.abs(point[0] - prev[0]) < 0.012 && Math.abs(point[1] - prev[1]) < 0.012) {
      kept.push(point)
    }
  }
  return kept
}
