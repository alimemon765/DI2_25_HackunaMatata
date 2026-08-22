"""Shared YOLO11 access and frame sampling.

Both seat calibration and the Stage 2 cascade need a detector, and both need
frames. Neither should own the model. Full decode happens only here, and only
for the frames someone explicitly asked for -- never for the full-duration
Stage 1 scan, which reads motion vectors instead (see `mv.py`).
"""
from __future__ import annotations

import functools
from dataclasses import dataclass
from pathlib import Path

import av
import numpy as np

from .config import DET_CONF, DET_SCALES, SMALL_OBJ_LINK_DIST_FRAC, TRACKER, YOLO_WEIGHTS


@functools.lru_cache(maxsize=4)
def load_model(weights: str = YOLO_WEIGHTS):
    from ultralytics import YOLO
    return YOLO(weights)


@functools.lru_cache(maxsize=1)
def class_names(weights: str = YOLO_WEIGHTS) -> dict[int, str]:
    return dict(load_model(weights).names)


@dataclass
class Detection:
    cls_id: int
    name: str
    conf: float
    xyxy: tuple[float, float, float, float]
    track_id: int | None = None

    @property
    def centroid(self) -> tuple[float, float]:
        x0, y0, x1, y1 = self.xyxy
        return (x0 + x1) / 2.0, (y0 + y1) / 2.0

    @property
    def area(self) -> float:
        x0, y0, x1, y1 = self.xyxy
        return max(0.0, x1 - x0) * max(0.0, y1 - y0)


@dataclass
class FrameDets:
    t_sec: float
    dets: list[Detection]


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    ua = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / ua if ua > 0 else 0.0


def sample_frames(
    video: str | Path,
    start_s: float,
    duration_s: float,
    n: int,
) -> list[tuple[float, np.ndarray]]:
    """`n` frames spread evenly over a window, as BGR arrays.

    Seeks per frame rather than decoding the window, so cost is O(n) and does
    not grow with the window length.
    """
    video = Path(video)
    out: list[tuple[float, np.ndarray]] = []
    targets = np.linspace(start_s, start_s + duration_s, n, endpoint=False)
    with av.open(str(video)) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        tb = float(st.time_base) if st.time_base else 1 / 25
        for t in targets:
            try:
                c.seek(int(t / tb), stream=st, backward=True, any_frame=False)
                for frame in c.decode(video=0):
                    ts = float(frame.pts * tb) if frame.pts is not None else t
                    if ts + 1e-6 < t:
                        continue
                    out.append((ts, frame.to_ndarray(format="bgr24")))
                    break
            except (av.AVError, StopIteration):
                continue
    return out


def detect_frames(
    frames: list[tuple[float, np.ndarray]],
    weights: str = YOLO_WEIGHTS,
    conf: float = DET_CONF,
    classes: list[int] | None = None,
    batch: int = 16,
) -> list[FrameDets]:
    """Plain detection, no tracking. Used for seat calibration."""
    model = load_model(weights)
    names = class_names(weights)
    out: list[FrameDets] = []
    for i in range(0, len(frames), batch):
        chunk = frames[i:i + batch]
        res = model.predict([f for _, f in chunk], conf=conf, classes=classes,
                            verbose=False)
        for (t, _), r in zip(chunk, res):
            dets = []
            if r.boxes is not None:
                for b in r.boxes:
                    cid = int(b.cls)
                    dets.append(Detection(
                        cls_id=cid, name=names.get(cid, str(cid)),
                        conf=float(b.conf),
                        xyxy=tuple(float(v) for v in b.xyxy[0].tolist()),
                    ))
            out.append(FrameDets(t_sec=t, dets=dets))
    return out


def reset_tracker(model) -> None:
    """Drop tracker state so ids do not leak between unrelated windows."""
    pred = getattr(model, "predictor", None)
    for t in getattr(pred, "trackers", []) or []:
        if hasattr(t, "reset"):
            t.reset()


def track_window(
    video: str | Path,
    start_s: float,
    end_s: float,
    fps: float,
    weights: str = YOLO_WEIGHTS,
    conf: float = DET_CONF,
    classes: list[int] | None = None,
    tracker: str = TRACKER,
    roi: tuple[int, int, int, int] | None = None,
) -> list[FrameDets]:
    """Detect + ByteTrack across one window, yielding persistent track ids.

    If `roi` is given, inference runs on that crop and boxes are mapped back to
    full-frame coordinates. Cropping to the seat region is what makes small
    objects -- a phone, a folded sheet -- large enough for the detector to see;
    at full frame they are a handful of pixels.

    Track ids are ID-persistence for movement analysis inside a single window.
    They are not an identity: nothing is stored, nothing is matched across
    windows or across videos, and no face is ever computed. The tracker is
    reset between windows precisely so ids cannot be joined up over time.
    """
    model = load_model(weights)
    names = class_names(weights)
    reset_tracker(model)

    step = max(1.0 / max(fps, 0.1), 1e-3)
    n = max(1, int(round((end_s - start_s) / step)))
    frames = sample_frames(video, start_s, end_s - start_s, n)

    ox, oy = (roi[0], roi[1]) if roi else (0, 0)
    out: list[FrameDets] = []
    for t, img in frames:
        if roi is not None:
            x0, y0, x1, y1 = roi
            img = img[y0:y1, x0:x1]
            if img.size == 0:
                continue
        res = model.track(img, conf=conf, classes=classes, tracker=tracker,
                          persist=True, verbose=False)[0]
        dets = []
        if res.boxes is not None:
            ids = res.boxes.id
            for j, b in enumerate(res.boxes):
                cid = int(b.cls)
                tid = int(ids[j]) if ids is not None else None
                bx = [float(v) for v in b.xyxy[0].tolist()]
                dets.append(Detection(
                    cls_id=cid, name=names.get(cid, str(cid)), conf=float(b.conf),
                    xyxy=(bx[0] + ox, bx[1] + oy, bx[2] + ox, bx[3] + oy),
                    track_id=tid,
                ))
        out.append(FrameDets(t_sec=t, dets=dets))
    return out


def _dedupe(dets: list[Detection], iou_thresh: float = 0.6) -> list[Detection]:
    """Keep the most confident of overlapping same-class boxes."""
    out: list[Detection] = []
    for d in sorted(dets, key=lambda x: -x.conf):
        if any(o.cls_id == d.cls_id and iou(o.xyxy, d.xyxy) > iou_thresh for o in out):
            continue
        out.append(d)
    return out


def detect_multiscale(
    images: list[tuple[float, np.ndarray]],
    classes: list[int],
    scales: tuple[int, ...] = DET_SCALES,
    conf: float = 0.10,
    weights: str = YOLO_WEIGHTS,
    offset: tuple[int, int] = (0, 0),
    include_native: bool = True,
) -> list[FrameDets]:
    """Detect small classes at several input sizes and merge.

    Not test-time augmentation for its own sake: the measured detection rate
    for `cell phone` swings from 0/40 to 38/40 across the two sizes depending
    on the clip, in both directions, so neither size can be dropped.

    `include_native` adds the crop's own pixel size to the list. This matters
    because a seat crop is small -- feeding it at imgsz 640 *upscales* it, and
    on clip 03 that upscaling is precisely what loses the phone that native
    full-frame inference finds in 38 of 40 frames. Detecting at native size
    keeps the object at the scale the weights were trained to expect.
    """
    model = load_model(weights)
    names = class_names(weights)
    ox, oy = offset
    out: list[FrameDets] = []
    for t, img in images:
        sizes = list(scales)
        if include_native and img.size:
            native = int(round(max(img.shape[:2]) / 32.0)) * 32
            native = int(np.clip(native, 160, 1600))
            if native not in sizes:
                sizes.append(native)
        merged: list[Detection] = []
        for sz in sizes:
            r = model.predict(img, conf=conf, classes=classes, imgsz=sz,
                              verbose=False)[0]
            if r.boxes is None:
                continue
            for b in r.boxes:
                cid = int(b.cls)
                bx = [float(v) for v in b.xyxy[0].tolist()]
                merged.append(Detection(
                    cls_id=cid, name=names.get(cid, str(cid)), conf=float(b.conf),
                    xyxy=(bx[0] + ox, bx[1] + oy, bx[2] + ox, bx[3] + oy)))
        out.append(FrameDets(t_sec=t, dets=_dedupe(merged)))
    return out


def link_by_centroid(
    frames: list[FrameDets],
    cls_id: int,
    max_dist: float,
    start_id: int = 10_000,
) -> None:
    """Assign track ids to one class by greedy nearest-centroid linking.

    ByteTrack is tuned for people and is not reliable on a small, flickering
    object that vanishes for frames at a time. Following an object between
    seats needs only frame-to-frame proximity, which this does directly, and
    keeps the small-object path independent of the person tracker.

    Ids start high so they cannot be confused with ByteTrack person ids.
    """
    next_id = start_id
    prev: list[tuple[int, tuple[float, float]]] = []
    for f in frames:
        cur: list[tuple[int, tuple[float, float]]] = []
        for d in f.dets:
            if d.cls_id != cls_id:
                continue
            cx, cy = d.centroid
            best, best_d = None, max_dist
            for tid, (px, py) in prev:
                dist = float(np.hypot(cx - px, cy - py))
                if dist < best_d and all(tid != c[0] for c in cur):
                    best, best_d = tid, dist
            if best is None:
                best = next_id
                next_id += 1
            d.track_id = best
            cur.append((best, (cx, cy)))
        if cur:
            prev = cur


def track_frames(
    images: list[tuple[float, np.ndarray]],
    classes: list[int] | None = None,
    weights: str = YOLO_WEIGHTS,
    conf: float = DET_CONF,
    tracker: str = TRACKER,
    offset: tuple[int, int] = (0, 0),
    reset: bool = True,
) -> list[FrameDets]:
    """ByteTrack over already-decoded frames. See track_window for the caveats."""
    model = load_model(weights)
    names = class_names(weights)
    if reset:
        reset_tracker(model)
    ox, oy = offset
    out: list[FrameDets] = []
    for t, img in images:
        res = model.track(img, conf=conf, classes=classes, tracker=tracker,
                          persist=True, verbose=False)[0]
        dets = []
        if res.boxes is not None:
            ids = res.boxes.id
            for j, b in enumerate(res.boxes):
                cid = int(b.cls)
                bx = [float(v) for v in b.xyxy[0].tolist()]
                dets.append(Detection(
                    cls_id=cid, name=names.get(cid, str(cid)), conf=float(b.conf),
                    xyxy=(bx[0] + ox, bx[1] + oy, bx[2] + ox, bx[3] + oy),
                    track_id=int(ids[j]) if ids is not None else None))
        out.append(FrameDets(t_sec=t, dets=dets))
    return out


def decode_window(
    video: str | Path,
    start_s: float,
    end_s: float,
    fps: float,
) -> list[tuple[float, np.ndarray]]:
    """Frames from one contiguous window: seek once, then decode forward.

    `sample_frames` seeks per frame, which is right when the targets are spread
    across hours and wrong inside a single window -- there the seeks dominate,
    and a two-hour file promotes enough windows for that to decide whether the
    cascade finishes at all.
    """
    video = Path(video)
    out: list[tuple[float, np.ndarray]] = []
    step = 1.0 / max(fps, 0.1)
    next_t = start_s
    with av.open(str(video)) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        tb = float(st.time_base) if st.time_base else 1 / 25
        try:
            c.seek(int(max(0.0, start_s) / tb), stream=st, backward=True,
                   any_frame=False)
        except av.AVError:
            return out
        for frame in c.decode(video=0):
            ts = float(frame.pts * tb) if frame.pts is not None else None
            if ts is None:
                continue
            if ts < start_s:
                continue
            if ts > end_s:
                break
            if ts + 1e-9 < next_t:
                continue
            out.append((ts, frame.to_ndarray(format="bgr24")))
            next_t = ts + step
    return out
