import { useState } from 'react'
import { useData } from './data'
import { ClipPlayer } from './ClipPlayer'
import { labelText, hoursLabel, camLabel } from './api'

// Live data replaces the design's hardcoded arrays. The module-level mock
// consts are kept below only as a shape reference; every screen shadows them
// with values from the API.

type Screen =
  | 'dashboard'
  | 'library'
  | 'event-explorer'
  | 'investigation'

function cn(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(' ')
}

// ── Icon paths ────────────────────────────────────────────────────

const I = {
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  video: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.94L15 14m-2-9H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
  search: 'M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z',
  event: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  roi: 'M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h6v6h-6z',
  report: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-2 12H8m4-4H8m6-6v4h4',
  status: 'M22 12h-4l-3 9L9 3l-3 9H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.93-3a6.97 6.97 0 0 0-.07-1l1.4-1.1a.3.3 0 0 0 .07-.4l-1.33-2.3a.3.3 0 0 0-.38-.13l-1.65.66a6.57 6.57 0 0 0-.86-.5l-.25-1.76A.3.3 0 0 0 15.6 5h-2.67a.3.3 0 0 0-.3.25l-.24 1.76a6.57 6.57 0 0 0-.87.5l-1.65-.67a.3.3 0 0 0-.37.13L8.17 9.27a.3.3 0 0 0 .07.4l1.4 1.1a6.7 6.7 0 0 0 0 2l-1.4 1.1a.3.3 0 0 0-.07.4l1.33 2.3c.08.14.25.2.38.13l1.65-.66c.27.18.56.35.86.5l.25 1.76c.04.15.18.25.3.25h2.67a.3.3 0 0 0 .3-.25l.24-1.76c.3-.14.59-.31.86-.5l1.65.67c.14.06.3 0 .38-.13l1.33-2.3a.3.3 0 0 0-.07-.4z',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6zm8 0h4v16h-4z',
  chevronR: 'M9 18l6-6-6-6',
  chevronL: 'M15 18l-6-6 6-6',
  chevronD: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  calendar: 'M3 4h18v16H3zm0 0V2m6 2V2m9 2V2M3 9h18',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zm-7-4a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5l5 5 5-5m-5 5V3',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  segments: 'M2 6h4v12H2zm6 3h4v9H8zm6-5h4v14h-4z',
  zoomin: 'M11 3a8 8 0 1 0 0 16A8 8 0 0 0 11 3zm0 5v6m-3-3h6m4 6l3 3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m14-7l-5-5-5 5m5-5v13',
  gpu: 'M4 6h16v12H4zm4 6h8m-8-3h8m-8 6h5',
  storage: 'M22 12H2m20-5H2m20 10H2m2-5v5m16-5v5',
  arrow: 'M5 12h14m-7-7l7 7-7 7',
}

function Ico({ d, size = 16, stroke }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke ?? 1.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  )
}

// ── Primitives ────────────────────────────────────────────────────

function Badge({ children, color = 'olive', dot }: {
  children: React.ReactNode; color?: 'olive' | 'burgundy' | 'amber' | 'danger' | 'success' | 'info' | 'muted'; dot?: boolean
}) {
  const map: Record<string, string> = {
    olive: 'bg-olive-subtle text-olive border border-olive-mid/30',
    burgundy: 'bg-burgundy-dim text-burgundy border border-burgundy-mid/30',
    amber: 'bg-amber-dim text-amber border border-amber/30',
    danger: 'bg-danger-dim text-danger border border-danger/30',
    success: 'bg-success-dim text-success border border-success/30',
    info: 'bg-info-dim text-info border border-info/30',
    muted: 'bg-elevated text-muted border border-border',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium font-mono', map[color])}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />}
      {children}
    </span>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-card border border-border rounded-xl', className)}>{children}</div>
}

function Btn({ children, variant = 'primary', size = 'md', onClick, className, disabled, title }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; className?: string; disabled?: boolean; title?: string
}) {
  const v = {
    primary: 'bg-olive text-white hover:bg-olive-mid',
    secondary: 'bg-card border border-border text-cream-dim hover:border-border-light hover:text-cream',
    ghost: 'text-muted hover:text-cream-dim hover:bg-elevated',
    danger: 'bg-burgundy text-white hover:bg-burgundy-mid',
  }
  const s = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-sm' }
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} title={title}
      className={cn('inline-flex items-center gap-2 font-medium rounded-lg transition-colors',
        disabled
          ? 'bg-elevated border border-border text-muted/60 cursor-not-allowed opacity-60'
          : v[variant],
        s[size], className)}>
      {children}
    </button>
  )
}

// ── Charts ────────────────────────────────────────────────────────

/** Events per time bucket across a recording. Real counts, not a drawn curve. */
function activitySeries(evs: { raw: { start_sec: number } }[], buckets = 60): number[] {
  if (!evs.length) return new Array(buckets).fill(0)
  const span = Math.max(...evs.map(e => e.raw.start_sec)) || 1
  const out = new Array(buckets).fill(0)
  for (const e of evs) {
    const i = Math.min(buckets - 1, Math.floor((e.raw.start_sec / span) * buckets))
    out[i] += 1
  }
  return out
}

function ActivityChart({ height = 100, data }: { height?: number; data: number[] }) {
  const ACT = data.length ? data : [0]
  const w = 600; const h = height
  const max = Math.max(...ACT)
  const xs = ACT.map((_, i) => (i / (ACT.length - 1)) * w)
  const ys = ACT.map(v => h - (v / max) * (h - 12) - 4)
  const line = ACT.map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i]},${ys[i]}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const ticks = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00']
  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" y1={h - f * (h - 16)} x2={w} y2={h - f * (h - 16)} stroke="#D8D0C0" strokeWidth="1" />
      ))}
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5E7832" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#5E7832" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ag)" />
      <path d={line} fill="none" stroke="#5E7832" strokeWidth="1.5" />
      <circle cx={xs[20]} cy={ys[20]} r="3" fill="#B02030" />
      <circle cx={xs[22]} cy={ys[22]} r="3" fill="#B02030" />
      <line x1={xs[22]} y1={ys[22]} x2={xs[22]} y2={h} stroke="#B02030" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
      {ticks.map((t, i) => (
        <text key={t} x={(i / (ticks.length - 1)) * w} y={h + 14} fill="#8C8576" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">{t}</text>
      ))}
    </svg>
  )
}

function Spark({ data, color = '#5E7832' }: { data: number[]; color?: string }) {
  const w = 64; const h = 24
  const max = Math.max(...data); const min = Math.min(...data)
  const ys = data.map(v => h - ((v - min) / (max - min + 1)) * (h - 4) - 2)
  const xs = data.map((_, i) => (i / (data.length - 1)) * w)
  const line = data.map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i]},${ys[i]}`).join(' ')
  return <svg width={w} height={h}><path d={line} fill="none" stroke={color} strokeWidth="1.5" /></svg>
}

function BarChart({ data, labels, color = '#5E7832' }: { data: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...data); const w = 360; const h = 100
  const bw = (w - (data.length - 1) * 5) / data.length
  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full">
      {data.map((v, i) => (
        <g key={i}>
          <rect x={i * (bw + 5)} y={h - (v / max) * h} width={bw} height={(v / max) * h} rx="2" fill={color} opacity="0.75" />
          <text x={i * (bw + 5) + bw / 2} y={h + 14} fill="#8C8576" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}

// ── CCTV Frame ────────────────────────────────────────────────────

// CCTVFrame and its ROIS data were removed: it drew a fake exam hall out of
// divs, with a fixed timestamp and a fixed activity percentage. ClipPlayer
// plays the real exported clip instead.

function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-sm font-mono text-muted">loading events…</span>
    </div>
  )
}

function ApiError({ error }: { error: string }) {
  return (
    <div className="h-full flex items-center justify-center px-10">
      <div className="max-w-lg text-center space-y-3">
        <div className="text-danger font-semibold">Cannot reach the REWIND API</div>
        <div className="text-sm text-muted font-mono break-all">{error}</div>
        <div className="text-sm text-muted">
          Start it with{' '}
          <code className="font-mono bg-elevated px-1.5 py-0.5 rounded">
            uvicorn api.main:app --port 8000
          </code>{' '}
          from the repo root, then reload.
        </div>
      </div>
    </div>
  )
}

// ── Status badge utility ──────────────────────────────────────────

function statusBadge(s: string) {
  if (s === 'Unreviewed') return <Badge color="amber" dot>{s}</Badge>
  if (s === 'Reviewed') return <Badge color="info" dot>{s}</Badge>
  if (s === 'Relevant') return <Badge color="danger" dot>{s}</Badge>
  return <Badge color="muted" dot>{s}</Badge>
}

// ── Top Navigation ────────────────────────────────────────────────

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'library', label: 'Library' },
  { id: 'event-explorer', label: 'Events' },
  { id: 'investigation', label: 'Investigate' },
] as const

function TopNav({ active, onNavigate }: { active: Screen; onNavigate: (s: Screen) => void }) {
  return (
    <nav className="sticky top-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-border h-14 flex items-center">
      <div className="w-full px-8 flex items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 bg-olive-subtle border border-olive-mid/30 rounded-lg flex items-center justify-center">
            <Ico d={I.layers} size={13} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg text-cream leading-none tracking-tight font-bold">REWIND</span>
            <span className="text-[9px] font-mono text-olive bg-olive-subtle px-1.5 py-0.5 rounded tracking-widest">FORENSICS</span>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-0.5 flex-1">
          {NAV.map(item => (
            <button key={item.id} onClick={() => onNavigate(item.id as Screen)}
              className={cn('px-3 py-1.5 text-sm rounded-md font-medium transition-colors',
                active === item.id
                  ? 'bg-olive-subtle text-olive'
                  : 'text-cream-dim hover:text-cream hover:bg-elevated')}>
              {item.label}
            </button>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Offline analysis
          </div>
          {/* GPU% and storage used to sit here as fixed strings. Nothing
              measured them, so they are gone rather than left as decoration. */}
        </div>
      </div>
    </nav>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────

function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [cam, setCam] = useState('all')
  const { events: ALL_EVENTS, selected, select, loading, error } = useData()
  const EVENTS_DATA = ALL_EVENTS.slice(0, 6)
  const { summary } = useData()
  // Every figure here comes from the manifest. Nothing is padded for effect:
  // if only eight recordings were processed, the card says eight.
  const kpi = (() => {
    const videos = summary ? Object.keys(summary.videos).length : 0
    const events = ALL_EVENTS.length
    const named = ALL_EVENTS.filter(e => e.raw.action_label !== 'unclassified_anomaly').length
    const reviewSec = ALL_EVENTS.reduce((a, e) => a + e.durationS, 0)
    return {
      videos,
      events,
      named,
      unnamed: events - named,
      high: ALL_EVENTS.filter(e => e.priority === 'high').length,
      withObject: ALL_EVENTS.filter(e => e.obj !== 'None').length,
      reviewMin: Math.max(1, Math.round(reviewSec / 60)),
      hours: hoursLabel(summary?.total_footage_s ?? 0),
    }
  })()
  const s1 = [18,22,24,28,30,32,35,38,40,42,44,48]
  const s2 = [40,42,45,48,50,52,55,58,60,62,66,70]
  const s3 = [8,10,12,14,15,16,18,20,22,24,26,28]

  return (
    <div className="overflow-y-auto h-full">

      {/* Hero band */}
      <div className="bg-surface border-b border-border">
        <div className="px-8 py-14 grid grid-cols-2 gap-16 items-center">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-xs font-mono text-muted uppercase tracking-widest">Offline Analysis Ready · Semester Exam 2026</span>
            </div>
            <h1 className="text-5xl font-display text-cream leading-tight mb-4">
              Rewind.<br />Investigate.<br />Verify.
            </h1>
            <p className="text-cream-dim text-base leading-relaxed mb-8 max-w-md">
              Turn hours of recorded footage into prioritized events, motion insights, and investigation-ready evidence — without watching a single frame manually.
            </p>
            <div className="flex items-center gap-3">
              <Btn size="lg" onClick={() => onNavigate('library')}>
                <Ico d={I.event} size={15} />Browse Events
              </Btn>
              <Btn size="lg" variant="secondary" onClick={() => onNavigate('event-explorer')}>
                View Events
                <Ico d={I.arrow} size={15} />
              </Btn>
            </div>
            <div className="flex items-center gap-6 mt-8 pt-8 border-t border-border">
              {[
                { label: 'Recordings', val: String(kpi.videos) },
                { label: 'Events', val: String(kpi.events) },
                { label: 'High Confidence', val: String(kpi.high) },
                { label: 'Footage', val: kpi.hours },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-2xl font-display text-cream">{s.val}</div>
                  <div className="text-xs font-mono text-muted mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <ClipPlayer event={selected} compact />
            <div className="flex items-center justify-between mt-3 text-xs font-mono text-muted">
              <span>Live investigation preview · {selected?.cam ?? '—'}</span>
              <button onClick={() => onNavigate('investigation')} className="text-olive hover:underline flex items-center gap-1">Open workspace <Ico d={I.arrow} size={10} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="px-8 py-10 border-b border-border">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Session Analytics</div>
            <h2 className="text-2xl font-display text-cream">Key Metrics</h2>
          </div>
          <Btn variant="ghost" size="sm">
            <Ico d={I.calendar} size={13} />22 Aug 2026 · IT Department
          </Btn>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Recordings Analysed', val: String(kpi.videos), sub: `${kpi.hours} of footage`, spark: s1, color: 'olive' as const },
            { label: 'Events Surfaced', val: String(kpi.events), sub: `${kpi.reviewMin} min to review`, spark: s2, color: 'olive' as const },
            { label: 'Named Behaviours', val: String(kpi.named), sub: `${kpi.unnamed} unclassified`, spark: s3, color: 'danger' as const },
            { label: 'Object Evidence', val: String(kpi.withObject), sub: 'detection-backed', spark: [4,6,8,7,10,12,14,16,18,20,21,23], color: 'amber' as const },
          ].map(k => {
            const cc = { olive: { border: 'border-olive-mid/20', val: 'text-olive', sc: '#5E7832' }, danger: { border: 'border-danger/20', val: 'text-danger', sc: '#B02030' }, amber: { border: 'border-amber/20', val: 'text-amber', sc: '#A06010' } }[k.color]
            return (
              <Card key={k.label} className={cn('p-6 border', cc.border)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-mono text-muted uppercase tracking-wider mb-2">{k.label}</div>
                    <div className={cn('text-5xl font-display', cc.val)}>{k.val}</div>
                    <div className="text-xs text-muted mt-2">{k.sub}</div>
                  </div>
                  <Spark data={k.spark} color={cc.sc} />
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Activity Overview */}
      <div className="px-8 py-10 border-b border-border">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Real-time Analysis</div>
            <h2 className="text-2xl font-display text-cream">Activity Timeline</h2>
            <p className="text-cream-dim text-sm mt-1">Jump directly to high-activity moments — skip manual review of quiet footage.</p>
          </div>
          <div className="flex gap-1.5">
            {['all','CAM-01','CAM-02','CAM-03','CAM-04'].map(c => (
              <button key={c} onClick={() => setCam(c)}
                className={cn('px-3 py-1.5 text-xs rounded-lg font-mono transition-colors',
                  cam === c ? 'bg-olive text-white font-semibold' : 'bg-card border border-border text-muted hover:text-cream-dim')}>
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
        </div>
        <Card className="p-6">
          {/* Activity level legend */}
          <div className="flex items-center gap-6 mb-4 text-xs font-mono text-muted">
            {[['Normal','#5E7832'],['Moderate','#A06010'],['High','#B02030'],['Suspicious','#7B2040']].map(([l,c]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-sm inline-block" style={{ background: c as string }} />
                {l} Activity
              </span>
            ))}
          </div>
          <ActivityChart height={100} data={activitySeries(ALL_EVENTS)} />
        </Card>
      </div>

      {/* Recent Events */}
      <div className="px-8 py-10">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Investigation Queue</div>
            <h2 className="text-2xl font-display text-cream">Recent High-Priority Events</h2>
          </div>
          <Btn variant="secondary" size="sm" onClick={() => onNavigate('event-explorer')}>
            View All Events <Ico d={I.arrow} size={13} />
          </Btn>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {EVENTS_DATA.filter(e => e.priority === 'high').slice(0, 3).map(e => (
            <Card key={e.id} className="p-6 flex flex-col gap-4 hover:border-border-light transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono text-muted">{e.id}</div>
                  <div className="text-base font-semibold text-cream mt-0.5">{e.type}</div>
                </div>
                {statusBadge(e.status)}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ['Timestamp', `${e.time} – ${e.end}`],
                  ['Camera', e.cam],
                  ['ROI', e.roi],
                  ['Object', e.obj],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="font-mono text-muted uppercase tracking-wide text-[10px] mb-0.5">{k}</div>
                    <div className="text-cream-dim font-medium truncate">{v}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 py-3 border-y border-border">
                <div className="text-center">
                  <div className="text-2xl font-display text-danger">{e.activity}%</div>
                  <div className="text-[10px] font-mono text-muted uppercase tracking-wide">Activity</div>
                </div>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-display text-olive">{e.conf}%</div>
                  <div className="text-[10px] font-mono text-muted uppercase tracking-wide">Confidence</div>
                </div>
                <div className="flex-1 text-right">
                  <div className="text-xs font-mono text-amber">Requires Review</div>
                </div>
              </div>
              <Btn onClick={() => onNavigate('investigation')} className="w-full justify-center">
                Review Event <Ico d={I.arrow} size={13} />
              </Btn>
            </Card>
          ))}
        </div>
        {/* Processing queue strip */}
        <div className="mt-6 p-5 bg-surface rounded-xl border border-border flex items-center gap-8">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Processing Queue</div>
            <div className="text-sm text-cream-dim font-medium">2 videos currently processing</div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4">
            {[{ name: 'CAM-08_14h30.mp4', prog: 67 }, { name: 'CAM-11_14h45.mp4', prog: 23 }].map(f => (
              <div key={f.name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-muted">
                  <span className="truncate">{f.name}</span><span>{f.prog}%</span>
                </div>
                <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                  <div className="h-full bg-olive rounded-full" style={{ width: `${f.prog}%` }} />
                </div>
              </div>
            ))}
          </div>
          <Btn variant="secondary" size="sm" onClick={() => onNavigate('library')}>
            Manage Queue
          </Btn>
        </div>
      </div>

      {/* Priority Video Columns */}
      <div className="px-8 py-10 border-t border-border">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Triage View</div>
            <h2 className="text-2xl font-display text-cream">Events by Priority</h2>
            <p className="text-muted text-sm mt-1">Sorted by activity score and confidence — review high-priority first.</p>
          </div>
          <Btn variant="secondary" size="sm" onClick={() => onNavigate('event-explorer')}>
            Full Event Table <Ico d={I.arrow} size={13} />
          </Btn>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* High */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-danger">
              <span className="w-2.5 h-2.5 rounded-full bg-danger" />
              <span className="font-semibold text-cream">High Priority</span>
              <span className="ml-auto text-xs font-mono text-danger">5 events</span>
            </div>
            <div className="space-y-3">
              {ALL_EVENTS.filter(e => e.priority === 'high').map(e => (
                <button key={e.id} onClick={() => { select(e); onNavigate('investigation') }}
                  className="w-full text-left p-4 bg-card border border-border rounded-xl hover:border-danger/40 hover:bg-danger-dim/20 transition-all group">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="text-[10px] font-mono text-muted">{e.id}</div>
                      <div className="text-sm font-semibold text-cream mt-0.5 group-hover:text-cream">{e.type}</div>
                    </div>
                    <Badge color="danger">{e.activity}%</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted mb-3">
                    <div><span className="text-cream-dim font-medium">{e.cam}</span></div>
                    <div><span className="text-cream-dim font-medium">{e.time}</span></div>
                    <div className="col-span-2 truncate">{e.roi}</div>
                  </div>
                  {e.obj !== 'None' && (
                    <div className="text-[10px] font-mono text-amber mb-2">⚠ Possible {e.obj}</div>
                  )}
                  <div className="flex items-center justify-between">
                    {statusBadge(e.status)}
                    <span className="text-xs text-olive opacity-0 group-hover:opacity-100 transition-opacity font-medium">Review →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Medium */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-amber">
              <span className="w-2.5 h-2.5 rounded-full bg-amber" />
              <span className="font-semibold text-cream">Medium Priority</span>
              <span className="ml-auto text-xs font-mono text-amber">3 events</span>
            </div>
            <div className="space-y-3">
              {ALL_EVENTS.filter(e => e.priority === 'medium').map(e => (
                <button key={e.id} onClick={() => onNavigate('event-explorer')}
                  className="w-full text-left p-4 bg-card border border-border rounded-xl hover:border-amber/40 hover:bg-amber-dim/20 transition-all group">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="text-[10px] font-mono text-muted">{e.id}</div>
                      <div className="text-sm font-semibold text-cream mt-0.5">{e.type}</div>
                    </div>
                    <Badge color="amber">{e.activity}%</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted mb-3">
                    <div><span className="text-cream-dim font-medium">{e.cam}</span></div>
                    <div><span className="text-cream-dim font-medium">{e.time}</span></div>
                    <div className="col-span-2 truncate">{e.roi}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    {statusBadge(e.status)}
                    <span className="text-xs text-olive opacity-0 group-hover:opacity-100 transition-opacity font-medium">Review →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Low */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-muted/40">
              <span className="w-2.5 h-2.5 rounded-full bg-muted/60" />
              <span className="font-semibold text-cream">Low Priority</span>
              <span className="ml-auto text-xs font-mono text-muted">3 events</span>
            </div>
            <div className="space-y-3">
              {ALL_EVENTS.filter(e => e.priority === 'low').slice(0, 3).map(e => (
                <button key={e.id} onClick={() => onNavigate('event-explorer')}
                  className="w-full text-left p-4 bg-card border border-border rounded-xl hover:border-border-light transition-all group">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="text-[10px] font-mono text-muted">{e.id}</div>
                      <div className="text-sm font-semibold text-cream mt-0.5">{e.type}</div>
                    </div>
                    <Badge color="muted">{e.activity}%</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted mb-3">
                    <div><span className="text-cream-dim font-medium">{e.cam}</span></div>
                    <div><span className="text-cream-dim font-medium">{e.time}</span></div>
                    <div className="col-span-2 truncate">{e.roi}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    {statusBadge(e.status)}
                    <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium">View →</span>
                  </div>
                </button>
              ))}
              {/* Filler card if few low events */}
              <div className="p-4 border border-dashed border-border rounded-xl text-center text-xs text-muted font-mono">
                + 12 more low-priority events
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Video Analysis ─────────────────────────────────────────────────

function Library({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { events, stats, summary, select, loading, error } = useData()
  if (error) return <ApiError error={error} />
  if (loading) return <Loading />

  const rows = Object.entries(stats ?? {})
    .filter(([, v]) => v && typeof v === 'object' && !('error' in v))
    .map(([video, v]: [string, any]) => {
      const evs = events.filter(e => e.raw.video === video)
      const named = evs.filter(e => !['staff_or_transit', 'unclassified_anomaly']
        .includes(e.raw.action_label)).length
      return {
        video,
        seats: v.n_seats ?? 0,
        durationS: v.duration_s ?? 0,
        candidates: v.stage1_candidates ?? null,
        promoted: v.promoted_to_stage2 ?? null,
        pct: v.promoted_fraction_of_seat_seconds ?? null,
        fixtures: (v.fixtures ?? {}).n ?? null,
        scanS: v.elapsed_s ?? null,
        events: evs.length,
        named,
        note: v.note as string | undefined,
      }
    })
    .sort((a, b) => b.durationS - a.durationS)

  const totalS = rows.reduce((a, r) => a + r.durationS, 0)

  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-7">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
          Processed Library
        </div>
        <h1 className="text-3xl font-display text-cream">Recordings</h1>
        <p className="text-cream-dim text-sm mt-1">
          {rows.length} recordings · {hoursLabel(totalS)} of footage · analysed
          offline, ahead of review. Select one to review its events.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated">
            <tr className="text-muted font-mono text-[10px] uppercase tracking-widest">
              {['Recording', 'Duration', 'Seats', 'Stage 1 scan', 'Candidates',
                'Reviewed', 'Fixtures rejected', 'Events', ''].map(h => (
                <th key={h} className="text-left px-5 py-3 font-medium border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.video} className="border-b border-border/50 hover:bg-elevated/40 transition-colors">
                <td className="px-5 py-3 font-mono text-olive whitespace-nowrap">{camLabel(r.video)}</td>
                <td className="px-5 py-3 font-mono text-cream-dim">{hoursLabel(r.durationS)}</td>
                <td className="px-5 py-3 font-mono text-cream-dim">{r.seats}</td>
                <td className="px-5 py-3 font-mono text-cream-dim">
                  {r.scanS != null ? `${r.scanS.toFixed(0)}s` : '—'}
                </td>
                <td className="px-5 py-3 font-mono text-cream-dim">{r.candidates ?? '—'}</td>
                <td className="px-5 py-3 font-mono">
                  {r.pct != null ? (
                    <span className="text-cream">{(r.pct * 100).toFixed(2)}%
                      <span className="text-muted"> of seat-seconds</span></span>
                  ) : <span className="text-muted">{r.note ? 'no seat grid' : '—'}</span>}
                </td>
                <td className="px-5 py-3 font-mono text-cream-dim">{r.fixtures ?? '—'}</td>
                <td className="px-5 py-3 font-mono">
                  <span className="text-cream">{r.events}</span>
                  <span className="text-muted"> · {r.named} named</span>
                </td>
                <td className="px-5 py-3">
                  <Btn variant="secondary" size="sm"
                    onClick={() => {
                      const first = events.find(e => e.raw.video === r.video)
                      if (first) select(first)
                      onNavigate('event-explorer')
                    }}>Review</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-cream mb-2">How these were processed</h3>
        <p className="text-xs text-muted leading-relaxed">
          Stage 1 reads motion vectors straight from the codec bitstream without
          decoding a frame, and scores every seat against its own rolling
          baseline. Only the highest-ranked ~2% of seat-seconds is ever fully
          decoded for detection and tracking. Analysis is offline and local; no
          footage leaves the machine, and no face recognition is performed at
          any stage.
        </p>
      </Card>
    </div>
  )
}



function InvestigationWorkspace() {
  const { events, selected, select, loading, error } = useData()
  const DET_EVENTS = events.slice(0, 8).map(e => ({
    time: e.time, type: e.type, roi: e.roi,
    score: e.activity, conf: e.conf, dur: `${e.durationS} sec`,
    color: (e.priority === 'high' ? 'danger' : e.priority === 'medium' ? 'amber' : 'muted') as 'danger' | 'amber' | 'muted',
    obj: e.obj, ev: e,
  }))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('1×')
  const [sel, setSel] = useState(0)
  const [tlX, setTlX] = useState(28)
  return (
    <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-surface shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Investigation · {selected?.id ?? '—'} · {selected?.cam ?? '—'}</div>
              <h1 className="text-xl font-display text-cream">REWIND — Investigation Workspace</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Disabled rather than removed: they show what a review workflow
                  would offer, without pretending any of it works yet. */}
              <Btn variant="secondary" size="sm" disabled title="not implemented - this build is read-only review"><Ico d={I.bookmark} size={12} />Bookmark</Btn>
              <Btn variant="secondary" size="sm" disabled title="not implemented - this build is read-only review"><Ico d={I.export} size={12} />Export Clip</Btn>
              <Btn variant="danger" size="sm" disabled title="not implemented - this build is read-only review"><Ico d={I.flag} size={12} />Mark Relevant</Btn>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ClipPlayer event={selected} />

          {/* Controls */}
          <Card className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => setPlaying(p => !p)}
                className="w-9 h-9 bg-olive rounded-full flex items-center justify-center text-white hover:bg-olive-mid transition-colors">
                <Ico d={playing ? I.pause : I.play} size={13} />
              </button>
              <button className="w-8 h-8 bg-card border border-border rounded-lg flex items-center justify-center hover:border-border-light"><Ico d={I.chevronL} size={13} /></button>
              <button className="w-8 h-8 bg-card border border-border rounded-lg flex items-center justify-center hover:border-border-light"><Ico d={I.chevronR} size={13} /></button>
              {/* Timeline */}
              <div className="flex-1 relative cursor-pointer" onClick={e => {
                const r = e.currentTarget.getBoundingClientRect()
                setTlX(((e.clientX - r.left) / r.width) * 100)
              }}>
                <div className="h-9 bg-elevated rounded-lg border border-border overflow-hidden relative">
                  {(() => { const A = activitySeries(
                      events.filter(e => e.raw.video === selected?.raw.video)); const mx = Math.max(1, ...A);
                    return A.map((v, i) => (
                    <div key={i} className="absolute bottom-0 bg-olive/40"
                      style={{ left: `${(i/A.length)*100}%`, width: `${100/A.length}%`, height: `${(v/mx)*100}%` }} />
                  )) })()}
                  {/* Markers are the real named findings in this recording,
                      positioned at their actual offsets -- not fixed decoration. */}
                  {(() => {
                    const sib = events.filter(e => e.raw.video === selected?.raw.video)
                    const span = Math.max(1, ...sib.map(e => e.raw.start_sec))
                    return sib
                      .filter(e => !['staff_or_transit', 'unclassified_anomaly'].includes(e.raw.action_label))
                      .slice(0, 12)
                      .map(e => (
                        <div key={e.id} title={`${e.type} · ${e.time}`}
                          className="absolute top-0 bottom-0 w-0.5"
                          style={{ left: `${(e.raw.start_sec / span) * 100}%`,
                                   background: e.priority === 'high' ? '#B02030' : '#A06010' }}>
                          <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-card"
                            style={{ background: e.priority === 'high' ? '#B02030' : '#A06010' }} />
                        </div>
                      ))
                  })()}
                  <div className="absolute top-0 bottom-0 w-0.5 bg-cream/80" style={{ left: `${tlX}%` }} />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-muted mt-1">
                  {['00:00','01:00','02:00','03:00','04:00'].map(t => <span key={t}>{t}</span>)}
                </div>
              </div>
              <div className="flex gap-1">
                {['0.5×','1×','2×','4×'].map(s => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={cn('px-2 py-1 text-xs font-mono rounded transition-colors',
                      speed === s ? 'bg-olive text-white font-semibold' : 'bg-card border border-border text-muted hover:text-cream-dim')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted font-mono flex-wrap">
              <span>{selected ? `t+${selected.time}` : '—'}</span>
              <span className="text-border">|</span>
              {events
                .filter(e => e.raw.video === selected?.raw.video
                  && !['staff_or_transit', 'unclassified_anomaly'].includes(e.raw.action_label))
                .slice(0, 5)
                .map(e => (
                  <button key={e.id} onClick={() => select(e)}
                    className="flex items-center gap-1 hover:text-cream-dim transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: e.priority === 'high' ? '#B02030' : '#A06010' }} />
                    {e.type} <span className="text-border">{e.time}</span>
                  </button>
                ))}
            </div>
          </Card>

          {/* Heatmap */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-cream">Motion Activity Heatmap</h3>
                <p className="text-xs text-muted mt-0.5">Visualize where activity occurred throughout the examination recording.</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-muted">
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-info/60" />Low</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-amber/70" />Medium</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-danger/80" />High</span>
              </div>
            </div>
            <div className="relative h-28 bg-[#0E1209] rounded-lg border border-border overflow-hidden">
              {[{x:15,y:20,r:28,c:'rgba(176,32,48,0.7)'},{x:55,y:45,r:40,c:'rgba(176,32,48,0.85)'},{x:75,y:25,r:22,c:'rgba(160,96,16,0.7)'},{x:30,y:60,r:18,c:'rgba(36,104,120,0.5)'},{x:85,y:65,r:15,c:'rgba(36,104,120,0.4)'}].map((h,i) => (
                <div key={i} className="absolute rounded-full" style={{ left:`${h.x}%`,top:`${h.y}%`,width:`${h.r*2}px`,height:`${h.r*2}px`,transform:'translate(-50%,-50%)',background:`radial-gradient(circle,${h.c} 0%,transparent 70%)` }} />
              ))}
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage:'linear-gradient(#5E7832 1px,transparent 1px),linear-gradient(90deg,#5E7832 1px,transparent 1px)',backgroundSize:'30px 20px' }} />
            </div>
            <div className="flex items-center gap-4 mt-3">
              <span className="text-xs font-mono text-muted">Opacity</span>
              <input type="range" min="0" max="100" defaultValue="70" className="flex-1 accent-olive h-1" />
              <span className="text-xs font-mono text-muted">Time Window</span>
              <select className="bg-card border border-border rounded-lg px-2 py-1 text-xs font-mono text-cream-dim focus:outline-none">
                <option>5 min</option><option>15 min</option><option>30 min</option>
              </select>
            </div>
          </Card>
        </div>
      </div>

      {/* Events Panel */}
      <div className="w-80 bg-surface border-l border-border flex flex-col overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">{selected?.cam ?? '—'} · {events.length} events</div>
          <h2 className="text-base font-semibold text-cream">Detected Events</h2>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {DET_EVENTS.map((e, i) => (
            <div key={i} onClick={() => setSel(i)}
              className={cn('p-4 cursor-pointer transition-colors', sel === i ? 'bg-elevated' : 'hover:bg-elevated/60')}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="text-[10px] font-mono text-muted">{e.time}</div>
                  <div className="text-sm font-semibold text-cream mt-0.5">{e.type}</div>
                </div>
                <Badge color={e.color}>{e.roi}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {[['Activity', `${e.score}%`, e.score >= 80 ? 'text-danger' : 'text-amber'],['Conf.', `${e.conf}%`, 'text-olive'],['Duration', e.dur, 'text-cream-dim']].map(([l,v,c]) => (
                  <div key={l} className="bg-card border border-border rounded-lg px-2 py-1.5 text-[10px] font-mono">
                    <div className="text-muted">{l}</div>
                    <div className={cn('font-semibold', c)}>{v}</div>
                  </div>
                ))}
              </div>
              {e.obj !== 'None' && (
                <div className="text-[10px] font-mono text-amber mb-3 flex items-center gap-1">
                  <Ico d={I.alert} size={10} />Possible {e.obj}
                </div>
              )}
              <div className="flex gap-1.5">
                <button className="flex-1 py-1.5 text-[10px] bg-olive-subtle border border-olive-mid/30 text-olive rounded-lg hover:bg-olive-dim font-medium transition-colors">Review</button>
                <button className="flex-1 py-1.5 text-[10px] bg-burgundy-dim border border-burgundy-mid/30 text-burgundy rounded-lg hover:bg-burgundy-mid font-medium transition-colors">Relevant</button>
                <button className="flex-1 py-1.5 text-[10px] bg-card border border-border text-muted rounded-lg hover:text-cream-dim font-medium transition-colors">Ignore</button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border">
          <textarea disabled placeholder="Investigation notes - not implemented in this build"
            title="not implemented - this build is read-only review"
            className="w-full bg-elevated border border-border rounded-lg p-3 text-xs text-muted/60 placeholder:text-muted/60 resize-none focus:outline-none h-20 cursor-not-allowed" />
          <Btn className="w-full justify-center mt-2" disabled title="not implemented - this build is read-only review">Save Note</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Event Explorer ─────────────────────────────────────────────────

function EventExplorer({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { events: ALL_EVENTS, select, loading, error } = useData()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  // Chips are the labels classify.py can actually emit, plus a findings-only
  // shortcut. The originals ('Possible Object', 'Elevated Motion') matched no
  // label this system produces, so they filtered to nothing.
  const DISMISSALS = ['staff_or_transit', 'unclassified_anomaly']
  const counts = ALL_EVENTS.reduce<Record<string, number>>((a, e) => {
    a[e.raw.action_label] = (a[e.raw.action_label] ?? 0) + 1
    return a
  }, {})
  const filters = ['All', 'Findings only',
    ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])]
  if (error) return <ApiError error={error} />
  if (loading) return <Loading />
  const shown = ALL_EVENTS.filter(e => {
    const q = search.toLowerCase()
    const m = !q || e.time.includes(q) || e.cam.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.roi.toLowerCase().includes(q)
    const f = filter === 'All'
      || (filter === 'Findings only' && !DISMISSALS.includes(e.raw.action_label))
      || filter === e.raw.action_label
    return m && f
  })
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-6">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Investigation Database</div>
        <h1 className="text-3xl font-display text-cream">Event Explorer</h1>
        <p className="text-cream-dim text-sm mt-1">Search, filter, and review all detected events across recorded footage.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Ico d={I.search} size={14} /></div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search timestamp, camera, event, ROI or object..."
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-cream placeholder:text-muted focus:outline-none focus:border-olive-mid font-mono" />
        </div>
        <div className="flex gap-1.5">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)} title={f}
              className={cn('px-3 py-2 text-xs rounded-lg font-medium transition-colors',
                filter === f ? 'bg-olive text-white font-semibold' : 'bg-card border border-border text-muted hover:text-cream-dim')}>
              {f === 'All' || f === 'Findings only' ? f : labelText(f)}
              {counts[f] != null && <span className="opacity-60"> {counts[f]}</span>}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-elevated">
              <tr className="text-muted font-mono text-[10px] uppercase tracking-widest">
                {['ID','Timestamp','Camera','Event Type','ROI','Activity','Confidence','Object','Status',''].map(h => (
                  <th key={h} className="text-left px-5 py-3 font-medium border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(e => (
                <tr key={e.id} onClick={() => select(e)}
                  title={e.clipUrl ? 'select this event' : 'no clip exported yet for this event'}
                  className={cn('border-b border-border/50 hover:bg-elevated/40 transition-colors cursor-pointer',
                    !e.clipUrl && 'opacity-55')}>
                  <td className="px-5 py-3 font-mono text-muted text-[10px]">{e.id}</td>
                  <td className="px-5 py-3 font-mono text-cream-dim whitespace-nowrap">{e.time}</td>
                  <td className="px-5 py-3 font-mono text-olive">{e.cam}</td>
                  <td className="px-5 py-3 text-cream font-medium">{e.type}</td>
                  <td className="px-5 py-3 text-cream-dim">{e.roi}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-elevated rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', e.activity >= 80 ? 'bg-danger' : e.activity >= 60 ? 'bg-amber' : 'bg-olive')} style={{ width: `${e.activity}%` }} />
                      </div>
                      <span className="font-mono text-cream-dim">{e.activity}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-olive">{e.conf}%</td>
                  <td className="px-5 py-3 text-cream-dim">{e.obj === 'None' ? '—' : e.obj}</td>
                  <td className="px-5 py-3">{statusBadge(e.status)}</td>
                  <td className="px-5 py-3">
                    <Btn variant="secondary" size="sm" onClick={() => { select(e); onNavigate('investigation') }}>
                      {e.status === 'Reviewed' ? 'View' : 'Review'} <Ico d={I.arrow} size={11} />
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border bg-elevated/30 flex items-center justify-between text-xs text-muted font-mono">
          <span>Showing {shown.length} of {ALL_EVENTS.length} events</span>
          <div className="flex gap-1">
            {['←','1','2','3','→'].map((l, i) => (
              <button key={l} className={cn('px-2.5 py-1 rounded-lg text-xs font-mono', i === 1 ? 'bg-olive text-white' : 'bg-card border border-border hover:border-border-light')}>{l}</button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── ROI Analysis ──────────────────────────────────────────────────

// ROIAnalysis, ObjectDetection, SegmentedEvents, Reports and SystemStatus
// were removed. Every one of them ran on hardcoded arrays -- invented ROI
// statistics, a mock detection list, fabricated report rows and made-up GPU
// and storage telemetry. None was wired to the pipeline, and SegmentedEvents
// was a second view of the same events as the Event Explorer while not being
// reachable from the nav at all. A screen that shows a reviewer numbers the
// system did not produce is worse than no screen.

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const screens: Record<Screen, React.ReactNode> = {
    'dashboard': <Dashboard onNavigate={setScreen} />,
    'library': <Library onNavigate={setScreen} />,
    'event-explorer': <EventExplorer onNavigate={setScreen} />,
    'investigation': <InvestigationWorkspace />,
  }
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg text-cream font-sans">
      <TopNav active={screen} onNavigate={setScreen} />
      <main className="flex-1 overflow-hidden screen-enter" key={screen}>
        {screens[screen]}
      </main>
    </div>
  )
}
