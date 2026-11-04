import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Activity } from '../types'
import { decodeTrack } from '../lib/geo'
import { activityTitle, sportColor, sportLabel } from '../lib/stats'
import { formatDotDate, formatDuration, formatKm, formatPace, formatSpeed, parseDuration } from '../lib/format'

const TRACK_CAP = 1200

interface RouteMapProps {
  activities: Activity[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyArchive: boolean
}

export function RouteMap({ activities, selectedId, onSelect, emptyArchive }: RouteMapProps) {
  const holder = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const showMap = activities.some((activity) => Boolean(activity.summary_polyline))

  useEffect(() => {
    if (!showMap) return
    const node = holder.current
    if (!node || mapRef.current) return
    const map = L.map(node, { zoomControl: true, scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    map.setView([35.6, 104.2], 4)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    const timer = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(timer)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [showMap])

  useEffect(() => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()

    const withTracks = activities.filter((activity) => activity.summary_polyline)
    const truncated = withTracks.length > TRACK_CAP
    let visible = truncated ? withTracks.slice(-TRACK_CAP) : withTracks
    const picked = withTracks.find(a => a.run_id === selectedId)
    if (picked && !visible.includes(picked)) visible = [...visible.slice(1), picked]
    const selected = activities.find((activity) => activity.run_id === selectedId) ?? null
    const bounds: L.LatLngExpression[] = []

    for (const activity of visible) {
      const chosen = activity.run_id === selectedId
      const points = decodeTrack(activity.summary_polyline, chosen ? 480 : 72)
      if (points.length < 2) continue
      const line = L.polyline(points, {
        color: sportColor(activity.type),
        weight: chosen ? 5 : 3,
        opacity: chosen ? 0.95 : 0.8,
      })
      line.on('click', () => onSelect(activity.run_id))
      line.addTo(group)
      bounds.push(points[Math.floor(points.length / 2)])
    }

    if (selected?.summary_polyline) {
      const points = decodeTrack(selected.summary_polyline, 480)
      if (points.length >= 2) {
        map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 14 })
        return
      }
    }
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 11 })
    } else {
      map.setView([35.6, 104.2], 4)
    }
  }, [activities, onSelect, selectedId, showMap])

  const withTracks = activities.filter((activity) => activity.summary_polyline)
  const selected = activities.find((activity) => activity.run_id === selectedId) ?? null
  const hiddenTracks = Math.max(0, withTracks.length - TRACK_CAP)

  return (
    <div className="map-layout">
      <div className="map-frame">
        {withTracks.length === 0 ? (
          <div className="map-placeholder">
            <div className="map-empty">
              <p>{emptyArchive ? '暂无轨迹。' : '所选记录暂无轨迹。'}</p>
              <p className="quiet">
                {emptyArchive
                  ? '数据导入后，具有坐标的跑步记录将显示于此。'
                  : '可以调整筛选，或从列表查看无轨迹记录的详情。'}
              </p>
            </div>
          </div>
        ) : (
          <div ref={holder} className="map-canvas" role="region" aria-label="运动轨迹地图" />
        )}
      </div>
      <aside className="map-card">
        <p className="kicker">单次记录</p>
        {selected ? <Detail activity={selected} /> : <EmptyDetail emptyArchive={emptyArchive} />}
        <ul className="legend">
          {[...new Set(activities.map(a=>a.type))].map(type=><li key={type}><i style={{background:sportColor(type)}}/>{sportLabel(type)}</li>)}
        </ul>
        <p className="quiet">
          {withTracks.length === 0
            ? '底图为 OpenStreetMap。'
            : `当前显示 ${Math.min(withTracks.length, TRACK_CAP)} 条轨迹。`}
          {hiddenTracks > 0 ? ` 其余 ${hiddenTracks} 条见于记录列表。` : ''}
          {activities.length > withTracks.length
            ? ` ${activities.length - withTracks.length} 条无坐标。`
            : ''}
        </p>
      </aside>
    </div>
  )
}

function EmptyDetail({ emptyArchive }: { emptyArchive: boolean }) {
  return (
    <div>
      <h3>{emptyArchive ? '未选择记录' : '请选择一条轨迹'}</h3>
      <p className="quiet">
        {emptyArchive
          ? '选择后可查看距离、时长、配速与地点。'
          : '与记录列表为同一数据集。'}
      </p>
    </div>
  )
}

function Detail({ activity }: { activity: Activity }) {
  const seconds = parseDuration(activity.moving_time)
  const ride = activity.type === 'Ride' || activity.type === 'Cycling'
  return (
    <div>
      <h3>{activityTitle(activity)}</h3>
      <p className="detail-date">{formatDotDate(activity.start_date_local)}</p>
      <p className="quiet">
        {sportLabel(activity.type)}
      </p>
      <dl className="detail-grid">
        <div>
          <dt>距离</dt>
          <dd>{formatKm(Number(activity.distance) || 0)} 公里</dd>
        </div>
        <div>
          <dt>运动</dt>
          <dd>{formatDuration(seconds)}</dd>
        </div>
        <div>
          <dt>耗时</dt>
          <dd>{activity.elapsed_time ? formatDuration(parseDuration(activity.elapsed_time)) : '—'}</dd>
        </div>
        <div>
          <dt>{ride ? '速度' : '配速'}</dt>
          <dd>{ride ? formatSpeed(activity.average_speed) : formatPace(seconds > 0 ? activity.distance / seconds : null)}</dd>
        </div>
        <div>
          <dt>心率</dt>
          <dd>{activity.average_heartrate ? Math.round(activity.average_heartrate) : '—'}</dd>
        </div>
        <div>
          <dt>年份</dt>
          <dd>{activity.start_date_local.slice(0, 4) || '—'}</dd>
        </div>
        <div>
          <dt>地点</dt>
          <dd>{activity.location_country || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
