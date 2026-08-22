import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchEvents, fetchSummary, type Summary, type UiEvent } from './api'

type Ctx = {
  events: UiEvent[]
  summary: Summary | null
  loading: boolean
  error: string | null
  selected: UiEvent | null
  select: (e: UiEvent | null) => void
  setStatus: (id: string, s: UiEvent['status']) => void
  reload: () => void
}

const DataCtx = createContext<Ctx | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<UiEvent[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, select] = useState<UiEvent | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchEvents(), fetchSummary()])
      .then(([evs, sum]) => {
        if (cancelled) return
        setEvents(evs)
        setSummary(sum)
        // Prefer something that can actually play: during a pipeline re-run
        // the manifest may name clips that are mid-export.
        select((cur) => cur ?? evs.find((e) => e.clipUrl) ?? evs[0] ?? null)
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [tick])

  // Review state is UI-local on purpose: the pipeline produces evidence, and
  // whether a reviewer has looked at something is not something it can know.
  const setStatus = (id: string, s: UiEvent['status']) =>
    setEvents((cur) => cur.map((e) => (e.id === id ? { ...e, status: s } : e)))

  return (
    <DataCtx.Provider
      value={{ events, summary, loading, error, selected, select, setStatus,
               reload: () => setTick((t) => t + 1) }}
    >
      {children}
    </DataCtx.Provider>
  )
}

export function useData(): Ctx {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData must be used inside <DataProvider>')
  return c
}
