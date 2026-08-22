import { useState } from 'react'
import { useData } from './data'
import { ClipPlayer } from './ClipPlayer'
import { labelText, hoursLabel, camLabel, debugImage, type UiEvent } from './api'

// Live data replaces the design's hardcoded arrays. The module-level mock
// consts are kept below only as a shape reference; every screen shadows them
// with values from the API.

type Screen =
  | 'videos'
  | 'analysis'
  | 'segment'

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
  { id: 'videos', label: 'Videos' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'segment', label: 'Segment' },
] as const

const SCREEN_TITLE: Record<Screen, string> = {
  'videos': 'Uploaded Recordings',
  'analysis': 'Analysis',
  'segment': 'Segment Detail',
}

const NAV_ICON: Record<Screen, string> = {
  'videos': I.video,
  'analysis': I.roi,
  'segment': I.search,
}

/** Single top bar with breadcrumb navigation. No sidebar: the flow is
 *  Videos -> Analysis -> Segment, and you move through it by drilling in and
 *  backing out, exactly as the reference layout does. */
function TopBar({ screen, onNavigate, video, segment, right }: {
  screen: Screen
  onNavigate: (s: Screen) => void
  video: string | null
  segment: string | null
  right: string
}) {
  const crumbs: { label: string; go?: () => void }[] = [
    { label: 'Videos', go: () => onNavigate('videos') },
  ]
  if (screen !== 'videos' && video) {
    crumbs.push({ label: camLabel(video), go: () => onNavigate('analysis') })
  }
  if (screen === 'segment' && segment) crumbs.push({ label: segment })

  return (
    <header className="h-14 shrink-0 bg-surface/95 backdrop-blur-sm border-b border-border flex items-center gap-5 px-6">
      <button onClick={() => onNavigate('videos')}
        className="flex items-center gap-2.5 shrink-0 group">
        <div className="w-7 h-7 bg-olive-subtle border border-olive-mid/30 rounded-lg flex items-center justify-center">
          <Ico d={I.layers} size={13} />
        </div>
        <div className="flex flex-col leading-none text-left">
          <span className="font-display text-base text-cream tracking-tight font-bold">REWIND</span>
          <span className="text-[9px] font-mono text-muted mt-0.5">Offline Examination Video Review</span>
        </div>
      </button>

      {screen !== 'videos' && (
        <button onClick={() => onNavigate(screen === 'segment' ? 'analysis' : 'videos')}
          className="text-xs font-mono text-muted hover:text-cream-dim flex items-center gap-1 shrink-0">
          <Ico d={I.chevronL} size={11} />Back
        </button>
      )}

      <nav className="flex items-center gap-2 text-xs font-mono min-w-0">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-border">/</span>}
            {c.go
              ? <button onClick={c.go} className="text-muted hover:text-cream-dim truncate">{c.label}</button>
              : <span className="text-cream truncate">{c.label}</span>}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs font-mono text-muted">{right}</span>
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          OFFLINE
        </div>
      </div>
    </header>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────

// Dashboard removed: the reference flow lands on the recording grid.


/** Renders an event's `evidence` object as-is. The shape genuinely varies by
 *  rule -- a phone event carries frame counts, a talking event a correlation
 *  and a lag, a transit event a displacement -- so this walks whatever is
 *  there rather than hard-coding fields and silently dropping the rest. */
function EvidencePanel({ event }: { event: UiEvent | null }) {
  if (!event) return <p className="text-xs text-muted">Select an event to see its evidence.</p>
  const ev = event.raw.evidence ?? {}
  const rule = String(ev['rule'] ?? '')
  const prose = ['note', 'caveat'] as const
  const skip = new Set<string>(['rule', ...prose])
  const rows = Object.entries(ev).filter(([k, v]) =>
    !skip.has(k) && v !== null && typeof v !== 'object')
  const also = ev['also_matched'] as { label: string; confidence: number }[] | undefined
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Signal that fired</div>
        <p className="text-xs text-cream-dim leading-relaxed">{rule || '—'}</p>
      </div>
      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[10px] font-mono text-muted truncate">{k.replace(/_/g, ' ')}</dt>
              <dd className="text-xs font-mono text-cream truncate">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {event.raw.stage1 && (
        <div>
          <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Stage 1 signal</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {Object.entries(event.raw.stage1).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] font-mono text-muted">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-xs font-mono text-cream">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {also?.length ? (
        <div>
          <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Other rules that also matched</div>
          <div className="flex flex-wrap gap-1.5">
            {also.map(a => <Badge key={a.label} color="muted">{labelText(a.label)} {a.confidence}</Badge>)}
          </div>
        </div>
      ) : null}
      {prose.map(k => ev[k] ? (
        <p key={k} className="text-[11px] text-muted leading-relaxed border-l-2 border-border pl-3">{String(ev[k])}</p>
      ) : null)}
    </div>
  )
}

function priorityCounts(evs: UiEvent[]) {
  return {
    high: evs.filter(e => e.priority === 'high').length,
    med: evs.filter(e => e.priority === 'medium').length,
    low: evs.filter(e => e.priority === 'low').length,
  }
}

/** Card grid of the processed recordings. Entry point of the review flow. */
function Library({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { events, stats, summary, setVideo, loading, error } = useData()
  if (error) return <ApiError error={error} />
  if (loading) return <Loading />

  const rows = Object.entries(stats ?? {})
    .filter(([, v]) => v && typeof v === 'object' && !('error' in v))
    .map(([video, v]: [string, any]) => {
      const evs = events.filter(e => e.raw.video === video)
      const p = priorityCounts(evs)
      return {
        video, stem: video.replace(/\.[^.]+$/, ''),
        seats: v.n_seats ?? 0, durationS: v.duration_s ?? 0,
        candidates: v.stage1_candidates ?? null,
        promoted: v.promoted_to_stage2 ?? null,
        pct: v.promoted_fraction_of_seat_seconds ?? null,
        fixtures: (v.fixtures ?? {}).n ?? null,
        scanS: v.elapsed_s ?? null,
        events: evs.length,
        findings: evs.filter(e => !['staff_or_transit','unclassified_anomaly'].includes(e.raw.action_label)).length,
        ...p,
      }
    })
    .sort((a, b) => b.durationS - a.durationS)

  const totalS = rows.reduce((a, r) => a + r.durationS, 0)

  return (
    <div className="overflow-y-auto h-full px-8 py-10 space-y-7">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Processed Library</div>
          <h1 className="text-3xl font-display text-cream">Recordings</h1>
          <p className="text-cream-dim text-sm mt-1">
            {rows.length} recordings · {hoursLabel(totalS)} analysed offline. Select one to review its events.
          </p>
        </div>
        <div className="text-xs font-mono text-muted">
          {events.length} events · {rows.reduce((a,r)=>a+r.findings,0)} findings
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {rows.map(r => (
          <button key={r.video}
            onClick={() => { setVideo(r.video); onNavigate('analysis') }}
            className="text-left group">
            <Card className="overflow-hidden border border-border hover:border-olive-mid/50 transition-colors">
              {/* Real Stage 1 render: discovered seats drawn on an actual frame. */}
              <div className="relative h-40 bg-[#0E1209] overflow-hidden">
                <img src={debugImage(`seats_${r.stem}.png`)} alt=""
                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                <div className="absolute top-2 left-2 flex gap-1.5">
                  <span className="text-[9px] font-mono text-white/85 bg-black/60 px-1.5 py-0.5 rounded">
                    {camLabel(r.video)}
                  </span>
                </div>
                <div className="absolute bottom-2 right-2">
                  <span className="text-[9px] font-mono text-white/85 bg-black/60 px-1.5 py-0.5 rounded">
                    {hoursLabel(r.durationS)}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge color="olive" dot>Analysis complete</Badge>
                  {r.findings > 0 && <Badge color="amber">{r.findings} findings</Badge>}
                </div>
                <div>
                  <div className="text-sm font-semibold text-cream truncate">{camLabel(r.video)}</div>
                  <div className="text-xs text-muted mt-0.5 font-mono">
                    {r.seats} seats · {r.candidates ?? '—'} candidates · {r.pct != null ? `${(r.pct*100).toFixed(2)}% reviewed` : 'no seat grid'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.high > 0 && <Badge color="danger">{r.high} high</Badge>}
                  {r.med > 0 && <Badge color="amber">{r.med} med</Badge>}
                  {r.low > 0 && <Badge color="muted">{r.low} low</Badge>}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                  <span className="text-[10px] font-mono text-muted">
                    Stage 1 scan {r.scanS != null ? `${r.scanS.toFixed(0)}s` : '—'}
                    {r.fixtures ? ` · ${r.fixtures} fixtures rejected` : ''}
                  </span>
                  <span className="text-xs text-olive opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    Review →
                  </span>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>

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


/** One recording: its counts, its events, drill-down into a segment. */
function Analysis({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { events, stats, video, setVideo, select, loading, error } = useData()
  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')
  if (error) return <ApiError error={error} />
  if (loading) return <Loading />

  if (!video) {
    return (
      <div className="h-full flex items-center justify-center px-10">
        <div className="text-center space-y-3">
          <div className="text-sm text-cream-dim">No recording selected.</div>
          <Btn onClick={() => onNavigate('videos')}>
            <Ico d={I.video} size={14} />Choose a recording
          </Btn>
        </div>
      </div>
    )
  }

  const evs = events.filter(e => e.raw.video === video)
  const st: any = (stats ?? {})[video] ?? {}
  const p = priorityCounts(evs)
  const DISMISS = ['staff_or_transit', 'unclassified_anomaly']
  const findings = evs.filter(e => !DISMISS.includes(e.raw.action_label))
  const counts = evs.reduce<Record<string, number>>((a, e) => {
    a[e.raw.action_label] = (a[e.raw.action_label] ?? 0) + 1; return a
  }, {})
  const chips = ['All', 'Findings only',
    ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])]

  const needle = q.trim().toLowerCase()
  const shown = evs.filter(e => {
    const f = filter === 'All'
      || (filter === 'Findings only' && !DISMISS.includes(e.raw.action_label))
      || filter === e.raw.action_label
    const m = !needle || e.time.includes(needle) || e.roi.toLowerCase().includes(needle)
      || e.type.toLowerCase().includes(needle) || e.obj.toLowerCase().includes(needle)
      || e.rule.toLowerCase().includes(needle)
    return f && m
  })

  const kpi = [
    { label: 'Events surfaced', val: evs.length, sub: 'across this recording', color: 'olive' as const },
    { label: 'Findings', val: findings.length, sub: 'named seat behaviour', color: 'danger' as const },
    { label: 'High confidence', val: p.high, sub: 'conf 0.60 and above', color: 'amber' as const },
    { label: 'Set aside', val: evs.length - findings.length, sub: 'transit or unclassified', color: 'olive' as const },
  ]

  return (
    <div className="overflow-y-auto h-full px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <button onClick={() => { setVideo(null); onNavigate('videos') }}
            className="text-xs font-mono text-muted hover:text-cream-dim flex items-center gap-1 mb-2">
            <Ico d={I.chevronL} size={11} />Back to library
          </button>
          <h1 className="text-2xl font-display text-cream">{camLabel(video)}</h1>
          <p className="text-cream-dim text-sm mt-1 font-mono">
            {hoursLabel(st.duration_s ?? 0)} · {st.n_seats ?? 0} seats discovered ·
            {' '}{st.stage1_candidates ?? '—'} Stage 1 candidates ·
            {' '}{st.promoted_fraction_of_seat_seconds != null
              ? `${(st.promoted_fraction_of_seat_seconds * 100).toFixed(2)}% of seat-seconds fully decoded`
              : 'no seat grid'}
          </p>
        </div>
        <Badge color="olive" dot>Analysis complete</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {kpi.map(k => {
          const cc = { olive: 'text-olive border-olive-mid/20', danger: 'text-danger border-danger/20',
                       amber: 'text-amber border-amber/20' }[k.color]
          return (
            <Card key={k.label} className={cn('p-5 border', cc.split(' ')[1])}>
              <div className="text-xs font-mono text-muted uppercase tracking-wider mb-2">{k.label}</div>
              <div className={cn('text-3xl font-display', cc.split(' ')[0])}>{k.val}</div>
              <div className="text-xs text-muted mt-1">{k.sub}</div>
            </Card>
          )
        })}
      </div>

      <Card className="p-5">
        <p className="text-sm text-cream-dim leading-relaxed">
          REWIND surfaced <span className="text-cream font-semibold">{evs.length}</span> moments
          in this recording, of which <span className="text-cream font-semibold">{findings.length}</span> are
          named seat behaviour and the rest are movement through the room or windows no rule could name.
        </p>
        <p className="text-[11px] text-muted mt-2 leading-relaxed">
          Every label describes observed behaviour, never intent, and every one carries a
          confidence score. Detections are probabilistic and require human verification.
        </p>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
        {chips.map(f => (
          <button key={f} onClick={() => setFilter(f)} title={f}
            className={cn('px-3 py-2 text-xs rounded-lg font-medium transition-colors',
              filter === f ? 'bg-olive text-white font-semibold'
                           : 'bg-card border border-border text-muted hover:text-cream-dim')}>
            {f === 'All' || f === 'Findings only' ? f : labelText(f)}
            {counts[f] != null && <span className="opacity-60"> {counts[f]}</span>}
          </button>
        ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <Ico d={I.search} size={13} />
          </span>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search offset, seat, behaviour or signal…"
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-cream-dim placeholder:text-muted focus:outline-none focus:border-olive-mid transition-colors" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-muted">{shown.length} events</div>
        {shown.slice(0, 80).map(e => (
          <button key={e.id} onClick={() => { select(e); onNavigate('segment') }}
            className="w-full text-left">
            <Card className="p-4 flex items-center gap-4 hover:border-olive-mid/40 border border-transparent transition-colors">
              <div className="w-24 h-14 rounded-lg bg-[#0E1209] border border-border shrink-0 overflow-hidden flex items-center justify-center">
                <span className="text-[9px] font-mono text-white/40">{e.durationS}s</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono text-muted">t+{e.time} · {e.roi}</div>
                <div className="text-sm font-semibold text-cream mt-0.5">{e.type}</div>
                <div className="text-xs text-muted mt-0.5 truncate">{e.rule || '—'}</div>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <Badge color={e.priority === 'high' ? 'danger' : e.priority === 'medium' ? 'amber' : 'muted'}>
                  {e.priority} priority
                </Badge>
                <div className="text-xs font-mono text-cream-dim">{e.conf}% conf.</div>
              </div>
            </Card>
          </button>
        ))}
        {shown.length > 80 && (
          <div className="text-xs font-mono text-muted pt-2">
            showing first 80 of {shown.length} — use Events for the full searchable list
          </div>
        )}
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-cream mb-1">Activity heatmap</h3>
        <p className="text-xs text-muted mb-3">
          Accumulated motion-vector energy for this recording, with the discovered seats drawn on top.
        </p>
        <img src={debugImage(`heatmap_${video.replace(/\.[^.]+$/, '')}.png`)}
          alt="activity heatmap"
          className="w-full rounded-lg border border-border bg-[#0E1209]"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      </Card>
    </div>
  )
}

function InvestigationWorkspace() {
  const { events, selected, select, setStatus, loading, error } = useData()
  const DET_EVENTS = events.slice(0, 8).map(e => ({
    time: e.time, type: e.type, roi: e.roi,
    score: e.activity, conf: e.conf, dur: `${e.durationS} sec`,
    color: (e.priority === 'high' ? 'danger' : e.priority === 'medium' ? 'amber' : 'muted') as 'danger' | 'amber' | 'muted',
    obj: e.obj, ev: e,
  }))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('1×')
  const rate = parseFloat(speed.replace('×', '')) || 1
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
          <ClipPlayer event={selected} rate={rate} />

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

          {/* Evidence, straight from the event record */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-cream">Evidence</h3>
                <p className="text-xs text-muted mt-0.5">
                  What the pipeline actually recorded for this window. Shape
                  varies by rule, so nothing here is fixed.
                </p>
              </div>
              {selected && (
                <Badge color={selected.priority === 'high' ? 'danger'
                  : selected.priority === 'medium' ? 'amber' : 'muted'} dot>
                  confidence {(selected.raw.confidence).toFixed(2)}
                </Badge>
              )}
            </div>
            <EvidencePanel event={selected} />
          </Card>

          {/* Motion heatmap - the real one the pipeline rendered */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-cream">Motion Activity Heatmap</h3>
                <p className="text-xs text-muted mt-0.5">
                  Accumulated motion-vector energy for this recording, with the
                  discovered seats drawn on top. Rendered by Stage 1.
                </p>
              </div>
            </div>
            {selected ? (
              <img
                src={debugImage(`heatmap_${selected.raw.video.replace(/\.[^.]+$/, '')}.png`)}
                alt="motion activity heatmap"
                className="w-full rounded-lg border border-border bg-[#0E1209]"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="h-28 rounded-lg border border-border bg-elevated flex items-center justify-center">
                <span className="text-xs font-mono text-muted">select an event</span>
              </div>
            )}
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
                {/* Review state is UI-local by design: the pipeline produces
                    evidence, and whether a human has looked at something is not
                    something it can know. It shows up in the Status column. */}
                <button onClick={() => { select(e.ev); setStatus(e.ev.id, 'Reviewed') }}
                  className={cn('flex-1 py-1.5 text-[10px] rounded-lg font-medium transition-colors border',
                    e.ev.status === 'Reviewed'
                      ? 'bg-olive text-white border-olive'
                      : 'bg-olive-subtle border-olive-mid/30 text-olive hover:bg-olive-dim')}>Review</button>
                <button onClick={() => { select(e.ev); setStatus(e.ev.id, 'Relevant') }}
                  className={cn('flex-1 py-1.5 text-[10px] rounded-lg font-medium transition-colors border',
                    e.ev.status === 'Relevant'
                      ? 'bg-burgundy text-white border-burgundy'
                      : 'bg-burgundy-dim border-burgundy-mid/30 text-burgundy hover:bg-burgundy-mid')}>Relevant</button>
                <button onClick={() => setStatus(e.ev.id, 'Ignored')}
                  className={cn('flex-1 py-1.5 text-[10px] rounded-lg font-medium transition-colors border',
                    e.ev.status === 'Ignored'
                      ? 'bg-elevated text-cream-dim border-border-light'
                      : 'bg-card border-border text-muted hover:text-cream-dim')}>Ignore</button>
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

// EventExplorer removed: the reference flow scopes search to a recording,

export default function App() {
  const [screen, setScreen] = useState<Screen>('videos')
  return (
    <DataConsumerShell screen={screen} setScreen={setScreen} />
  )
}

function DataConsumerShell({ screen, setScreen }: {
  screen: Screen; setScreen: (s: Screen) => void
}) {
  const { events, video, selected } = useData()
  const scoped = video ? events.filter(e => e.raw.video === video) : events
  const right =
    screen === 'videos'
      ? `${events.length} events across ${new Set(events.map(e => e.raw.video)).size} recordings`
      : screen === 'analysis'
        ? `${scoped.length} events detected`
        : selected ? `${selected.conf}% confidence` : ''

  const screens: Record<Screen, React.ReactNode> = {
    'videos': <Library onNavigate={setScreen} />,
    'analysis': <Analysis onNavigate={setScreen} />,
    'segment': <InvestigationWorkspace />,
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg text-cream font-sans">
      <TopBar screen={screen} onNavigate={setScreen} video={video}
        segment={selected ? selected.id : null} right={right} />
      <main className="flex-1 overflow-hidden screen-enter" key={screen}>
        {screens[screen]}
      </main>
    </div>
  )
}
