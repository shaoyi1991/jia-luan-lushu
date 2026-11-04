import raw from '../static/activities.json'
import type { Activity } from '../types'

type RawActivity = Omit<Activity, 'run_id'> & { run_id: string | number }

function isActivity(value: unknown): value is RawActivity {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const id = record.run_id
  return (
    (typeof id === 'string' || typeof id === 'number') &&
    typeof record.start_date_local === 'string'
  )
}

export function loadActivities(): { activities: Activity[]; error: string | null } {
  const data: unknown = raw
  if (!Array.isArray(data)) {
    return {
      activities: [],
      error: 'activities.json 不是数组。请重新导入 activities.db。',
    }
  }
  const accepted = data.filter(isActivity)
  const activities: Activity[] = accepted.map((item) => ({
    ...item,
    run_id: String(item.run_id),
  }))
  if (activities.length !== data.length) {
    return {
      activities,
      error: '有几条记录字段不完整，已先跳过。',
    }
  }
  return { activities, error: null }
}
