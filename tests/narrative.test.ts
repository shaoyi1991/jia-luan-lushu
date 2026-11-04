import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildNarrative, median, paceLabel, runSlice, archiveLink, distanceBestHistory, comparableRunningYears, longDistanceRuns, dawnShare, dawnFlipYear, peakHalfHour } from '../src/lib/narrative.ts'
import { parseStories } from '../src/lib/story.ts'
import { formatPace } from '../src/lib/format.ts'
import type { Activity } from '../src/types.ts'
const run=(id:string,date:string,extra:Partial<Activity>={}):Activity=>({run_id:id,start_date_local:date+' 06:00:00',type:'Run',name:'test',distance:5000,moving_time:'0:30:00',...extra})

test('empty export has no fabricated years, months or medians',()=>{
 const d=buildNarrative([])
 assert.deepEqual(d.years,[]);assert.deepEqual(d.months,[]);assert.equal(d.total.medianKm,null);assert.equal(d.tailMonths,0)
})
test('month ribbon distinguishes gaps and range boundaries; leap day closes February',()=>{
 const d=buildNarrative([run('1','2023-12-31'),run('2','2024-02-29'),run('3','2024-02-29',{type:'VirtualRun'})])
 assert.equal(d.months.find(m=>m.key==='2023-11')?.state,'outside')
 assert.equal(d.months.find(m=>m.key==='2024-01')?.state,'no-record')
 assert.equal(d.months.find(m=>m.key==='2024-02')?.partial,false)
 assert.equal(d.months.find(m=>m.key==='2024-03')?.state,'outside')
 assert.equal(d.total.days,2);assert.equal(d.total.count,3);assert.equal(d.tailMonths,1)
})
test('new year extends statistics, preserves prior figures and does not invent future activity',()=>{
 const before=[run('1','2025-12-31'),run('2','2026-01-02')]
 const d=buildNarrative([...before,run('3','2027-01-03',{distance:10000})])
 assert.deepEqual(d.years.map(y=>y.year),[2025,2026,2027])
 assert.equal(d.years[0].km,5);assert.equal(d.years[2].partial,true)
 assert.equal(d.months.find(m=>m.key==='2027-01')?.partial,true)
 assert.equal(d.months.find(m=>m.key==='2027-02')?.state,'outside')
 assert.equal(d.last,'2027-01-03');assert.equal(d.tailFrom,'2027-01')
})
test('narrative uses runs only, does not deduplicate same-day records and has no track requirement',()=>{
 const d=buildNarrative([run('1','2026-01-01'),run('2','2026-01-01'),run('3','2026-01-02',{type:'Walk'}),run('4','2026-01-03',{distance:0})])
 assert.equal(d.total.count,2);assert.equal(d.total.km,10);assert.equal(d.last,'2026-01-01');assert.equal(d.total.days,1)
})
test('pace uses valid elapsed exercise time and rounds minutes correctly',()=>{
 const s=runSlice([run('1','2026-01-01'),run('2','2026-01-02',{moving_time:''})])
 assert.equal(s.km,10);assert.equal(s.paceSeconds,360);assert.equal(s.missingTime,1)
 assert.equal(paceLabel(359.8),'6′00″');assert.equal(formatPace(1000/359.8),`6'00"`)
 assert.equal(median([5,10]),7.5);assert.equal(median([]),null)
})
test('dawn share and flip year follow before-8 departures across year boundaries',()=>{
 const nights=[run('a','2024-01-05 21:00:00'),run('b','2024-03-05 22:00:00'),run('c','2024-05-05 19:30:00')]
 const dawns=[...Array(5)].map((_,i)=>run('d'+i,'2025-03-0'+(i+1)+' 06:00:00'))
 const before=buildNarrative(nights).years, after=buildNarrative(dawns).years
 assert.equal(Math.round(dawnShare(before[0])*100),0)
 assert.equal(Math.round(dawnShare(after[0])*100),100)
 assert.equal(dawnFlipYear([...before,...after]),2025)
 assert.equal(dawnFlipYear(before),null) // 从未过半：无转折
 assert.equal(dawnFlipYear(buildNarrative([]).years),null) // 空数据不编造
 const firstYearMorning=[run('e','2026-02-05 06:00:00')]
 assert.equal(dawnFlipYear(buildNarrative(firstYearMorning).years),null) // 首年即过半不算迁移
})
test('dawn share supports the before-7 edition cutoff alongside the default before-8',()=>{
 const nights=[run('a','2024-01-05 21:00:00'),run('b','2024-03-05 22:00:00')]
 const sixAM=[run('c1','2025-03-01 06:10:00'),run('c2','2025-03-02 06:20:00')]
 const years=[...buildNarrative(nights).years,...buildNarrative(sixAM).years]
 assert.equal(Math.round(dawnShare(years[0],7)*100),0)   // 夜跑年不计入七点前
 assert.equal(Math.round(dawnShare(years[1],7)*100),100) // 六点档计入七点前（新版「黎明」口径）
 assert.equal(Math.round(dawnShare(years[1],6)*100),0)   // 六点前口径不含六点档
 assert.equal(dawnFlipYear(years,7),2025)
 assert.equal(dawnFlipYear(years,6),null)                // 六点前从未过半：无转折
 // 七点档（07:10 出发）默认口径计入、新版口径不计入
 const sevenAM=[run('d1','2026-03-01 07:10:00')]
 const y7=buildNarrative(sevenAM).years[0]
 assert.equal(Math.round(dawnShare(y7)*100),100)
 assert.equal(Math.round(dawnShare(y7,7)*100),0)
})
test('story export publishes only explicit fields, ignores templates and retains anchored dates',()=>{
 const md=readFileSync(new URL('../docs/STORY.md',import.meta.url),'utf8')
 const stories=parseStories(md)
 assert.ok(stories.some(s=>s.id==='life-luoyang-work'))
 assert.ok(stories.find(s=>s.id==='life-recent-recovery')?.when.includes('2026'))
 assert.ok(stories.find(s=>s.id==='life-2023-parenthood')?.text.includes('孩子出生'))
 assert.ok(!JSON.stringify(stories).includes('姑'+'娘'))
 assert.ok(!JSON.stringify(stories).includes('2023-06-'+'24'))
 assert.ok(!JSON.stringify(stories).includes('不能改写成'))
 assert.deepEqual(parseStories('## life-private · Private\n- 可用表述：不公开\n'),[])
 assert.throws(()=>parseStories('## life-broken · Missing\n- 页面展示：是\n- 可用表述：test\n'))
})
test('archive URLs preserve oversized IDs and Chinese places',()=>{
 const q=new URLSearchParams(archiveLink({id:'9223370284062707907',place:'山东省青岛市'}).slice(1))
 assert.equal(q.get('id'),'9223370284062707907');assert.equal(q.get('place'),'山东省青岛市')
})

test('distance bests use elapsed time and exclude indoor, missing-time and over-distance records', () => {
  const rows = [
    run('best', '2026-01-01', { distance: 21300, elapsed_time: '1:24:50' }),
    run('first', '2020-01-01', { distance: 21100, elapsed_time: '1:30:00' }),
    run('paused', '2022-01-01', { distance: 21000, elapsed_time: '1:35:00', moving_time: '1:20:00' }),
    run('missing', '2023-01-01', { distance: 21100 }),
    run('indoor', '2024-01-01', { distance: 21100, elapsed_time: '1:10:00', type: 'VirtualRun' }),
    run('longer', '2025-01-01', { distance: 23000, elapsed_time: '1:10:00' }),
  ]
  assert.deepEqual(distanceBestHistory(rows, 20800, 22200).map(mark => mark.activity.run_id), ['first', 'best'])
})

test('same-calendar comparison excludes later days and follows a new export year', () => {
  const rows = [
    run('leap', '2024-02-29', { distance: 9000 }),
    run('late', '2024-03-01', { distance: 12000 }),
    run('latest', '2025-02-28', { distance: 6000 }),
  ]
  assert.deepEqual(comparableRunningYears(buildNarrative(rows)).map(period => [period.year, period.count]), [[2024, 0], [2025, 1]])
  const extended = buildNarrative([...rows, run('new', '2026-03-01', { distance: 7000 })])
  assert.deepEqual(comparableRunningYears(extended).map(period => [period.year, period.medianKm]), [[2025, 6], [2026, 7]])
})

test('long-distance outdoor records are counted even when GPS is missing', () => {
  const rows = [
    run('no-track', '2025-01-01', { distance: 42000, summary_polyline: null }),
    run('threshold', '2025-01-02', { distance: 40000 }),
    run('indoor', '2025-01-03', { distance: 42000, type: 'VirtualRun' }),
  ]
  assert.deepEqual(longDistanceRuns(rows).map(activity => activity.run_id), ['no-track'])
})

test('half-hour peak uses local time and puts minute 30 in the next bin', () => {
  assert.equal(peakHalfHour([]), null)
  const date = '2026-11-03'
  const records = ['05:29:59', '05:30:00', '05:59:59', '06:00:00'].map((time, i) =>
    run(String(i), date, { start_date_local: `${date} ${time}` }))
  assert.equal(peakHalfHour(records), '05:30')
})
