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
    # Persons are collected on the same pass: the crowd rule needs a person
    # count over the whole file, and this is already the whole file.
    fds = detect_multiscale(frames, classes=SMALL_CLASSES + [COCO_PERSON],
                            conf=min(PHONE_CONF, BOOK_CONF) * 0.6,
                            include_native=False)
    if verbose:
        n_hit = sum(1 for f in fds if f.dets)
        print(f"  [sweep] {len(fds)} frames every {interval:.0f}s, "
              f"{n_hit} with a small-object detection", flush=True)
    return fds


def _sweep_cache_path(video: str, duration_s: float, start_s: float,
                      cache_dir: str = "cache") -> "Path":
    from pathlib import Path
    stem = Path(video).stem
    return Path(cache_dir) / f"sweep_{stem}_s{start_s:.0f}_d{duration_s:.0f}.json"


def cached_sweep(
    video: str,
    grid: SeatGrid | None,
    duration_s: float,
    start_s: float = 0.0,
    cache_dir: str = "cache",
    verbose: bool = True,
) -> list[FrameDets]:
    """`sweep_persistent_objects` with an on-disk cache of its detections.

    The sweep is the only whole-file detection pass, and the fixture test is
    built on top of it. Caching the detections means that test can be changed
    and re-measured without decoding two hours of video again -- which is the
    difference between iterating on it and guessing at it.
    """
    import json
    from pathlib import Path

    p = _sweep_cache_path(video, duration_s, start_s, cache_dir)
    if p.exists():
        raw = json.loads(p.read_text())
        if verbose:
            print(f"  [sweep] cache hit {p} ({len(raw)} frames)", flush=True)
        return [FrameDets(t_sec=f["t"],
                          dets=[Detection(cls_id=d[0], name=d[1], conf=d[2],
                                          xyxy=tuple(d[3]))
                                for d in f["d"]])
                for f in raw]

    frames = sweep_persistent_objects(video, grid, duration_s, start_s=start_s,
                                      verbose=verbose)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(
        [{"t": f.t_sec,
          "d": [[d.cls_id, d.name, round(d.conf, 4),
                 [round(v, 1) for v in d.xyxy]] for d in f.dets]}
         for f in frames]))
    return frames


# --- Stage 2 evidence cache -------------------------------------------------
# Stage 3 is a rule engine, so it is the part most likely to be changed and
# re-run. Without this cache, changing a rule means re-running the cascade --
# 55 minutes across the two long files -- which makes iterating on rules
# impractical and encourages guessing instead of measuring.

def _evidence_key(video: str, candidates: list[Candidate]) -> str:
    import hashlib
    from pathlib import Path
    h = hashlib.sha1()
    for c in candidates:
        h.update(f"{c.seat_id}:{c.start_sec:.3f}:{c.end_sec:.3f};".encode())
    return f"evidence_{Path(video).stem}_{len(candidates)}_{h.hexdigest()[:10]}.json"


def save_evidence(video: str, evidence: list[WindowEvidence],
                  candidates: list[Candidate], cache_dir: str = "cache") -> None:
    import json
    from pathlib import Path
    p = Path(cache_dir) / _evidence_key(video, candidates)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps([{
        "cand": {"seat_id": e.candidate.seat_id, "start_sec": e.candidate.start_sec,
                 "end_sec": e.candidate.end_sec, "i0": e.candidate.i0,
                 "i1": e.candidate.i1, "peak_z": e.candidate.peak_z,
                 "mean_z": e.candidate.mean_z, "duration_s": e.candidate.duration_s},
        "roi": list(e.roi_px), "nbrs": e.neighbour_ids,
        "seat_boxes": {str(k): list(v) for k, v in e.seat_boxes.items()},
        "frames": [{"t": f.t_sec,
                    "d": [[d.cls_id, d.name, round(d.conf, 4),
                           [round(v, 1) for v in d.xyxy], d.track_id]
                          for d in f.dets]} for f in e.frames],
    } for e in evidence]))


def load_evidence(video: str, candidates: list[Candidate],
                  cache_dir: str = "cache") -> list[WindowEvidence] | None:
    import json
    from pathlib import Path
    p = Path(cache_dir) / _evidence_key(video, candidates)
    if not p.exists():
        return None
    out: list[WindowEvidence] = []
    for r in json.loads(p.read_text()):
        c = r["cand"]
        out.append(WindowEvidence(
            candidate=Candidate(c["seat_id"], c["start_sec"], c["end_sec"],
                                c["i0"], c["i1"], c["peak_z"], c["mean_z"],
                                c["duration_s"]),
            roi_px=tuple(r["roi"]), neighbour_ids=r["nbrs"],
            seat_boxes={int(k): tuple(v) for k, v in r["seat_boxes"].items()},
            frames=[FrameDets(t_sec=f["t"],
                              dets=[Detection(cls_id=d[0], name=d[1], conf=d[2],
                                              xyxy=tuple(d[3]), track_id=d[4])
                                    for d in f["d"]]) for f in r["frames"]],
        ))
    return out
