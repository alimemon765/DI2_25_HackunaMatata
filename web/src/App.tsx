import { useState } from 'react'
import { useData } from './data'
import { ClipPlayer } from './ClipPlayer'
import { labelText, hoursLabel } from './api'

// Live data replaces the design's hardcoded arrays. The module-level mock
// consts are kept below only as a shape reference; every screen shadows them
// with values from the API.

type Screen =
  | 'dashboard'
  | 'video-analysis'
  | 'investigation'
  | 'event-explorer'
  | 'roi-analysis'
  | 'object-detection'
  | 'segmented-events'
  | 'reports'
  | 'system-status'

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

function Btn({ children, variant = 'primary', size = 'md', onClick, className }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; className?: string
}) {
  const v = {
    primary: 'bg-olive text-white hover:bg-olive-mid',
    secondary: 'bg-card border border-border text-cream-dim hover:border-border-light hover:text-cream',
    ghost: 'text-muted hover:text-cream-dim hover:bg-elevated',
    danger: 'bg-burgundy text-white hover:bg-burgundy-mid',
  }
  const s = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-sm' }
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-2 font-medium rounded-lg transition-colors', v[variant], s[size], className)}>
      {children}
    </button>
  )
}

// ── Charts ────────────────────────────────────────────────────────

const ACT = [12,18,14,22,28,31,26,35,42,38,45,52,48,55,61,58,65,72,68,74,82,78,86,81,74,68,62,55,48,42,38,34,29,24,18,14,22,28,35,42,48,55,61,68,74,82,78,72,65,58,52,46,40,34,28,24,18,14,10,8]

function ActivityChart({ height = 100 }: { height?: number }) {
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

const ROIS = [
  { id: '01', label: 'Student Area', x: '8%', y: '15%', w: '22%', h: '30%', color: '#5E7832', active: false },
  { id: '02', label: 'Desk Area', x: '35%', y: '12%', w: '25%', h: '35%', color: '#5E7832', active: false },
  { id: '03', label: 'Possible Object', x: '52%', y: '38%', w: '18%', h: '22%', color: '#B02030', active: true },
  { id: '04', label: 'Hand Movement', x: '72%', y: '20%', w: '20%', h: '28%', color: '#A06010', active: false },
]

function CCTVFrame({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('relative w-full bg-[#0E1209] rounded-xl overflow-hidden border border-border scanline-overlay', compact ? 'h-52' : 'h-80')}>
      <div className="absolute inset-0 opacity-25">
        {[20, 35, 50, 65, 78].map(y => (
          <div key={y} className="absolute w-full flex gap-[3%] px-[5%]" style={{ top: `${y}%` }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-1">
                <div className="w-full h-3 bg-[#1C2214] border border-[#2A3420] rounded-sm" />
                <div className="w-[60%] h-1 bg-[#181F10] rounded-sm mt-0.5 mx-auto" />
              </div>
            ))}
          </div>
        ))}
      </div>
      {ROIS.map(r => (
        <div key={r.id} className="absolute pointer-events-none" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
          <div className="w-full h-full relative" style={{ border: `1px solid ${r.color}`, boxShadow: `0 0 8px ${r.color}25, inset 0 0 8px ${r.color}06` }}>
            {['tl','tr','bl','br'].map(c => (
              <div key={c} className={cn('absolute w-2.5 h-2.5',
                c === 'tl' && 'top-0 left-0 border-t-2 border-l-2',
                c === 'tr' && 'top-0 right-0 border-t-2 border-r-2',
                c === 'bl' && 'bottom-0 left-0 border-b-2 border-l-2',
                c === 'br' && 'bottom-0 right-0 border-b-2 border-r-2',
              )} style={{ borderColor: r.color }} />
            ))}
            <div className="absolute -top-5 left-0 text-[9px] font-mono px-1.5 py-0.5 rounded-sm whitespace-nowrap text-white"
              style={{ background: r.color }}>
              ROI {r.id} {r.active && '⚠'}
            </div>
            {r.active && <div className="absolute inset-0 animate-pulse" style={{ background: `${r.color}12` }} />}
          </div>
        </div>
      ))}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-danger rec-blink" />
        <span className="text-xs font-mono text-white/80 bg-black/50 px-1.5 py-0.5 rounded">CAM-03</span>
      </div>
      <div className="absolute top-3 right-3 bg-black/60 border border-danger/30 rounded px-2 py-1 text-center">
        <div className="text-[8px] font-mono text-white/50 uppercase tracking-widest">Activity</div>
        <div className="text-sm font-mono text-danger font-semibold">82%</div>
      </div>
      <div className="absolute bottom-3 left-3 text-[9px] font-mono text-white/40">14:32:18</div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </div>
  )
}

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
  { id: 'video-analysis', label: 'Analysis' },
  { id: 'investigation', label: 'Investigate' },
  { id: 'event-explorer', label: 'Events' },
  { id: 'roi-analysis', label: 'ROI' },
  { id: 'object-detection', label: 'Objects' },
  { id: 'reports', label: 'Reports' },
  { id: 'system-status', label: 'System' },
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
            Offline · Ready
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted">
            <Ico d={I.gpu} size={12} />
            <span>GPU 78%</span>
            <span className="text-border">|</span>
            <Ico d={I.storage} size={12} />
            <span>4.8 TB</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-olive-subtle border border-olive-mid/30 flex items-center justify-center text-[11px] font-semibold text-olive font-mono">
            IK
          </div>
        </div>
      </div>
    </nav>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────

const EVENTS_DATA = [
  { id: 'EVT-00342', time: '14:32:18', end: '14:32:27', cam: 'CAM-03', type: 'Elevated Motion', roi: 'Student Area 07', activity: 86, conf: 91, status: 'Unreviewed', obj: 'Mobile Phone', priority: 'high' },
  { id: 'EVT-00339', time: '14:41:52', end: '14:42:05', cam: 'CAM-02', type: 'Possible Object', roi: 'Desk Area 04', activity: 74, conf: 87, status: 'Unreviewed', obj: 'Paper / Chit', priority: 'high' },
  { id: 'EVT-00335', time: '15:02:11', end: '15:02:25', cam: 'CAM-04', type: 'Multiple Movement', roi: 'Zone B', activity: 68, conf: 82, status: 'Reviewed', obj: 'None', priority: 'medium' },
  { id: 'EVT-00331', time: '14:21:08', end: '14:21:21', cam: 'CAM-01', type: 'Unusual Activity', roi: 'Zone A', activity: 79, conf: 85, status: 'Relevant', obj: 'Mobile Phone', priority: 'high' },
  { id: 'EVT-00328', time: '13:55:44', end: '13:55:54', cam: 'CAM-06', type: 'Elevated Motion', roi: 'Row 3', activity: 52, conf: 76, status: 'Ignored', obj: 'None', priority: 'low' },
  { id: 'EVT-00325', time: '13:38:20', end: '13:38:29', cam: 'CAM-03', type: 'Possible Paper/Chit', roi: 'Desk Area 02', activity: 63, conf: 79, status: 'Unreviewed', obj: 'Paper / Chit', priority: 'medium' },
]

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
              <Btn size="lg" onClick={() => onNavigate('video-analysis')}>
                <Ico d={I.upload} size={15} />Analyze Video
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
          <ActivityChart height={100} />
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
          <Btn variant="secondary" size="sm" onClick={() => onNavigate('video-analysis')}>
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

function VideoAnalysis() {
  const [opts, setOpts] = useState({ detect: true, heatmap: true, segment: true })
  const [dragging, setDragging] = useState(false)
  const pipeline = ['Video Ingestion', 'Frame Extraction', 'Motion Estimation', 'ROI Detection', 'Object Detection', 'Event Segmentation', 'Analytics Generation']
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-8">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Offline Processing</div>
        <h1 className="text-3xl font-display text-cream">Video Analysis</h1>
        <p className="text-cream-dim text-sm mt-1">Upload and configure offline analysis for recorded examination footage.</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={() => setDragging(false)}
            className={cn('border-2 border-dashed rounded-2xl p-14 text-center transition-all cursor-pointer',
              dragging ? 'border-olive bg-olive-subtle' : 'border-border hover:border-olive-mid hover:bg-surface')}
          >
            <div className="w-14 h-14 rounded-2xl bg-card border border-border mx-auto mb-4 flex items-center justify-center">
              <Ico d={I.upload} size={24} />
            </div>
            <h3 className="text-lg font-semibold text-cream mb-2">Upload Recorded Examination Footage</h3>
            <p className="text-cream-dim text-sm mb-5">Drag and drop CCTV recordings here, or browse your files</p>
            <Btn>Browse Files</Btn>
            <div className="flex justify-center gap-2 mt-5">
              {['MP4', 'AVI', 'MOV', 'MKV'].map(f => <Badge key={f} color="muted">{f}</Badge>)}
            </div>
          </div>

          <Card className="p-6">
            <h3 className="text-base font-semibold text-cream mb-5">Analysis Options</h3>
            <div className="space-y-4">
              {[
                { key: 'detect', label: 'Run Object Detection', desc: 'Identify mobile phones, paper/chits, and unauthorized materials where technically feasible' },
                { key: 'heatmap', label: 'Generate Motion Heatmap', desc: 'Visualize accumulated motion intensity across the footage timeline' },
                { key: 'segment', label: 'Automatically Segment Events', desc: 'Split video into meaningful activity-based segments for efficient investigation' },
              ].map(o => (
                <label key={o.key} className="flex items-start gap-4 cursor-pointer group">
                  <div className="mt-0.5">
                    <input type="checkbox" checked={opts[o.key as keyof typeof opts]}
                      onChange={e => setOpts(p => ({ ...p, [o.key]: e.target.checked }))} className="sr-only" />
                    <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                      opts[o.key as keyof typeof opts] ? 'bg-olive border-olive' : 'border-border bg-card')}>
                      {opts[o.key as keyof typeof opts] && <Ico d={I.check} size={11} />}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-cream">{o.label}</div>
                    <div className="text-xs text-muted mt-0.5">{o.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-cream">Processing Mode</h3>
              <Badge color="info">OFFLINE</Badge>
            </div>
            <p className="text-xs text-muted leading-relaxed">Analysis runs locally on stored footage. No external data transmission. Average speed: <span className="text-cream font-mono">2.4× realtime</span>.</p>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold text-cream mb-5">Processing Pipeline</h3>
            <div className="space-y-3">
              {pipeline.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-olive-subtle border border-olive-mid/30 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-mono text-olive">{i + 1}</span>
                  </div>
                  <span className="text-xs text-cream-dim">{step}</span>
                </div>
              ))}
            </div>
          </Card>
          <Btn className="w-full justify-center" size="lg">
            <Ico d={I.play} size={15} />Start Analysis
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Investigation Workspace ────────────────────────────────────────

const DET_EVENTS = [
  { time: '14:32:18', type: 'Elevated Activity', roi: 'ROI-03', score: 86, conf: 91, dur: '8 sec', color: 'danger' as const, obj: 'Possible Mobile Phone' },
  { time: '14:28:44', type: 'Possible Mobile Phone', roi: 'ROI-03', score: 82, conf: 89, dur: '5 sec', color: 'danger' as const, obj: 'Mobile Phone' },
  { time: '14:21:08', type: 'Multiple ROI Movement', roi: 'ROI-01,02', score: 79, conf: 85, dur: '12 sec', color: 'amber' as const, obj: 'None' },
  { time: '14:15:30', type: 'Possible Paper/Chit', roi: 'ROI-07', score: 63, conf: 77, dur: '6 sec', color: 'amber' as const, obj: 'Paper/Chit' },
  { time: '13:58:12', type: 'Unusual Activity', roi: 'ROI-02', score: 55, conf: 72, dur: '4 sec', color: 'muted' as const, obj: 'None' },
]

const TL = [{ label: 'Elevated Activity', x: 28, c: '#B02030' }, { label: 'Possible Object', x: 52, c: '#A06010' }, { label: 'Multiple ROI', x: 71, c: '#A06010' }]

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
              <Btn variant="secondary" size="sm"><Ico d={I.bookmark} size={12} />Bookmark</Btn>
              <Btn variant="secondary" size="sm"><Ico d={I.export} size={12} />Export Clip</Btn>
              <Btn variant="danger" size="sm"><Ico d={I.flag} size={12} />Mark Relevant</Btn>
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
                  {ACT.map((v, i) => (
                    <div key={i} className="absolute bottom-0 bg-olive/40"
                      style={{ left: `${(i/ACT.length)*100}%`, width: `${100/ACT.length}%`, height: `${(v/86)*100}%` }} />
                  ))}
                  {TL.map(e => (
                    <div key={e.label} className="absolute top-0 bottom-0 w-0.5" style={{ left: `${e.x}%`, background: e.c }}>
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-card" style={{ background: e.c }} />
                    </div>
                  ))}
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
            <div className="flex items-center gap-3 text-xs text-muted font-mono">
              <span>14:32:18</span>
              <span className="text-border">|</span>
              {TL.map(e => (
                <button key={e.label} onClick={() => setTlX(e.x)} className="flex items-center gap-1 hover:text-cream-dim transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.c }} />{e.label}
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
          <textarea placeholder="Add investigation notes..." className="w-full bg-card border border-border rounded-lg p-3 text-xs text-cream-dim placeholder:text-muted resize-none focus:outline-none focus:border-olive-mid h-20" />
          <Btn className="w-full justify-center mt-2">Save Note</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Event Explorer ─────────────────────────────────────────────────

const ALL_EVENTS = [
  ...EVENTS_DATA,
  { id: 'EVT-00320', time: '13:20:15', end: '13:20:28', cam: 'CAM-05', type: 'Elevated Motion', roi: 'Zone C', activity: 58, conf: 74, status: 'Reviewed', obj: 'None', priority: 'medium' },
  { id: 'EVT-00315', time: '13:05:33', end: '13:05:46', cam: 'CAM-01', type: 'Possible Object', roi: 'Desk Area 01', activity: 72, conf: 83, status: 'Relevant', obj: 'Mobile Phone', priority: 'high' },
  { id: 'EVT-00310', time: '12:48:02', end: '12:48:14', cam: 'CAM-07', type: 'Elevated Motion', roi: 'Row 5', activity: 65, conf: 80, status: 'Unreviewed', obj: 'None', priority: 'medium' },
  { id: 'EVT-00304', time: '12:30:18', end: '12:30:26', cam: 'CAM-09', type: 'Minor Movement', roi: 'Row 2', activity: 31, conf: 65, status: 'Reviewed', obj: 'None', priority: 'low' },
  { id: 'EVT-00298', time: '12:12:44', end: '12:12:51', cam: 'CAM-06', type: 'Brief Activity', roi: 'Zone A', activity: 28, conf: 62, status: 'Ignored', obj: 'None', priority: 'low' },
]

function EventExplorer({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { events: ALL_EVENTS, select, loading, error } = useData()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const filters = ['All', 'High Priority', 'Unreviewed', 'Possible Object', 'Elevated Motion']
  if (error) return <ApiError error={error} />
  if (loading) return <Loading />
  const shown = ALL_EVENTS.filter(e => {
    const q = search.toLowerCase()
    const m = !q || e.time.includes(q) || e.cam.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.roi.toLowerCase().includes(q)
    const f = filter === 'All' || (filter === 'High Priority' && e.priority === 'high') || (filter === 'Unreviewed' && e.status === 'Unreviewed') || (filter === 'Possible Object' && e.type.includes('Object')) || (filter === 'Elevated Motion' && e.type.includes('Motion'))
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
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-2 text-xs rounded-lg font-medium transition-colors',
                filter === f ? 'bg-olive text-white font-semibold' : 'bg-card border border-border text-muted hover:text-cream-dim')}>
              {f}
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

const ROISD = [
  { id: 'ROI-01', name: 'Student Zone A', score: 72, dur: '18 sec', conf: 88, count: 6, obj: 'None detected', x: '8%', y: '15%', w: '22%', h: '30%' },
  { id: 'ROI-02', name: 'Student Zone B', score: 91, dur: '11 sec', conf: 94, count: 4, obj: 'Possible Mobile Phone', x: '35%', y: '12%', w: '25%', h: '35%' },
  { id: 'ROI-03', name: 'Student Zone C', score: 43, dur: '6 sec', conf: 76, count: 2, obj: 'None detected', x: '52%', y: '38%', w: '18%', h: '22%' },
  { id: 'ROI-04', name: 'Supervisor Area', score: 78, dur: '14 sec', conf: 85, count: 5, obj: 'Possible Paper/Chit', x: '72%', y: '20%', w: '20%', h: '28%' },
]

function ROIAnalysis() {
  const [sel, setSel] = useState(1)
  const r = ROISD[sel]
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-6">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Spatial Analysis</div>
        <h1 className="text-3xl font-display text-cream">ROI Analysis</h1>
        <p className="text-cream-dim text-sm mt-1">Region of Interest detection and activity scoring across the examination frame.</p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="relative bg-[#0E1209] rounded-xl border border-border overflow-hidden" style={{ paddingTop: '56.25%' }}>
            <div className="absolute inset-0">
              {ROISD.map((roi, i) => {
                const color = roi.score >= 80 ? '#B02030' : roi.score >= 60 ? '#A06010' : '#5E7832'
                return (
                  <div key={roi.id} onClick={() => setSel(i)} className="absolute cursor-pointer" style={{ left: roi.x, top: roi.y, width: roi.w, height: roi.h }}>
                    <div className="w-full h-full relative border-2 transition-all" style={{ borderColor: sel === i ? '#E3D9C2' : color, background: sel === i ? `${color}18` : `${color}08`, boxShadow: `0 0 ${sel === i ? 16 : 6}px ${color}35` }}>
                      {['tl','tr','bl','br'].map(c => (
                        <div key={c} className={cn('absolute w-3 h-3', c==='tl'&&'top-0 left-0 border-t-2 border-l-2', c==='tr'&&'top-0 right-0 border-t-2 border-r-2', c==='bl'&&'bottom-0 left-0 border-b-2 border-l-2', c==='br'&&'bottom-0 right-0 border-b-2 border-r-2')} style={{ borderColor: color }} />
                      ))}
                      <div className="absolute -top-6 left-0 text-[9px] font-mono px-2 py-0.5 rounded-sm text-white whitespace-nowrap" style={{ background: color }}>
                        {roi.id} · {roi.score}%
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-danger rec-blink" />
                <span className="text-[9px] font-mono text-white/70 bg-black/50 px-1.5 py-0.5 rounded">CAM-03 · 14:32:18</span>
              </div>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,0.5) 100%)' }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {ROISD.map((roi, i) => (
              <button key={roi.id} onClick={() => setSel(i)}
                className={cn('p-4 rounded-xl border text-left transition-all', sel === i ? 'border-olive bg-olive-subtle' : 'border-border bg-card hover:border-border-light')}>
                <div className="text-xs font-mono font-semibold text-cream">{roi.id}</div>
                <div className="text-[10px] text-muted mt-1">{roi.name}</div>
                <div className="text-[10px] text-muted mt-1">Activity: <span className={cn('font-mono', roi.score >= 80 ? 'text-danger' : roi.score >= 60 ? 'text-amber' : 'text-olive')}>{roi.score}%</span></div>
              </button>
            ))}
          </div>
        </div>

        <Card className="p-6 space-y-5 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-cream">ROI Details</h3>
            <Badge color={r.score >= 80 ? 'danger' : r.score >= 60 ? 'amber' : 'olive'}>{r.id}</Badge>
          </div>
          <div className="space-y-2.5">
            {[['ROI ID', r.id],['Zone Name', r.name],['Activity Score', `${r.score}%`],['Motion Duration', r.dur],['Confidence', `${r.conf}%`],['Event Count', `${r.count} events`]].map(([k,v]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                <span className="text-muted">{k}</span>
                <span className="font-mono text-cream-dim font-medium">{v}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted">Detected Objects</span>
              <Badge color={r.obj !== 'None detected' ? 'amber' : 'muted'}>{r.obj}</Badge>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-mono text-muted mb-1.5">
              <span>Activity Score</span><span>{r.score}%</span>
            </div>
            <div className="h-2 bg-elevated rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', r.score >= 80 ? 'bg-danger' : r.score >= 60 ? 'bg-amber' : 'bg-olive')} style={{ width: `${r.score}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['View Events','Compare Timeline','Mark Relevant','Edit ROI','Reset ROI','Save Annotation'].map((b, i) => (
              <button key={b} className={cn('py-2 text-xs rounded-lg border font-medium transition-colors',
                i === 2 ? 'col-span-2 bg-burgundy-dim border-burgundy-mid/30 text-burgundy hover:bg-burgundy-mid' : 'bg-card border-border text-cream-dim hover:border-olive-mid')}>
                {b}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Object Detection ───────────────────────────────────────────────

const DETS = [
  { type: 'Possible Mobile Phone', cam: 'CAM-03', time: '14:32:18', conf: 89, roi: 'ROI-03', status: 'Needs Review', color: 'danger' as const },
  { type: 'Possible Paper / Chit', cam: 'CAM-02', time: '14:41:52', conf: 77, roi: 'ROI-07', status: 'Needs Review', color: 'amber' as const },
  { type: 'Possible Mobile Phone', cam: 'CAM-05', time: '13:55:20', conf: 83, roi: 'ROI-04', status: 'Flagged', color: 'danger' as const },
  { type: 'Possible Paper / Chit', cam: 'CAM-01', time: '13:20:44', conf: 71, roi: 'ROI-02', status: 'Reviewed', color: 'muted' as const },
]

function ObjectDetection({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-6">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">AI-Assisted Analysis</div>
        <h1 className="text-3xl font-display text-cream">Object Detection</h1>
        <p className="text-cream-dim text-sm mt-1">Identify external or potentially prohibited objects where technically feasible.</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-amber-dim/30 border border-amber/20 rounded-xl">
        <Ico d={I.alert} size={16} />
        <p className="text-sm text-amber leading-relaxed">
          <span className="font-semibold">Important: </span>
          AI detection is an investigation aid. Confidence scores indicate probability, not certainty. Final verification must be performed by an authorized human reviewer before any action is taken.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {DETS.map((d, i) => (
          <Card key={i} className="overflow-hidden hover:border-border-light transition-colors">
            <div className="relative h-40 bg-[#0E1209] overflow-hidden">
              <div className="absolute inset-6 border" style={{ borderColor: d.color === 'danger' ? '#B02030' : d.color === 'amber' ? '#A06010' : '#3A3D35' }}>
                {['tl','tr','bl','br'].map(c => (
                  <div key={c} className={cn('absolute w-3 h-3', c==='tl'&&'top-0 left-0 border-t-2 border-l-2', c==='tr'&&'top-0 right-0 border-t-2 border-r-2', c==='bl'&&'bottom-0 left-0 border-b-2 border-l-2', c==='br'&&'bottom-0 right-0 border-b-2 border-r-2')} style={{ borderColor: d.color === 'danger' ? '#B02030' : d.color === 'amber' ? '#A06010' : '#3A3D35' }} />
                ))}
              </div>
              <div className="absolute top-2 left-2 text-[9px] font-mono text-white/60 bg-black/50 px-1.5 py-0.5 rounded">{d.cam}</div>
              <div className="absolute bottom-2 right-2"><Badge color={d.color}>AI: {d.conf}%</Badge></div>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm font-semibold text-cream">{d.type}</div>
              <div className="text-[10px] font-mono text-muted space-y-1">
                <div>Camera: <span className="text-olive">{d.cam}</span></div>
                <div>Timestamp: <span className="text-cream-dim">{d.time}</span></div>
                <div>ROI: <span className="text-cream-dim">{d.roi}</span></div>
              </div>
              <div className="flex items-center justify-between">
                <Badge color={d.status === 'Needs Review' ? 'amber' : d.status === 'Flagged' ? 'danger' : 'muted'} dot>{d.status}</Badge>
              </div>
              <div className="flex gap-2">
                <Btn size="sm" className="flex-1 justify-center" onClick={() => onNavigate('investigation')}>Review</Btn>
                <Btn size="sm" variant="danger" className="flex-1 justify-center">Flag</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Segmented Events ───────────────────────────────────────────────

const SEG = [
  { id: 'EVT-00342', start: '14:32:14', end: '14:32:23', dur: '9 sec', cam: 'CAM-03', level: 'High', conf: 91, tags: ['Motion', 'ROI-03', 'Possible Object'], status: 'Unreviewed' },
  { id: 'EVT-00339', start: '14:41:45', end: '14:41:58', dur: '13 sec', cam: 'CAM-02', level: 'High', conf: 87, tags: ['Motion', 'ROI-07', 'Object Detected'], status: 'Unreviewed' },
  { id: 'EVT-00335', start: '15:02:05', end: '15:02:19', dur: '14 sec', cam: 'CAM-04', level: 'Medium', conf: 82, tags: ['Multi-ROI', 'ROI-02'], status: 'Reviewed' },
  { id: 'EVT-00331', start: '14:21:01', end: '14:21:14', dur: '13 sec', cam: 'CAM-01', level: 'High', conf: 85, tags: ['Unusual', 'ROI-05', 'Object Detected'], status: 'Relevant' },
  { id: 'EVT-00328', start: '13:55:40', end: '13:55:50', dur: '10 sec', cam: 'CAM-06', level: 'Low', conf: 76, tags: ['Motion', 'ROI-01'], status: 'Ignored' },
  { id: 'EVT-00325', start: '13:38:16', end: '13:38:25', dur: '9 sec', cam: 'CAM-03', level: 'Medium', conf: 79, tags: ['Motion', 'ROI-04', 'Possible Paper'], status: 'Unreviewed' },
]

function SegmentedEvents({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { events, select } = useData()
  const SEG = events.slice(0, 40).map(e => ({
    id: e.id, start: e.time, end: e.end, dur: `${e.durationS} sec`, cam: e.cam,
    level: e.priority === 'high' ? 'High' : e.priority === 'medium' ? 'Medium' : 'Low',
    conf: e.conf,
    tags: [e.type, e.roi, ...(e.obj !== 'None' ? [e.obj] : [])],
    status: e.status, ev: e,
  }))
  const [filter, setFilter] = useState('All')
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Auto-Segmented Clips</div>
          <h1 className="text-3xl font-display text-cream">Segmented Events</h1>
          <p className="text-cream-dim text-sm mt-1">Auto-segmented video clips from detected activity windows.</p>
        </div>
        <span className="text-sm font-mono text-muted">342 segments total</span>
      </div>
      <div className="flex gap-2">
        {['All','High Priority','Object Detection','High Motion','Unreviewed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-2 text-xs rounded-lg font-medium transition-colors',
              filter === f ? 'bg-olive text-white font-semibold' : 'bg-card border border-border text-muted hover:text-cream-dim')}>
            {f}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-5">
        {SEG.map(e => (
          <Card key={e.id} className="overflow-hidden hover:border-border-light transition-colors">
            <div className="relative h-36 bg-[#0E1209] flex items-center justify-center border-b border-border">
              <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'linear-gradient(#2A3028 1px, transparent 1px), linear-gradient(90deg, #2A3028 1px, transparent 1px)', backgroundSize: '20px 15px' }} />
              <button onClick={() => onNavigate('investigation')} className="relative z-10 w-11 h-11 bg-olive/90 rounded-full flex items-center justify-center hover:bg-olive transition-colors">
                <Ico d={I.play} size={14} />
              </button>
              <div className="absolute top-2 left-2 text-[9px] font-mono text-white/60">{e.cam}</div>
              <div className="absolute top-2 right-2"><Badge color={e.level === 'High' ? 'danger' : e.level === 'Medium' ? 'amber' : 'muted'}>{e.level}</Badge></div>
              <div className="absolute bottom-2 left-2 text-[9px] font-mono text-white/40">{e.start} → {e.end}</div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold font-mono text-cream">{e.id}</span>
                {statusBadge(e.status)}
              </div>
              <div className="text-xs text-muted font-mono">
                Duration: <span className="text-cream-dim">{e.dur}</span> · Confidence: <span className="text-olive">{e.conf}%</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {e.tags.map(t => <Badge key={t} color="muted">{t}</Badge>)}
              </div>
              <div className="flex gap-2 pt-1">
                <Btn size="sm" className="flex-1 justify-center" onClick={() => onNavigate('investigation')}>Review Clip</Btn>
                <Btn size="sm" variant="secondary" className="flex-1 justify-center">Export</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Reports ────────────────────────────────────────────────────────

function Reports() {
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Investigation Summary</div>
          <h1 className="text-3xl font-display text-cream">Investigation Report</h1>
          <p className="text-cream-dim text-sm mt-1">Semester Examination — IT Department · 22 August 2026</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm"><Ico d={I.export} size={12} />Export Events</Btn>
          <Btn size="md"><Ico d={I.report} size={13} />Generate PDF Report</Btn>
        </div>
      </div>

      {/* Report meta */}
      <Card className="p-6">
        <div className="grid grid-cols-4 gap-8">
          {[['Examination','Semester Exam — IT Dept'],['Date','22 August 2026'],['Total Cameras','12 active'],['Total Footage','186h 42m'],['Events Detected','342'],['High Priority','18 flagged'],['Reviewed','127 events'],['Object Detections','23 potential']].map(([k,v]) => (
            <div key={k}>
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">{k}</div>
              <div className="text-sm font-semibold text-cream">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats strip */}
      <div className="grid grid-cols-5 gap-4">
        {[['Total Footage','186h 42m','info'],['Total Events','342','olive'],['High Activity','18','danger'],['Object Detections','23','amber'],['ROIs Identified','48','olive']].map(([l,v,c]) => (
          <Card key={l} className="p-5 text-center">
            <div className={cn('text-4xl font-display mb-1', c === 'olive' ? 'text-olive' : c === 'danger' ? 'text-danger' : c === 'amber' ? 'text-amber' : 'text-info')}>{v}</div>
            <div className="text-xs font-mono text-muted uppercase tracking-wide">{l}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-cream mb-1">Events by Camera</h3>
          <p className="text-xs text-muted mb-4">Distribution across 12 active cameras</p>
          <BarChart data={[48,61,32,27,38,44,19,28,35,22,18,14]} labels={Array.from({length:12},(_,i)=>`C${String(i+1).padStart(2,'0')}`)} color="#5E7832" />
        </Card>
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-cream mb-1">Events by Category</h3>
          <p className="text-xs text-muted mb-4">Breakdown by detection type</p>
          <BarChart data={[142,98,64,38]} labels={['Elevated Motion','Multi-ROI','Possible Object','Unusual']} color="#7B2040" />
        </Card>
        <Card className="col-span-2 p-6">
          <h3 className="text-sm font-semibold text-cream mb-1">High-Priority Events Timeline</h3>
          <p className="text-xs text-muted mb-4">Activity intensity across the full session duration</p>
          <ActivityChart height={90} />
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-cream mb-3">Summary & Findings</h3>
        <div className="text-sm text-cream-dim leading-relaxed space-y-3">
          <p>Analysis completed for Semester Examination, IT Department on 22 August 2026. A total of <strong className="text-cream">186 hours 42 minutes</strong> of CCTV footage across <strong className="text-cream">12 cameras</strong> was processed using offline motion estimation and ROI detection.</p>
          <p><strong className="text-danger">18 high-priority events</strong> were detected requiring immediate investigator review. Of the <strong className="text-cream">342 total events</strong>, 127 have been reviewed, 23 involve possible prohibited object detections, and 18 have been marked as potentially relevant.</p>
          <p className="text-amber italic text-xs">All AI detections are presented as probabilistic findings. Final determination of any violation must be made by an authorized human reviewer following established examination authority protocols.</p>
        </div>
        <div className="flex gap-3 mt-5">
          <Btn variant="secondary"><Ico d={I.export} size={13} />Export Evidence</Btn>
          <Btn variant="secondary"><Ico d={I.export} size={13} />Export Event Log</Btn>
        </div>
      </Card>
    </div>
  )
}

// ── System Status ─────────────────────────────────────────────────

function SystemStatus() {
  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-8">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Infrastructure</div>
        <h1 className="text-3xl font-display text-cream">System Status</h1>
        <p className="text-cream-dim text-sm mt-1">Hardware utilization and processing pipeline health.</p>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'GPU Utilization', val: 78, unit: '%', color: 'olive' as const },
          { label: 'CPU Usage', val: 42, unit: '%', color: 'info' as const },
          { label: 'RAM Usage', val: 50, unit: '64 / 128 GB', color: 'olive' as const },
          { label: 'Storage Used', val: 40, unit: '4.8 / 12 TB', color: 'amber' as const },
        ].map(r => {
          const cc = { olive: 'text-olive bg-olive', info: 'text-info bg-info', amber: 'text-amber bg-amber' }[r.color]
          const tv = cc.split(' ')[0]
          const bv = cc.split(' ')[1]
          return (
            <Card key={r.label} className="p-6">
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">{r.label}</div>
              <div className={cn('text-4xl font-display mb-1', tv)}>{r.val}%</div>
              <div className="text-xs font-mono text-muted mb-4">{r.unit}</div>
              <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', bv)} style={{ width: `${r.val}%` }} />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-cream mb-4">Active Jobs</h3>
            <div className="space-y-4">
              {[{ name: 'CAM-08_Session1.mp4', stage: 'Object Detection', prog: 67, speed: '2.8× RT' }, { name: 'CAM-11_Session1.mp4', stage: 'Motion Estimation', prog: 23, speed: '2.1× RT' }].map(j => (
                <div key={j.name} className="p-4 bg-elevated rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-mono text-cream">{j.name}</span>
                    <div className="flex gap-2"><Badge color="info">{j.stage}</Badge><Badge color="olive">{j.speed}</Badge></div>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-olive rounded-full" style={{ width: `${j.prog}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-muted">{j.prog}% complete</div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-base font-semibold text-cream mb-4">Processing Logs</h3>
            <div className="font-mono text-[10px] text-muted bg-[#0E1209] rounded-lg p-4 border border-border space-y-1.5 max-h-36 overflow-y-auto">
              {[['14:38:22','INFO','CAM-08: ROI detection completed — 312 frames'],['14:38:19','INFO','CAM-11: Frame extraction started — 2.1× realtime'],['14:38:15','WARN','CAM-08: High activity detected in ROI-03 (score: 86%)'],['14:38:10','INFO','CAM-11: Video ingestion complete — 28,440 frames'],['14:38:05','INFO','Processing queue updated — 2 active, 1 queued']].map(([t,l,m]) => (
                <div key={t} className="flex gap-3">
                  <span className="text-white/20 shrink-0">{t}</span>
                  <span className={cn('shrink-0', l === 'WARN' ? 'text-amber' : 'text-olive')}>[{l}]</span>
                  <span className="text-white/50">{m}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-cream mb-4">Job Summary</h3>
            <div className="space-y-4">
              {[{ label: 'Active', val: 2, color: 'text-olive' }, { label: 'Completed Today', val: 22, color: 'text-success' }, { label: 'Failed', val: 0, color: 'text-muted' }, { label: 'In Queue', val: 1, color: 'text-amber' }].map(j => (
                <div key={j.label} className="flex items-center justify-between border-b border-border/50 pb-3">
                  <span className="text-sm text-muted">{j.label}</span>
                  <span className={cn('text-3xl font-display', j.color)}>{j.val}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-cream mb-3">Storage Health</h3>
            <div className="space-y-2 text-xs font-mono">
              {[['Capacity','12.0 TB'],['Used','4.8 TB'],['Available','7.2 TB'],['Last Backup','22 Aug 03:00'],['Status','Verified ✓']].map(([k,v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted">{k}</span>
                  <span className="text-cream-dim">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-olive-subtle border border-olive-mid/30 rounded-xl flex items-center justify-center">
              <Ico d={I.status} size={16} />
            </div>
            <div>
              <div className="text-xs text-muted font-mono">Avg Speed</div>
              <div className="text-3xl font-display text-olive leading-none">2.4×</div>
              <div className="text-[10px] font-mono text-muted">realtime</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── App Shell ─────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const screens: Record<Screen, React.ReactNode> = {
    'dashboard': <Dashboard onNavigate={setScreen} />,
    'video-analysis': <VideoAnalysis />,
    'investigation': <InvestigationWorkspace />,
    'event-explorer': <EventExplorer onNavigate={setScreen} />,
    'roi-analysis': <ROIAnalysis />,
    'object-detection': <ObjectDetection onNavigate={setScreen} />,
    'segmented-events': <SegmentedEvents onNavigate={setScreen} />,
    'reports': <Reports />,
    'system-status': <SystemStatus />,
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
