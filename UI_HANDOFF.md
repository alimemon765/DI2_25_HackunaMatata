# REWIND — `out/events.json` spec for the review UI

Paste this whole file to whoever builds the UI. Everything below is verified
against the actual artifact (926 events, generated 2026-08-22), not from memory.

## Where things are

| | |
|---|---|
| Manifest | `out/events.json` (single file, ~773 KB) |
| Clips | `out/clips/` — 926 `.mp4`, 1.3 GB, exactly one per event |
| Stub API | `GET /events` returns the manifest verbatim (`uvicorn api.main:app`) |
| Figures | `out/debug/heatmap_*.png`, `seats_*.png`, `timeline_*.png` |

**Ignore `out/clips_stale/`.** Those are 362 orphans from earlier runs whose
results were discredited (mouse-as-phone false positives, and a crowd rule that
is now disabled). They are kept only for audit. Never surface them.

## Top-level shape

```json
{
  "generated_by": "REWIND pipeline_run.py",
  "parameters": { "Z_THRESHOLD": 3.5, "CASCADE_TOP_PCT": 0.02, ... },
  "disclaimer": "...",
  "stats":      { "<video>": { ...per-video run stats... } },
  "evaluation": { ...label accuracy, plus metrics marked unavailable... },
  "events":     [ ... 926 event objects ... ]
}
```

**The `disclaimer` string must be displayed and must not be dismissible.**

## Event object — exact field presence

Verified counts across all 926 events:

| Field | Present | Type | Notes |
|---|---|---|---|
| `video` | 926/926 | string | source filename |
| `seat_id` | 926/926 | int | spatial index for that camera view, **not** the number printed on the partition |
| `start_sec` / `end_sec` | 926/926 | float | seconds into the source video |
| `action_label` | 926/926 | string | one of six, see below |
| `confidence` | 926/926 | float | 0–0.97, **not calibrated** — see warning |
| `evidence` | 926/926 | object | **shape varies by label** |
| `clip_path` | 926/926 | string | repo-root-relative; all 926 resolve |
| `stage1` | **921/926** | object | **OPTIONAL — must null-check.** Absent on the 5 persistent-object-sweep events, which never went through Stage 1 |

`zone_id` appears in **no** current event (it only exists for crowd events, and
that rule is disabled). Handle it if present; do not require it.

`stage1`, when present: `peak_z`, `mean_z`, `duration_s`, `salience`.

## Labels, counts, confidence ranges

| Label | n | conf min / median / max |
|---|---|---|
| `unclassified_anomaly` | 434 | 0.11 / 0.31 / 0.35 |
| `mobile_phone_usage` | 288 | 0.19 / 0.55 / 0.75 |
| `talking_to_neighbour` | 198 | 0.38 / 0.59 / 0.78 |
| `seat_exchange` | 5 | 0.76 / 0.85 / 0.92 |
| `paper_pass_object_present` | 1 | 0.42 |
| `crowd_gathering` | 0 | rule disabled |

## `evidence` is polymorphic — render it generically

Do **not** hard-code keys. Different rules emit different evidence:

- `unclassified_anomaly` → `rule, seat_id, peak_z, mean_z, persons_tracked,
  frames_in_window, note`
- `talking_to_neighbour` → `rule, seat_id, neighbour_seat_id, correlation,
  lag_s, duration_s, min_correlation, min_duration_s, caveat`
- `mobile_phone_usage` → always `rule, detector_class, mean_detection_conf`;
  then **either** `frames_with_detection` + `frames_in_window` (Stage 1 path)
  **or** `samples_in_run` + `samples_with_detection` + `path` (sweep path)
- `seat_exchange` → `rule, seat_a, seat_b, track_a, track_b, hold_fraction,
  min_hold_s, note`

`also_matched` appears when more than one rule fired; it lists the runners-up.
Render it — it is useful to a reviewer.

Suggested treatment: show `rule` as the headline sentence, then the remaining
keys as a plain key/value list. Any key ending `_conf`, `_z`, `correlation` or
`fraction` is numeric; the rest are ints or strings.

## Clip playback — three gotchas

1. Clips are **cropped to the seat ROI**, not full frame.
2. Clips carry **2 s of padding** either side, so
   `clip duration != end_sec - start_sec`. The event begins ~2 s in.
3. Filenames are `{video_stem}_{NNN}_{action_label}.mp4` where `NNN` indexes
   that video's event list. It is **not globally unique and not stable across
   runs.** Always use `clip_path` from the JSON; never reconstruct or parse a
   filename.

## Warnings that must reach the reviewer

- **Confidence does not rank correctness.** Measured: the single most confident
  `cell phone` detection in one clip is a sheet of paper. Do not sort by
  confidence alone and present the top item as "most likely".
- **`seat_exchange` is not trustworthy.** All three top-confidence detections
  were checked frame by frame and all three were false positives (ByteTrack
  reassigning IDs during occlusion — an invigilator walking past two desks
  looks identical). There are 5 in this artifact. Do not give them a prominent
  badge.
- **`unclassified_anomaly` is 47% of all events**, and spot-checking 5 at
  random found 3 were staff or people walking through frame, not candidate
  behaviour. Expect a noisy queue.
- Some events overlap in time on adjacent seats — one behaviour can be reported
  against two seats. De-duplicate in the view if it looks repetitive.

## Language rules — non-negotiable

The word **"cheating" must never appear** in the UI, nor must any synonym for a
verdict. Labels name an **observed behaviour**; the reviewer decides what it
means. No `is_cheating`, no `verdict`, no "suspicious" badge. Acceptable verbs:
estimates, flags, suggests, prioritises, indicates.

There is no face recognition and no identity database anywhere in this system.
Track IDs exist only inside a single window and are reset between windows. Do
not build any UI affordance implying a person can be followed across events.

## Minimal integration

```python
import json
data = json.load(open("out/events.json"))
for e in data["events"]:
    label  = e["action_label"]
    clip   = e["clip_path"]              # always present, always resolves
    z      = (e.get("stage1") or {}).get("peak_z")   # OPTIONAL - null-check
    seat   = e.get("seat_id", e.get("zone_id"))
```
