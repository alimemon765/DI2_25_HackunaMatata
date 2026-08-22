# DI2_25_HackunaMatata — REWIND

REWIND watches a multi-hour exam-hall recording and hands the invigilator the
few minutes worth watching, per seat, per named action — without ever running
face recognition.

## What it does

A three-stage cascade over CCTV footage:

1. **Stage 1 — cheap triage.** Motion vectors are read straight from the codec
   bitstream (no full decode). Per-seat activity is scored against that seat's
   own rolling median/MAD baseline. Camera vibration and periodic motion (fans,
   curtains, flicker) are filtered out before scoring.
2. **Stage 2 — targeted perception.** Only the top few percent of windows get
   fully decoded. YOLO11 + ByteTrack run on seat crops to produce object
   detections and persistent person IDs.
3. **Stage 3 — action naming.** A rule engine over Stage 2's outputs assigns a
   named observed behaviour to each surviving event.

## Action labels

`mobile_phone_usage`, `talking_to_neighbour`, `seat_exchange`, `paper_pass`,
`crowd_gathering`, `unclassified_anomaly`.

REWIND names observed behaviour. It does not judge intent, and it does not
identify people — person tracking is ID-persistence within a single video
session for movement analysis only. Every output is evidence for a human
reviewer to act on.

## Layout

```
pipeline/       stages 1-3 + evidence export + evaluation
pipeline_run.py one command, produces out/events.json
api/main.py     stub: GET /events serves out/events.json
data/raw/       source footage (gitignored)
data/ground_truth.csv
out/events.json
```
