"""Fixture rejection: telling a phone from a mouse.

The single biggest source of false `mobile_phone_usage` on this footage is not
a marginal detection -- it is a *confident, perfectly stable* one. A COCO
detector calls a computer mouse a cell phone, at conf 0.2-0.5, in essentially
every frame, from the same pixels, for as long as the camera runs. Verified on
clips 03 and 06: see out/debug/diag_03.png and out/debug/diag_06.png, where the
box sits at the identical coordinates 225 seconds apart.

That breaks the persistent-object sweep's original premise. Persistence was
meant to be evidence *for* an object being in use; it is in fact the signature
of furniture. The discriminator that actually separates the two is **motion**:

    a phone in someone's hand moves; a mouse on a desk does not.

So a small-object detection cluster that is both long-lived and stationary is
declared a fixture, and every detection overlapping it is dropped everywhere --
in the Stage 2 windows and in the sweep alike. Nothing is thresholded on
detector confidence, because on this footage confidence does not rank
correctness: the single most confident `cell phone` in clip 02 is a sheet of
paper.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .detector import Detection, FrameDets, iou

# A fixture is **stationary and long-lived**. Its centroid never wanders
# further than this multiple of its own box diagonal: a held phone drifts far
# more than its own size as an arm moves, a mouse drifts by detector jitter.
FIXTURE_MAX_DRIFT = 0.75
# It must be seen enough times for "never moves" to mean anything...
FIXTURE_MIN_SAMPLES = 8
# ...and those sightings must span a long stretch of the recording.
FIXTURE_MIN_SPAN_FRAC = 0.25
FIXTURE_MIN_SPAN_S = 300.0
#
# There is deliberately NO requirement on what *fraction* of samples a cluster
# appears in. That was the first formulation and it failed exactly where it
# mattered most: measured on the full two-hour file 06, a >=50% presence bar
# identified **zero** fixtures, while the same footage cut to five minutes
# yielded two. Over two hours a desk mouse is occluded by people, chairs and
# passers-by for long stretches, so its presence fraction collapses even though
# it never moves an inch. Occlusion is not evidence of mobility.
FIXTURE_MIN_PRESENCE = 0.0
# How much a detection must overlap a fixture to be considered the same object.
FIXTURE_IOU = 0.30


@dataclass
class Fixture:
    cls_id: int
    box: tuple[float, float, float, float]
    presence: float
    drift: float
    n_samples: int
    span_s: float = 0.0

    def describe(self) -> dict:
        return {"class_id": self.cls_id,
                "box": [round(v) for v in self.box],
                "presence": round(self.presence, 3),
                "drift_in_box_diagonals": round(self.drift, 3),
                "samples": self.n_samples,
                "span_s": round(self.span_s, 1)}


def build_fixture_map(
    frames: list[FrameDets],
    min_presence: float = FIXTURE_MIN_PRESENCE,
    max_drift: float = FIXTURE_MAX_DRIFT,
    join_iou: float = FIXTURE_IOU,
    only_classes: tuple[int, ...] | None = None,
) -> list[Fixture]:
    """Find small objects that are always there and never move.

    Runs over the sweep frames, which already span the whole file, so this
    costs no extra decoding.
    """
    if len(frames) < FIXTURE_MIN_SAMPLES:
        return []

    clusters: list[dict] = []
    for f in frames:
        for d in f.dets:
            # Restricted to small object classes on purpose. A candidate who
            # sits still for two hours is long-lived and stationary by every
            # measure here, and is emphatically not furniture.
            if only_classes is not None and d.cls_id not in only_classes:
                continue
            # Best match, not first match: a greedy first-match splits one
            # jittering object into several weak clusters, and each fragment
            # then looks too short-lived to be furniture.
            hit, best_v = None, join_iou
            for c in clusters:
                if c["cls"] != d.cls_id:
                    continue
                v = iou(d.xyxy, c["box"])
                if v >= best_v:
                    hit, best_v = c, v
            if hit is None:
                clusters.append({"cls": d.cls_id, "box": tuple(d.xyxy), "n": 1,
                                 "cents": [d.centroid], "frames": {round(f.t_sec, 3)},
                                 "t0": f.t_sec, "t1": f.t_sec})
            else:
                k = hit["n"]
                hit["box"] = tuple((np.array(hit["box"]) * k + np.array(d.xyxy)) / (k + 1))
                hit["n"] = k + 1
                hit["cents"].append(d.centroid)
                hit["frames"].add(round(f.t_sec, 3))
                hit["t0"] = min(hit["t0"], f.t_sec)
                hit["t1"] = max(hit["t1"], f.t_sec)

    n_frames = len(frames)
    obs_span = max(f.t_sec for f in frames) - min(f.t_sec for f in frames)
    span_bar = min(FIXTURE_MIN_SPAN_S, obs_span * FIXTURE_MIN_SPAN_FRAC) \
        if obs_span > 0 else 0.0
    out: list[Fixture] = []
    for c in clusters:
        n = len(c["frames"])
        if n < FIXTURE_MIN_SAMPLES:
            continue
        presence = n / n_frames
        if presence < min_presence:
            continue
        if (c["t1"] - c["t0"]) < span_bar:
            continue
        cents = np.array(c["cents"], float)
        x0, y0, x1, y1 = c["box"]
        diag = max(float(np.hypot(x1 - x0, y1 - y0)), 1.0)
        drift = float(np.max(np.linalg.norm(cents - cents.mean(axis=0), axis=1))) / diag
        if drift <= max_drift:
            out.append(Fixture(c["cls"], c["box"], presence, drift, n,
                               span_s=float(c["t1"] - c["t0"])))
    return out


def is_fixture(det: Detection, fixtures: list[Fixture],
               iou_thresh: float = FIXTURE_IOU) -> bool:
    return any(f.cls_id == det.cls_id and iou(det.xyxy, f.box) >= iou_thresh
               for f in fixtures)


def drop_fixtures(frames: list[FrameDets], fixtures: list[Fixture]) -> int:
    """Remove fixture detections in place. Returns how many were dropped."""
    if not fixtures:
        return 0
    n = 0
    for f in frames:
        keep = [d for d in f.dets if not is_fixture(d, fixtures)]
        n += len(f.dets) - len(keep)
        f.dets = keep
    return n


def frames_from_evidence(evidence: list) -> list[FrameDets]:
    """Flatten cached Stage 2 windows into one time-sorted frame list.

    The sweep is a *less sensitive* detector than the cascade: it runs
    full-frame, while Stage 2 runs on ROI crops where a small object is
    upscaled and becomes detectable. Building the fixture map from the sweep
    alone therefore cannot see most of what it is supposed to reject.

    measured on file 07: the sweep found 0 `cell phone` and 0 `book`
    detections across 720 frames, so 0 fixtures were identified -- while Stage
    2 found 7,949 phone detections in the same recording, 197 events' worth,
    dominated by desk mice and calculators sitting still for the whole exam.

    Feeding the fixture test the detections it is meant to filter is the fix.
    No new rule, no new threshold.
    """
    out: list[FrameDets] = []
    for w in evidence:
        for f in w.frames:
            out.append(f)
    out.sort(key=lambda f: f.t_sec)
    return out
