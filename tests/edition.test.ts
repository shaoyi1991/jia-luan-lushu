import test from 'node:test'
import assert from 'node:assert/strict'
import { goalState, historicalRuns, weekendComparison } from '../src/edition/data.ts'
import { buildNarrative, runSlice } from '../src/lib/narrative.ts'
import { parseStories, parseEditionStories, parseEditionEditorial } from '../src/lib/story.ts'
import type { Activity } from '../src/types.ts'

test('goal counts only complete months from November 2024; exactly 200 qualifies', () => {
  const base = { ...runSlice([]), key: '2024-11', state: 'recorded' as const, partial: false }
  assert.equal(goalState({...base, km:200}), 'reached')
  assert.equal(goalState({...base, km:199.999}), 'below')
  assert.equal(goalState({...base, km:200, partial:true}), 'pending')
  assert.equal(goalState({...base, key:'2024-10', km:201}), 'outside')
  assert.equal(goalState({...base, state:'outside'}), 'outside')
})

test('historical comparison stays fixed as more records arrive', () => {
  const rows = ['2025-11-03','2025-11-04','2026-11-03','2027-01-01'].map(start => ({
    type:'Run', distance:5000, start_date_local:start+' 05:30:00'
  } as Activity))
  assert.deepEqual(historicalRuns(buildNarrative(rows),2025), rows.slice(0,1))
  assert.deepEqual(historicalRuns(buildNarrative([]),2025), [])
})

test('weekend contribution keeps local calendar, multiple records and a fixed cutoff', () => {
  const row = (start: string, distance: number, id: string) => ({type:'Run', distance, run_id:id, start_date_local:start, moving_time:'00:30:00'} as Activity)
  const data = buildNarrative([
    row('2025-01-04 23:50:00',5000,'9223370479911015337'),
    row('2025-01-06 05:30:00',5000,'9223370479911015338'),
    row('2026-01-03 05:30:00',8000,'9223370479911015339'),
    row('2026-01-03 23:50:00',7000,'9223370479911015340'),
    row('2026-01-05 05:30:00',10000,'9223370479911015341'),
    row('2026-11-04 05:30:00',50000,'9223370479911015342'),
  ])
  const result = weekendComparison(data)
  assert.equal(result.rows[1].all.count,3)
  assert.equal(result.growth,15)
  assert.equal(result.share,2/3)
  assert.equal(weekendComparison(buildNarrative([])).share,null)
  assert.equal(weekendComparison(data,[2026,2025]).share,null)
})

test('edition text is opt-in and isolated from original stories', () => {
  const markdown = [
    '## life-public · 故事','- 页面展示：是','- 页面时间：旧时间','- 可用表述：旧正文',
    '- 新版正文：新版','- 新版时间：新时间','- 新版摘录：新摘录','- 用户原话：仅限档案',
    '## life-private · 私有','- 页面展示：否','- 新版正文：私有',
    '## 新版编辑文案','- 新版开场：开场','- 新版结语：结语',
  ].join('\n')
  assert.equal(parseStories(markdown)[0].text,'旧正文')
  assert.deepEqual(parseEditionStories(markdown), [{id:'life-public',title:'故事',text:'新版',when:'新时间',quote:'新摘录'}])
  assert.deepEqual(parseEditionEditorial(markdown),{opening:'开场',ending:'结语'})
})
