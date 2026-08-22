# Deck corrections — DRISHTI_AI_2026_IDEA_PS2_REWIND

Paste these into your source deck (Slides/Canva/PowerPoint). Phrase them in
your own words — they are given as *facts with labels*, not as finished copy,
so the wording stays yours.

Every figure is marked **[measured]** or **[target]**. Do not move a figure
from target to measured without a run behind it.

---

## Slide 1 — title

```
Team ID – DI2_25
Team Name (As Registered) – hackuna matata
```

Also replace the literal `Team Name` in the footer of slides 2, 3, 4 and 5.

---

## Slide 2 — Proposed Solution

**MUST CHANGE — this claim is now false:**

> "Self-calibrating seat cells replace person tracking, so ROIs survive
> occlusion, crowding and identity switching"

Motion-only seat cells do not work on this footage. These are computer-based
test centres: a seated candidate barely moves, so averaged motion energy peaks
on the **aisle**, not the seats. Seats are discovered from **person detection
persistence** instead — cluster person boxes by IoU across sampled frames, keep
the positions that stay occupied.

Replacement fact: *seats are discovered automatically from the recording, with
no hand-drawn grid and no homography; the perspective is handled because IoU is
scale-relative.* **[measured]** — verified against printed seat numbers 18, 24
and 26 in file 06.

The privacy claim **survives unchanged and is worth keeping**: no face
recognition, no identity database, and track IDs are reset between windows so
they cannot be joined over time.

**MUST LABEL:**

> "Three hours reviewed in about four minutes"

Not achieved end-to-end. What is true:
- Stage 1 scan of a 2h08m file: motion vectors only, **34.9 s = 221x realtime** **[measured]**,
  at **5,347 fps** decode over 186,416 frames **[measured]**
- Full pipeline including detection on the shortlist: **35 min** **[measured]**
  — the cascade dominates, not the scan
- Share of seat-seconds ever fully decoded: **2.00%** **[measured]**

Honest headline: *98% of the footage is never fully decoded* **[measured]**.

---

## Slide 3 — Technical Approach

Remove or move to a clearly-marked "future work" line — **none of these are
built**:
- CLIP segment embeddings / plain-English clip retrieval
- Celery workers, Postgres event store
- React timeline + heatmap review UI (the API is a single stub endpoint)

Correct these:
- "Kernel Temporal Segmentation" → **PELT change-point detection** (what the
  code actually runs)
- "YOLOv11 for phone / chit / paper" → YOLO11 for `person`, `cell phone` and
  `book`. **COCO has no chit/paper class**; `book` is used as a proxy for a
  held rectangular object and this is an approximation, not a solved problem.
- "one RTX-class GPU" → developed and measured on **Apple Silicon (MPS)**;
  inference is CPU-viable.

Add, because it is the strongest technical point and it is real:
- A **fixture filter** that rejects static small objects by motion rather than
  by confidence. **[measured]** on the 2-hour file: 18 fixtures identified,
  `cell phone` detections **1393 → 156 (−89%)**.

---

## Slide 4 — Feasibility and Viability

Mostly still accurate. Two additions from what actually happened:

- "Occlusion in crowded halls → seat-cell ROIs — there is no tracker to lose"
  is no longer true as written; seat discovery uses a detector. The occlusion
  argument now rests on **persistence across sampled frames**, not on the
  absence of a tracker.
- Add a risk that we actually hit: **a COCO detector confidently misclassifies
  furniture.** A computer mouse was read as a `cell phone` at conf 0.2–0.5 in
  **59 of 60** samples, from pixels that never moved across two hours.
  **[measured]** Mitigation shipped: reject by motion, not confidence — the
  most confident `cell phone` in one clip is a sheet of paper.

---

## Slide 5 — Robustness Testing & Model Evaluation

**Delete or mark `[target]` — none of these were measured:**
mAP @ tIoU 0.3/0.5 · AUC/AP under the UCF-Crime protocol · F-measure on
CDnet2014 · "≥30× real time" · "cutting GPU-hours by roughly 90%".

**What we can actually put on the slide, all [measured]:**

| Metric | Value |
|---|---|
| Stage 1 scan of a 2h08m file | 34.9 s = **221x realtime** |
| Stage 1 decode throughput | 5,347 fps (186,416 frames) |
| Seat-seconds fully decoded | 2.00% (budget target 2%) |
| Stage 1 candidates → promoted, file 06 | 1,500 → 474 |
| Action-label accuracy, file level | 38% top-label, 50% label-present |
| Fixture filter reduction | 1393 → 156 phone detections (−89%) |
| Files validated | 8 of 8 run end-to-end |

**Say this out loud rather than hide it:** recall@review-budget, temporal IoU
and false-events/hour print **`unavailable`**, because the ground truth has no
timestamps yet. We chose to print nothing rather than a plausible-looking
number.

**Do NOT claim `seat_exchange` works.** All three top-confidence detections
were verified frame by frame and all three are false positives — ByteTrack
reassigns IDs during occlusion, so an invigilator walking past two desks
produces the same signature as a swap. If the slide implies this class works,
change it.

---

## Slide 6 — References

No changes needed. Reference [11] (YOLOv8 cheating recognition) and [12] (MIL
cheating detection) are cited as prior work, which is fine — our own outputs
never use that word.
