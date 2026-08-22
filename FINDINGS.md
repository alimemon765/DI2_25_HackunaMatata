# REWIND — what the dataset actually is, and what that changed

Everything here is `measured` unless marked `target`. Where an earlier reading
turned out to be wrong, the correction is kept in place rather than deleted —
the mistakes are the useful part.

## 1. The footage

`ffprobe`, all eight files, after renaming into `data/raw/`:

| File | Codec | Res | fps | Duration |
|---|---|---|---|---|
| 01_mobile_phone_hall.mkv | h264 Baseline | 1280×720 | 25.0 | 2m 11s |
| 02_mobile_phone_hall.mkv | h264 Baseline | 1280×720 | 25.0 | 3m 32s |
| 03_cctv_mobile_usage.mkv | mpeg4 SP | 1280×720 | 12.1 | 4m 42s |
| 04_cctv_candidate_talking.mkv | h264 Main | 640×480 | 8.0 | 2m 23s |
| 05_crowd_reception_desk.mp4 | mpeg4 SP | 1280×720 | 25.0 | 4m 01s |
| 06_mobile_phone_hall.mp4 | mpeg4 SP | 1280×720 | 25.0 | **2h 08m** |
| 07_seat_exchange.mp4 | mpeg4 SP | 1280×720 | 22.0 | **2h 14m** |
| 08_seat12_paper_pass.mkv | mpeg4 SP | 1280×720 | 25.0 | 1m 28s |

Three things differ from what the build plan assumed:

- **Most files are MPEG-4 Part 2, not H.264.** It does not matter. Motion
  vectors extract from every file: ~3,500 per frame on the 80×45 macroblock
  grid, with 88–98% P-frames. No re-encoding was needed for MV extraction.
- **`08` had a genuinely damaged header** (`Error, header damaged or not
  MPEG-4 header (f_code=0)`). Re-encoded to h264 in `data/processed/`.
- **Decode runs at 5,573 fps**, so the Stage 1 scan of a two-hour file is
  ~35 seconds. The planned P-frame stride was never needed.

The camera is fixed and steady: the per-frame global median motion vector is
exactly 0.0, so vibration compensation is a correct no-op on this data rather
than a load-bearing step.

## 2. These are CBT centres, not paper exam halls

Candidates sit at PC cubicles behind glass partitions, and **the seat number is
printed on each partition** (16–20 and 23–28 in `06`, 1–6 in `07`, 9 and 13 in
`08`).

The consequence for Stage 1: **a seated candidate barely moves.** Time-averaged
motion energy peaks on the *aisle*, where people walk past. Discovering seats
from motion found the walkway, not the seats.

So seat discovery was rebuilt on **person persistence** — sample a few dozen
frames, agglomerate person boxes by IoU, keep clusters occupied in ≥45% of
samples. IoU is scale-relative, so the strong perspective is handled without a
homography. Verified visually: on `06` the boxes land exactly on the three
occupied desks (printed seats 18, 24, 26) and correctly ignore the empty ones.

**Open opportunity:** the printed seat numbers are legible. OCR would map
`seat_id` to the invigilator's own numbering, which is what makes "Seat No. 12"
in the organisers' filename directly checkable. Not implemented.

## 3. The COCO detector is not trustworthy on this footage

This is the most important negative result, and it was nearly missed.

**A computer mouse is confidently a `cell phone`.** On `06`, a detection sits at
pixels (1028,480)–(1073,518) at conf 0.2–0.5 in **59 of 60** sweep samples,
unchanged over four minutes. On `03`, the same thing: an earlier version of this
document cited "phone detected in 38/40 frames" as a success. Those 38
detections were a mouse. See `out/debug/diag_03.png`, `out/debug/diag_06.png`.

Before the fix, this single artefact produced **12 of 14 events** on a
five-minute window of `06`.

**Detector confidence does not rank correctness.** On `02`, verified frame by
frame, the candidate is genuinely holding a dark slab-like object at conf
0.25–0.33 — but the single most confident `cell phone` in the whole clip
(0.61) is a **white sheet of paper**. See `out/debug/diag_02.png`.

**Input size matters more than model size.** On `02`, `cell phone` is found in
1/30 frames at imgsz 640 and 11/30 at 1280. `yolo11m` was *worse* than
`yolo11n` at the same size — a bigger backbone does not close the domain gap
between COCO's hand-held close-ups and a phone eight metres from a ceiling
camera. The pipeline therefore runs the detector at 640, 1280, and the crop's
native size, and merges.

### The fix: reject fixtures by motion, not confidence

A phone in a hand moves; a mouse on a desk does not. `pipeline/fixtures.py`
builds a map of small-object clusters that are both long-lived (present in
≥50% of sweep samples) and stationary (centroid drift ≤0.75 box diagonals), and
drops every detection overlapping one — in the Stage 2 windows and the sweep
alike. Nothing is thresholded on confidence, because confidence does not rank
correctness here.

Measured on a 5-minute window of `06`: `mobile_phone_usage` events fell from 12
to 4, and the two fixtures identified were exactly the two mice (presence 98%
and 83%, drift 0.16 and 0.11 box diagonals).

**`mobile_phone_usage` should be read as a pointer for a reviewer, not as a
determination.** Making it dependable needs a detector fine-tuned on exam-hall
phone crops, which needs labelled data this dataset does not contain.

## 4. Stage 1 is structurally blind to continuous behaviour

A per-seat rolling median/MAD baseline asks *when did this seat start behaving
differently*. It cannot answer *has this seat been doing the same thing since
the recording began*, because a constant behaviour is absorbed into the seat's
own normal.

Measured on `03`: only **4 of 282** seat-seconds clear `Z_THRESHOLD`. Stage 1
is working exactly as designed and still cannot see the clip's subject.

This is fine on a two-hour exam — a phone comes out at some point, and that
transition is what Stage 1 is for. It is not fine on a short clip that opens
mid-behaviour. The **persistent-object sweep** (`sweep_persistent_objects`) was
added as an explicit complement: a sparse whole-file scan, at most 720 decoded
frames, that asks the other question. Events from it are tagged
`"path": "persistent_object_sweep"` so the two are never confused.

## 5. Motion energy is heavy-tailed, and robust statistics alone don't fix it

Measured per-seat skew: **4.1 to 9.8**. Untransformed, the rolling MAD collapses
onto its floor and a single ordinary movement scores **178 "sigma"** — a number
nobody can reason about. A square-root variance-stabilising transform (no fitted
parameter, monotone, so it reorders nothing) cuts max z from 178 to ~40 and the
z>3.5 rate from 11.0% to 6.7%.

The rolling scale is also floored against the seat's own long-run spread and
against hall-wide activity, so a permanently still seat cannot manufacture
significance out of near-zero noise.

## 6. Known limitations, stated plainly

- **Ground truth has no timestamps.** `evaluate.py` reports action-label
  accuracy at file level (`measured`) and prints `unavailable` for
  recall@budget, temporal IoU, and false-events/hour rather than estimating
  them. A plausible-looking number there would be the easiest thing in this
  project to mistake for a result.
- **Validation and tuning share the same clips.** With one example per class,
  the choices made here (multi-scale, native scale, fixture thresholds) were
  informed by the same clips they are scored on. The file-level accuracy figure
  is therefore optimistic, and is not a held-out estimate.
- **`paper_pass` uses COCO `book` as a proxy.** There is no paper/chit class.
  Any flat held object matches.
- **`talking_to_neighbour` rests on motion correlation**, not speech or pose.
  It is the weakest named rule and fires partly on the *absence* of object
  evidence. Pose keypoints would sharpen it; not implemented.
- **Overlapping seat boxes can double-report** one detection against two seats.
- **Seats are only discovered where someone sits** during a calibration window.
  An empty desk is not a seat, by construction.
