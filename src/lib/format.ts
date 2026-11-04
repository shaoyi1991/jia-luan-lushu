export function parseDuration(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const trimmed = value.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  const epoch = trimmed.match(/^1970-01-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (epoch) {
    const extraDays = Number(epoch[1]) - 1
    return (
      extraDays * 86400 +
      Number(epoch[2]) * 3600 +
      Number(epoch[3]) * 60 +
      Number(epoch[4])
    )
  }
  let days = 0
  let clock = trimmed
  const dayMatch = trimmed.match(/(\d+)\s+days?/)
  if (dayMatch) {
    days = Number(dayMatch[1])
    clock = trimmed.split(',').pop()?.trim() ?? ''
  }
  const timeMatch = clock.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (!timeMatch) return 0
  return (
    days * 86400 +
    Number(timeMatch[1]) * 3600 +
    Number(timeMatch[2]) * 60 +
    Number(timeMatch[3])
  )
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatHours(seconds: number): string {
  if (!seconds) return '—'
  const hours = seconds / 3600
  return hours >= 100 ? hours.toFixed(0) : hours.toFixed(1)
}

export function formatKm(meters: number, digits?: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0'
  const km = meters / 1000
  if (digits !== undefined) return km.toFixed(digits)
  if (km >= 100) return km.toFixed(0)
  if (km >= 10) return km.toFixed(1)
  return km.toFixed(2)
}

export function formatPace(metersPerSecond: number | null | undefined): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '—'
  const seconds = Math.round(1000 / metersPerSecond)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}'${String(secs).padStart(2, '0')}"`
}

export function formatSpeed(metersPerSecond: number | null | undefined): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '—'
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`
}

export function dateKey(local: string | null | undefined): string {
  const match = String(local ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

export function dateKeyFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatDotDate(local: string): string {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!match) return local || '—'
  const clock = match[4] ? ` ${match[4]}:${match[5]}` : ''
  return `${match[1]}.${match[2]}.${match[3]}${clock}`
}

export function formatCnDay(key: string): string {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return key
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
}

export function yearOf(local: string | null | undefined): number | null {
  const key = dateKey(local)
  if (!key) return null
  return Number(key.slice(0, 4))
}

export function monthKey(local: string | null | undefined): string {
  const key = dateKey(local)
  return key ? key.slice(0, 7) : ''
}

export function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}
