"""Central parameters for REWIND.

Values in PARAMETERS come from the build plan and are deliberately not
hand-tuned. If a stage misbehaves at these values, that is a bug in the stage,
not a licence to weaken the constant.

Every numeric claim elsewhere in this codebase is labelled `measured` (produced
by evaluate.py against ground truth) or `target` (a design goal, unverified).
"""
from __future__ import annotations

# --- Stage 1: motion-vector triage -----------------------------------------
GRID_CELL_PX = 16          # matches the H.264/MPEG-4 macroblock size
SEAT_ACCUM_SECONDS = 120   # footage accumulated before seat-grid discovery
BASELINE_WINDOW_S = 60     # rolling per-seat median/MAD baseline
Z_THRESHOLD = 3.5          # robust z above which a seat-second is anomalous
CORR_MAX_LAG_S = 2.0       # max lag when correlating adjacent seats
MIN_EVENT_S = 1.5          # shorter excursions are discarded as noise
PELT_PENALTY = 10          # ruptures PELT penalty for change-point detection
CASCADE_TOP_PCT = 0.02     # fraction of windows promoted to Stage 2

# --- Stage 1 internals ------------------------------------------------------
BIN_S = 1.0                # temporal bin for the activity cube, seconds
PERIODIC_MIN_PROMINENCE = 0.35  # share of spectral energy in one narrow peak
PERIODIC_MIN_HZ = 0.05     # ignore near-DC drift; narrowbandness does the work
ILLUM_FRAC = 0.60          # frac of cells moving together => illumination jump
PERIODIC_MAX_CELL_FRAC = 0.20  # if more cells look periodic than this, distrust the test

# --- Stage 2: targeted perception ------------------------------------------
YOLO_WEIGHTS = "yolo11n.pt"
YOLO_POSE_WEIGHTS = "yolo11n-pose.pt"
TRACKER = "bytetrack.yaml"
CASCADE_FPS = 5.0          # frames per second sampled inside a promoted window
SEAT_CROP_PAD = 1.6        # seat box is dilated by this factor before cropping
DET_CONF = 0.25

# Small objects are found at whichever input size happens to suit the clip,
# and that size is not predictable up front.
# measured, clip 02 (30 sampled frames, class `cell phone`): 1 detection at
# imgsz 640, 11 at 1280. yolo11m at 1280 was *worse* than yolo11n -- a bigger
# backbone does not close the domain gap between COCO's hand-held close-ups
# and a phone eight metres from a ceiling camera. Both sizes are kept because
# neither dominates. The cost lands only on the CASCADE_TOP_PCT shortlist.
#
# CORRECTION, and a warning against trusting this class: an earlier version of
# this comment cited "38/40 frames at imgsz 640" on clip 03 as the headline
# evidence. Those 38 detections were a **computer mouse**, misclassified as a
# phone in nearly every frame. Verified visually -- see out/debug/diag_03.png.
# On clip 02, verified frame by frame, some detections are a real slab-shaped
# object in the candidate's hand (conf 0.25-0.33) but the single highest-
# confidence detection in the clip (0.61) is a white sheet of paper.
#
# So: COCO-pretrained `cell phone` is NOT reliable on this footage, and its
# confidence does not rank correctness. `mobile_phone_usage` should be read as
# a pointer for a reviewer, never as a determination. Making this class
# dependable needs a detector fine-tuned on exam-hall phone crops, which needs
# labelled data this dataset does not contain. That is the honest next step.
DET_SCALES = (640, 1280)
SMALL_OBJ_LINK_DIST_FRAC = 0.25   # centroid link radius, as a fraction of ROI width
PHONE_CONF = 0.20          # phones are small and often partly occluded
BOOK_CONF = 0.12           # `book` is a proxy for paper/chit -- see classify.py

# --- Stage 3: action naming -------------------------------------------------
PHONE_MIN_FRAMES = 3       # detections needed inside the window
# --- seat_exchange: OFF by default ------------------------------------------
# Every event this rule produced was checked frame by frame. All five were
# false positives: an invigilator walking a row and leaning over desks, people
# entering and leaving, a busy transition. Precision 0/5. Recall is also 0 --
# file 07 is the organisers' own seat-swap clip and the real swap was never
# detected, only a walk-through elsewhere in it.
#
# Two fixes were measured and both fail:
#   * raising the hold to 30 s cannot work -- the Stage 1 windows this rule
#     sees are 2-10 s long, so a 30 s in-window hold is unsatisfiable by
#     construction. It would zero the rule by arithmetic, not by evidence.
#   * requiring both tracks stationary at window end is confounded by sample
#     count. measured end-displacement: 0.50, 0.06, 0.06, 0.31, 0.60 box
#     diagonals -- the LOWEST (0.06) is the invigilator walk-through at 3387 s,
#     which scored still only because its tracks were seen 1 and 5 times before
#     leaving the crop. That filter would keep the worst false positive.
#
# The mechanism is the problem, not the threshold: ByteTrack reassigns ids
# during occlusion, so someone passing behind two seats produces the same
# id-swap signature as an exchange. Detecting this properly needs identity that
# survives occlusion over minutes, which is a different system.
SEAT_EXCHANGE_ENABLED = False
SEAT_EXCHANGE_MIN_HOLD_S = 3.0

# --- evidence clips ---------------------------------------------------------
# Padding either side of the flagged window. A reviewer needs the run-up to
# judge what they are seeing; the event itself is often only 2-3 s.
# Single source of truth: the overlay burner maps clip time back to source time
# with this same value, so they cannot drift apart.
CLIP_PAD_S = 5.0
TALKING_MIN_S = 4.0
TALKING_MIN_CORR = 0.35
# --- talking: reject one motion counted twice -------------------------------
# Seat discovery can split a single person across two boxes, or leave two boxes
# overlapping on one desk. adjacency() then calls them neighbours, and the same
# motion appears in both series -- which correlates near-perfectly at zero lag.
# That is not two people interacting.
#
# measured across 234 talking events, correlation band vs the IoU of the two
# seat boxes involved:
#   corr >= 0.95   n=72  median seat IoU 0.230   lag==0 in 90%
#   0.85-0.95      n=62  median seat IoU 0.063   lag==0 in 74%
#   0.60-0.85      n=73  median seat IoU 0.003   lag==0 in 49%
#   corr <  0.60   n=27  median seat IoU 0.000   lag==0 in 26%
#
# The relationship is monotonic but GRADED -- there is no clean gap like the
# 0.13-vs-0.87 that separated seated from transit. So this is a conjunction of
# all three signals rather than one threshold, which is deliberately harder to
# trip. It removes 53 events, all from the two long files, and none from any
# short file. The one validated true positive (clip 04) survives at
# correlation 0.897, IoU 0.108 -- clearing the gate by 0.053, a thin margin
# that is worth re-checking if seat discovery changes.
TALKING_REJECT_CORR = 0.95
TALKING_REJECT_SEAT_IOU = 0.10
# --- staff / transit ---------------------------------------------------------
# A person crossing the frame is a large motion excursion, so Stage 1 flags it
# correctly -- but it is an invigilator walking past desks, not seat behaviour.
# Before this rule those windows all fell into `unclassified_anomaly`.
#
# The discriminator is DISPLACEMENT, measured in the track's own box diagonals.
# It is deliberately NOT "the person is not in a seat":
# measured on 5 hand-checked windows (3 transit, 2 seated-only) --
#   transit : unseated_frac 0.12 / 0.69 / 0.24   displacement 0.87 / 1.23 / 1.65
#   seated  : unseated_frac 1.00 / 0.00          displacement 0.13 / 0.09
# Gating on "unseated" would have MISSED two of the three transit cases, because
# someone walking past desks is inside the seat boxes they pass, while a
# stationary candidate at a desk seat-discovery never found scores unseated 1.00
# without moving at all. Displacement separates with no overlap.
#
# CAVEAT: 5 windows is a small sample. 0.5 sits roughly midway in the observed
# gap (0.13 -> 0.87). Treat it as provisional until checked on more windows.
TRANSIT_MIN_DISPLACEMENT = 0.5   # in box diagonals, peak deviation from the mean
# Evaluate staff_or_transit BEFORE the seat-behaviour rules rather than as a
# fallback. Rationale: spot-checking the ten highest-confidence events on the
# two long files found movement through the room driving the top of the queue --
# correlated motion across adjacent seats as somebody passes between them, and
# spurious object detections while they move. Reordering is behind a flag so
# the trade can be measured and reverted.
TRANSIT_FIRST = True
TRANSIT_MIN_FRAMES = 3

CROWD_MIN_PERSONS = 4
CROWD_MIN_S = 5.0
# --- ranking: findings outrank dismissals, always -------------------------
# Two of the six labels are not findings about a seat. They are the opposite:
# a reason to spend LESS attention on a window. `staff_or_transit` says
# somebody walked through; `unclassified_anomaly` says nothing matched at all.
# Both must therefore sort below every label that reports an actual observed
# behaviour, or the review queue is led by its own dismissals.
#
# That is exactly what went wrong. measured before this cap: staff_or_transit
# had the HIGHEST median confidence of any label (0.758, max 0.825), against a
# median of 0.457 for mobile_phone_usage -- so it became the top label on four
# of eight files and file-level top-label accuracy fell from 38% to 25%.
#
# The ceilings sit below the lowest confidence any named seat behaviour
# produced on this data (0.232, a weak phone detection), and transit ranks
# above unclassified because "this is someone crossing the room" is a more
# specific statement than "no rule matched".
TRANSIT_MAX_CONF = 0.22
UNCLASSIFIED_MAX_CONF = 0.20

# COCO class ids used by the Stage 3 rules.
COCO_PERSON = 0
COCO_BOOK = 73
COCO_CELL_PHONE = 67

ACTION_LABELS = (
    "mobile_phone_usage",
    "talking_to_neighbour",
    "seat_exchange",
    "paper_pass",
    "crowd_gathering",
    "staff_or_transit",
    "unclassified_anomaly",
)

# --- robust scoring floors --------------------------------------------------
# A seat that is almost always still has a rolling MAD of exactly zero, which
# would send z to infinity on the first twitch. The scale is floored against
# the seat's own long-run spread and against the hall's overall activity, so a
# quiet seat cannot manufacture significance out of nothing.
MAD_FLOOR_FRAC_SEAT = 0.25    # of the seat's whole-series robust scale
MAD_FLOOR_FRAC_GLOBAL = 0.05  # of the p95 activity across all seats

# Per-seat motion energy is strongly right-skewed (measured skew 4.1 to 9.8 on
# the calibration slices): mostly near zero, with rare large excursions. Robust
# statistics handle outliers, but they cannot fix a scale that is skewed by
# construction -- untransformed, the rolling MAD collapses toward the floor and
# a single real movement scores 178 "sigma", which is not a number anyone can
# reason about. A square-root transform is the standard variance-stabiliser for
# magnitude-like data, has no fitted parameter, and is monotone, so it changes
# no ordering -- only the scale the threshold is applied on.
# measured: sqrt cuts max z from 178 to 45 and the z>3.5 rate from 11.0% to 6.7%.
ACTIVITY_TRANSFORM = "sqrt"   # one of: "sqrt", "log1p", "none"

# --- persistent-object sweep ------------------------------------------------
# The change-point path answers "when did this seat start behaving differently".
# It cannot answer "has this seat been doing the same thing since the recording
# began", because a rolling per-seat baseline absorbs a constant behaviour into
# the seat's own normal.
# measured, clip 03: a phone is visible in 95% of the 282 s clip, and only
# 4 of 282 seat-seconds clear Z_THRESHOLD. Stage 1 is working exactly as
# designed and still cannot see it.
# So a sparse sweep looks for objects that are persistently present at a seat.
# It stays cheap: at most SWEEP_MAX_SAMPLES decoded frames for a whole file,
# which is under 1% of a two-hour recording either way.
SWEEP_ENABLED = True
SWEEP_MAX_SAMPLES = 720
SWEEP_MIN_INTERVAL_S = 5.0
SWEEP_MIN_RUN = 3          # consecutive samples before a run counts
SWEEP_MIN_HIT_FRAC = 0.6   # share of samples in the run carrying a detection
