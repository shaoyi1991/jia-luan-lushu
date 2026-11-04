import type { Activity } from '../types.ts'
import { parseDuration } from './format.ts'

export const RUN_TYPES = new Set(['Run', 'VirtualRun'])
export const isRun = (a: Activity) => RUN_TYPES.has(a.type)
export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const at = (sorted.length - 1) * p
  const lo = Math.floor(at)
  return sorted[lo] + (sorted[Math.ceil(at)] - sorted[lo]) * (at - lo)
}
export function runSlice(rows: Activity[]) {
  const km = rows.reduce((sum, a) => sum + a.distance / 1000, 0)
  const timed = rows.filter(a => parseDuration(a.moving_time) > 0)
  const seconds = timed.reduce((sum, a) => sum + parseDuration(a.moving_time), 0)
  const timedKm = timed.reduce((sum, a) => sum + a.distance / 1000, 0)
  const distances = rows.map(a => a.distance / 1000)
  return {
    count: rows.length, km, seconds, days: new Set(rows.map(a => a.start_date_local.slice(0, 10))).size,
    medianKm: median(distances), q1: percentile(distances, .25), q3: percentile(distances, .75),
    paceSeconds: timedKm ? seconds / timedKm : null,
    missingTime: rows.length - timed.length,
    longCount: rows.filter(a => a.distance >= 10000).length,
  }
}
export type RunSlice = ReturnType<typeof runSlice>
export type YearSlice = RunSlice & { year: number; hours: number[]; partial: boolean }
export type MonthSlice = RunSlice & { key: string; state: 'recorded' | 'no-record' | 'outside'; partial: boolean }
export function buildNarrative(activities: Activity[]) {
  const runs = activities.filter(isRun).filter(a => Number.isFinite(a.distance) && a.distance > .1 && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(a.start_date_local)).sort((a,b) => a.start_date_local.localeCompare(b.start_date_local))
  const first = runs[0]?.start_date_local.slice(0,10) ?? ''
  const last = runs.at(-1)?.start_date_local.slice(0,10) ?? ''
  const lastYear = last ? Number(last.slice(0,4)) : null
  const years: YearSlice[] = []
  const months: MonthSlice[] = []
  if (first && lastYear) {
    for (let year = Number(first.slice(0,4)); year <= lastYear; year++) {
      const rows = runs.filter(a => a.start_date_local.startsWith(String(year)))
      const hours = Array.from({ length: 24 }, () => 0)
      rows.forEach(a => { const h = Number(a.start_date_local.slice(11,13)); if (h >= 0 && h < 24) hours[h]++ })
      years.push({ year, ...runSlice(rows), hours, partial: year === lastYear && last.slice(5) !== '12-31' })
      for (let month = 1; month <= 12; month++) {
        const key = `${year}-${String(month).padStart(2,'0')}`
        const m = rows.filter(a => a.start_date_local.startsWith(key))
        const outside = key < first.slice(0,7) || key > last.slice(0,7)
        const lastDay = new Date(Date.UTC(year,month,0)).getUTCDate()
        months.push({ key, ...runSlice(m), state: outside ? 'outside' : m.length ? 'recorded' : 'no-record', partial: key === last.slice(0,7) && Number(last.slice(8,10)) < lastDay })
      }
    }
  }
  let tailMonths = 0
  for (const month of [...months.filter(m => m.state !== 'outside')].reverse()) {
    if (!month.count) break
    tailMonths++
  }
  const tailFrom = tailMonths ? months.filter(m => m.state !== 'outside').at(-tailMonths)?.key ?? '' : ''
  const places = [...new Set(runs.map(a => a.location_country).filter((s): s is string => Boolean(s)))].map(place => {
    const rows = runs.filter(a => a.location_country === place)
    return { place, ...runSlice(rows), first: rows[0].start_date_local.slice(0,10), last: rows.at(-1)!.start_date_local.slice(0,10), rows }
  }).sort((a,b) => b.count - a.count)
  const hours = Array.from({length:24},(_,h) => years.reduce((s,y) => s+y.hours[h],0))
  return { runs, first, last, years, months, places, hours, tailMonths, tailFrom, total: runSlice(runs) }
}
export type NarrativeData = ReturnType<typeof buildNarrative>
export function monthLabel(key: string) { return key ? `${Number(key.slice(0,4))} 年 ${Number(key.slice(5,7))} 月` : '暂无记录' }
export function dawnShare({ hours, count }: { hours: number[]; count: number }, beforeHour = 8) {
  const before = hours.slice(0, beforeHour).reduce((s, v) => s + v, 0)
  return count ? before / count : 0
}
export function dawnFlipYear(years: YearSlice[], beforeHour = 8) {
  let previous: number | null = null
  for (const year of years) {
    const share = dawnShare(year, beforeHour)
    if (previous !== null && previous <= .5 && share > .5) return year.year
    previous = share
  }
  return null
}
export function shortPlace(place: string) { return place.replace(/^.*?省/, '').replace(/市$/, '') }
export function paceLabel(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2,'0')}″`
}
export function archiveLink(filters: {year?: number; month?: string; place?: string; id?: string} = {}) {
  const query = new URLSearchParams({view:'journal'})
  Object.entries(filters).forEach(([key,value])=>{ if (value !== undefined) query.set(key,String(value)) })
  return `?${query}`
}

export function distanceBestHistory(runs: Activity[], minMeters: number, maxMeters: number) {
  const milestones: { activity: Activity; seconds: number }[] = []
  const candidates = runs.filter(run => run.type === 'Run' && run.distance >= minMeters && run.distance <= maxMeters)
  candidates.sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
  for (const activity of candidates) {
    const seconds = parseDuration(activity.elapsed_time)
    if (!Number.isFinite(seconds) || seconds <= 0) continue
    const previous = milestones.at(-1)
    if (!previous || seconds < previous.seconds) milestones.push({ activity, seconds })
  }
  return milestones
}

export function comparableRunningYears(data: NarrativeData) {
  const cutoff = data.last.slice(5)
  return data.years.slice(-2).map(({ year }) => ({
    year,
    ...runSlice(data.runs.filter(run => run.start_date_local.startsWith(String(year))
      && run.start_date_local.slice(5, 10) <= cutoff)),
  }))
}

export function longDistanceRuns(runs: Activity[]) {
  return runs.filter(run => run.type === 'Run' && run.distance > 40000)
}

export function peakHalfHour(runs: Activity[]): string | null {
  if (!runs.length) return null
  const bins = Array.from({ length: 48 }, () => 0)
  for (const run of runs) {
    const hour = Number(run.start_date_local.slice(11, 13))
    const minute = Number(run.start_date_local.slice(14, 16))
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) bins[hour * 2 + Math.floor(minute / 30)]++
  }
  const peak = Math.max(...bins)
  if (!peak) return null
  const slot = bins.indexOf(peak)
  return `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`
}
