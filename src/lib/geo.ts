import polyline from '@mapbox/polyline'

export function decodeTrack(
  value: string | null | undefined,
  maxPoints = 80,
): [number, number][] {
  if (!value) return []
  try {
    const decoded = polyline.decode(value) as [number, number][]
    const points = decoded.filter(
      (point) =>
        Array.isArray(point) &&
        Math.abs(point[0]) <= 90 &&
        Math.abs(point[1]) <= 180,
    )
    if (points.length <= maxPoints) return points
    const step = Math.ceil(points.length / maxPoints)
    const trimmed: [number, number][] = []
    for (let index = 0; index < points.length; index += step) trimmed.push(points[index])
    const last = points[points.length - 1]
    const tail = trimmed[trimmed.length - 1]
    if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) trimmed.push(last)
    return trimmed
  } catch {
    return []
  }
}

// A preview of the most represented local area, not an assertion of identical routes.
// Large-area tracks stay available in the archive rather than flattening the thumbnail.
export function localRouteSample(activities: { summary_polyline?: string | null }[], cap = 18): [number, number][][] {
  const candidates = activities.map(a => decodeTrack(a.summary_polyline,120)).filter(p=>p.length>1).map(points=>{
    const lat=points.map(p=>p[0]), lon=points.map(p=>p[1])
    const minLat=Math.min(...lat),maxLat=Math.max(...lat),minLon=Math.min(...lon),maxLon=Math.max(...lon)
    return {points,lat:(minLat+maxLat)/2,lon:(minLon+maxLon)/2,span:Math.max(maxLat-minLat,maxLon-minLon)}
  }).filter(c=>c.span<.15)
  if (!candidates.length) return []
  const buckets=new Map<string,typeof candidates>()
  for (const c of candidates) {
    const key=`${Math.round(c.lat/.025)},${Math.round(c.lon/.025)}`
    const group=buckets.get(key)??[];group.push(c);buckets.set(key,group)
  }
  const main=[...buckets.values()].sort((a,b)=>b.length-a.length)[0]
  const step=Math.max(1,Math.ceil(main.length/cap))
  return main.filter((_,i)=>i%step===0).slice(0,cap).map(c=>c.points)
}
