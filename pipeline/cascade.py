"""Stage 2: targeted perception on the shortlist only.

Stage 1 read motion vectors over the whole file without decoding a pixel. This
stage does the opposite -- full decode, a detector, a tracker -- and that is
affordable precisely because it runs on at most CASCADE_TOP_PCT of the footage.

Each promoted window is cropped to a region of interest covering the flagged
seat *and its neighbours*. Neighbours are included deliberately: handing an
object over and swapping places are both two-seat events, and a crop tight to
one seat cannot see either.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .config import (
    BOOK_CONF,
    CASCADE_FPS,
    COCO_BOOK,
    COCO_CELL_PHONE,
    COCO_PERSON,
    DET_CONF,
    PHONE_CONF,
    SEAT_CROP_PAD,
    SMALL_OBJ_LINK_DIST_FRAC,
)
from .detector import (
    Detection,
    FrameDets,
    decode_window,
    detect_multiscale,
    iou,
    link_by_centroid,
    track_frames,
)
from .seats import Seat, SeatGrid
from .segment import Candidate

PERSON_CLASSES = [COCO_PERSON]
SMALL_CLASSES = [COCO_CELL_PHONE, COCO_BOOK]


@dataclass
class WindowEvidence:
    """Everything Stage 2 saw inside one promoted window."""

    candidate: Candidate
    roi_px: tuple[int, int, int, int]
    neighbour_ids: list[int]
    frames: list[FrameDets] = field(default_factory=list)
    seat_boxes: dict[int, tuple[float, float, float, float]] = field(default_factory=dict)

    @property
    def n_frames(self) -> int:
        return len(self.frames)

    def dets_of(self, cls_id: int, min_conf: float = 0.0) -> list[tuple[float, Detection]]:
        return [(f.t_sec, d) for f in self.frames for d in f.dets
                if d.cls_id == cls_id and d.conf >= min_conf]

    def person_tracks(self) -> dict[int, list[tuple[float, Detection]]]:
        out: dict[int, list[tuple[float, Detection]]] = {}
        for f in self.frames:
            for d in f.dets:
                if d.cls_id == COCO_PERSON and d.track_id is not None:
                    out.setdefault(d.track_id, []).append((f.t_sec, d))
        return out

    def seat_of(self, det: Detection, min_iou: float = 0.10) -> int | None:
        """Which seat region a detection sits in: best IoU, else nearest centroid."""
        best, best_v = None, 0.0
        for sid, box in self.seat_boxes.items():
            v = iou(det.xyxy, box)
            if v > best_v:
                best, best_v = sid, v
        if best is not None and best_v >= min_iou:
            return best
        cx, cy = det.centroid
        near, near_d = None, float("inf")
        for sid, (x0, y0, x1, y1) in self.seat_boxes.items():
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                d = np.hypot(cx - (x0 + x1) / 2, cy - (y0 + y1) / 2)
                if d < near_d:
                    near, near_d = sid, d
        return near

    def seat_track_series(self) -> dict[int, list[tuple[float, int | None]]]:
        """track_id -> [(t, seat_id)], recomputed every frame from the box.

        Recomputed, not fixed at first sight: a seat swap is exactly the case
        where the assignment must be allowed to change.
        """
        out: dict[int, list[tuple[float, int | None]]] = {}
        for f in self.frames:
            for d in f.dets:
                if d.cls_id == COCO_PERSON and d.track_id is not None:
                    out.setdefault(d.track_id, []).append((f.t_sec, self.seat_of(d)))
        return out


def _roi_for(grid: SeatGrid, seat: Seat, neighbours: list[Seat],
             pad: float = SEAT_CROP_PAD) -> tuple[int, int, int, int]:
    boxes = [seat.bbox_px] + [n.bbox_px for n in neighbours]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = (x1 - x0) * pad, (y1 - y0) * pad
    W, H = grid.frame_size
    return (int(max(0, cx - w / 2)), int(max(0, cy - h / 2)),
            int(min(W, cx + w / 2)), int(min(H, cy + h / 2)))


def _perceive_window(
    video: str,
    roi: tuple[int, int, int, int],
    t0: float,
    t1: float,
    fps: float,
    conf: float,
) -> list[FrameDets]:
    """Decode a window once, then look at it two ways.

    People are tracked with ByteTrack at the detector's default input size --
    they are large, and tracking needs a single consistent stream. Phones and
    sheets of paper are found by a separate multi-scale detection pass and
    linked frame to frame by centroid, because ByteTrack is not dependable on a
    small object that drops out for frames at a time.
    """
    x0, y0, x1, y1 = roi
    raw = decode_window(video, t0, t1, fps)
    crops = [(t, img[y0:y1, x0:x1]) for t, img in raw
             if img[y0:y1, x0:x1].size > 0]
    if not crops:
        return []

    person_frames = track_frames(crops, classes=PERSON_CLASSES, conf=conf,
                                 offset=(x0, y0))
    small_frames = detect_multiscale(crops, classes=SMALL_CLASSES,
                                     conf=min(PHONE_CONF, BOOK_CONF),
                                     offset=(x0, y0))
    link_dist = max(16.0, (x1 - x0) * SMALL_OBJ_LINK_DIST_FRAC)
    link_by_centroid(small_frames, COCO_BOOK, link_dist, start_id=20_000)
    link_by_centroid(small_frames, COCO_CELL_PHONE, link_dist, start_id=30_000)

    by_t = {round(f.t_sec, 4): f for f in person_frames}
    for sf in small_frames:
        tgt = by_t.get(round(sf.t_sec, 4))
        if tgt is None:
            by_t[round(sf.t_sec, 4)] = sf
        else:
            tgt.dets.extend(sf.dets)
    return [by_t[k] for k in sorted(by_t)]


def run_cascade(
    video: str,
    grid: SeatGrid,
    candidates: list[Candidate],
    fps: float = CASCADE_FPS,
    conf: float = DET_CONF,
    pad_s: float = 1.0,
    fixtures: list | None = None,
    verbose: bool = True,
) -> list[WindowEvidence]:
    """Detect and track inside each promoted window.

    `fixtures` are static small objects identified over the whole file (see
    `pipeline/fixtures.py`). They are dropped here as well as in the sweep,
    because a mouse on a desk is inside the seat crop too.
    """
    from .fixtures import drop_fixtures
    by_id = grid.by_id()
    adj = grid.adjacency()
    out: list[WindowEvidence] = []

    for k, c in enumerate(candidates):
        seat = by_id.get(c.seat_id)
        if seat is None:
            continue
        nbrs = [by_id[n] for n in adj.get(c.seat_id, []) if n in by_id]
        roi = _roi_for(grid, seat, nbrs)
        t0 = max(0.0, c.start_sec - pad_s)
        t1 = c.end_sec + pad_s

        frames = _perceive_window(video, roi, t0, t1, fps=fps, conf=conf)
        n_dropped = drop_fixtures(frames, fixtures or [])
        ev = WindowEvidence(
            candidate=c, roi_px=roi, neighbour_ids=[n.seat_id for n in nbrs],
            frames=frames,
            seat_boxes={s.seat_id: tuple(float(v) for v in s.bbox_px)
                        for s in [seat] + nbrs},
        )
        out.append(ev)
        if verbose:
            n_det = sum(len(f.dets) for f in frames)
            print(f"  [cascade] {k+1}/{len(candidates)} seat {c.seat_id} "
                  f"{t0:.0f}-{t1:.0f}s: {len(frames)} frames, {n_det} detections"
                  + (f" ({n_dropped} fixture dets dropped)" if n_dropped else ""),
                  flush=True)
    return out


def scan_zone_crowd(
    video: str,
    duration_s: float,
    sample_fps: float = 1.0,
    conf: float = DET_CONF,
    verbose: bool = True,
) -> list[tuple[float, int]]:
    """Person count over time for a scene with no seat grid (reception, lobby).

    Deliberately a separate code path from everything above: `crowd_gathering`
    is a property of a *zone*, not of a seat, and forcing it through seat logic
    would invent seats where there are none.
    """
    from .detector import detect_frames, sample_frames

    n = max(1, int(duration_s * sample_fps))
    frames = sample_frames(video, 0.0, duration_s, n)
    fds = detect_frames(frames, conf=conf, classes=[COCO_PERSON])
    if verbose:
        counts = [len(f.dets) for f in fds]
        print(f"  [crowd] {len(fds)} frames, persons min={min(counts, default=0)} "
              f"median={int(np.median(counts)) if counts else 0} "
              f"max={max(counts, default=0)}", flush=True)
    return [(f.t_sec, len(f.dets)) for f in fds]


def sweep_persistent_objects(
    video: str,
    grid: SeatGrid,
    duration_s: float,
    start_s: float = 0.0,
    verbose: bool = True,
) -> list[FrameDets]:
    """Sparse full-frame sweep for objects that are simply *there*, all along.

    Deliberately full frame rather than per-seat crops: measured on clip 03, a
    seat crop upscaled to the detector's input size loses the phone that native
    full-frame inference finds in 38 of 40 frames.

    This is a complement to the Stage 1 change-point path, not a replacement.
    It answers a different question, and it is priced accordingly -- at most
    SWEEP_MAX_SAMPLES decoded frames for the whole file.
    """
    from .config import SWEEP_MAX_SAMPLES, SWEEP_MIN_INTERVAL_S
    from .detector import sample_frames

    interval = max(SWEEP_MIN_INTERVAL_S, duration_s / max(SWEEP_MAX_SAMPLES, 1))
    n = max(1, min(SWEEP_MAX_SAMPLES, int(duration_s / interval)))
    frames = sample_frames(video, start_s, duration_s, n)
    if not frames:
        return []
    fds = detect_multiscale(frames, classes=SMALL_CLASSES,
                            conf=min(PHONE_CONF, BOOK_CONF) * 0.6)
    if verbose:
        n_hit = sum(1 for f in fds if f.dets)
        print(f"  [sweep] {len(fds)} frames every {interval:.0f}s, "
              f"{n_hit} with a small-object detection", flush=True)
    return fds
