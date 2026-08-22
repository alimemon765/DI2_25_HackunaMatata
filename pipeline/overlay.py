"""Burn evidence into the exported clips.

A bare cropped clip asks the reviewer to take our word for what they are
looking at. This draws the thing that actually triggered the event, and states
the label, seat and confidence on the frame, so a clip is self-explanatory.

Two honesty constraints shape the design:

* **Not every label has an object to box.** `talking_to_neighbour` is triggered
  by correlated activity between two seats and `unclassified_anomaly` is by
  definition the case where no rule matched. Neither has a detection behind it.
  Drawing a tight box on those would assert evidence that does not exist, so
  they get a loosely-drawn *seat region* in a different colour, labelled as a
  region.
* **Boxes are sampled at CASCADE_FPS (5 Hz), the video runs at 25 fps.** Held
  to the nearest sample they visibly step and lag movement by up to 200 ms, so
  positions are linearly interpolated between samples and dropped entirely
  outside the sampled range rather than extrapolated.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .config import COCO_BOOK, COCO_CELL_PHONE

# BGR
C_TRIGGER = (90, 230, 60)      # green: this is what fired the rule
C_REGION = (40, 190, 245)      # amber: a seat region, not a detection
C_BANNER = (24, 24, 28)
C_TEXT = (245, 245, 245)
C_DIM = (140, 140, 140)

MAX_EXTRAPOLATE_S = 0.30       # never draw a box further than this from a sample
DISCLAIMER = "REWIND - observed behaviour, not a determination"


def load_evidence_index(cache_dir: str = "cache") -> dict:
    """(video_stem, seat_id, round(start,1), round(end,1)) -> cached window."""
    idx = {}
    for p in Path(cache_dir).glob("evidence_*.json"):
        stem = p.stem[len("evidence_"):].rsplit("_", 2)[0]
        for w in json.loads(p.read_text()):
            c = w["cand"]
            idx[(stem, c["seat_id"], round(c["start_sec"], 1),
                 round(c["end_sec"], 1))] = w
    return idx


def _trigger_spec(event: dict) -> tuple[str, object]:
    """What should be highlighted for this label."""
    label = event["action_label"]
    ev = event.get("evidence", {})
    if label == "mobile_phone_usage":
        return "class", COCO_CELL_PHONE
    if label.startswith("paper_pass"):
        return "class", COCO_BOOK
    if label == "staff_or_transit":
        return "track", [t for t in [ev.get("track_id")] if t is not None]
    if label == "seat_exchange":
        return "track", [t for t in [ev.get("track_a"), ev.get("track_b")]
                         if t is not None]
    return "region", None


def _collect_tracks(window: dict, spec: tuple[str, object]) -> dict:
    """identity -> sorted [(t_sec, box, conf, name)] for whatever we highlight."""
    kind, arg = spec
    out: dict = {}
    for f in window["frames"]:
        for cls_id, name, conf, xyxy, tid in f["d"]:
            if kind == "class" and cls_id != arg:
                continue
            if kind == "track" and (tid is None or tid not in arg):
                continue
            key = tid if tid is not None else f"{name}"
            out.setdefault(key, []).append((f["t"], xyxy, conf, name))
    for k in out:
        out[k].sort(key=lambda r: r[0])
    return out


def _interp_box(samples: list, t: float) -> tuple | None:
    """Linear interpolation between the two bracketing samples, else None."""
    if not samples:
        return None
    ts = [s[0] for s in samples]
    if t < ts[0] - MAX_EXTRAPOLATE_S or t > ts[-1] + MAX_EXTRAPOLATE_S:
        return None
    i = int(np.searchsorted(ts, t))
    if i == 0:
        return samples[0][1], samples[0][2], samples[0][3]
    if i >= len(ts):
        return samples[-1][1], samples[-1][2], samples[-1][3]
    t0, b0, c0, n0 = samples[i - 1]
    t1, b1, c1, n1 = samples[i]
    span = max(t1 - t0, 1e-6)
    a = float(np.clip((t - t0) / span, 0.0, 1.0))
    box = [b0[j] + a * (b1[j] - b0[j]) for j in range(4)]
    return box, c0 + a * (c1 - c0), n0


def _put_label(img, x, y, text, colour, scale=0.5):
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    y = max(y, th + 6)
    cv2.rectangle(img, (x, y - th - 6), (x + tw + 8, y + 2), C_BANNER, -1)
    cv2.putText(img, text, (x + 4, y - 3), cv2.FONT_HERSHEY_SIMPLEX, scale,
                colour, 1, cv2.LINE_AA)


def _draw_region(img, box, text):
    """Corner brackets, not a solid rectangle -- a region, not a detection."""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = [int(v) for v in box]
    # A seat box can extend past the ROI crop; clamp so brackets stay visible.
    x0, x1 = max(2, min(x0, w - 3)), max(2, min(x1, w - 3))
    y0, y1 = max(2, min(y0, h - 3)), max(2, min(y1, h - 3))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return
    L = max(14, int(0.18 * min(x1 - x0, y1 - y0)))
    for (cx, cy, dx, dy) in ((x0, y0, 1, 1), (x1, y0, -1, 1),
                             (x0, y1, 1, -1), (x1, y1, -1, -1)):
        cv2.line(img, (cx, cy), (cx + dx * L, cy), C_REGION, 2, cv2.LINE_AA)
        cv2.line(img, (cx, cy), (cx, cy + dy * L), C_REGION, 2, cv2.LINE_AA)
    _put_label(img, x0, y0 - 4, text, C_REGION)


def burn(event: dict, window: dict | None, out_path: Path,
         pad_s: float = 2.0, crf: int = 23) -> Path | None:
    """Redraw one clip with its evidence burned in."""
    src = Path(event["clip_path"])
    if not src.exists():
        return None
    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    roi = window["roi"] if window else [0, 0, w, h]
    ox, oy = roi[0], roi[1]
    t_clip0 = max(0.0, event["start_sec"] - pad_s)

    spec = _trigger_spec(event)
    tracks = _collect_tracks(window, spec) if window else {}
    seat_box = None
    if window:
        sb = window.get("seat_boxes", {}).get(str(event.get("seat_id")))
        seat_box = sb

    out_path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{w}x{h}", "-r", f"{fps}", "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf),
         "-pix_fmt", "yuv420p", str(out_path)],
        stdin=subprocess.PIPE)

    banner = (f"{event['action_label']}  |  seat {event.get('seat_id', '-')}"
              f"  |  conf {event.get('confidence', 0):.2f}")
    i = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t_src = t_clip0 + i / fps
            drew = False
            for key, samples in tracks.items():
                got = _interp_box(samples, t_src)
                if got is None:
                    continue
                box, conf, name = got
                x0, y0 = int(box[0] - ox), int(box[1] - oy)
                x1, y1 = int(box[2] - ox), int(box[3] - oy)
                cv2.rectangle(frame, (x0, y0), (x1, y1), C_TRIGGER, 2, cv2.LINE_AA)
                _put_label(frame, x0, y0 - 4, f"{name} {conf:.2f}", C_TRIGGER)
                drew = True
            if not drew and seat_box is not None:
                _draw_region(frame, [seat_box[0] - ox, seat_box[1] - oy,
                                     seat_box[2] - ox, seat_box[3] - oy],
                             f"seat {event.get('seat_id')} region")
            cv2.rectangle(frame, (0, 0), (w, 26), C_BANNER, -1)
            cv2.putText(frame, banner, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                        C_TEXT, 1, cv2.LINE_AA)
            cv2.putText(frame, DISCLAIMER, (8, h - 8), cv2.FONT_HERSHEY_SIMPLEX,
                        0.38, C_DIM, 1, cv2.LINE_AA)
            proc.stdin.write(frame.tobytes())
            i += 1
    finally:
        cap.release()
        if proc.stdin:
            proc.stdin.close()
        proc.wait()
    return out_path if out_path.exists() else None
