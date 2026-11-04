import { useMemo } from 'react'
import type { Activity } from '../types'
import { site } from '../site'
import { buildHabits, projectStrokes } from '../lib/loops'

const STARS = Array.from({ length: 70 }, (_, index) => ({
  x: (index * 97) % 1200,
  y: (index * 53) % 700,
  r: index % 6 === 0 ? 1.6 : 0.75,
  opacity: 0.35 + (index % 5) * 0.1,
}))

interface CoverProps {
  kilometers: string
  count: number
  span: string
  activities: Activity[]
  onEnter: () => void
}

export function Cover({ kilometers, count, span, activities, onEnter }: CoverProps) {
  const loop = useMemo(() => buildHabits(activities)[0], [activities])
  const rings = useMemo(() => {
    if (!loop) return []
    return projectStrokes(loop.strokes, { x: 560, y: 70, width: 560, height: 560 })
  }, [loop])
  const years = loop?.years ?? []
  const cycle = Math.max(12, years.length * 2.4)

  return (
    <section className="cover" aria-label="封面">
      <svg className="cover-sky" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g className="cover-stars">
          {STARS.map((star, index) => (
            <circle
              key={index}
              className="cover-star"
              cx={star.x}
              cy={star.y}
              r={star.r}
              fill={index % 11 === 0 ? '#9ff6ea' : '#fff6e4'}
              opacity={star.opacity}
              style={{ animationDelay: `${(index % 12) * 0.35}s` }}
            />
          ))}
        </g>
        <defs>
          <filter id="nebula-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="46" />
          </filter>
        </defs>
        <ellipse cx="860" cy="390" rx="250" ry="190" fill="#ff6a2c" opacity="0.55" filter="url(#nebula-blur)" />
        <ellipse cx="900" cy="330" rx="150" ry="110" fill="#2ee6d0" opacity="0.4" filter="url(#nebula-blur)" />
        {years.map((year, yearIndex) => {
          const tone = yearTone(yearIndex, years.length)
          return (
            <g key={year.year} className={`cover-ring cover-${tone.name}`} style={{ ['--i' as string]: yearIndex }}>
              {rings
                .filter((stroke) => stroke.year === year.year)
                .map((stroke, index) => (
                  <polyline
                    key={index}
                    className={index === 0 ? 'cover-redraw' : undefined}
                    points={stroke.points}
                    fill="none"
                    stroke={tone.color}
                    strokeWidth={tone.width}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
            </g>
          )
        })}
      </svg>
      <div className="cover-veil" />
      <div className="cover-copy">
        <p className="cover-kicker">{site.name} · 跑步</p>
        <h1>同一条路的年轮</h1>
        <p className="cover-num">{kilometers}</p>
        <p className="cover-unit">{count ? '公里' : '尚无跑步记录'}</p>
        <p className="cover-meta">
          {count ? `${count} 次` : '尚无记录'}
          {span ? ` · ${span}` : ''}
          {loop ? ` · ${loop.place}${loop.chapter} ${loop.count} 次` : ''}
        </p>
        <div className="cover-years" aria-hidden="true">
          {years.map((year, index) => (
            <p key={year.year} className="cover-year" style={{ animationDelay: `${index * 2.4}s`, animationDuration: `${cycle}s` }}>
              {year.year} 年 · 同一圈 {year.count} 次
            </p>
          ))}
        </div>
        <button type="button" className="cover-enter" onClick={onEnter}>
          进入路书
        </button>
      </div>
    </section>
  )
}

const YEAR_TONES = [
  { name: 'gold', color: '#ffe08a', width: 1.8 },
  { name: 'gold', color: '#ffc14a', width: 1.9 },
  { name: 'ember', color: '#ff7a32', width: 2.1 },
  { name: 'ember', color: '#ff4d3a', width: 2.2 },
  { name: 'teal', color: '#3ef0d2', width: 2.15 },
  { name: 'teal', color: '#7af6ff', width: 2.3 },
]

function yearTone(index: number, total: number) {
  if (total <= 1) return YEAR_TONES[2]
  const slot = Math.round((index / (total - 1)) * (YEAR_TONES.length - 1))
  return YEAR_TONES[slot]
}
