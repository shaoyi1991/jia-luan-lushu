import { useRef } from 'react'
import { site } from '../site'
import type { SportFilter } from '../types'
import { formatCnDay, formatKm } from '../lib/format'
import { decadeYears, type Summary } from '../lib/stats'

interface TotalsPosterProps {
  summary: Summary
  sport: SportFilter
  emptyArchive: boolean
}

function posterSports(summary: Summary) {
  const blocks = [
    { key: 'run' as const, label: '跑步', color: '#1c1915' },
    { key: 'walk' as const, label: '行走', color: '#8d6232' },
    { key: 'hike' as const, label: '徒步', color: '#2f6b4a' },
    { key: 'ride' as const, label: '骑行', color: '#1f4e79' },
  ]
  const present = blocks.filter((item) => summary.sports[item.key].count > 0)
  return present.length > 0 ? present : [blocks[0]]
}

const SPORT_LABEL: Record<SportFilter, string> = {
  all: '全部',
  run: '跑步',
  walk: '行走',
  ride: '骑行',
  hike: '徒步',
}

export function TotalsPoster({ summary, sport, emptyArchive }: TotalsPosterProps) {
  const ref = useRef<SVGSVGElement>(null)
  const years = decadeYears(summary)
  const peak = Math.max(0, ...years.map((year) => summary.yearDistance[year] ?? 0))
  const headline = summary.count === 0 ? '尚无记录' : formatKm(summary.distance)
  const slot = 760 / years.length

  function download() {
    const node = ref.current
    if (!node) return
    const markup = new XMLSerializer().serializeToString(node)
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], {
      type: 'image/svg+xml',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '贾栾-路书.svg'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="poster-block">
      <div className="section-head">
        <div>
          <p className="kicker">SVG</p>
          <h2>累计海报</h2>
        </div>
        <button type="button" className="text-button" onClick={download}>
          下载这张 SVG
        </button>
      </div>
      <svg
        ref={ref}
        className="poster"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1080 640"
        role="img"
        aria-label={`${site.name}的路书海报`}
        fontFamily="PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
      >
        <rect width="1080" height="640" fill="#f6f1e6" />
        <rect x="28" y="28" width="1024" height="584" fill="none" stroke="#221c17" strokeOpacity="0.18" />
        <g transform="rotate(-8 100 100)">
          <rect x="64" y="64" width="72" height="72" fill="none" stroke="#1c1915" strokeWidth="2" />
        </g>
        <text x="100" y="112" textAnchor="middle" fontSize="36" fill="#1c1915">
          {site.seal}
        </text>
        <text x="168" y="92" fontSize="16" letterSpacing="4" fill="#6f6256">
          {site.nameEn.toUpperCase()} · KEEP · {SPORT_LABEL[sport]}
        </text>
        <text x="168" y="138" fontSize="42" fill="#221c17">
          {site.name}的路书
        </text>
        <text x="1000" y="118" textAnchor="end" fontSize={summary.count === 0 ? 42 : 64} fill="#221c17" fontFamily="Fraunces, Palatino, serif">
          {headline}
        </text>
        <text x="1000" y="150" textAnchor="end" fontSize="16" fill="#6f6256">
          {summary.count === 0 ? '尚无记录' : '公里'}
        </text>
        <text x="64" y="196" fontSize="16" fill="#6f6256">
          {summary.span
            ? `${formatCnDay(summary.span.from)}  —  ${formatCnDay(summary.span.to)}`
            : '同步全量历史之后，第一天和最近一天会写在这里。'}
        </text>
        {posterSports(summary).map((item, index) => (
          <PosterStat
            key={item.key}
            x={64 + index * 190}
            label={item.label}
            color={item.color}
            meters={summary.sports[item.key].distance}
            count={summary.sports[item.key].count}
          />
        ))}
        <PosterStat
          x={808}
          label="最长连续"
          color="#8d6a3b"
          meters={null}
          count={summary.streak.longest}
          text={summary.streak.longest ? String(summary.streak.longest) : '—'}
          unit="天"
        />
        <text x="64" y="360" fontSize="14" letterSpacing="3" fill="#6f6256">
          年份
        </text>
        <line x1="64" y1="470" x2="1016" y2="470" stroke="#221c17" strokeOpacity="0.2" />
        {years.map((year, index) => {
          const meters = summary.yearDistance[year] ?? 0
          const height = peak > 0 ? 150 * (meters / peak) : 0
          const x = 160 + index * slot
          const width = Math.max(slot - 14, 8)
          return (
            <g key={year}>
              <rect
                x={x}
                y={470 - height}
                width={width}
                height={height}
                rx="3"
                fill={meters > 0 ? '#1c1915' : '#e7e1d6'}
              />
              <text x={x + width / 2} y="492" textAnchor="middle" fontSize="12" fill="#6f6256">
                {year}
              </text>
            </g>
          )
        })}
        <text x="64" y="560" fontSize="14" fill="#6f6256">
          {emptyArchive ? '尚无跑步记录。' : '各年跑步里程累计。'}
        </text>
      </svg>
    </div>
  )
}

function PosterStat({
  x,
  label,
  color,
  meters,
  count,
  text,
  unit,
}: {
  x: number
  label: string
  color: string
  meters: number | null
  count: number
  text?: string
  unit?: string
}) {
  const value = text ?? (meters && meters > 0 ? formatKm(meters) : '—')
  return (
    <g>
      <text x={x} y="250" fontSize="15" fill={color}>
        {label}
      </text>
      <text x={x} y="286" fontSize="28" fill="#221c17">
        {value}
      </text>
      <text x={x} y="310" fontSize="13" fill="#6f6256">
        {unit ?? `${count} 次`}
      </text>
    </g>
  )
}
