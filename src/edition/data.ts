import { dayNumber, dateKey, parseDuration } from '../lib/format.ts'
import { runSlice, shortPlace, type MonthSlice, type NarrativeData } from '../lib/narrative.ts'

export const goalStart = '2024-11'
export const goalKm = 200
export function goalState(month: MonthSlice) {
  if (month.state === 'outside' || month.key < goalStart) return 'outside'
  if (month.partial) return 'pending'
  return month.km >= goalKm ? 'reached' : 'below'
}
export function historicalRuns(data: NarrativeData, year: number) {
  return data.runs.filter(run => run.start_date_local.startsWith(String(year)) && run.start_date_local.slice(5, 10) <= '11-03')
}
// A fixed historical comparison: never label these windows with the live data cutoff.
export function weekendComparison(data: NarrativeData, years = [2025, 2026]) {
  const rows = years.map(year => {
    const runs = historicalRuns(data, year)
    const weekend = runs.filter(run => [0, 6].includes(new Date(dateKey(run.start_date_local) + 'T00:00:00Z').getUTCDay()))
    const weekday = runs.filter(run => ![0, 6].includes(new Date(dateKey(run.start_date_local) + 'T00:00:00Z').getUTCDay()))
    return { year, all: runSlice(runs), weekend: runSlice(weekend), weekday: runSlice(weekday) }
  })
  const [before, after] = rows
  const growth = before && after ? after.all.km - before.all.km : 0
  const weekendGrowth = before && after ? after.weekend.km - before.weekend.km : 0
  const share = growth > 0 && weekendGrowth >= 0 && weekendGrowth <= growth ? weekendGrowth / growth : null
  return { rows, growth, share }
}
export function raceOn(data: NarrativeData, date: string, place: string, min: number, max: number) {
  return data.runs.find(run => run.type === 'Run' && dateKey(run.start_date_local) === date &&
    shortPlace(run.location_country ?? '') === place && run.distance >= min && run.distance <= max)
}
export function dongying(data: NarrativeData) {
  return ['2025-10-19', '2026-10-18'].flatMap(date => {
    const race = raceOn(data, date, '东营', 41500, 44000)
    if (!race) return []
    const prior = data.runs.filter(run => {
      const days = dayNumber(date) - dayNumber(dateKey(run.start_date_local))
      return days >= 1 && days <= 56
    })
    return [{ date, ...runSlice(prior), long: prior.filter(run => run.distance >= 20000).length, elapsed: parseDuration(race.elapsed_time) }]
  })
}
