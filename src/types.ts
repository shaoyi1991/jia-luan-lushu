export interface Activity {
  run_id: string
  name: string
  distance: number
  moving_time: string
  elapsed_time?: string | null
  type: string
  subtype?: string
  start_date?: string
  start_date_local: string
  location_country?: string | null
  summary_polyline?: string | null
  average_heartrate?: number | null
  average_speed?: number | null
  elevation_gain?: number | null
  streak?: number
}

export type SportFilter = 'all' | 'run' | 'walk' | 'hike' | 'ride'
