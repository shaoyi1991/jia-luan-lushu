import { useState } from 'react'
import type { Activity } from '../types'
import { formatDotDate, formatDuration, formatKm, formatPace, formatSpeed, parseDuration } from '../lib/format'
import { activityTitle, sportLabel, sportOf } from '../lib/stats'

interface ActivityLogProps {
  activities: Activity[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyArchive: boolean
}

export function ActivityLog({ activities, selectedId, onSelect, emptyArchive }: ActivityLogProps) {
  const [limit, setLimit] = useState(30)
  const ordered = [...activities].sort((a, b) =>
    (b.start_date_local || '').localeCompare(a.start_date_local || ''),
  )
  const shown = ordered.slice(0, limit)

  return (
    <div>
      <div className="section-head">
        <div>
          <p className="kicker">记录</p>
          <h2>{activities.length ? `${activities.length} 次` : '记录'}</h2>
        </div>
        <p className="quiet">
          {emptyArchive ? '记录导入后，将按时间倒序列出。' : '按时间倒序。选择一行后，地图将定位至该次记录。'}
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="empty-log">暂无记录。</p>
      ) : (
        <ol className="log">
          {shown.map((activity) => {
            const ride = sportOf(activity.type) === 'ride'
            const seconds = parseDuration(activity.moving_time)
            return (
              <li key={activity.run_id}>
                <button
                  type="button"
                  className={activity.run_id === selectedId ? 'log-row selected' : 'log-row'}
                  aria-pressed={activity.run_id === selectedId}
                  onClick={() => {
                    onSelect(activity.run_id)
                    document.getElementById('map')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
                  }}
                >
                  <time>{formatDotDate(activity.start_date_local)}</time>
                  <strong>{activityTitle(activity)}</strong>
                  <span className={`pill ${sportOf(activity.type)}`}>{sportLabel(activity.type)}</span>
                  <span>{formatKm(Number(activity.distance) || 0)} 公里</span>
                  <span>{formatDuration(seconds)}</span>
                  <span>{ride ? formatSpeed(activity.average_speed) : formatPace(seconds > 0 ? activity.distance / seconds : null)}</span>
                  <em>{activity.location_country || '地点未记录'}</em>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {ordered.length > limit && (
        <button type="button" className="text-button more" onClick={() => setLimit((value) => value + 40)}>
          继续载入 {Math.min(40, ordered.length - limit)} 条
        </button>
      )}
    </div>
  )
}
