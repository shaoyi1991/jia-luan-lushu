import { useEffect, useRef, useState } from 'react'
import type { Activity } from '../types'
import type { Story } from '../lib/story'
import { archiveLink, dawnFlipYear, dawnShare, distanceBestHistory, longDistanceRuns, monthLabel, paceLabel, peakHalfHour, runSlice, shortPlace, type NarrativeData } from '../lib/narrative'
import { dateKey, dayNumber, formatDuration, parseDuration } from '../lib/format'
import { computeStreak } from '../lib/stats'
import { decodeTrack, localRouteSample } from '../lib/geo'

const number = (n: number, digits = 0) => n.toLocaleString('zh-CN', { maximumFractionDigits: digits })
const cnDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分`
}
function clockWords(local: string) {
  const h = Number(local.slice(11, 13)), m = Number(local.slice(14, 16))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  const part = h < 5 ? '凌晨' : h < 12 ? '早上' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上'
  const hour = h % 12 || 12
  return `${part} ${hour} 点 ${String(m).padStart(2, '0')} 分`
}
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width,setWidth] = useState(500)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(entries => setWidth(Math.max(240,entries[0].contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  },[])
  return {ref,width}
}
export function RouteSignature({ rows, label }: { rows: Activity[]; label: string }) {
  const tracks = rows.length === 1
    ? [decodeTrack(rows[0].summary_polyline,120)].filter(p=>p.length>1)
    : localRouteSample(rows)
  if (!tracks.length) return <div className="signature-empty">未记录轨迹</div>
  const points=tracks.flat(), lat=points.reduce((s,p)=>s+p[0],0)/points.length
  const cos=Math.cos(lat*Math.PI/180)
  const xs=points.map(p=>p[1]*cos), ys=points.map(p=>p[0])
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
  const scale=Math.min(250/Math.max(.0001,maxX-minX),155/Math.max(.0001,maxY-minY))
  const ox=(290-(maxX-minX)*scale)/2,oy=(190-(maxY-minY)*scale)/2
  return <svg className="signature" viewBox="0 0 290 190" role="img" aria-label={label}>
    {tracks.map((track,i)=><polyline key={i} points={track.map(([y,x])=>`${ox+(x*cos-minX)*scale},${190-oy-(y-minY)*scale}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={tracks.length===1?1.6:1} strokeOpacity={tracks.length===1?.9:.35} pathLength={1} />)}
  </svg>
}
function ChapterHead({n,eyebrow,title,children}:{n:string;eyebrow:string;title:string;children?:React.ReactNode}) {
  return <div className="chapter-head"><span className="chapter-index" aria-hidden="true">{n}</span><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}</div></div>
}
function StoryNote({story,evidence}:{story?:Story;evidence?:string}) {
  if(!story)return null
  return <blockquote className="story-note"><p className="eyebrow">{story.when} · 贾栾的回忆</p><p className="quote">“{story.quote || story.text}”</p>{evidence && <p className="story-context">{evidence}</p>}</blockquote>
}
// 数据对照小注：每条回忆旁一行由当前导出实时计算的数字，随同步自动更新
function storyEvidence(story: Story | undefined, data: NarrativeData, activities: Activity[]): string | undefined {
  if (!story) return undefined
  const storyYear = (offset = 0) => Number(story.when.match(/\d{4}/)?.[0]) + offset
  if (story.id === 'life-2018-beijing-origin') {
    const beijing = data.places.find(p => shortPlace(p.place) === '北京')
    const qingdao = data.places.find(p => shortPlace(p.place) === '青岛')
    return beijing && qingdao ? `北京 ${number(beijing.count)} 次 ${number(beijing.km, 1)} 公里；青岛自 ${qingdao.first} 起至今 ${number(qingdao.count)} 次。` : undefined
  }
  if (story.id === 'life-2023-parenthood') {
    const year = data.years.find(y => y.year === storyYear())
    const july = data.months.find(m => m.key === `${storyYear()}-07`)
    return year && july ? `当年全年 ${number(year.km)} 公里，7 月全月 ${number(july.km, 1)} 公里。` : undefined
  }
  if (story.id === 'life-2020-pandemic-routine') {
    const year = data.years.find(y => y.year === storyYear())
    const prev = data.years.find(y => y.year === storyYear(-1))
    const months = data.months.filter(m => m.key.startsWith(String(storyYear())) && m.count > 0)
    const busiest = months.reduce<(typeof months)[number] | undefined>((peak, m) => peak && peak.count >= m.count ? peak : m, undefined)
    return year && prev ? `${year.year} 年 ${number(year.count)} 次出发（上一年 ${number(prev.count)} 次）${busiest ? `；最密的一个月是 ${monthLabel(busiest.key)}，${number(busiest.count)} 次` : ''}。` : undefined
  }
  if (story.id === 'life-luoyang-work') {
    const rows = data.runs.filter(r => shortPlace(r.location_country ?? '') === '洛阳')
    if (!rows.length) return undefined
    const segments: { from: string; to: string; count: number }[] = []
    for (const row of rows) {
      const key = dateKey(row.start_date_local)
      const current = segments.at(-1)
      if (current && dayNumber(key) - dayNumber(current.to) <= 90) { current.to = key; current.count++ }
      else segments.push({ from: key, to: key, count: 1 })
    }
    const km = rows.reduce((s, r) => s + r.distance / 1000, 0)
    return `${segments.length} 段共 ${number(rows.length)} 次 ${number(km, 1)} 公里：${segments.map(s => `${s.from.slice(0, 7)} 至 ${s.to.slice(0, 7)} ${number(s.count)} 次`).join('，')}。`
  }
  if (story.id === 'life-jining-hometown') {
    const jining = data.places.find(p => shortPlace(p.place) === '济宁')
    return jining ? `在济宁跑了 ${number(jining.count)} 次 ${number(jining.km)} 公里，${jining.first.slice(0, 7)} 至今。` : undefined
  }
  if (story.id === 'life-jinan-project') {
    // 济南驻场的密度按全部运动记录统计（步行、骑行也在其中），与 STORY 档案口径一致
    const rows = activities.filter(r => shortPlace(r.location_country ?? '') === '济南')
    if (!rows.length) return undefined
    const count = (keys: string[]) => keys.reduce((map, key) => { map[key] = (map[key] ?? 0) + 1; return map }, {} as Record<string, number>)
    const jinans = count(rows.map(r => r.start_date_local.slice(0, 7)))
    const top = Object.entries(jinans).sort((a, b) => b[1] - a[1])[0]
    const awayMonths = count(activities.filter(a => a.location_country && shortPlace(a.location_country) !== '青岛').map(a => a.start_date_local.slice(0, 7)))
    const awayTop = Object.entries(awayMonths).sort((a, b) => b[1] - a[1])[0]
    const siteTotal = rows.filter(r => r.start_date_local.startsWith(top[0].slice(0, 4))).length
    return `驻场那年共 ${number(siteTotal)} 次记录（含步行与骑行）；最密的 ${monthLabel(top[0])}，单月 ${number(top[1])} 次${awayTop && awayTop[0] === top[0] ? '，全周期最密的异地月份' : ''}。`
  }
  return undefined
}
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState<boolean>()
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    setRevealed(false)
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setRevealed(true)
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, revealed }
}

function Departure({data}:{data:NarrativeData}) {
  const {ref,width}=useWidth()
  const hours = data.hours
  const count=hours.reduce((s,v)=>s+v,0), peak=Math.max(...hours,1),hour=hours.indexOf(peak)
  const cx=width/2, cy=width/2, radius=width*.25, growth=width*.15
  return <div className="departure" ref={ref}>
    <div className="departure-heading"><span className="eyebrow">出发时钟 · 一天 24 小时</span></div>
    <div className="clock-scene"><svg viewBox={`0 0 ${width} ${width}`} role="img" aria-label={`全周期出发时间分布，最常出发的小时是 ${hour} 点`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" className="clock-circle" />
      {hours.map((v,h)=>{const angle=(h/24)*Math.PI*2-Math.PI/2;const r=radius+growth*v/peak;return <line key={h} className={h === hour ? "clock-ray clock-peak" : "clock-ray"} pathLength={1} x1={cx+Math.cos(angle)*radius} y1={cy+Math.sin(angle)*radius} x2={cx+Math.cos(angle)*r} y2={cy+Math.sin(angle)*r} stroke={h>=4&&h<8?'var(--copper)':'var(--clock-muted)'} strokeWidth={width<350?6:8} strokeLinecap="round" />})}
      {[0,6,12,18].map(h=>{const angle=(h/24)*Math.PI*2-Math.PI/2;return <text key={h} x={cx+Math.cos(angle)*width*.46} y={cy+Math.sin(angle)*width*.46+4} textAnchor="middle" className="clock-label">{String(h).padStart(2,'0')}</text>})}
      <text x={cx} y={cy-7} textAnchor="middle" className="clock-big">{String(hour).padStart(2,'0')}:00</text>
      <text x={cx} y={cy+24} textAnchor="middle" className="clock-label">最常出发的小时</text>
    </svg></div>
    <p className="clock-caption"><strong>{number(peak)} 次在这个钟点出发。</strong><br/>{count?`${number(hours.slice(4,8).reduce((s,v)=>s+v,0)/count*100,1)}% 的出发在 04:00—08:00`:'暂无出发时间记录'}</p>
  </div>
}

function Hero({ data, hasHiking }: { data: NarrativeData; hasHiking: boolean }) {
  const before8 = data.hours.slice(0, 8).reduce((s, v) => s + v, 0)
  const dawnPct = data.total.count ? Math.round(before8 / data.total.count * 100) : 0
  const yearsSpan = Math.floor((dayNumber(data.last) - dayNumber(data.first)) / 365.25)
  return <header className="hero-shell">
    <div className="home-nav">
      <a className="wordmark" href="#top">路书<span>JIA LUAN</span></a>
      <nav aria-label="主导航"><a href="#long-game">长期主义</a><a href="#habits">习惯</a><a href="#places">足迹</a><a href="#signatures">签名</a></nav>
    </div>
    <div className="hero-content">
      <div className="hero-copy">
        <p className="eyebrow">贾栾的跑步路书 · {data.first.slice(0, 4)}—{data.last.slice(0, 4)}</p>
        <h1><span>黎明</span>的人</h1>
        <p className="hero-lede">{yearsSpan > 0 && `${yearsSpan} 年多，`}{number(data.total.count)} 次跑步出发。</p>
        <div className="hero-totals">
          <span><strong>{number(data.total.km)}</strong> 公里</span>
          <span><strong>{number(data.total.seconds / 3600)}</strong> 小时</span>
          <span><strong>{dawnPct}%</strong> 在八点前出发</span>
        </div>
      </div>
      <Departure data={data} />
    </div>
    <a className="scroll-cue" href={hasHiking ? '#hiking' : '#first-run'}>{hasHiking ? '从徒步开始' : '查看第一条跑步记录'} <span>↓</span></a>
  </header>
}

function FirstRun({ data, activities, origin }: { data: NarrativeData; activities: Activity[]; origin?: Story }) {
  const first = data.runs[0]
  const firstYear = data.years[0]
  const place = shortPlace(first.location_country ?? '')
  return <section id="first-run" className="first-run">
    <div>
      <p className="eyebrow">起点 / FIRST RECORD</p>
      <h2>{number(first.distance / 1000, 2)} 公里</h2>
    </div>
    <div className="first-run-copy">
      <p className="first-run-when"><time dateTime={dateKey(first.start_date_local)}>{dateKey(first.start_date_local)}</time>，{clockWords(first.start_date_local)}{place && `，${place}`}。</p>
      <p className="first-run-line">没有人能从这 {number(first.distance / 1000, 2)} 公里里，<br/>看出后面的 {number(data.total.km)} 公里。</p>
      {firstYear && <p className="chart-note">那一年一共 {number(firstYear.count)} 次，{number(firstYear.km, 1)} 公里。</p>}
      <StoryNote story={origin} evidence={storyEvidence(origin, data, activities)} />
    </div>
  </section>
}

function PaceFigure({ data, dipYear, dipLabel }: { data: NarrativeData; dipYear?: number; dipLabel?: string }) {
  const { ref, revealed } = useReveal<HTMLElement>()
  const paces = data.years.filter(y => y.paceSeconds !== null)
  if (paces.length < 2) return null
  const W = 640, top = 34, bottom = 158, left = 20, right = 26
  const yearSpan = Math.max(1, paces.at(-1)!.year - paces[0].year)
  const x = (year: number) => left + (year - paces[0].year) / yearSpan * (W - left - right)
  const secs = paces.map(p => p.paceSeconds!)
  const lo = Math.min(...secs), hi = Math.max(...secs)
  const spread = (hi - lo) || 1
  const y = (s: number) => top + (s - lo) / spread * (bottom - top)
  const maxKm = Math.max(...paces.map(p => p.km), 1)
  const spineTop = 188, spineH = 30
  const first = paces[0], last = paces.at(-1)!
  const dip = dipYear !== undefined ? paces.find(p => p.year === dipYear) : undefined
  return <figure className="pace-figure" ref={ref} data-reveal={revealed}>
    <figcaption>年度配速与跑量——折线为每公里平均用时，越短越高；柱为当年跑量（公里）</figcaption>
    <svg viewBox={`0 0 ${W} 236`} role="img" aria-label={paces.map(p => `${p.year} 年配速 ${paceLabel(p.paceSeconds)} 每公里，跑量 ${number(p.km)} 公里`).join('；')}>
      <line className="pace-baseline" x1={left} y1={bottom} x2={W - right} y2={bottom} />
      <polyline className="pace-line" pathLength={1} points={paces.map(p => `${x(p.year)},${y(p.paceSeconds!)}`).join(' ')} />
      {paces.map(p => <circle key={p.year} className={p === last ? 'pace-dot pace-dot-last' : 'pace-dot'} cx={x(p.year)} cy={y(p.paceSeconds!)} r={4}>
        <title>{p.year} 年 · {paceLabel(p.paceSeconds)}/公里 · {number(p.km)} 公里{p.partial ? '（截至当前）' : ''}</title>
      </circle>)}
      <text className="pace-tag" x={x(first.year) - 4} y={y(first.paceSeconds!) + 26} textAnchor="start">{paceLabel(first.paceSeconds)}</text>
      <text className="pace-tag pace-tag-last" x={x(last.year) + 4} y={y(last.paceSeconds!) - 14} textAnchor="end">{paceLabel(last.paceSeconds)}</text>
      {paces.map(p => <rect key={p.year} className={p.partial ? 'vol-bar vol-bar-partial' : 'vol-bar'} x={x(p.year) - 6} y={spineTop + spineH * (1 - p.km / maxKm)} width={12} height={Math.max(1.5, spineH * p.km / maxKm)}>
        <title>{p.year} 年跑量 {number(p.km)} 公里{p.partial ? '（截至当前）' : ''}</title>
      </rect>)}
      {paces.map(p => <text key={p.year} className={`vol-tag${p.km === maxKm ? ' vol-tag-peak' : ''}${p.partial ? ' vol-tag-partial' : ''}`} x={x(p.year)} y={spineTop + spineH * (1 - p.km / maxKm) - 4} textAnchor="middle">{Math.round(p.km)}</text>)}
      {paces.map(p => <text key={p.year} className="year-tick" x={x(p.year)} y={spineTop + spineH + 14} textAnchor="middle">{p.year}</text>)}
      {dip && dipLabel && <text className="pace-dip-tag" x={x(dip.year)} y={spineTop - 8} textAnchor="middle">{dip.year} · {dipLabel}</text>}
    </svg>
    <p className="chart-note">配速为当年有效运动时长合计 ÷ 跑步里程合计；{data.years.at(-1)?.partial ? <>{data.years.at(-1)!.year} 年为进行中年度，截至 {data.last}。</> : null}</p>
  </figure>
}

function DawnMigration({ data, alarm }: { data: NarrativeData; alarm?: Story }) {
  const { ref, revealed } = useReveal<HTMLElement>()
  const years = data.years.filter(y => y.count > 0)
  if (years.length < 2) return null
  const flipYear = dawnFlipYear(data.years)
  const pct = (year: (typeof years)[number]) => Math.round(dawnShare(year) * 100)
  const first = years[0], last = years.at(-1)!
  const firstRun = data.runs[0]
  return <figure className="dawn-migration" ref={ref} data-reveal={revealed}>
    <figcaption>从夜到黎明——出发时间的年际迁移</figcaption>
    <div className="dawn-dials">
      {years.map(year => {
        const peak = year.hours.indexOf(Math.max(...year.hours))
        const peakValue = Math.max(...year.hours, 1)
        const flip = year.year === flipYear
        const halfHour = peakHalfHour(data.runs.filter(run => run.start_date_local.startsWith(String(year.year))))
        return <div className={flip ? 'dawn-dial dial-flip' : 'dawn-dial'} key={year.year}>
          <svg viewBox="0 0 92 92" role="img" aria-label={`${year.year} 年 ${pct(year)}% 在八点前出发，最常出发的小时是 ${peak} 点`}>
            <circle className="dial-circle" cx="46" cy="46" r="27" />
            {year.hours.map((v, h) => {
              const angle = (h / 24) * Math.PI * 2 - Math.PI / 2
              const r = 27 + 14 * v / peakValue
              return <line key={h} className={h === peak ? 'dial-ray dial-peak' : h >= 4 && h < 8 ? 'dial-ray dial-morning' : 'dial-ray'} pathLength={1}
                x1={46 + Math.cos(angle) * 27} y1={46 + Math.sin(angle) * 27} x2={46 + Math.cos(angle) * r} y2={46 + Math.sin(angle) * r} />
            })}
            <text className="dial-pct" x="46" y="51" textAnchor="middle">{pct(year)}%</text>
          </svg>
          <span className="dial-year">{year.year}{year.partial ? '﹡' : ''}</span>
          {halfHour && <span className="dial-peak-time">{halfHour} 档</span>}
          {flip && <span className="dial-flag">转向清晨</span>}
        </div>})}
    </div>
    <p className="chart-note">每格是一年的 24 小时出发分布：铜色为 04:00—08:00，赭色为当年最常出发的小时。年份下方单独标出记录最多的半小时时段。八点前出发从 {first.year} 年的 {pct(first)}%{first.count < 15 ? `（当年仅 ${number(first.count)} 条记录）` : ''}{flipYear ? `，到 ${flipYear} 年翻转为清晨主导` : ''}，{last.year} 年 {pct(last)}%{last.partial ? `（截至 ${data.last}）` : ''}。首跑在 {dateKey(firstRun.start_date_local)}，{clockWords(firstRun.start_date_local)}。</p>
    <StoryNote story={alarm} />
  </figure>
}

function WeekendFigure({ data }: { data: NarrativeData }) {
  const cutoff = data.last.slice(5)
  const years = [...new Set([2021, ...data.years.slice(-2).map(year => year.year)])].sort((a, b) => a - b)
  const rows = years.flatMap(year => {
    const runs = data.runs.filter(run => run.start_date_local.startsWith(String(year)) && run.start_date_local.slice(5, 10) <= cutoff)
    if (!runs.length) return []
    const weekend = runs.filter(run => {
      const day = new Date(dateKey(run.start_date_local) + 'T00:00:00Z').getUTCDay()
      return day === 0 || day === 6
    })
    const weekendIds = new Set(weekend.map(run => run.run_id))
    return [{
      year, all: runSlice(runs), weekend: runSlice(weekend),
      weekday: runSlice(runs.filter(run => !weekendIds.has(run.run_id))),
      longWeekend: weekend.filter(run => run.distance >= 20000).length,
      longAll: runs.filter(run => run.distance >= 20000).length,
    }]
  })
  if (rows.length < 2) return null
  const [before, after] = rows.slice(-2)
  const growth = after.all.km - before.all.km
  const weekendGrowth = after.weekend.km - before.weekend.km
  const share = growth > 0 && weekendGrowth > 0 && weekendGrowth <= growth ? Math.round(100 * weekendGrowth / growth) : null
  const [month, day] = cutoff.split('-').map(Number)
  return <figure className="insight" id="weekend">
    <figcaption>工作日和周末，一次跑多远？</figcaption>
    {share !== null && <p className="chapter-lede">{before.year}、{after.year} 年同期分别跑了 {before.all.count} 次和 {after.all.count} 次。多出的 {number(growth)} 公里里，<strong>{share}% 来自周末</strong>。</p>}
    <table>
      <caption>各年 1 月 1 日至 {month} 月 {day} 日 · 单次距离中位数</caption>
      <thead><tr><th scope="col">年份</th><th scope="col">工作日</th><th scope="col">周末</th><th scope="col">周末 ≥20 公里</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.year}>
        <th scope="row">{row.year}</th>
        <td>{row.weekday.medianKm === null ? '—' : `${number(row.weekday.medianKm, 2)} 公里`}</td>
        <td>{row.weekend.medianKm === null ? '—' : `${number(row.weekend.medianKm, 2)} 公里`}</td>
        <td>{row.longWeekend} 次</td>
      </tr>)}</tbody>
    </table>
    <p className="chart-note">{after.year} 年同期 {after.longAll} 次至少 20 公里的跑步中，{after.longWeekend} 次在周末。含室内跑，周末按当地日期的周六、周日计算。</p>
  </figure>
}

function MonthlyGoal({ data, goal }: { data: NarrativeData; goal?: Story }) {
  if (!goal) return null
  const start = '2024-11'
  const target = 200
  const complete = data.months.filter(month => month.key >= start && month.state !== 'outside' && !month.partial)
  const years = [...new Set(complete.map(month => month.key.slice(0, 4)))]
  const october = data.months.find(month => month.key === '2024-10' && month.state === 'recorded')
  const november = complete.find(month => month.key === start && month.state === 'recorded')
  return <section className="insight" id="monthly-goal" aria-labelledby="monthly-goal-title">
    <h3 id="monthly-goal-title">每月 200 公里，从定下到做到</h3>
    {october && november && <p className="chapter-lede">定下目标前一个月跑了 {number(october.km, 1)} 公里，定下目标当月跑了 <strong>{number(november.km, 1)} 公里</strong>。</p>}
    <StoryNote story={goal} />
    <div className="goal-years">{years.map(year => {
      const months = complete.filter(month => month.key.startsWith(year))
      const count = months.filter(month => month.km >= target).length
      return <div className="goal-year" key={year}>
        <p><strong>{year}</strong> <span>{count} / {months.length} 个月达标</span></p>
        <ul aria-label={`${year} 年各月跑量`}>{months.map(month => <li key={month.key} className={month.km >= target ? 'goal-met' : undefined}>
          <span>{Number(month.key.slice(5))} 月</span>
          <strong>{month.state === 'no-record' ? '无记录' : number(month.km, 1)}</strong>
        </li>)}</ul>
      </div>
    })}</div>
    <p className="chart-note">各格单位为公里。深色为达到 200 公里。仅统计目标设立后已经结束的月份。</p>
  </section>
}

function LongGame({ data, activities, parenthood, recovery, turning2020, alarm, goal }: { data: NarrativeData; activities: Activity[]; parenthood?: Story; recovery?: Story; turning2020?: Story; alarm?: Story; goal?: Story }) {
  const paces = data.years.filter(y => y.paceSeconds !== null)
  const pairs = Math.max(0, paces.length - 1)
  let improved = 0
  for (let i = 1; i < paces.length; i++) if (paces[i].paceSeconds! < paces[i - 1].paceSeconds!) improved++
  const allBetter = pairs > 0 && improved === pairs
  const first = paces[0], last = paces.at(-1)!
  const saved = first && last ? first.paceSeconds! - last.paceSeconds! : 0
  const parenthoodYear = parenthood?.when.match(/\d{4}/)?.[0]
  const dip = parenthoodYear ? data.years.find(y => y.year === Number(parenthoodYear)) : undefined
  const dipStillFaster = dip && paces.find(p => p.year === dip.year) && paces.find(p => p.year === dip.year - 1)
    && paces.find(p => p.year === dip.year)!.paceSeconds! < paces.find(p => p.year === dip.year - 1)!.paceSeconds!
  return <section id="long-game" className="chapter">
    <ChapterHead n="01" eyebrow="长期主义 / THE LONG GAME" title={allBetter ? `${pairs} 个年度交替，平均配速逐年变快。` : '配速的年轮。'} />
    <div className="chapter-split">
      <PaceFigure data={data} dipYear={dipStillFaster && dip ? dip.year : undefined} dipLabel="有了娃" />
      <div className="story-column">
        <p className="chapter-lede">从 {paceLabel(first?.paceSeconds ?? null)} 到 {paceLabel(last?.paceSeconds ?? null)}，每公里少用 {number(saved)} 秒。{dipStillFaster && dip ? `${dip.year} 年跑量只有 ${number(dip.km)} 公里，平均配速仍比上一年快。` : ''}这是所有有效跑步记录的距离加权配速，随每年记录的距离和跑法而变。</p>
        <StoryNote story={turning2020} evidence={storyEvidence(turning2020, data, activities)} />
        <StoryNote story={parenthood} evidence={storyEvidence(parenthood, data, activities)} />
        <StoryNote story={recovery} />
      </div>
    </div>
    <MonthlyGoal data={data} goal={goal} />
    <DawnMigration data={data} alarm={alarm} />
  </section>
}

function Habits({ data }: { data: NarrativeData }) {
  const streak = computeStreak(data.runs.map(r => r.start_date_local.slice(0, 10)), data.last)
  const spanDays = dayNumber(data.last) - dayNumber(data.first) + 1
  const dayPct = spanDays ? Math.round(data.total.days / spanDays * 100) : 0
  const crossWinter = streak.from && Number(streak.from.slice(5, 7)) >= 10 && Number(streak.to.slice(5, 7)) <= 3
  const bins = [
    { label: '不到 5 公里', min: 0, max: 5000 },
    { label: '5–10 公里', min: 5000, max: 10000 },
    { label: '10–20 公里', min: 10000, max: 20000 },
    { label: '20 公里及以上', min: 20000, max: Infinity },
  ].map(bin => ({ ...bin, count: data.runs.filter(run => run.distance >= bin.min && run.distance < bin.max).length }))
  const usual = bins[1]
  const weekdays = Array<number>(7).fill(0)
  for (const run of data.runs) weekdays[(new Date(`${dateKey(run.start_date_local)}T00:00:00Z`).getUTCDay() + 6) % 7]++
  const weekdayMax = Math.max(...weekdays, 1)
  const maxDay = '一二三四五六日'[weekdays.indexOf(weekdayMax)]
  const minDay = '一二三四五六日'[weekdays.indexOf(Math.min(...weekdays))]
  const peakMonth = data.months.filter(m => m.state !== 'outside').reduce((peak, month) => month.km > peak.km ? month : peak)
  return <section id="habits" className="chapter">
    <ChapterHead n="02" eyebrow="习惯 / RUNNING PATTERNS" title="日常跑，也在慢慢变长。" />
    <WeekendFigure data={data} />
    <div className="fact-tiles">
      <div><strong>{Math.round(usual.count / Math.max(data.total.count, 1) * 100)}%</strong><p>{number(usual.count)} 次出发落在 5 到 10 公里之间</p></div>
      <div><strong>{dayPct}%</strong><p>{number(spanDays)} 天里的 {number(data.total.days)} 天有跑步</p></div>
      <div><strong>{streak.longest} 天</strong><p>最长连续，{streak.from} 至 {streak.to}{crossWinter && '，跨过整个冬天'}</p></div>
    </div>
    <div className="chapter-split habit-grid">
      <figure className="pattern-distances">
        <figcaption>从 {number(data.total.count)} 次出发里看单次距离</figcaption>
        {bins.map(bin => <div className="pattern-distance" key={bin.label}>
          <span>{bin.label}</span>
          <span className="pattern-track" aria-hidden="true"><span style={{ width: `${bin.count / data.total.count * 100}%` }} /></span>
          <strong>{number(bin.count / data.total.count * 100)}%</strong>
        </div>)}
        <p className="chart-note">{number(usual.count)} 次落在 5 公里到不足 10 公里之间，是最常见的一次。</p>
      </figure>
      <figure className="weekday-figure">
        <figcaption>一周七天，都有出发</figcaption>
        {weekdays.map((count, index) => <div className="pattern-distance weekday-row" key={index}>
          <span>周{'一二三四五六日'[index]}</span>
          <span className="pattern-track" aria-hidden="true"><span style={{ width: `${count / weekdayMax * 100}%` }} /></span>
          <strong>{count}</strong>
        </div>)}
        <p className="chart-note">周{maxDay}跑得最多，周{minDay}最少，只差 {number(weekdayMax - Math.min(...weekdays))} 次。</p>
      </figure>
    </div>
    <figure className="month-roll">
      <figcaption>跑量的月度长卷</figcaption>
      <div className="month-row month-labels" aria-hidden="true"><span />{Array.from({ length: 12 }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
      {data.years.map(({ year }) => <div className="month-row" key={year}>
        <span>{year}</span>
        {data.months.filter(month => month.key.startsWith(String(year))).map(month => {
          const inStreak = month.key >= streak.from.slice(0, 7) && month.key <= streak.to.slice(0, 7)
          const isPeak = month.key === peakMonth.key
          const label = `${monthLabel(month.key)} · ${month.state === 'outside' ? '记录范围外' : `${number(month.km, 1)} 公里`}${isPeak ? ' · 峰值月' : ''}${inStreak ? ' · 连跑区间' : ''}`
          return <span key={month.key} role="img" title={label} aria-label={label}
            className={`month-cell ${month.state} ${inStreak ? 'month-streak' : ''} ${isPeak ? 'month-peak' : ''}`}>
            {month.state === 'recorded' && <i className={month.partial ? 'month-bar-partial' : undefined} style={{ height: `${Math.max(8, month.km / Math.max(peakMonth.km, 1) * 100)}%` }} />}
          </span>
        })}
      </div>)}
      <p className="chart-note"><strong>柱高即当月跑量</strong>（相对峰值月）。赭色描边是连续跑步跨过的月份，圆点为峰值月：{monthLabel(peakMonth.key)}，<strong>{number(peakMonth.km, 1)} 公里</strong>；空白格是该月没有跑步记录。</p>
    </figure>
  </section>
}

function PlaceTimeline({ data, activities }: { data: NarrativeData; activities: Activity[] }) {
  const qingdao = data.places.find(place => shortPlace(place.place) === '青岛')
  const jining = data.places.find(place => shortPlace(place.place) === '济宁')
  const jinan = data.places.find(place => shortPlace(place.place) === '济南')
  const luoyang = data.places.find(place => shortPlace(place.place) === '洛阳')
  const dongying = longDistanceRuns(data.runs).filter(run => shortPlace(run.location_country ?? '') === '东营' && run.distance >= 41500 && run.distance <= 44000)
  const aba = activities.filter(activity => activity.location_country?.includes('阿坝') && dateKey(activity.start_date_local))
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
  const walks = aba.filter(activity => activity.type === 'Walk' || activity.type === 'Hiking').length
  const entries = [
    qingdao && { name: '青岛', start: qingdao.first, end: qingdao.last, text: `${number(qingdao.count)} 次跑步 · 常跑的地方` },
    jining && { name: '济宁', start: jining.first, end: jining.last, text: `${number(jining.count)} 次跑步 · 老家金乡` },
    jinan && { name: '济南', start: jinan.first, end: jinan.last, text: `${number(jinan.count)} 次跑步 · 2020 年项目驻场` },
    luoyang && { name: '洛阳', start: luoyang.first, end: luoyang.last, text: `${number(luoyang.count)} 次跑步 · 一段异地日常` },
    dongying.length > 0 && { name: '东营', start: dateKey(dongying[0].start_date_local), end: dateKey(dongying.at(-1)!.start_date_local), text: `${dongying.length} 条全马距离记录` },
    aba.length > 0 && { name: '阿坝', start: dateKey(aba[0].start_date_local), end: dateKey(aba.at(-1)!.start_date_local), text: `${aba.length} 条全运动记录，${walks} 条是步行或徒步` },
  ].filter(entry => entry !== undefined && entry !== false).sort((a, b) => a.start.localeCompare(b.start))
  if (!entries.length) return null
  return <ol className="place-timeline">{entries.map(entry => <li key={entry.name}>
    <time dateTime={entry.start}>{entry.start}{entry.end !== entry.start && ` 至 ${entry.end}`}</time>
    <div><strong>{entry.name}</strong><p>{entry.text}</p></div>
  </li>)}</ol>
}

function Places({ data, activities, luoyang, hometown, cityStories }: { data: NarrativeData; activities: Activity[]; luoyang?: Story; hometown?: Story; cityStories: Record<string, Story | undefined> }) {
  const home = data.places.find(p => shortPlace(p.place) === '青岛')
  const jining = data.places.find(p => shortPlace(p.place) === '济宁')
  const second = data.places.find(p => shortPlace(p.place) === '洛阳')
  const dongying = data.runs.filter(r => shortPlace(r.location_country ?? '') === '东营')
  const others = data.places.filter(p => p !== home && p !== second && p !== jining && (cityStories[shortPlace(p.place)] || p.rows.some(r => r.summary_polyline))).sort((a, b) => Number(Boolean(cityStories[shortPlace(b.place)])) - Number(Boolean(cityStories[shortPlace(a.place)]))).slice(0, 4)
  const warmups = dongying.filter(r => r.distance < 40000)
  const marathons = dongying.filter(r => r.distance >= 40000)
  return <section id="places" className="chapter">
    <ChapterHead n="03" eyebrow="足迹 / PLACES" title="一座主场，一个老家，几段插曲。" />
    <div className="place-featured">
      {home && <article className="place-card place-home">
        <div className="place-title"><h3>{shortPlace(home.place)}</h3><span>主场</span></div>
        <RouteSignature rows={home.rows} label="青岛的常跑路线" />
        <p>{number(home.count)} 次跑步 · {number(home.km)} 公里 · {home.first.slice(0, 4)} 年至今</p>
        {cityStories.青岛 && <p className="city-context">{cityStories.青岛.text}</p>}
      </article>}
      {jining && <article className="place-card place-hometown">
        <div className="place-title"><h3>{shortPlace(jining.place)}</h3><span>老家</span></div>
        <RouteSignature rows={jining.rows} label="济宁的常跑路线" />
        <p>{number(jining.count)} 次跑步 · {jining.first.slice(0, 4)} 年至今</p>
        <StoryNote story={hometown} evidence={storyEvidence(hometown, data, activities)} />
      </article>}
      {second && <article className="place-card place-second">
        <div className="place-title"><h3>{shortPlace(second.place)}</h3><span>插曲</span></div>
        <RouteSignature rows={second.rows} label="洛阳的常跑路线" />
        <p>{number(second.count)} 次跑步 · {second.first} 至 {second.last}</p>
        <StoryNote story={luoyang} evidence={storyEvidence(luoyang, data, activities)} />
      </article>}
    </div>
    {dongying.length > 0 && <p className="place-dongying">东营只留下 {dongying.length} 笔记录：{warmups.length === 1 ? `赛前一早的 ${number(warmups[0].distance / 1000, 1)} 公里热身，和 ` : ''}{marathons.length} 场全马，都与比赛相邻。</p>}
    <PlaceTimeline data={data} activities={activities} />
    {others.length > 0 && <div className="places-grid">{others.map(place => (
      <article className="place-item" key={place.place}>
        <div className="place-title"><h3>{shortPlace(place.place)}</h3><span>{number(place.count)} 次</span></div>
        <RouteSignature rows={place.rows} label={`${shortPlace(place.place)}的部分跑步轨迹`} />
        {cityStories[shortPlace(place.place)] && <p className="city-context">{cityStories[shortPlace(place.place)]!.text}</p>}
      </article>
    ))}</div>}
    <p className="chart-note">跑步足迹共 {data.places.length} 个地点；地点沿用记录标签，阿坝一段按全部运动统计。</p>
  </section>
}

function SignatureCard({ run }: { run: Activity }) {
  const { ref, revealed } = useReveal<HTMLElement>()
  const date = dateKey(run.start_date_local)
  const place = shortPlace(run.location_country ?? '')
  return <article className="signature-card" ref={ref} data-reveal={revealed}>
    <RouteSignature rows={[run]} label={`${date} ${place}的跑步轨迹`} />
    <strong>{number(run.distance / 1000, 1)} 公里</strong>
    <p>{date}{place && ` · ${place}`}</p>
  </article>
}

function BestMarkCards({ data }: { data: NarrativeData }) {
  const groups = [
    { label: '全马距离', history: distanceBestHistory(data.runs, 41500, 44000) },
    { label: '半马距离', history: distanceBestHistory(data.runs, 20800, 22200) },
  ].filter(group => group.history.length)
  if (!groups.length) return null
  return <div className="best-marks">
    {groups.map(({ label, history }) => {
      const first = history[0]
      const best = history[history.length - 1]
      const timestamp = (date: string) => Date.parse(date.slice(0, 10))
      const start = timestamp(first.activity.start_date_local)
      const span = Math.max(timestamp(best.activity.start_date_local) - start, 1)
      const spread = Math.max(first.seconds - best.seconds, 1)
      const points = history.map(mark => {
        const x = 8 + 284 * (timestamp(mark.activity.start_date_local) - start) / span
        const y = 8 + 48 * (mark.seconds - best.seconds) / spread
        return [x, y]
      })
      return <article className="best-mark" key={label}>
        <h3>{label} · 个人最快记录的来路</h3>
        <strong>{cnDuration(best.seconds)}</strong>
        <p>{dateKey(best.activity.start_date_local)}{best.activity.location_country && ` · ${shortPlace(best.activity.location_country)}`}</p>
        <svg viewBox="0 0 300 64" aria-hidden="true">
          <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
          {points.map(([x, y], index) => <circle key={history[index].activity.run_id} cx={x} cy={y} r="3.5" fill="currentColor" />)}
        </svg>
        <p>最早一笔 · {first.activity.start_date_local.slice(0, 4)} 年 · {cnDuration(first.seconds)}，此后刷新 {number(history.length - 1)} 次。</p>
      </article>
    })}
  </div>
}

function DongyingComparison({ data }: { data: NarrativeData }) {
  const dates = ['2025-10-19', '2026-10-18']
  const rows = dates.flatMap(date => {
    const race = data.runs.find(run => run.type === 'Run' && dateKey(run.start_date_local) === date
      && shortPlace(run.location_country ?? '') === '东营' && run.distance >= 41500 && run.distance <= 44000)
    if (!race) return []
    const raceDay = dayNumber(date)
    const previous = data.runs.filter(run => {
      const days = raceDay - dayNumber(dateKey(run.start_date_local))
      return days >= 1 && days <= 56
    })
    return [{ date, training: runSlice(previous), long: previous.filter(run => run.distance >= 20000).length, seconds: parseDuration(race.elapsed_time) }]
  })
  if (rows.length !== dates.length) return null
  return <figure className="insight" id="dongying">
    <figcaption>两次东营全马，赛前八周怎么跑？</figcaption>
    <table>
      <thead><tr><th scope="col">赛前与当天</th>{rows.map(row => <th scope="col" key={row.date}>{row.date}</th>)}</tr></thead>
      <tbody>
        <tr><th scope="row">跑步记录</th>{rows.map(row => <td key={row.date}>{row.training.count} 次</td>)}</tr>
        <tr><th scope="row">累计里程</th>{rows.map(row => <td key={row.date}>{number(row.training.km, 1)} 公里</td>)}</tr>
        <tr><th scope="row">≥20 公里</th>{rows.map(row => <td key={row.date}>{row.long} 次</td>)}</tr>
        <tr><th scope="row">当天整次耗时</th>{rows.map(row => <td key={row.date}><strong>{formatDuration(row.seconds)}</strong></td>)}</tr>
      </tbody>
    </table>
    <p className="chart-note">赛前取比赛日前 56 天，含室内跑。当天耗时来自设备记录。两次对照呈现跑量与成绩的变化。</p>
  </figure>
}

function Signatures({ data, autumn }: { data: NarrativeData; autumn?: Story }) {
  const runs = longDistanceRuns(data.runs)
  if (!runs.length) return null
  const history = distanceBestHistory(data.runs, 41500, 44000)
  const firstMark = history[0]
  const bestMark = history.at(-1)!
  const saved = history.length > 1 ? firstMark.seconds - bestMark.seconds : 0
  const lastGap = runs.length > 1
    ? dayNumber(dateKey(runs.at(-1)!.start_date_local)) - dayNumber(dateKey(runs.at(-2)!.start_date_local))
    : 0
  const placeOf = (run: Activity) => shortPlace(run.location_country ?? '')
  return <section id="signatures" className="chapter">
    <ChapterHead n="04" eyebrow="长距离 / SIGNATURES" title={`42 公里的形状，${runs.length} 幅签名。`} />
    {firstMark && <div className="signature-progress">
      <div><span className="eyebrow">第一次</span><strong>{cnDuration(firstMark.seconds)}</strong><p>{dateKey(firstMark.activity.start_date_local)} · {placeOf(firstMark.activity)}</p></div>
      {saved > 0 && <div className="signature-arrow">全马距离记录<br/>快了 {cnDuration(saved)}</div>}
      <div><span className="eyebrow">最快一次</span><strong>{cnDuration(bestMark.seconds)}</strong><p>{dateKey(bestMark.activity.start_date_local)} · {placeOf(bestMark.activity)}</p></div>
    </div>}
    <p className="chapter-lede">每一次超过 40 公里的轨迹，形状都不一样。放在一起，像一个人的签名。</p>
    <BestMarkCards data={data} />
    <DongyingComparison data={data} />
    <StoryNote story={autumn} />
    <div className="signature-grid">{runs.map(run => <SignatureCard key={run.run_id} run={run} />)}</div>
    {lastGap > 0 && lastGap <= 14 && <p className="signature-last">最后一幅签名，在全马之后第 {lastGap} 天：又是一条 {number(runs.at(-1)!.distance / 1000, 1)} 公里。</p>}
    <p className="chart-note">轨迹为等比缩放的 GPS 记录。最快记录取接近全马或半马距离的整次经过时间；半马距离窗口内亦含日常长距离训练，非官方比赛净成绩。</p>
  </section>
}

function SelfPortrait({ data }: { data: NarrativeData }) {
  const before8 = data.hours.slice(0, 8).reduce((sum, count) => sum + count, 0)
  const dawnPct = Math.round(100 * before8 / data.total.count)
  const paces = data.years.filter(year => year.paceSeconds !== null)
  const values = paces.map(year => year.paceSeconds!)
  const min = Math.min(...values), max = Math.max(...values)
  const points = values.map((pace, i) => ({
    x: 9 + i * 162 / Math.max(1, values.length - 1),
    y: 9 + (pace - min) * 42 / Math.max(1, max - min),
  }))
  const latest = data.years.filter(year => year.count).at(-1)
  const runs = latest ? data.runs.filter(run => run.start_date_local.startsWith(String(latest.year))) : []
  const weekend = (run: Activity) => [0, 6].includes(new Date(dateKey(run.start_date_local) + 'T00:00:00Z').getUTCDay())
  const weekdayKm = runSlice(runs.filter(run => !weekend(run))).medianKm
  const weekendKm = runSlice(runs.filter(weekend)).medianKm
  const maxKm = Math.max(1, weekdayKm ?? 0, weekendKm ?? 0)
  const home = data.places.find(place => shortPlace(place.place) === '青岛')
  const homePct = home ? Math.round(100 * home.count / data.total.count) : 0
  return <section className="chapter closing-chapter" id="portrait">
    <ChapterHead n="05" eyebrow="终章 / SELF-PORTRAIT" title="数据自画像。" />
    <div className="portrait-grid">
      <figure className="portrait-card">
        <figcaption>几点出门</figcaption>
        <div className="portrait-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="42" className="portrait-track" />
            <circle cx="50" cy="50" r="42" pathLength="100" strokeDasharray={`${dawnPct} 100`} transform="rotate(-90 50 50)" />
          </svg>
          <strong>{dawnPct}%</strong>
        </div>
        <p>八点前出发 · 全周期</p>
      </figure>
      {weekdayKm !== null && weekendKm !== null && <figure className="portrait-card">
        <figcaption>一次跑多远</figcaption>
        <div className="portrait-bars">{[['工作日', weekdayKm], ['周末', weekendKm]].map(([label, km]) => <div key={label}>
          <p>{label}<strong>{number(Number(km), 1)} 公里</strong></p>
          <span aria-hidden="true" style={{ width: `${Number(km) / maxKm * 100}%` }} />
        </div>)}</div>
        <p>{latest!.year} 年单次距离中位数</p>
      </figure>}
      {paces.length > 1 && <figure className="portrait-card">
        <figcaption>每公里用时</figcaption>
        <svg className="portrait-spark" viewBox="0 0 180 60" aria-hidden="true">
          <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} />
          {[points[0], points.at(-1)!].map(point => <circle key={point.x} cx={point.x} cy={point.y} r="3.4" />)}
        </svg>
        <p className="portrait-endpoints"><strong>{paceLabel(values[0])}</strong><span aria-hidden="true">→</span><strong>{paceLabel(values.at(-1)!)}</strong></p>
        <p>年度平均 · {paces[0].year}–{paces.at(-1)!.year}</p>
      </figure>}
      {home && <figure className="portrait-card">
        <figcaption>跑步主场</figcaption>
        <div className="portrait-home"><strong>{homePct}%</strong><span>青岛</span></div>
        <div className="portrait-share" aria-hidden="true"><span style={{ width: `${homePct}%` }} /></div>
        <p>{number(home.count)} 次，占全部跑步记录的比例</p>
      </figure>}
    </div>
    <p className="chart-note">跑步记录含室内跑。数据截至 {data.last}。</p>
  </section>
}

function HikingChapter({ activities, hiking, family }: { activities: Activity[]; hiking?: Story; family?: Story }) {
  if (!hiking && !family) return null
  const hikes = activities.filter(activity => activity.type === 'Hiking')
  const first = hikes.map(activity => dateKey(activity.start_date_local)).filter(Boolean).sort()[0]
  const hikeYears = [...new Set(hikes.map(activity => activity.start_date_local.slice(0, 4)))].sort()
  const aba = activities.filter(activity => activity.location_country?.includes('阿坝'))
  const walking = aba.filter(activity => activity.type === 'Walk' || activity.type === 'Hiking')
  const unmatched = aba.length - walking.length
  return <section className="chapter hiking-chapter" id="hiking" aria-labelledby="hiking-title">
    <p className="eyebrow">徒步 / EARLY TRAILS</p>
    <h2 id="hiking-title">跑步之前，已经在路上</h2>
    <div className="chapter-split">
      <div>
        {first && <p className="chapter-lede">现存最早的徒步记录在 <time dateTime={first}>{first}</time>。档案里标为徒步的 {hikes.length} 条活动，分布在 {hikeYears.join('、')} 年。</p>}
        <RouteSignature rows={walking} label="阿坝行程中步行与徒步记录的轨迹" />
        {aba.length > 0 && <p className="chart-note">阿坝现存 {aba.length} 条活动，{walking.length} 条标为步行或徒步。{unmatched > 0 && `另有 ${unmatched} 条标签与这次徒步行程的回忆有出入，留待核对。`}</p>}
      </div>
      <div className="hiking-notes"><StoryNote story={hiking} /><StoryNote story={family} /></div>
    </div>
  </section>
}

export function Narrative({ data, stories, activities }: { data: NarrativeData; stories: Story[]; activities: Activity[] }) {
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  const wovenIds = [
    'life-2023-parenthood', 'life-recent-recovery', 'life-luoyang-work',
    'life-2020-pandemic-routine', 'life-2018-beijing-origin', 'life-jining-hometown',
    'life-2026-goal-200', 'life-2026-autumn-races',
    'life-dawn-alarm', 'life-hiking-aba', 'life-2021-family-rhythm',
    'life-qingdao-home', 'life-tianjin-campus', 'life-weifang-races',
  ]
  const parenthood = stories.find(s => s.id === 'life-2023-parenthood')
  const recovery = stories.find(s => s.id === 'life-recent-recovery')
  const luoyang = stories.find(s => s.id === 'life-luoyang-work')
  const turning2020 = stories.find(s => s.id === 'life-2020-pandemic-routine')
  const origin2018 = stories.find(s => s.id === 'life-2018-beijing-origin')
  const hometown = stories.find(s => s.id === 'life-jining-hometown')
  const goal200 = stories.find(s => s.id === 'life-2026-goal-200')
  const autumnRaces = stories.find(s => s.id === 'life-2026-autumn-races')
  const alarm = stories.find(s => s.id === 'life-dawn-alarm')
  const hiking = stories.find(s => s.id === 'life-hiking-aba')
  const family = stories.find(s => s.id === 'life-2021-family-rhythm')
  const otherStories = stories.filter(s => !wovenIds.includes(s.id))
  return <>
    <Hero data={data} hasHiking={Boolean(hiking || family)} />
    <main id="main" className="narrative-main">
      <HikingChapter activities={activities} hiking={hiking} family={family} />
      <FirstRun data={data} activities={activities} origin={origin2018} />
      <LongGame data={data} activities={activities} parenthood={parenthood} recovery={recovery} turning2020={turning2020} alarm={alarm} goal={goal200} />
      <Habits data={data} />
      <Places data={data} activities={activities} luoyang={luoyang} hometown={hometown} cityStories={{
        青岛: stories.find(s => s.id === 'life-qingdao-home'),
        天津: stories.find(s => s.id === 'life-tianjin-campus'),
        潍坊: stories.find(s => s.id === 'life-weifang-races'),
      }} />
      <Signatures data={data} autumn={autumnRaces} />
      {otherStories.length > 0 && <section className="chapter additional-stories"><h2>更多生活片段</h2>{otherStories.map(story => <StoryNote key={story.id} story={story} evidence={storyEvidence(story, data, activities)} />)}</section>}
      <SelfPortrait data={data} />
    </main>
    <footer className="site-footer">
      <a className="wordmark" href="#top">路书<span>JIA LUAN</span></a>
      <p>户外跑与室内跑 · 数据截至 {data.last}<br/><a href={archiveLink()}>原始运动档案 ↗</a> · <a href="./">回到定稿版 ↗</a></p>
      <a href="#top">回到开头 ↑</a>
    </footer>
  </>
}
