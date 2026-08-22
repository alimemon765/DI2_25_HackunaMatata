import { useEffect, useRef, useState } from 'react'
import type { UiEvent } from './api'

/**
 * Plays the actual exported evidence clip.
 *
 * This replaces the CSS-drawn mock CCTV frame the design shipped with. A
 * mockup cannot show a reviewer what happened, which is the entire point of
 * the product.
 *
 * Clips carry ~2 s of padding before the event, so playback starts slightly
 * early on purpose: the reviewer needs the run-up to judge what they are
 * seeing.
 */
export function ClipPlayer({
  event,
  compact = false,
  preferAnnotated = true,
}: {
  event: UiEvent | null
  compact?: boolean
  preferAnnotated?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [useAnnotated, setUseAnnotated] = useState(preferAnnotated)
  const [err, setErr] = useState<string | null>(null)

  const hasAnnotated = !!event?.annotatedUrl
  const src = (useAnnotated && hasAnnotated ? event?.annotatedUrl : event?.clipUrl) ?? null

  useEffect(() => {
    setErr(null)
    if (ref.current) ref.current.load()
  }, [src])

  const h = compact ? 'h-52' : 'h-80'

  if (!event || !src) {
    return (
      <div className={`relative w-full ${h} rounded-xl border border-border bg-[#0E1209] flex items-center justify-center`}>
        <span className="text-xs font-mono text-white/40">
          {event ? 'no clip exported for this event' : 'select an event'}
        </span>
      </div>
    )
  }

  return (
    <div className={`relative w-full ${h} rounded-xl overflow-hidden border border-border bg-[#0E1209]`}>
      <video
        ref={ref}
        src={src}
        controls
        muted
        playsInline
        preload="metadata"
        className="w-full h-full object-contain bg-black"
        onError={() => setErr('clip failed to load - is the API running on :8000?')}
      />

      <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
        <span className="text-[10px] font-mono text-white/85 bg-black/60 px-1.5 py-0.5 rounded">
          {event.cam}
        </span>
        <span className="text-[10px] font-mono text-white/85 bg-black/60 px-1.5 py-0.5 rounded">
          {event.roi}
        </span>
        <span className="text-[10px] font-mono text-white/85 bg-black/60 px-1.5 py-0.5 rounded">
          t+{event.time}
        </span>
      </div>

      {hasAnnotated && (
        <button
          onClick={() => setUseAnnotated((v) => !v)}
          className="absolute top-2 right-2 text-[10px] font-mono px-2 py-1 rounded bg-black/60 text-white/85 hover:bg-black/80 border border-white/15"
        >
          {useAnnotated ? 'overlay on' : 'overlay off'}
        </button>
      )}

      {!hasAnnotated && (
        <span className="absolute top-2 right-2 text-[10px] font-mono px-2 py-1 rounded bg-black/50 text-white/45">
          no overlay yet
        </span>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
        <span className="text-[10px] font-mono text-white/70 bg-black/60 px-1.5 py-0.5 rounded truncate">
          clip includes ~2s lead-in
        </span>
        <span className="text-[10px] font-mono text-white/70 bg-black/60 px-1.5 py-0.5 rounded">
          {event.durationS}s event
        </span>
      </div>

      {err && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <span className="text-xs font-mono text-danger">{err}</span>
        </div>
      )}
    </div>
  )
}
