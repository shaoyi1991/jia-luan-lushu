import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { loadActivities } from './lib/activities'
import { buildNarrative, shortPlace, isRun } from './lib/narrative'
import { formatDuration, formatKm } from './lib/format'
import { summarize } from './lib/stats'
import { ActivityLog } from './components/ActivityLog'
import { Narrative } from './components/Narrative'
import stories from 'virtual:stories'
const RouteMap = lazy(() => import('./components/RouteMap').then(m=>({default:m.RouteMap})))
const loaded=loadActivities()
const portrait=buildNarrative(loaded.activities)
const query=new URLSearchParams(window.location.search)
const initialId=query.get('id')

export default function App() {
  const archive=query.get('view')==='journal'
  if(archive)return <Archive/>
  if(!portrait.runs.length)return <div className="empty-page"><a className="wordmark" href="?">路书<span>JIA LUAN</span></a><main id="main"><p className="eyebrow">贾栾的运动记录</p><h1>等待下一次出发。</h1><p>{loaded.error||'目前还没有可展示的跑步记录。导入数据后，这里会呈现时间、路线与生活的变化。'}</p><a href="?view=journal" className="solid-link">查看运动档案 ↗</a></main></div>
  return <>{loaded.error&&<div role="alert" className="banner">{loaded.error}</div>}<Narrative data={portrait} stories={stories} activities={loaded.activities}/></>
}
function Archive() {
  const [sport,setSport]=useState(query.get('sport')==='all' || (initialId && loaded.activities.some(a=>a.run_id===initialId && !isRun(a))) ? 'all' : 'run')
  const [year,setYear]=useState(query.get('year')||'all')
  const [month,setMonth]=useState(query.get('month')||'all')
  const [place,setPlace]=useState(query.get('place')||'all')
  const [selectedId,setSelectedId]=useState<string|null>(initialId)
  const years=[...new Set(loaded.activities.map(a=>a.start_date_local.slice(0,4)))].sort().reverse()
  const places=[...new Set(loaded.activities.map(a=>a.location_country).filter((p):p is string=>Boolean(p)))].sort()
  const months=[...new Set(loaded.activities.map(a=>a.start_date_local.slice(0,7)))].filter(m=>year==='all'||m.startsWith(year)).sort().reverse()
  const visible=useMemo(()=>loaded.activities.filter(a=>(sport==='all'||isRun(a))&&(year==='all'||a.start_date_local.startsWith(year))&&(month==='all'||a.start_date_local.startsWith(month))&&(place==='all'||a.location_country===place)),[sport,year,month,place])
  const summary=useMemo(()=>summarize(visible),[visible])
  const onSelect=useCallback((id:string)=>setSelectedId(current=>current===id?null:id),[])
  useEffect(()=>{
    const url=new URL(window.location.href)
    const state:Record<string,string|null>={year,month,place,sport,id:selectedId}
    for(const [key,value] of Object.entries(state)) {
      if(value && value!=='all' && !(key==='sport'&&value==='run'))url.searchParams.set(key,value)
      else url.searchParams.delete(key)
    }
    if(sport==='all')url.searchParams.set('sport','all')
    window.history.replaceState({},'',url)
  },[year,month,place,sport,selectedId])
  const changed=()=>setSelectedId(null)
  return <div className="archive-page">
    <header className="archive-nav"><a className="wordmark" href="?">路书<span>JIA LUAN</span></a><a href="?">← 回到故事</a></header>
    <main id="main"><div className="archive-heading"><p className="eyebrow">THE ARCHIVE / 原始记录</p><h1>每一次出发，都在这里。</h1><p>从一个年份、一座城市，找到具体的那一天。</p></div>
      {loaded.error&&<p className="banner" role="alert">{loaded.error}</p>}
      <div className="archive-filters">
        <label>运动<select value={sport} onChange={e=>{setSport(e.target.value);changed()}}><option value="run">跑步（含室内）</option><option value="all">全部运动</option></select></label>
        <label>年份<select value={year} onChange={e=>{setYear(e.target.value);setMonth('all');changed()}}><option value="all">全部年份</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
        <label>月份<select value={month} onChange={e=>{setMonth(e.target.value);changed()}}><option value="all">全部月份</option>{months.map(m=><option key={m}>{m}</option>)}</select></label>
        <label>地点<select value={place} onChange={e=>{setPlace(e.target.value);changed()}}><option value="all">全部地点</option>{places.map(p=><option value={p} key={p}>{shortPlace(p)}</option>)}</select></label>
        <button type="button" className="text-button" onClick={()=>{setSport('run');setYear('all');setMonth('all');setPlace('all');changed()}}>重置筛选</button>
      </div>
      <div className="archive-summary" aria-live="polite"><span><strong>{visible.length}</strong> 条记录</span><span><strong>{formatKm(summary.distance,1)}</strong> 公里</span><span><strong>{Object.keys(summary.dayDistance).length}</strong> 个运动日</span><span>运动时长 {formatDuration(summary.movingSeconds)}</span></div>
      <section id="map" aria-label="轨迹与单次详情"><Suspense fallback={<p className="map-loading">正在载入地图与轨迹…</p>}><RouteMap activities={visible} selectedId={selectedId} onSelect={onSelect} emptyArchive={!loaded.activities.length}/></Suspense></section>
      <section id="log"><ActivityLog key={[sport,year,month,place].join('/')} activities={visible} selectedId={selectedId} onSelect={onSelect} emptyArchive={!loaded.activities.length}/></section>
      <p className="archive-footnote">地点沿用记录标签。时间为记录中的本地时间；“运动时长”与从开始到结束的“总耗时”分别展示。当前保留原始导出，未进行跨设备去重。</p>
    </main>
    <footer className="site-footer"><a href="?">← 回到路书</a><p>当前导出截至 {loaded.activities.map(a=>a.start_date_local.slice(0,10)).sort().at(-1)||'暂无记录'}</p></footer>
  </div>
}
