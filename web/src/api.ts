/**
 * Client for the REWIND API.
 *
 * The pipeline's event schema and this UI's view model are genuinely
 * different shapes, so the mapping is explicit and lives here rather than
 * being smeared through the components.
 *
 * Two honesty rules are enforced in this file:
 *  - Nothing invents a number the pipeline did not produce. Where the design
 *    expects a 0-100 bar and the pipeline produces a robust z-score, the bar
 *    is a normalised *display* value and the real z travels alongside it.
 *  - Times are OFFSETS INTO THE RECORDING, not wall-clock. The pipeline knows
 *    "3833 seconds in"; it does not know what time that was.
 */

export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? ''

export type Stage1 = {
  peak_z: number
  mean_z: number
  duration_s: number
  salience: number
}

export type RewindEvent = {
  video: string
  seat_id?: number
  zone_id?: string
  start_sec: number
  end_sec: number
  action_label: string
  confidence: number
  evidence: Record<string, unknown>
  /** absent on sweep-path events - always null-check */
  stage1?: Stage1
  clip_path: string
  clip_url: string | null
  clip_annotated_url: string | null
}

export type Summary = {
  total_events: number
  total_footage_s: number
  labels: Record<string, number>
  videos: Record<string, number>
  parameters: Record<string, unknown>
  disclaimer: string
  evaluation: Record<string, unknown>
}

/** How the existing screens want an event shaped. */
export type UiEvent = {
  id: string
  time: string
  end: string
  cam: string
  type: string
  roi: string
  /** 0-100, for bar width only. The real value is raw.stage1.peak_z. */
  activity: number
  peakZ: number | null
  conf: number
  status: 'Unreviewed' | 'Reviewed' | 'Relevant' | 'Ignored'
  obj: string
  priority: 'high' | 'medium' | 'low'
  durationS: number
  clipUrl: string | null
  annotatedUrl: string | null
  rule: string
  raw: RewindEvent
}

const LABEL_TEXT: Record<string, string> = {
  mobile_phone_usage: 'Mobile Phone Usage',
  talking_to_neighbour: 'Talking to Neighbour',
  seat_exchange: 'Seat Exchange',
  paper_pass: 'Paper Pass',
  paper_pass_object_present: 'Held Object Present',
  crowd_gathering: 'Crowd Gathering',
  staff_or_transit: 'Staff / Transit',
  unclassified_anomaly: 'Unclassified Anomaly',
}

export function labelText(l: string): string {
  return LABEL_TEXT[l] ?? l.replace(/_/g, ' ')
}

/** Offset into the recording as HH:MM:SS. Not a wall-clock time. */
export function hms(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(r)}`
}

export function camLabel(video: string): string {
  return video.replace(/\.(mp4|mkv|avi)$/i, '').toUpperCase()
}

function priorityOf(conf: number): 'high' | 'medium' | 'low' {
  if (conf >= 0.6) return 'high'
  if (conf >= 0.4) return 'medium'
  return 'low'
}

function objectOf(e: RewindEvent): string {
  const cls = e.evidence?.['detector_class']
  if (typeof cls === 'string') return cls.replace(/\s*\(COCO \d+\).*/, '')
  return 'None'
}

export function toUi(e: RewindEvent, i: number): UiEvent {
  const peak = e.stage1?.peak_z ?? null
  return {
    id: `EVT-${String(i + 1).padStart(5, '0')}`,
    time: hms(e.start_sec),
    end: hms(e.end_sec),
    cam: camLabel(e.video),
    type: labelText(e.action_label),
    roi: e.seat_id != null ? `Seat ${e.seat_id}` : (e.zone_id ?? 'Zone'),
    // Display-only normalisation. Z is unbounded above; 20 is a generous
    // ceiling for a bar, and anything past it simply pins at 100.
    activity: peak == null ? 0 : Math.min(100, Math.round((peak / 20) * 100)),
    peakZ: peak,
    conf: Math.round(e.confidence * 100),
    status: 'Unreviewed',
    obj: objectOf(e),
    priority: priorityOf(e.confidence),
    durationS: Math.round((e.end_sec - e.start_sec) * 10) / 10,
    clipUrl: e.clip_url ? API_BASE + e.clip_url : null,
    annotatedUrl: e.clip_annotated_url ? API_BASE + e.clip_annotated_url : null,
    rule: String(e.evidence?.['rule'] ?? ''),
    raw: e,
  }
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path)
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

export async function fetchEvents(params: {
  label?: string
  video?: string
  minConfidence?: number
  limit?: number
} = {}): Promise<UiEvent[]> {
  const q = new URLSearchParams()
  if (params.label) q.set('label', params.label)
  if (params.video) q.set('video', params.video)
  if (params.minConfidence) q.set('min_confidence', String(params.minConfidence))
  if (params.limit) q.set('limit', String(params.limit))
  const s = q.toString()
  const data = await get<{ events: RewindEvent[] }>(`/events${s ? '?' + s : ''}`)
  return data.events.map(toUi)
}

export const fetchSummary = () => get<Summary>('/summary')

/** "2h 08m" from seconds. */
export function hoursLabel(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
export const fetchStats = () => get<Record<string, any>>('/stats')
export const debugImage = (name: string) => `${API_BASE}/debug/${name}`
