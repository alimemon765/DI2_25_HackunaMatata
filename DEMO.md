# REWIND — demo runbook

Target: ~3 minutes. Every number below is labelled **measured** or **target**.
Nothing in this script claims a result that has not been checked frame by frame.

## What this demo does NOT claim

`seat_exchange` is **not** presented as working. All three top-confidence
detections were verified frame by frame and all three were false positives —
two people walking through a room, a busy transition, and an invigilator
leaning over desks. Cause: ByteTrack reassigns IDs during occlusion, so
"track 1 ended in seat 2" happens without anyone swapping seats. The rule's
hold requirement is 3.0 s, which is far too short for a behaviour that should
be durable. See the Q&A answer below — this is a strength to own, not a gap to
hide.

`crowd_gathering` is off by default and not demoed. See FINDINGS.md §7.

---

## Beat 1 — the triage claim (~60s)

**The line:** a two-hour exam recording, and the invigilator gets back the
handful of seat-seconds worth watching.

| | value | status |
|---|---|---|
| Source file `06` | 2 h 08 m, 192,431 frames | measured |
| Stage 1 scan | motion vectors only, no pixel decode | measured |
| Decode throughput | 5,573 fps | measured |
| Stage 1 candidates | 1,500 | measured |
| Promoted to Stage 2 | 474 windows | measured |
| Share of seat-seconds fully decoded | **2.00%** | measured |

**Show:** `out/debug/timeline_06_mobile_phone_hall.png` (per-seat z over two
hours, events marked) and the terminal line
`[stage1] 1500 candidates -> 474 promoted (1539s = 2.00% of seat-seconds)`.

**The point:** 98% of the footage is never fully decoded. That is the product.

## Beat 2 — the fixture catch (~60s)

**The line:** the system caught its own false positive, and the fix was
physics, not a threshold.

**Show:** `out/demo/fixture_before_after.png`.

- A COCO detector calls a **computer mouse** a `cell phone`, at conf 0.2–0.5,
  in **59 of 60** samples, from pixels `(1027,480)-(1072,518)` that do not move
  across the whole two hours. **measured**
- Before the fix this artefact produced **12 of 14** events on a five-minute
  test window. **measured**
- The discriminator is **motion, not confidence** — a phone in a hand moves, a
  mouse on a desk does not. Confidence would not have worked: the single most
  confident `cell phone` in clip 02 is a **sheet of paper**. **measured**
- Result: **18 fixtures** identified, `cell phone` detections **1393 → 156**
  (−89%) over the two-hour file. **measured**

**The point:** we measured two candidate fixes before writing either. One of
them — group compactness — ran *backwards* on the data and would have rejected
the true positive while keeping the false ones. FINDINGS.md §7 records it.

## Beat 3 — honest labelling (~40s, optional)

**Show:** `data/demo/04_talking.mp4` → `talking_to_neighbour` (validated), or
`data/demo/02_phone.mp4` → `mobile_phone_usage` (validated).

Then show an `unclassified_anomaly` entry in `out/events.json`: Stage 1 flagged
it, no Stage 3 rule matched, and it is still reported with its z-score and
clip. **A flag is never silently dropped because we could not name it.**

Overall label accuracy: **38% top-label, 62% label-present**, file-level,
against filename-derived ground truth. **measured.** Say the number out loud
before a judge finds it.

---

## Reproducing the demo

Run demo clips **standalone**, not as a batch — seat discovery is
batch-order dependent (the detector is cached and the tracker carries state
across files), so a file's seat count can differ depending on what ran before
it. Standalone runs are reproducible; verified twice in-process and twice
across fresh interpreters.

```bash
python pipeline_run.py --video data/demo/04_talking.mp4 --out out/demo_run
```

## Q&A

**"How is this different from background subtraction?"**
Background subtraction gives one global foreground mask and no notion of who
is where. REWIND scores each seat against *its own* rolling median/MAD
baseline, so a seat by the door being permanently busy does not drown out a
quiet corner, and it correlates adjacent seats with a lag allowance, which is
what makes a two-person interaction distinguishable from one person fidgeting.

**"Is that measured or a target?"**
Point at `evaluate.py`. Label accuracy is measured. recall@budget, temporal
IoU and false-events/hour print **`unavailable`**, because ground truth has no
timestamps yet and we would rather print nothing than a plausible-looking
number. Nothing on the deck is an unlabelled target.

**"What about privacy?"**
No face recognition, no identity database, nothing stored. Track IDs exist for
movement analysis inside a single window and the tracker is **reset between
windows** specifically so IDs cannot be joined over time. It is a design
property, not a setting.

**"Seat exchange is in the problem statement — do you detect it?"**
Not reliably, and we are not claiming it. We got candidate detections at
seat-swap-like moments, checked them frame by frame, and found all three were
tracking IDs swapping during occlusion — an invigilator walking past two desks
produces the same signature. We know the likely fix: a real exchange is
durable, and our hold requirement is 3 seconds. We would rather ship a system
that says `unclassified_anomaly` than one that says `seat_exchange` and is
wrong. That is the same discipline that caught the mouse.

## If anything breaks

Switch to the backup recording immediately and narrate over it. Do not debug
live.
