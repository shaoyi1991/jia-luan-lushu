import type { SportFilter } from '../types'
import { formatCnDay, formatKm } from '../lib/format'
import {
  decadeYears,
  heatFill,
  type Summary,
  yearWeeks,
} from '../lib/stats'

interface DecadePanelProps {
  career: Summary
  sport: SportFilter
  focusYear: number
  onYear: (year: number) => void
  emptyArchive: boolean
  title?: string
  detail?: string
}

export function DecadePanel({
  career,
  sport,
  focusYear,
  onYear,
  emptyArchive,
  title = '年份与月份',
  detail,
}: DecadePanelProps) {
  const years = decadeYears(career)
  const maxMonth = Math.max(0, ...years.flatMap((year) =>
    Array.from({ length: 12 }, (_, month) => (career.monthDistance[monthId(year, month)] ?? 0) / 1000),
  ))
  const weeks = yearWeeks(focusYear)
  const dayKms = weeks.flat().map((day) => (day ? (career.dayDistance[day] ?? 0) / 1000 : 0))
  const maxDay = Math.max(0, ...dayKms)
  const monthMeters = Array.from({ length: 12 }, (_, month) => career.monthDistance[monthId(focusYear, month)] ?? 0)
  const maxBar = Math.max(0, ...monthMeters)

  return (
    <div className="decade">
      <div className="section-head">
        <div>
          <p className="kicker">十年</p>
          <h2>{title}</h2>
        </div>
        <p className="quiet">
          {detail
            ? detail
            : emptyArchive
              ? '所示年份尚无跑步记录。'
              : '色阶表示里程。选择年份后，地图与记录将同步筛选。'}
        </p>
      </div>

      <div className="rug-wrap">
        <div className="rug" role="grid" aria-label="按年按月的里程">
          <div className="rug-corner" />
          {Array.from({ length: 12 }, (_, month) => (
            <div key={month} className="rug-month">{month + 1}</div>
          ))}
          {years.map((year) => (
            <YearRow
              key={year}
              year={year}
              count={career.yearCount[year] ?? 0}
              active={year === focusYear}
              maxMonth={maxMonth}
              sport={sport}
              distances={Array.from({ length: 12 }, (_, month) => career.monthDistance[monthId(year, month)] ?? 0)}
              onYear={onYear}
            />
          ))}
        </div>
      </div>

      <div className="year-split">
        <div>
          <div className="section-head tight">
            <h3>{focusYear} 年，一天一格</h3>
            <p className="quiet">纵轴自周一至周日。</p>
          </div>
          <div className="calendar">
          <div className="weekdays" aria-hidden="true">
            <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
          </div>
          <div className="heat-scroll">
          <div
            className="heat"
            style={{ gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column' }}
            role="img"
            aria-label={`${focusYear} 年每日里程`}
          >
            {weeks.flat().map((day, index) => {
              const km = day ? (career.dayDistance[day] ?? 0) / 1000 : 0
              return (
                <span
                  key={`${day ?? 'pad'}-${index}`}
                  className={day ? 'cell' : 'cell pad'}
                  style={{ background: day ? heatFill(km, maxDay, sport) : 'transparent' }}
                  title={day ? `${formatCnDay(day)} · ${km ? `${formatKm(km * 1000)} 公里` : '无记录'}` : undefined}
                />
              )
            })}
          </div>
          </div>
          </div>
        </div>
        <div>
          <div className="section-head tight">
            <h3>{focusYear} 年月度</h3>
            <p className="quiet">{maxBar > 0 ? '柱高按该年单月最高里程缩放。' : '该年尚无里程。'}</p>
          </div>
          <div className="bars" aria-label={`${focusYear} 年每月里程`}>
            {monthMeters.map((meters, month) => (
              <div key={month} className="bar-col">
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      height: maxBar > 0 ? `${(meters / maxBar) * 100}%` : '0%',
                      background: '#1c1915',
                    }}
                  />
                </div>
                <span>{month + 1}</span>
                <b>{meters > 0 ? formatKm(meters, meters >= 100000 ? 0 : 1) : ''}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function monthId(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function YearRow({
  year,
  count,
  active,
  distances,
  maxMonth,
  sport,
  onYear,
}: {
  year: number
  count: number
  active: boolean
  distances: number[]
  maxMonth: number
  sport: SportFilter
  onYear: (year: number) => void
}) {
  const total = distances.reduce((sum, value) => sum + value, 0)
  return (
    <>
      <button
        type="button"
        className={active ? 'rug-year active' : 'rug-year'}
        data-year={year}
        onClick={() => onYear(year)}
        aria-pressed={active}
      >
        {year}
        <small>{count ? `${count} 次` : '—'}</small>
        <small>{total > 0 ? `${formatKm(total, 0)} km` : ''}</small>
      </button>
      {distances.map((meters, month) => (
        <span
          key={month}
          className="rug-cell"
          style={{ background: heatFill(meters / 1000, maxMonth, sport) }}
          title={`${year}年${month + 1}月 · ${meters > 0 ? `${formatKm(meters)} 公里` : '无记录'}`}
        />
      ))}
    </>
  )
}
