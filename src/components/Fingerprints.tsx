import { useMemo } from 'react'
import type { HabitLoop } from '../lib/loops'
import { projectStrokes } from '../lib/loops'

export function Fingerprints({ loops }: { loops: HabitLoop[] }) {
  if (loops.length === 0) return null
  const [primary, ...rest] = loops
  const maxCount = Math.max(...loops.map((loop) => loop.count))

  return (
    <section className="prints" aria-label="常跑指纹">
      <div className="section-head">
        <div>
          <p className="kicker">常跑</p>
          <h2>同一条路的刻痕</h2>
        </div>
        <p className="quiet">色泽随重复次数加深，仅展示常跑路线。</p>
      </div>
      <div className="print-grid">
        <PrintCard loop={primary} primary maxCount={maxCount} />
        {rest.map((loop) => (
          <PrintCard key={loop.id} loop={loop} maxCount={maxCount} />
        ))}
      </div>
    </section>
  )
}

function heatColor(id: string, year: number, years: number[]): string {
  const index = Math.max(0, years.indexOf(year))
  const t = years.length <= 1 ? 0.66 : index / (years.length - 1)
  const qingdao = id.startsWith('qd')
  const stops = qingdao
    ? ['#1fd4c4', '#7ee0a8', '#ffd15a', '#ff8a3d', '#e24b24']
    : ['#f6c7a4', '#e8895a', '#d4653a', '#b8432f', '#8c2a16']
  return ramp(stops, qingdao ? t : Math.min(1, t * 0.75 + (id === 'luoyang' ? 0.25 : 0.05)))
}

function ramp(stops: string[], amount: number): string {
  const t = Math.min(0.999, Math.max(0, amount)) * (stops.length - 1)
  const index = Math.floor(t)
  return mix(stops[index], stops[Math.min(stops.length - 1, index + 1)], t - index)
}

function mix(from: string, to: string, amount: number): string {
  const a = rgb(from)
  const b = rgb(to)
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * amount)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function PrintCard({
  loop,
  primary = false,
  maxCount,
}: {
  loop: HabitLoop
  primary?: boolean
  maxCount: number
}) {
  const strokes = useMemo(
    () => projectStrokes(loop.strokes.slice(0, primary ? 28 : 14), { x: 8, y: 8, width: 84, height: 84 }),
    [loop, primary],
  )
  const density = 0.28 + 0.62 * (loop.count / maxCount)
  const firstYear = loop.years[0]?.year
  const lastYear = loop.years[loop.years.length - 1]?.year
  const span = firstYear && lastYear ? (firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`) : ''

  return (
    <article className={primary ? 'print-card primary' : 'print-card'}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`${loop.place}${loop.chapter}`}>
        {strokes.map((stroke, index) => (
          <polyline
            key={`${stroke.year}-${index}`}
            points={stroke.points}
            fill="none"
            stroke={heatColor(loop.id, stroke.year, loop.years.map((item) => item.year))}
            strokeWidth={primary ? 1.35 : 1.5}
            strokeOpacity={Math.min(0.95, 0.35 + density * 0.6)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <p className="print-place">{loop.place} · {loop.chapter}</p>
      <p className="print-count">第 {loop.count} 次跑完同一圈</p>
      <p className="quiet">约 {loop.km.toFixed(1)} 公里{span ? ` · ${span}` : ''}</p>
    </article>
  )
}
