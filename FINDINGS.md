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

## 7. Two defects found in the final validation run

### The crowd rule is unsound wherever a seat grid exists

`crowd_gathering` counts people who are not in a discovered seat. That
definition is only as good as the seat set, and the seat set is incomplete by
construction: discovery finds *persistently occupied* positions inside its
calibration windows, so a candidate at a desk it never discovered is counted as
"unseated".

Measured on `06` — a two-hour exam hall with roughly 28 numbered desks and 10
discovered seats — **313 of 720 sweep frames carry ≥4 "unseated" people**,
producing **60 `crowd_gathering` events in a room where nobody is gathering**.

Two geometric discriminators were measured, and **both failed**:

| | 06 (exam hall, false) | 05 (reception, true) |
|---|---|---|
| group bbox area / frame | p50 **0.18** | p50 **0.43** |
| dist to nearest seat / frame diagonal | p50 **0.052** | p50 **0.081** |
| unseated share of all people | p50 **0.25** | p50 **0.21** |

The compactness result runs *backwards* — the exam hall's groups are tighter
than the real gathering's, so a compactness test would have rejected the true
positive and kept the false ones. Worth recording: that filter was about to be
written before it was measured.

The rule is therefore **off by default** (`--crowd never`). It still works when
asked for (`--crowd always` on `05` yields `crowd_gathering` as the top label).
The fix is not a threshold — it needs either better seat-discovery recall, or a
signal this module does not have: dwell time, or the per-cell motion energy
Stage 1 already computes.

### Seat discovery is not deterministic

The same file yields a different seat count between runs — `08` gave 6 seats in
one run and 9 in another; `05` gave 6 and 7. Two causes compound: detector
output varies slightly run to run on MPS, and the IoU agglomeration in
`discover_seats_from_persons` / `discover_seats_multi` is **order-dependent**,
so a small change in detection order changes which boxes merge.

This is why `06`'s crowd events swung from 0 to 60 between two runs of the same
code. Anything downstream of the seat count — per-seat z-scores, the
seat-second budget, unseated counts — inherits that instability.

Not fixed. The fix is to seed the detector, sort detections into a canonical
order before agglomerating, and merge by a deterministic criterion rather than
greedy best-match-so-far.

## 8. Pose-based behavioural monitoring: keypoints are good, the naive signal is not

Tested `yolo11n-pose.pt` on real seat crops before building anything, the same
way the calculator/phone question was tested with CLIP. The result is different
from the CLIP case and worth stating precisely, because "it didn't work" would
be the wrong summary.

### Keypoints are usable — this is NOT a resolution failure

People are large in frame: person boxes measure **144 x 214 px** at the median
across 128,402 cached detections, about 11x the height of the 29x19 px objects
that defeated CLIP.

Measured keypoint confidence over 32 skeletons sampled from five windows that
had already been reviewed frame by frame:

| keypoint | mean conf | share > 0.5 |
|---|---|---|
| l/r shoulder | **0.93 / 0.94** | **97%** |
| l/r hip | 0.81 / 0.82 | 94% |
| nose | 0.63 | 59% |
| l/r ear | 0.49 / 0.57 | 50% |
| l/r eye | 0.43 / 0.51 | 38% / 56% |
| l/r ankle | 0.20 / 0.23 | 9% / 16% |

**Shoulders and hips are reliable. Head keypoints are not.** That matters
directly: **head-yaw — the originally proposed signal — depends on eyes and
ears, which are the two weakest keypoints available.** Sustained
head-turning cannot be measured dependably from this footage.

### The torso signal does not survive contact with the data

Shoulders being reliable, the natural fallback is torso lean: the lateral
offset of the shoulder midpoint over the hip midpoint, in torso lengths.
Measured against windows already visually classified:

| case | n | lateral lean p50 |
|---|---|---|
| seated, normal work (06 @1415) | 49 | 0.29 |
| seated, normal work (06 @4887) | 51 | 0.35 |
| **validated talking (clip 04)** | 61 | **0.13** |
| invigilator walking (06) | 65 | 0.32 |

**The signal runs backwards** — the validated talking case leans *least*. Same
shape as the crowd-compactness attempt, and caught the same way.

### Why: camera geometry dominates, and by the same magnitude as the effect

Within a **single** recording, at five separate minutes, lean grouped by where
the person sits in the frame:

| frame region | n | lean p50 |
|---|---|---|
| centre-left | 47 | 0.44 |
| centre-right | 78 | 0.22 |
| right quarter | 20 | 0.37 |

**Spread across regions of one room: 0.21. The apparent seated-vs-talking
difference: 0.22.** The confound is the same size as the effect. Image-space
posture measures obliquity — where you sit relative to the lens — not
behaviour, so it cannot be compared across seats, let alone across recordings.

### Status: documented future work, not built

The indicated fix is the same principle Stage 1 already uses: score each seat's
posture against **that seat's own rolling baseline** rather than a global
threshold, so a seat's fixed viewing angle cancels out. That is a plausible
design, not a validated one — confirming it needs timestamped ground truth to
say whether a deviation coincides with a real interaction, and
`data/ground_truth.csv` currently has 0 of 8 rows timestamped.

Building a behavioural rule on the global signal as measured would ship the
inverted discriminator. Not doing that.

## 9. First real timing metrics — and Stage 1's blind spot, confirmed

Four events were scrubbed from the raw footage by sweeping frames directly,
with no reference to the pipeline's own output (see `GROUND_TRUTH_NOTES.md`
and the contact sheets in `out/demo/gt_*.png`). That is enough to activate
recall@budget, temporal IoU and false-events/hour for the first time.

| file | ground truth | recall@budget | mean tIoU |
|---|---|---|---|
| 01 | 2-52 s, phone | **0%** | 0.000 |
| 02 | 104-162 s, phone | **0%** | 0.000 |
| 04 | 4-18 s, talking | **100%** | **0.357** |
| 05 | 11-101 s, crowd | **0%** | 0.000 |

**Recall 1 of 4.** The three misses share one cause, and it is the blind spot
already documented in §4 — now confirmed against real timestamps rather than
argued from first principles.

* **01** — the candidate sits still with a hand at her face for fifty seconds.
  A person holding a phone and not moving produces no motion excursion, so
  Stage 1 has nothing to threshold. The events it did produce sit at 66-68 s
  and 97-101 s: the staff member approaching, and the candidate standing up.
  **It found the reaction, not the behaviour.**
* **02** — the phone is up between 104 and 162 s. The one
  `mobile_phone_usage` event fires at **182-184 s**, twenty seconds after it
  ended.
* **05** — the crowd is dense from 11 to 101 s. Every event falls between 164
  and 238 s, once the room has emptied. **The per-seat rolling baseline
  normalises away sustained crowding**: while everyone is busy nothing
  deviates, and only when it quiets down does the remaining movement stand out.
* **04** — works, tIoU 0.357. The interaction is brief and punctuated, which is
  exactly what a change-point detector is built for.

**Read plainly: Stage 1 reliably finds moments where behaviour *changes*, and
systematically misses behaviour that is simply *sustained*.** The persistent-
object sweep was added for precisely this reason and covers the object case;
nothing yet covers sustained *interaction* or sustained *crowding*.

### On false-events/hour

Reported as 51-105 per hour, but that number is inflated by construction: an
event counts as false if it does not overlap **the single** scrubbed window,
and these clips plainly contain other genuine activity — staff walking through
01 and 05 is real. Treat it as an upper bound until more of each file is
scrubbed, not as a measured false-positive rate.

## 10. CLIP linear probe: not enough independent positives to train responsibly

A linear probe on our own labelled crops is a genuinely different technique
from the zero-shot text-prompt test in §3, so it was worth attempting. It was
stopped at the data-sufficiency gate, before any classifier was fitted.

**There is one verified real-phone event in the entire dataset.** Scrubbing the
raw footage (§9) established 02 at 104-162 s. Harvesting that window yields 48
`cell phone` crops — but all 48 detections fall inside a **single 40 px cell**
at (652, 371), because the phone is held still against the candidate's face.
They are 48 views of one object, not 48 examples.

Measured in CLIP embedding space:

| | median pairwise cosine |
|---|---|
| the 48 crops of that one phone | **0.924** (80% of pairs above 0.90) |
| the 12 *distinct* objects — mice, calculators, bottle, hands | **0.823** |

**Crops of the same object are more similar to each other than genuinely
different objects are.** A random train/test split over those 48 would put
near-duplicates on both sides of the line, and the held-out score would measure
memorisation of one phone at one pixel location. It would read as ~100% and
mean nothing — the same self-grading error as scoring a rule on the data used
to design it.

Counting *independent instances* rather than crops: **1 verified positive**,
plus at most two more candidates from the cluster audit that were never
confirmed. Against roughly nine distinct negatives. That is not a training set;
it is one example.

**Not built.** The duration-based fixture filter remains the primary defence —
it is measured (§3: `cell phone` detections 1393 -> 156, −89%) and it does not
require any phone examples at all, which is precisely why it works here.

What would change this: several verified phone events across different people,
seats and recordings. One per recording would be a reasonable bar. That is the
same labelling effort §9 identified, and it unlocks the same things.
