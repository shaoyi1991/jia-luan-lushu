import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import stories, { editorial } from 'virtual:edition-stories'
import { loadActivities } from '../lib/activities'
import { buildNarrative, archiveLink, distanceBestHistory, dawnFlipYear, dawnShare, monthLabel, paceLabel, peakHalfHour, runSlice, shortPlace, longDistanceRuns, type YearSlice } from '../lib/narrative'
import { computeStreak } from '../lib/stats'
import { dateKey, formatDuration, parseDuration } from '../lib/format'
import { decodeTrack } from '../lib/geo'
import { RouteSignature } from '../components/Narrative'
import type { Activity } from '../types'
import { usePlay } from './usePlay'
import { goalState, goalKm, historicalRuns, raceOn, dongying, weekendComparison } from './data'
import './style.css'

const { activities, error } = loadActivities()
const data = buildNarrative(activities)
const n = (value: number, digits = 0) => value.toLocaleString('zh-CN', {maximumFractionDigits: digits})
const place = (row: Activity) => shortPlace(row.location_country ?? '') || '地点未标注'
const archive = (id?: string) => './old.html' + archiveLink({id})
const km = (row: Activity) => n(row.distance / 1000, 1)
const hoursText = (seconds: number) => {
  const whole = Math.round(seconds / 60)
  const h = Math.floor(whole / 60), m = whole % 60
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`
}
const hourScale = Math.max(.01, ...data.years.flatMap(y => y.hours.map(h => h / (y.count || 1))))
const peak = (year: number) => peakHalfHour(data.runs.filter(r => r.start_date_local.startsWith(String(year)))) ?? '—'

const months = data.months.filter(m => m.state !== 'outside')
const goalMonths = months.filter(m => m.key >= '2024-01')
const goalLimit = Math.max(250, Math.ceil(Math.max(0, ...goalMonths.map(m => m.km)) / 50) * 50)
const monthLimit = Math.max(50, Math.ceil(Math.max(0, ...months.map(m => m.km)) / 50) * 50)

// 结论式章题的数字，全部由当前导出实时计算
const streak = computeStreak(data.runs.map(r => dateKey(r.start_date_local)), data.last)
const dawnPct = Math.round(dawnShare({ hours: data.hours, count: data.total.count }, 7) * 100)
const equatorShare = data.total.km / 40075 * 100
const wholeDays = Math.round(data.total.seconds / 86400)
const crossWinter = streak.from && Number(streak.from.slice(5, 7)) >= 10 && Number(streak.to.slice(5, 7)) <= 3
const qingdao = data.places.filter(p => ['青岛','胶州'].includes(shortPlace(p.place)))
const homeRows = qingdao.flatMap(p => p.rows)
const homeShare = data.total.count ? Math.round(homeRows.length / data.total.count * 100) : 0
const flipYear = dawnFlipYear(data.years, 7)
const firstPeak = data.years[0] ? peak(data.years[0].year) : '—'
const lastPeak = data.years.at(-1) ? peak(data.years.at(-1)!.year) : '—'
const paced = data.years.filter(y => y.paceSeconds !== null)
const pacePairs = Math.max(0, paced.length - 1)
let paceImproved = 0
for (let i = 1; i < paced.length; i++) if (paced[i].paceSeconds! < paced[i - 1].paceSeconds!) paceImproved++
const troughWindow = months.filter(m => m.key >= '2023-01' && m.key <= '2024-10')
const lightest = troughWindow.length ? troughWindow.reduce((low, m) => m.km < low.km ? m : low, troughWindow[0]) : undefined
const year2023 = data.years.find(y => y.year === 2023)
const year2024 = data.years.find(y => y.year === 2024)
const goalComplete = months.filter(m => m.key >= '2024-11' && m.state !== 'outside' && !m.partial)
const goalHits = goalComplete.filter(m => goalState(m) === 'reached').length
const marathonMarks = distanceBestHistory(data.runs, 41500, 44000)
const marathonFirst = marathonMarks[0]
const marathonBest = marathonMarks.at(-1)
const marathonSaved = marathonFirst && marathonBest ? marathonFirst.seconds - marathonBest.seconds : 0
const marathonSpan = marathonFirst && marathonBest
  ? Number(marathonBest.activity.start_date_local.slice(0, 4)) - Number(marathonFirst.activity.start_date_local.slice(0, 4)) : 0
// 结尾路线：青岛最近一次清晨出发的日常路线
const morningRun = data.runs.filter(r => r.type === 'Run' && shortPlace(r.location_country ?? '') === '青岛'
  && Number(r.start_date_local.slice(11, 13)) >= 4 && Number(r.start_date_local.slice(11, 13)) < 8
  && r.distance >= 8000 && r.distance <= 21000).at(-1)
// 首跑时刻的中文表述（旧版起点章沿用）
function clockWords(local: string) {
  const h = Number(local.slice(11, 13)), m = Number(local.slice(14, 16))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  const part = h < 5 ? '凌晨' : h < 12 ? '早上' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上'
  const hour = h % 12 || 12
  return `${part} ${hour} 点 ${String(m).padStart(2, '0')} 分`
}
const firstRun = data.runs[0]
const firstYear = data.years[0]
const year2022 = data.years.find(y => y.year === 2022)
const paceDip = year2023 && year2022 && year2023.paceSeconds !== null && year2022.paceSeconds !== null
  && year2023.paceSeconds < year2022.paceSeconds ? year2023 : undefined

function Detail({title, children}: {title: string; children: ReactNode}) {
  return <details className="evidence"><summary>{title}<span aria-hidden="true">＋</span></summary><div className="evidence-body">{children}</div></details>
}
function Memory({id, evidence}: {id: string; evidence?: ReactNode}) {
  const story = stories.find(s => s.id === 'life-' + id)
  if (!story) return null
  return <aside className="memory"><p className="kicker">{story.when} · 贾栾的回忆</p>
    <blockquote>{story.text}</blockquote>{evidence && <p className="memory-data"><span>数据对照</span>{evidence}</p>}</aside>
}

function Bars({title, rows, limit, caption, highlight}: {
  title: string; rows: {label: string; value: number; display?: string}[]; limit?: number; caption?: string; highlight?: string
}) {
  const max = limit ?? Math.max(1,...rows.map(r => r.value))
  return <figure className="paper"><figcaption>{title}</figcaption>
    <div className="bars">{rows.map(({label,value,display}) => <div key={label} className={highlight===label ? "bar-active" : undefined}>
      <span>{label}</span><i aria-hidden="true"><b style={{width: 100 * value / max + '%'}}/></i><strong>{display ?? n(value,1)}</strong>
    </div>)}</div>{caption && <p className="note">{caption}</p>}
  </figure>
}

// 长期主义同轴图（旧版原样移植）：上层配速折线，下层跑量柱，低谷年标注"有了娃"
function PaceFigure() {
  const paces = data.years.filter(y => y.paceSeconds !== null)
  if (paces.length < 2) return null
  const W = 640, top = 34, bottom = 158, left = 20, right = 26
  const yearSpan = Math.max(1, paces.at(-1)!.year - paces[0].year)
  const x = (year: number) => left + (year - paces[0].year) / yearSpan * (W - left - right)
  const secs = paces.map(p => p.paceSeconds!)
  const lo = Math.min(...secs), hi = Math.max(...secs), spread = (hi - lo) || 1
  const y = (s: number) => top + (s - lo) / spread * (bottom - top)
  const maxKm = Math.max(...paces.map(p => p.km), 1)
  const spineTop = 188, spineH = 30
  const first = paces[0], last = paces.at(-1)!
  const dip = paceDip ? paces.find(p => p.year === paceDip.year) : undefined
  return <figure className="paper pace-figure">
    <figcaption>年度配速与跑量——折线为每公里平均用时，越短越高；柱为当年跑量（公里）</figcaption>
    <div className="pace-plot"><svg viewBox={`0 0 ${W} 236`} role="img" aria-label={paces.map(p => `${p.year} 年配速 ${paceLabel(p.paceSeconds)} 每公里，跑量 ${n(p.km)} 公里`).join('；')}>
      <line className="pace-baseline" x1={left} y1={bottom} x2={W - right} y2={bottom} />
      <polyline className="pace-line" pathLength={1} points={paces.map(p => `${x(p.year)},${y(p.paceSeconds!)}`).join(' ')} />
      {paces.map(p => <circle key={p.year} className={p === last ? 'pace-dot pace-dot-last' : 'pace-dot'} cx={x(p.year)} cy={y(p.paceSeconds!)} r={4}>
        <title>{p.year} 年 · {paceLabel(p.paceSeconds)}/公里 · {n(p.km)} 公里{p.partial ? '（截至当前）' : ''}</title>
      </circle>)}
      <text className="pace-tag" x={x(first.year) - 4} y={y(first.paceSeconds!) + 26} textAnchor="start">{paceLabel(first.paceSeconds)}</text>
      <text className="pace-tag pace-tag-last" x={x(last.year) + 4} y={y(last.paceSeconds!) - 14} textAnchor="end">{paceLabel(last.paceSeconds)}</text>
      {paces.map(p => <rect key={p.year} className={p.partial ? 'vol-bar vol-bar-partial' : 'vol-bar'} x={x(p.year) - 6} y={spineTop + spineH * (1 - p.km / maxKm)} width={12} height={Math.max(1.5, spineH * p.km / maxKm)}>
        <title>{p.year} 年跑量 {n(p.km)} 公里{p.partial ? '（截至当前）' : ''}</title>
      </rect>)}
      {paces.map(p => <text key={p.year} className={`vol-tag${p.km === maxKm ? ' vol-tag-peak' : ''}${p.partial ? ' vol-tag-partial' : ''}`} x={x(p.year)} y={spineTop + spineH * (1 - p.km / maxKm) - 4} textAnchor="middle">{Math.round(p.km)}</text>)}
      {paces.map(p => <text key={p.year} className="year-tick" x={x(p.year)} y={spineTop + spineH + 14} textAnchor="middle">{p.year}</text>)}
      {dip && <text className="pace-dip-tag" x={x(dip.year)} y={spineTop - 8} textAnchor="middle">{dip.year} · 有了娃</text>}
    </svg></div>
    <p className="note">配速为当年有效运动时长合计 ÷ 跑步里程合计{data.years.at(-1)?.partial ? `；${data.years.at(-1)!.year} 年为进行中年度，截至 ${data.last}` : ''}。</p>
    <Detail title="读取各年度数值"><table><thead><tr><th>年份</th><th>平均配速 / 公里</th><th>跑量 / 公里</th></tr></thead><tbody>{paces.map(p=><tr key={p.year}><th>{p.year}{p.partial?"（进行中）":""}</th><td>{paceLabel(p.paceSeconds)}</td><td>{n(p.km)}</td></tr>)}</tbody></table></Detail>
  </figure>
}

function Annual() {
  const paces = data.years.filter(y => y.paceSeconds !== null)
  const paceSaved = paces.length > 1 ? paces[0].paceSeconds! - paces.at(-1)!.paceSeconds! : 0
  const title = pacePairs > 0 && paceImproved === pacePairs ? '跑量有起伏，年度平均配速逐年变快。' : '跑量与配速，放在一起看。'
  return <section id="annual" className="wrap annual">
    <div className="section-head"><span className="kicker">02 / {data.first.slice(0,4)}—{data.last.slice(0,4)} · 长期主义</span><h2>{title}</h2></div>
    <div className="annual-composition"><div>
      <p className="metric-line"><b>{paceLabel(paces[0]?.paceSeconds ?? null)}</b><span>→</span><b>{paceLabel(paces.at(-1)?.paceSeconds ?? null)}</b></p>
      <p className="note">每公里少用 {n(paceSaved)} 秒 · {paceImproved}/{pacePairs} 个年度交替变快</p>
      <PaceFigure/>
    </div><div className="annual-memories">
      <Memory id="2020-pandemic-routine" evidence={<>{data.years.find(y=>y.year===2019)?.count} → {data.years.find(y=>y.year===2020)?.count} 次出发 · 2019 / 2020</>}/>
      <Memory id="2023-parenthood" evidence={<>{n(year2023?.km ?? 0)} 公里 · 2023 年；{n(months.find(m=>m.key==='2023-07')?.km ?? 0,1)} 公里 · 7 月</>}/>
    </div></div>
    <p className="note">年度平均随每年跑步距离和跑法而变，不等同于同条件比赛成绩。数据截至 {data.last}。</p>
    <Detail title="展开全周期月度长卷"><figure><figcaption>每个月，都留在这里</figcaption><Months rows={months} limit={monthLimit}/><p className="note">铜色标出 2023 年 6 月至 2024 年 10 月；无记录月份不等于没有运动。</p></figure></Detail>
  </section>
}

function Clock({bins,count,ghost}: {bins:number[];count:number;ghost?:number[]}) {
  return <svg className="clock" viewBox="0 0 320 320" role="img" aria-label={count ? '24 小时出发占比，' + count + ' 条记录' : '暂无出发记录'}>
    <circle cx="160" cy="160" r="61" fill="none" stroke="currentColor" opacity=".2"/>
    <circle cx="160" cy="160" r="119" fill="none" stroke="currentColor" opacity=".15"/>
    {bins.map((value,h) => <g key={h} transform={`rotate(${h*15} 160 160)`}>
      {ghost && ghost[h] > 0 && <path d={`M160 99V${99-58*(ghost[h]/(count||1))/hourScale}`} stroke="currentColor" opacity=".25" strokeWidth="13"/>}
      {value > 0 && <path d={`M160 99V${99-58*(value/(count||1))/hourScale}`} stroke={h<8 ? '#bf784d' : 'currentColor'} strokeWidth="7" strokeLinecap="round"/>}
    </g>)}
    <g fill="currentColor" fontSize="13" textAnchor="middle"><text x="160" y="25">00</text><text x="298" y="165">06</text><text x="160" y="304">12</text><text x="22" y="165">18</text><text x="160" y="156" fontSize="26">{count}</text><text x="160" y="178">条记录</text></g>
  </svg>
}

function TimeDial({year, hero = false}: {year: YearSlice; hero?: boolean}) {
  const peakLabel = peak(year.year)
  return <svg className="time-dial" viewBox="0 0 360 360" role="img" aria-label={`${year.year} 年，最常出发时段 ${peakLabel}，${Math.round(dawnShare(year,7)*100)}% 在七点前出发`}>
    <circle cx="180" cy="180" r="132" className="dial-ring"/>
    <circle cx="180" cy="180" r="91" className="dial-ring inner"/>
    {Array.from({length:48},(_,i)=><line key={i} x1="180" y1="42" x2="180" y2={i%2?'45':'49'} transform={`rotate(${i*7.5} 180 180)`} className="dial-tick"/>)}
    {year.hours.map((v,h)=>v>0 && <line key={h} x1="180" y1="89" x2="180" y2={89-46*(v/year.count)/hourScale} transform={`rotate(${h*15} 180 180)`} className={h<8?'dial-ray dawn-ray':'dial-ray night-ray'} pathLength={1}/>)}
    <g className="dial-hours" textAnchor="middle"><text x="180" y="24">00</text><text x="340" y="185">06</text><text x="180" y="345">12</text><text x="20" y="185">18</text></g>
    <text x="180" y="180" textAnchor="middle" className="dial-time">{peakLabel}</text>
    <text x="180" y="206" textAnchor="middle" className="dial-sub">最常出发的半小时起点</text>
    {hero && <text x="180" y="235" textAnchor="middle" className="dial-sub">{year.year} 年 · {year.count} 次出发</text>}
  </svg>
}
function DawnBeam({simple}: {simple: boolean}) {
  const {ref,played,run,replay}=usePlay<HTMLElement>(simple)
  const years=[data.years[0],data.years.find(y=>y.year===flipYear),data.years.at(-1)].filter((y):y is YearSlice=>!!y)
    .filter((y,i,all)=>all.findIndex(t=>t.year===y.year)===i)
  return <figure className="dawn-scenes" ref={ref}>
    <div className="stage-top"><figcaption>同一只钟，三个阶段</figcaption><button className="replay" onClick={replay} disabled={simple}>重播晨夜变化 ↻</button></div>
    <div key={run} className={'dial-triptych '+(played&&!simple?'play':'')}>
      {years.map((y,i)=><article key={y.year} style={{'--i':i} as CSSProperties} className={i===0?'night':'morning'}>
        <p className="dial-year">{y.year}<span>{i===0?'最早的记录年':y.year===flipYear?'转向清晨':'最近的记录年'}</span></p>
        <TimeDial year={y}/><p className="dial-share"><b>{Math.round(dawnShare(y,7)*100)}<small>%</small></b><span>七点前出发</span></p>
        <p className="note">{n(y.count)} 次记录{y.partial?` · 截至 ${data.last}`:''}</p>
      </article>)}
    </div><p className="note">表盘按小时分布；各年用同一比例尺。中心标注当年最常见的半小时时段。七点前指 00:00–06:59；早期样本较少。</p>
  </figure>
}

// 年际迁移（旧版 DawnMigration 沿用）：一年一枚小表盘，九枚连起来看从夜跑到清晨
function YearDials() {
  const years = data.years.filter(y => y.count > 0)
  if (years.length < 2) return null
  const pct = (y: YearSlice) => Math.round(dawnShare(y, 7) * 100)
  return <figure className="year-dials">
    <figcaption>从夜到黎明 · 每一年的出发时间迁移</figcaption>
    <div className="yd-row">{years.map(year => {
      const modalHour = year.hours.indexOf(Math.max(...year.hours))
      return <div key={year.year} className={year.year === flipYear ? 'yd-flip' : 'yd-year'}>
        <svg viewBox="0 0 92 92" role="img" aria-label={`${year.year} 年 ${pct(year)}% 在七点前出发，最常出发的钟点是 ${modalHour} 点`}>
          <title>{year.year} 年 · {pct(year)}% 七点前出发 · 最常 {peak(year.year)}</title>
          <circle cx="46" cy="46" r="27" className="yd-ring"/>
          {year.hours.map((v, h) => v > 0 && <line key={h} x1="46" y1="19" x2="46" y2={19 - 14 * (v / year.count) / hourScale}
            transform={`rotate(${h * 15} 46 46)`} className={h === modalHour ? 'yd-ray yd-modal' : h < 8 ? 'yd-ray yd-dawn' : 'yd-ray'}/>)}
          <text x="46" y="51" textAnchor="middle" className="yd-pct">{pct(year)}%</text>
        </svg>
        <span className="yd-label">{year.year}{year.partial ? '﹡' : ''}</span>
        <span className="yd-peak">{peak(year.year)} 档</span>
        {year.year === flipYear && <span className="yd-flag">转向清晨</span>}
      </div>
    })}</div>
    <p className="note">每枚表盘是一年的 24 小时出发分布，各年同一比例尺：铜色为清晨钟点，深绿为当年最常出发的钟点，中心是七点前出发占比。{years.length} 枚连起来，是从夜晚挪到清晨的整段迁移。﹡ 最新年度截至 {data.last}。</p>
  </figure>
}

function DawnChart() {
  const [year, setYear] = useState<number>(() => data.years.at(-1)?.year ?? 0)
  const selected = data.years.find(y => y.year === year) ?? data.years.at(-1)
  return <div id="dawn-detail" className="pair">
    <figure className="paper"><figcaption>每一年，几点出发？</figcaption>
      <div className="heat-key">当地时间 <span>00 → 06 → 12 → 18 → 23</span></div>
      <div className="heat">{data.years.map(y => <button type="button" className={y===selected?'heat-row focused':'heat-row'} key={y.year}
        aria-pressed={y===selected} aria-label={`${y.year} 年出发分布`} onClick={() => setYear(y.year)}>
        <span>{y.year}</span>{y.hours.map((v,i) => <i key={i} style={{opacity: .08 + .92 * v / (y.count||1) / hourScale}} title={`${i} 时 · ${v} 条`}/>)}
        <span>{peak(y.year)}</span></button>)}</div>
      <p className="note">每行按当年记录数归一化。点击一行，右侧表盘显示该年；行末为最常见半小时出发时段。</p>
    </figure>
    <figure className="paper"><figcaption>{selected?.year ?? '暂无'} 年 · 出发表盘</figcaption>
      {selected && <Clock bins={selected.hours} count={selected.count}/>}
      <p className="note">表盘跟随左侧选中的年份。</p>
    </figure>
  </div>
}

function Months({rows, limit, target = false, compact = false, stagger = false, show = () => true}: {
  rows: typeof months; limit: number; target?: boolean; compact?: boolean; stagger?: boolean; show?: (key:string) => boolean
}) {
  const [selected,setSelected] = useState<string>()
  const current = rows.find(m => m.key === selected && show(m.key))
  const years = [...new Set(rows.map(m => m.key.slice(0,4)))]
  return <div className={compact ? 'month-chart compact' : 'month-chart'}>
    <div className="scale"><span>{limit} 公里</span>{target && <span style={{bottom: goalKm / limit * 100 + '%'}}>200</span>}<span>0</span></div>
    <div className="month-years">{years.map((year, yi) => <div className="month-year" key={year}>
      <div className="month-plot" style={{'--line': goalKm/limit*100+'%'} as CSSProperties}>
        {target && year >= '2024' && <i className={'target-line ' + (year==='2024' ? 'late' : '')}/>}
        {Array.from({length:12},(_,i) => {
          const key = year + '-' + String(i+1).padStart(2,'0')
          const m = rows.find(row => row.key === key)
          const visible = m && show(key)
          const state = m && (target ? goalState(m) : m.partial ? 'pending' : key >= '2023-06' && key <= '2024-10' ? 'highlight' : '')
          return <div className="month-slot" key={key}>{visible && <button className={'month ' + state} type="button"
            aria-label={`${key} · ${m.count ? n(m.km,1)+' 公里' : '无记录'}${m.partial ? ' · 进行中' : ''}`}
            title={`${key} · ${m.count ? n(m.km,1)+' 公里' : '无记录'}`} aria-pressed={selected === key}
            onClick={() => setSelected(key)}><i style={{height: m.km/limit*100+'%', ...(stagger ? {animationDelay: `${(yi*12+i)*14}ms`} : {})}}/></button>}</div>
        })}
      </div><small>{year}</small>
    </div>)}</div>
    <output>{current ? `${current.key} · ${current.count ? n(current.km,1)+' 公里' : '无记录'}${current.partial ? ' · 进行中' : ''}` : compact ? '柱高表示当月里程' : '选择月份查看里程'}</output>
  </div>
}

const half = raceOn(data,'2026-11-01','临沂',20800,22200)
const wall = [...longDistanceRuns(data.runs), ...(half ? [half] : [])].sort((a,b) => a.start_date_local.localeCompare(b.start_date_local))
const raceRows = dongying(data)
function Track({row}: {row?: Activity}) {
  if (!row) return <p className="note">暂无对应记录</p>
  return <a className="track" href={archive(row.run_id)}>
    <RouteSignature rows={[row]} label={place(row)+'轨迹'}/>
    <span>{dateKey(row.start_date_local)} · {place(row)}</span><strong>{km(row)} km · {formatDuration(parseDuration(row.elapsed_time))}</strong>
  </a>
}

// 目标章：完整对比直接在场——灰色的目标前、深绿的达标、铜色的差距、200 线横贯，进入视口后依次升起。
function GoalFigure({simple}: {simple: boolean}) {
  const { ref, played, run, replay } = usePlay<HTMLElement>(simple)
  return <figure key={run} className="paper goal-figure" ref={ref} data-play={played && !simple ? 'on' : 'off'}>
    <div className="stage-top"><figcaption>每月 200 公里 · 从定下到做到</figcaption><button className="replay" onClick={replay} disabled={simple}>重播目标变化 ↻</button></div>
    <Months rows={goalMonths} limit={goalLimit} target stagger/>
    <div className="facts">{data.years.filter(y=>y.year>=2024).map(y=>{
      const rows=goalMonths.filter(m=>m.key.startsWith(String(y.year))).map(goalState)
      const reached=rows.filter(s=>s==='reached').length, total=rows.filter(s=>s==='reached'||s==='below').length
      return <p key={y.year}><b>{total ? reached+'/'+total : '—'}</b> {y.year} 年完整目标月</p>
    })}</div>
    <p className="note">灰色为目标设立前，深绿达到 200 公里，铜色低于目标，条纹为进行中。仅统计已经结束的月份。</p>
  </figure>
}

// 比赛论据层：全部长距离轨迹平移到同一起点，按日期逐条描出，
// 织成一片；最早一条与最快一条高亮，端点标注。
function RaceOverlay({simple}: {simple: boolean}) {
  const { ref, played, run, replay } = usePlay<HTMLElement>(simple)
  const tracks = wall.flatMap(row => {
    if (!row.summary_polyline) return []
    const pts = decodeTrack(row.summary_polyline, 160)
    if (pts.length < 2) return []
    const [lat0, lon0] = pts[0]
    const cos = Math.cos(lat0 * Math.PI / 180)
    return [{ row, xy: pts.map(p => [(p[1] - lon0) * cos, p[0] - lat0] as [number, number]) }]
  })
  if (!tracks.length) return null
  const size = 400, c = size / 2, R = 148
  const maxR = Math.max(0.0001, ...tracks.flatMap(t => t.xy.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))))
  const scale = R / maxR
  const toSvg = (xy: [number, number][]) => xy.map(([x, y]) => `${(c + x * scale).toFixed(1)},${(c - y * scale).toFixed(1)}`).join(' ')
  const firstIdx = tracks.findIndex(t => marathonFirst && t.row.run_id === marathonFirst.activity.run_id)
  const bestIdx = tracks.findIndex(t => marathonBest && t.row.run_id === marathonBest.activity.run_id)
  const cls = (i: number) => i === bestIdx ? 'overlay-best' : i === firstIdx ? 'overlay-first' : undefined
  const baseOpacity = (i: number) => i === bestIdx ? 0.95 : i === firstIdx ? 0.8 : 0.15
  const endLabel = (i: number, text: string) => {
    const [x, y] = tracks[i].xy.at(-1)!
    const sx = c + x * scale, sy = c - y * scale
    return <g className={cls(i)}>
      <circle cx={sx} cy={sy} r="3.6"/>
      <text x={sx + (sx > c ? 8 : -8)} y={sy + (i === bestIdx ? -12 : 18)} textAnchor={sx > c ? 'start' : 'end'}>{text}</text>
    </g>
  }
  return <figure className="stage" ref={ref}>
    <div className="stage-top"><h3>不同的路，留下不同的签名 · {tracks.length} 条长距离轨迹</h3>
      {!simple && <button type="button" className="replay" onClick={replay}>重播 ↻</button>}</div>
    <div className="stage-body">
      <svg key={run} className={played && !simple ? 'animate' : undefined} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`按日期叠印的 ${tracks.length} 条长距离轨迹，最早与最快高亮`}>
        <circle cx={c} cy={c} r="3" fill="currentColor" opacity=".5"/>
        {tracks.map((t, i) => <polyline key={t.row.run_id} points={toSvg(t.xy)} pathLength={1} fill="none"
          className={'overlay-track' + (i === bestIdx ? ' overlay-best' : i === firstIdx ? ' overlay-first' : '')}
          style={{ '--i': i, '--to': baseOpacity(i) } as CSSProperties}/>)}
        {firstIdx >= 0 && endLabel(firstIdx, '最早')}
        {bestIdx >= 0 && endLabel(bestIdx, '最快')}
      </svg>
      <div className="beam-side">
        <div className="stage-notes">
          {marathonFirst && <span>{dateKey(marathonFirst.activity.start_date_local)} · {place(marathonFirst.activity)} · {formatDuration(marathonFirst.seconds)}</span>}
          <span className="arrow">→</span>
          {marathonBest && <span className="hot">{dateKey(marathonBest.activity.start_date_local)} · {place(marathonBest.activity)} · {formatDuration(marathonBest.seconds)}</span>}
        </div>
        <p className="note">不同地点的轨迹平移到同一绘图起点后等比缩放，按日期顺序自动描出；颜色越深越近。耗时来自设备整次记录。点击下方轨迹墙可进入原始档案。</p>
      </div>
    </div>
  </figure>
}

function RaceEvidence() {
  const split = [2021,2025,2026].flatMap(year => {
    const rows = historicalRuns(data,year)
    if (!rows.length) return []
    return [false,true].map(weekend => {
      const subset = rows.filter(r => (new Date(dateKey(r.start_date_local)).getUTCDay() % 6 === 0) === weekend)
      return {label: year + (weekend ? ' 周末' : ' 平日'), ...runSlice(subset)}
    })
  })
  const historical = historicalRuns(data,2026)
  const bands = [0,5,10,15,20,30,40].map((from,i,all) => ({
    label: all[i+1] ? `${from}–<${all[i+1]} km` : '≥40 km',
    value: historical.filter(r => r.distance/1000 >= from && (!all[i+1] || r.distance/1000 < all[i+1])).length
  }))
  return <>
    <p className="kicker">固定历史对照 · 2021 / 2025 / 2026 各年 1 月 1 日至 11 月 3 日</p>
    <div className="pair">
      <Bars title="平日与周末 · 累计公里" rows={split.map(s=>({...s,value:s.km}))}/>
      <Bars title="平日与周末 · 单次公里中位数" rows={split.map(s=>({...s,value:s.medianKm ?? 0,display:s.medianKm===null?'—':undefined}))}/>
      <Bars title="2026 同期 · 单次距离分布（条）" rows={bands}/>
      <Bars title="2026 同期 · 星期分布（条）" rows={['一','二','三','四','五','六','日'].map((day,i)=>({label:'周'+day,value:historical.filter(r=>new Date(dateKey(r.start_date_local)).getUTCDay()===(i+1)%7).length}))}/>
    </div>
    <figure className="paper"><figcaption>两次东营全马，赛前八周怎么跑？</figcaption>
      <table><thead><tr><th scope="col">赛前与当天</th>{raceRows.map(r=><th scope="col" key={r.date}>{r.date}</th>)}</tr></thead>
      <tbody>{([['记录（条）','count'],['里程（公里）','km'],['≥20 km（条）','long'],['设备经过时间','elapsed']] as const).map(([label,key]) => <tr key={key}><th scope="row">{label}</th>{raceRows.map(r=><td key={r.date}>{key==='elapsed'?formatDuration(r[key]):n(r[key],1)}</td>)}</tr>)}</tbody></table>
      <p className="note">从比赛日前 56 天起算，不含比赛当天。设备经过时间可能与官方净成绩不同。</p>
    </figure>
  </>
}
function RaceMarks() {
  return <div className="pair record-pair">{([[41500,44000,'全马'],[20800,23500,'半马']] as const).map(([min,max,label]) => {
    const marks=distanceBestHistory(data.runs,min,max), first=marks[0], last=marks.at(-1)
    if (!first || !last) return null
    const lo=Math.min(...marks.map(m=>m.seconds)), hi=Math.max(...marks.map(m=>m.seconds))
    const start=Date.parse(dateKey(first.activity.start_date_local)), span=Math.max(1,Date.parse(dateKey(last.activity.start_date_local))-start)
    const point=(m:typeof first)=>[18+(Date.parse(dateKey(m.activity.start_date_local))-start)/span*404,112-(hi-m.seconds)/Math.max(1,hi-lo)*90]
    return <figure className="record-card" key={label}><figcaption>{label}距离 · 最快记录</figcaption>
      <strong className="record-time">{formatDuration(last.seconds)}</strong><p className="note">{dateKey(last.activity.start_date_local)} · {place(last.activity)}</p>
      <svg viewBox="0 0 440 138" role="img" aria-label={`${label}从${formatDuration(first.seconds)}到${formatDuration(last.seconds)}，刷新${marks.length-1}次`}>
        <line x1="18" y1="118" x2="422" y2="118" className="pace-baseline"/>
        <polyline points={marks.map(m=>point(m).join(',')).join(' ')} className="pace-line"/>
        {marks.map(m=><circle key={m.activity.run_id} cx={point(m)[0]} cy={point(m)[1]} r="4" className="pace-dot"><title>{dateKey(m.activity.start_date_local)} · {formatDuration(m.seconds)}</title></circle>)}
      </svg><p>从 {formatDuration(first.seconds)} 出发，此后刷新 <b>{marks.length-1}</b> 次。</p>
      <Detail title={`查看${label}逐次最快记录`}><ol className="marks">{marks.map(m=><li key={m.activity.run_id}><a href={archive(m.activity.run_id)}>{dateKey(m.activity.start_date_local)} · {place(m.activity)}</a><b>{formatDuration(m.seconds)}</b></li>)}</ol></Detail>
    </figure>
  })}</div>
}

function CityGallery({cities}: {cities: {name: string; count: number; rows: Activity[]}[]}) {
  const [name, setName] = useState(cities[0]?.name ?? '')
  const selected = cities.find(city => city.name === name) ?? cities[0]
  return <div className="city-stage">
    <div className="city-route" key={selected?.name}>
      {selected && <RouteSignature rows={selected.rows.length === 1 ? selected.rows : selected.rows.slice(0,120)} label={selected.name+'路线样本'}/>}
    </div>
    <div className="city-readout"><b>{selected?.name ?? '暂无地点'}</b>{selected && <small>{n(selected.count)} 条跑步记录 · 路线样本</small>}</div>
    <div className="city-tags" role="group" aria-label="选择要查看的地点">{cities.map(city =>
      <button type="button" key={city.name} className={city===selected?'lit':undefined}
        aria-pressed={city===selected} onClick={()=>setName(city.name)}>{city.name}</button>)}</div>
  </div>
}
const cityList = ['青岛','北京','天津','济宁','济南','洛阳','潍坊','东营','临沂'].flatMap(name => {
  const entry = data.places.find(p => shortPlace(p.place) === name)
  return entry ? [{name, count: entry.count, rows: entry.rows}] : []
})

function Origin() {
  const aba=activities.filter(r=>/阿坝/.test(r.location_country??''))
  const hiking=activities.filter(r=>r.type==='Hiking')
  const hikeYears=[...new Set(hiking.map(r=>r.start_date_local.slice(0,4)))]
  const beijing=data.places.find(p=>shortPlace(p.place)==='北京')
  if (!firstRun) return null
  return <section id="origin" className="origin wrap">
    <p className="kicker">01 / {dateKey(firstRun.start_date_local)} · 现存最早的跑步记录</p>
    <div className="origin-scene"><div className="origin-distance"><b>{n(firstRun.distance/1000,2)}</b><span>公里</span><p>{place(firstRun)} · {firstRun.start_date_local.slice(11,16)}</p></div>
      <div className="origin-story"><h2>没有人能从这 {n(firstRun.distance/1000,2)} 公里里，<br/>看出后面的 <em>{n(data.total.km)}</em> 公里。</h2>
        <p>{dateKey(firstRun.start_date_local)}，{clockWords(firstRun.start_date_local)}。那一年，{n(firstYear?.count??0)} 次出发，{n(firstYear?.km??0,1)} 公里。</p>
        <Memory id="2018-beijing-origin" evidence={<>{beijing?.count??0} 次 · {n(beijing?.km??0,1)} 公里留在北京；青岛至今 {n(homeRows.length)} 次。</>}/>
      </div></div>
    <Detail title="跑步之前，已经在路上 · 徒步与早期片段"><div className="pair"><div>
      <Memory id="hiking-aba" evidence={<>{hiking.length} 条 Hiking 记录，分布在 {hikeYears.join('、')} 年；阿坝 {aba.length} 条全运动记录。</>}/>
      <p className="note">阿坝有一条 Run 标签与回忆有出入，保留原记录待核实。条数不是出行次数。</p>
      <Memory id="tianjin-campus"/>
    </div><figure><RouteSignature rows={aba.filter(r=>r.type==='Hiking'||r.type==='Walk')} label="阿坝步行与徒步路线样本"/><figcaption>阿坝 · 徒步行程的轨迹</figcaption></figure></div></Detail>
  </section>
}
function Places() {
  return <section id="family" className="chapter wrap places-chapter">
    <div className="section-head"><span className="kicker">04 / 生活发生的地方</span><h2>一座主场，一个老家，<br/>几段出差的日常。</h2><p>全周期 {homeShare}% 的跑步记录留在青岛。不同地方，留下不同的生活片段。</p></div>
    <div className="place-roles">{[['青岛','主场','qingdao-home'],['济宁','老家','jining-hometown'],['洛阳','出差','luoyang-work']].map(([name,role,id])=>{
      const entry=cityList.find(c=>c.name===name)
      return <article key={name}><p className="kicker">{role}</p><h3>{name==='济宁'?'济宁金乡':name}</h3>
        {entry&&<RouteSignature rows={entry.rows} label={name+'路线样本'}/>}
        <Memory id={id} evidence={entry?<>{n(entry.count)} 次跑步 · {n(runSlice(entry.rows).km,1)} 公里</>:undefined}/>
      </article>
    })}</div>
    <Memory id="2021-family-rhythm"/>
    <Detail title="沿着地点继续看 · 城市轨迹与生活片段"><CityGallery cities={cityList}/>
      <div className="pair"><Memory id="jinan-project"/><Memory id="tianjin-campus"/><Memory id="weifang-races"/>
      <Bars title="全周期跑步地点分布（条）" rows={data.places.map(p=>({label:shortPlace(p.place),value:p.count}))}/></div>
      <p className="note">地点按记录标签统计，不代表居住时长或出行次数。青岛占比为全周期统计，不据此推断婚后的变化。</p>
    </Detail>
  </section>
}
function Child() {
  return <section id="child" className="child-scene"><div className="wrap">
    <p className="kicker">05 / 2023 年 6 月 · 孩子出生</p>
    <div className="child-composition"><div><h2>留给跑步的时间，<br/>少了一些。</h2><Memory id="2023-parenthood"/></div>
      <div className="child-number"><span>{lightest?monthLabel(lightest.key):'调整期'} · 跑步记录</span><b>{n(lightest?.km??0,1)}<small>公里</small></b><p>2023 年至 2024 年 10 月，跑量最少的一个月。</p></div></div>
    <Detail title="放近看 · 育儿前后的月度记录"><Months rows={troughWindow} limit={monthLimit}/>
      <div className="facts"><p><b>{n(year2023?.km??0)}</b>2023 年全年公里</p><p><b>{n(year2024?.km??0)}</b>2024 年全年公里</p></div></Detail>
    <Memory id="recent-recovery"/>
  </div></section>
}
function Goal({simple}: {simple:boolean}) {
  const groups=[...new Set(goalComplete.map(m=>m.key.slice(0,4)))].map(year=>{
    const rows=goalComplete.filter(m=>m.key.startsWith(year));return {year,rows,hits:rows.filter(m=>goalState(m)==='reached').length}
  })
  const recent=groups.slice(-2)
  return <section id="goal" className="chapter wrap goal-chapter"><div className="section-head"><p className="kicker">06 / 2024 年 11 月起 · 每月 200 公里</p><h2>从定下一个目标，<br/>到越来越稳定地做到。</h2></div>
    <div className="goal-comparison">{recent.map(g=><article key={g.year}><span className="kicker">{g.year} 年 · 完整目标月</span><p className="goal-score"><b>{g.hits}</b><span>/ {g.rows.length}<small>个月达到 200 公里</small></span></p>
      <div className="month-tokens">{g.rows.map(m=><span key={m.key} className={goalState(m)==='reached'?'met':''} title={`${m.key} · ${n(m.km,1)} 公里`}>{Number(m.key.slice(5))}<small>月</small></span>)}</div>
      <p className="note">截至 {monthLabel(g.rows.at(-1)?.key??'')} · 已结束月份</p></article>)}</div>
    <div className="goal-spark" aria-label="目标设立以来逐月达标情况">{goalComplete.map(m=><span key={m.key} className={goalState(m)==='reached'?'met':''} title={`${m.key} · ${n(m.km,1)} 公里`}>{Number(m.key.slice(5))}</span>)}</div>
    <p className="note">2024 年 11 月以来的完整月份，深绿为达到 200 公里；逐月跑量可展开查看。</p>
    <Memory id="2026-goal-200" evidence={<>自 2024 年 11 月设立目标，{goalHits}/{goalComplete.length} 个完整月份达到 200 公里。进行中月份不计入。</>}/>
    <Detail title="展开每月跑量与 200 公里目标线"><GoalFigure simple={simple}/></Detail>
  </section>
}
function Everyday() {
  const {rows,growth,share}=weekendComparison(data)
  const [before,after]=rows
  const max=Math.max(1,...rows.flatMap(r=>[r.weekday.medianKm??0,r.weekend.medianKm??0]))
  return <section id="everyday" className="chapter wrap everyday"><div className="section-head"><p className="kicker">07 / 同期对照 · 2025 → 2026</p><h2>出发次数几乎一样，<br/>日常跑变长了。</h2>
    <p>{before.all.count} 次与 {after.all.count} 次出发。{growth>0&&<>多出的 <strong>{n(growth)} 公里</strong>{share!==null&&<>里，<strong>{n(share*100)}% 来自周末</strong></>}。</>}</p></div>
    <div className="everyday-chart"><div className="everyday-legend"><span>2025</span><span>2026</span><small>单次距离中位数 · 公里</small></div>
      {(['weekday','weekend'] as const).map(key=><div className="distance-compare" key={key}><h3>{key==='weekday'?'工作日':'周末'}</h3><div>{rows.map(r=><div className={'distance-row year-'+r.year} key={r.year}><span>{r.year}</span><i style={{width:(r[key].medianKm??0)/max*100+'%'}}/><b>{r[key].medianKm===null?'—':n(r[key].medianKm!,1)}<small> km</small></b></div>)}</div></div>)}
    </div><p className="note">固定历史窗口：各年 1 月 1 日至 11 月 3 日。含室内跑；周末按当地日期的周六、周日计算。这里呈现变化，不据此断言训练与成绩的因果。</p>
    <Detail title="查看距离、星期分布与两次东营赛前八周"><RaceEvidence/></Detail>
  </section>
}
function Race({simple}: {simple:boolean}) {
  return <section id="race" className="race-scene"><div className="wrap"><div className="section-head"><p className="kicker">08 / 长距离 · 从最早到最快</p><h2>{marathonSpan} 年，同一个全马距离，<br/>少用 {hoursText(marathonSaved)}。</h2></div>
    <div className="race-comparison"><article><span className="kicker">最早的全马距离记录</span><b>{marathonFirst?formatDuration(marathonFirst.seconds):'—'}</b><p>{marathonFirst&&<>{dateKey(marathonFirst.activity.start_date_local)} · {place(marathonFirst.activity)}</>}</p></article><span className="race-arrow" aria-hidden="true">→</span><article><span className="kicker">最快的全马距离记录</span><b>{marathonBest?formatDuration(marathonBest.seconds):'—'}</b><p>{marathonBest&&<>{dateKey(marathonBest.activity.start_date_local)} · {place(marathonBest.activity)}</>}</p></article></div>
    <RaceMarks/><Memory id="2018-qingdao-half" evidence={<>青岛 · 22.7 公里（GPS 略超标准半马距离） · 设备整次 2:33:55</>}/><Memory id="2026-autumn-races" evidence={half?<>临沂 · {dateKey(half.start_date_local)} · {formatDuration(parseDuration(half.elapsed_time))}。设备记录，与官方净成绩可能有差异。</>:undefined}/>
    <p className="note">全马筛选 41.5–44 公里，半马 20.8–23.5 公里（含 GPS 略超标准距离的比赛记录，也含日常长距离跑）；曲线按日期排列逐次最快值，越快越高。耗时取设备整次经过时间，不作为官方比赛成绩榜。</p>
    <Detail title={`走过的路，留下的签名 · ${wall.length} 条轨迹`}><RaceOverlay simple={simple}/><figure id="race-wall"><figcaption>长距离轨迹墙</figcaption><p className="note">含超过 40 公里的跑步与临沂半马；点按进入对应原始记录。</p><div className="track-wall">{wall.map(row=><Track key={row.run_id} row={row}/>)}</div></figure></Detail>
  </div></section>
}
function App() {
  const [simple,setSimple] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference=matchMedia('(prefers-reduced-motion: reduce)')
    const change=(event:MediaQueryListEvent)=>setSimple(event.matches)
    preference.addEventListener('change',change)
    return ()=>preference.removeEventListener('change',change)
  },[])
  const lastYear=data.years.at(-1)
  return <>
    <nav className="top wrap" aria-label="页面"><a className="brand" href="#top">贾栾的路书</a><div className="chapter-nav"><a href="#origin">起点</a><a href="#dawn">黎明</a><a href="#family">足迹</a><a href="#race">突破</a></div><button type="button" aria-pressed={simple} onClick={()=>setSimple(!simple)}>{simple?'播放动效':'暂停动效'}</button></nav>
    <main id="main" data-simple={simple}>
      <header className="hero"><div className="wrap hero-inner"><div className="hero-copy"><p className="kicker">{data.first.slice(0,4)}—{data.last.slice(0,4)} / 一个人的运动与生活</p><h1><span>黎明</span>的人</h1>
        <p className="hero-lead">{editorial.opening}</p>
        <a className="start" href="#origin">从最早的一条记录开始 <span>↓</span></a>
      </div><div className="hero-clock">{lastYear&&<TimeDial year={lastYear} hero/>}<p><b>{lastYear?Math.round(dawnShare(lastYear,7)*100):0}%</b> 七点前出发 <span>· 最常 {lastPeak} 出发 · {lastYear?.year} 年截至 {data.last}</span></p></div></div>
      <div className="wrap hero-stats"><div><b>{n(data.total.km)}</b><small>累计跑步公里 · 约地球赤道的 {n(equatorShare,1)}%</small></div><div><b>{n(data.total.count)}</b><small>次跑步出发 · {n(data.total.seconds/3600)} 小时</small></div><div><b className="span-wide">{firstPeak} → {lastPeak}</b><small>最常见出发时段 · {data.first.slice(0,4)}→{data.last.slice(0,4)}</small></div><div><b>{streak.longest} 天</b><small>最长连续{crossWinter?'，跨过整个冬天':''}</small></div></div><p className="wrap hero-meta">户外跑与室内跑 · 全周期七点前出发 {dawnPct}% · 数据截至 {data.last} · 运动时长约 {wholeDays} 个整天</p></header>
      {error&&<p role="alert" className="wrap">{error}</p>}
      <Origin/><Annual/>
      <section id="dawn" className="dawn-chapter"><div className="wrap"><div className="section-head"><p className="kicker">03 / {flipYear??'2020'} 年 · 从夜晚到清晨</p><h2>把出发，挪到清晨。</h2><p>{flipYear} 年，七点前出发首次超过一半。</p></div><DawnBeam simple={simple}/>
        <YearDials/>
        <Memory id="2020-pandemic-routine"/><Memory id="dawn-alarm" evidence={<>闹钟来自本人回忆；图表记录实际出发时间，两者不完全相同。</>}/>
        <Detail title="展开每一年的出发时间"><DawnChart/></Detail>
      </div></section>
      <Places/><Child/><Goal simple={simple}/><Everyday/><Race simple={simple}/>
      <section id="portrait" className="ending"><div className="wrap"><p className="kicker">09 / 回到日常</p><h2>明天，还会有新的记录。</h2>
        <div className="closing-composition"><div><p className="closing">{editorial.ending}</p><div className="closing-facts"><p><b>{lastYear?peak(lastYear.year):'—'}</b>最近记录年最常见出发时段</p><p><b>{homeShare}%</b>全周期跑步留在青岛主场</p></div></div>
        <figure>{morningRun&&<RouteSignature rows={[morningRun]} label="最近的青岛清晨日常路线"/>}<figcaption>{morningRun?`${dateKey(morningRun.start_date_local)} · 青岛 · ${morningRun.start_date_local.slice(11,16)} 出发`:'青岛日常'}</figcaption></figure></div>
        <footer><span>跑步含室内跑 · 数据截至 {data.last}</span><a href="./old.html">对照旧版 ↗</a><a href={archive()}>原始运动档案 ↗</a><a href="#top">回到顶部 ↑</a></footer>
      </div></section>
    </main></>
}
createRoot(document.getElementById('root')!).render(<App/>)
