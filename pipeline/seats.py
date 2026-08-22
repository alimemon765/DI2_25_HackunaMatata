"""Seat discovery.

The footage is computer-based-test centres: candidates sit at PC cubicles, and
a seated candidate barely moves. Averaged motion energy therefore peaks on the
*aisle*, not on the seats -- discovering seats from motion alone finds the
walkway. So seats are discovered from **person persistence** instead:

1. Sample a few dozen frames across the calibration window (O(n) decodes, not
   O(duration) -- the full-duration scan stays motion-vector only).
2. Detect people. Agglomerate boxes across frames by IoU, so one cluster is one
   place a person keeps being.
3. Keep clusters occupied in at least `min_occupancy` of sampled frames. A
   candidate at a desk is present in nearly all of them; someone walking past
   is present in one or two, at any given spot.
4. Map each seat to the grid cells its box covers, so Stage 1's motion cube can
   be reduced to a per-seat time series.

IoU agglomeration handles the perspective for free: boxes shrink with depth,
and IoU is scale-relative, so no pitch model or homography is needed.

`discover_seats_from_motion` is kept as a detector-free fallback. It is honest
about being the weaker of the two -- see the docstring there.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
from scipy import ndimage

from .config import GRID_CELL_PX, SEAT_ACCUM_SECONDS, COCO_PERSON, DET_CONF
from .mv import ActivityCube


@dataclass
class Seat:
    seat_id: int
    row: int
    col: int
    cells: list[tuple[int, int]]        # (cy, cx) grid cells owned by this seat
    bbox_px: tuple[int, int, int, int]  # x0, y0, x1, y1
    centroid_px: tuple[float, float]
    energy: float                       # mean activity over the calibration window

    @property
    def label(self) -> str:
        return f"seat_{self.seat_id:02d}"

    def cell_mask(self, shape: tuple[int, int]) -> np.ndarray:
        m = np.zeros(shape, bool)
        for cy, cx in self.cells:
            m[cy, cx] = True
        return m


@dataclass
class SeatGrid:
    seats: list[Seat]
    pitch_cells: tuple[float, float]     # (y, x) estimated seat spacing, in cells
    grid_shape: tuple[int, int]
    frame_size: tuple[int, int]
    accum_seconds: float
    activity_map: np.ndarray             # (H, W) the map seats were found in
    notes: list[str]

    def __len__(self) -> int:
        return len(self.seats)

    def by_id(self) -> dict[int, Seat]:
        return {s.seat_id: s for s in self.seats}

    def label_map(self) -> np.ndarray:
        """(H, W) int, 0 = unassigned, else seat_id."""
        out = np.zeros(self.grid_shape, np.int32)
        for s in self.seats:
            for cy, cx in s.cells:
                out[cy, cx] = s.seat_id
        return out

    def adjacency(self, max_gap: float = 1.8) -> dict[int, list[int]]:
        """Seats close enough to hand something to each other.

        `max_gap` is in units of the estimated seat pitch, so the notion of
        "next to" scales with the hall's own geometry.
        """
        py, px = self.pitch_cells
        pitch = max(np.hypot(py, px), 1e-6)
        cents = {s.seat_id: np.array(s.centroid_px, float) for s in self.seats}
        adj: dict[int, list[int]] = {sid: [] for sid in cents}
        ids = list(cents)
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                d = np.linalg.norm(cents[a] - cents[b]) / (pitch * GRID_CELL_PX)
                if d <= max_gap:
                    adj[a].append(b)
                    adj[b].append(a)
        return adj

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "pitch_cells": list(self.pitch_cells),
            "grid_shape": list(self.grid_shape),
            "frame_size": list(self.frame_size),
            "accum_seconds": self.accum_seconds,
            "notes": self.notes,
            "seats": [
                {**asdict(s), "cells": [list(c) for c in s.cells],
                 "bbox_px": list(s.bbox_px), "centroid_px": list(s.centroid_px)}
                for s in self.seats
            ],
        }
        path.write_text(json.dumps(payload, indent=2))


def _estimate_pitch(amap: np.ndarray) -> tuple[float, float, list[str]]:
    """First off-centre peak of the 2-D autocorrelation = seat spacing."""
    notes: list[str] = []
    H, W = amap.shape
    x = amap - amap.mean()
    if not np.any(x):
        return 4.0, 4.0, ["activity map is empty; falling back to 4x4-cell pitch"]

    f = np.fft.rfft2(x, s=(2 * H, 2 * W))
    ac = np.fft.irfft2(f * np.conj(f), s=(2 * H, 2 * W)).real
    ac = np.fft.fftshift(ac)
    cy, cx = ac.shape[0] // 2, ac.shape[1] // 2

    def first_peak(profile: np.ndarray, centre: int, lo: int, hi: int, axis: str) -> float:
        seg = profile[centre + lo: centre + hi]
        if seg.size < 3:
            notes.append(f"{axis} autocorrelation too short; default pitch used")
            return 4.0
        # local maxima, take the nearest one to the centre
        peaks = np.where((seg[1:-1] > seg[:-2]) & (seg[1:-1] >= seg[2:]))[0] + 1
        if peaks.size == 0:
            notes.append(f"no {axis} autocorrelation peak; default pitch used")
            return 4.0
        return float(peaks[0] + lo)

    py = first_peak(ac[:, cx], cy, 2, min(H, 40), "vertical")
    px = first_peak(ac[cy, :], cx, 2, min(W, 40), "horizontal")
    notes.append(f"estimated seat pitch {py:.1f} x {px:.1f} cells "
                 f"({py*GRID_CELL_PX:.0f} x {px*GRID_CELL_PX:.0f} px)")
    return py, px, notes


def discover_seats_from_motion(
    ac: ActivityCube,
    accum_seconds: float = SEAT_ACCUM_SECONDS,
    min_cells: int = 2,
    occupancy_pct: float = 70.0,
) -> SeatGrid:
    """Detector-free fallback: find seats as local maxima of motion energy.

    Weaker than `discover_seats_from_persons` on this footage, because a still
    candidate produces almost no motion while an aisle produces a lot. Use it
    only when no detector is available.
    """
    notes: list[str] = []
    n = int(round(accum_seconds / ac.bin_s))
    if ac.n_bins < n:
        notes.append(f"only {ac.n_bins*ac.bin_s:.0f}s available, "
                     f"{accum_seconds:.0f}s requested for calibration")
        n = ac.n_bins
    amap = ac.cube[:n].mean(axis=0).astype(np.float32)

    py, px, pnotes = _estimate_pitch(amap)
    notes += pnotes

    # Smooth at roughly a third of the seat pitch: enough to join one person's
    # macroblocks, not enough to merge neighbours.
    sigma = max(0.6, min(py, px) / 3.0)
    smooth = ndimage.gaussian_filter(amap, sigma=sigma)

    thresh = float(np.percentile(smooth, occupancy_pct))
    mask = smooth > thresh
    if not mask.any():
        notes.append("no cell exceeded the occupancy threshold; no seats found")
        return SeatGrid([], (py, px), amap.shape, ac.frame_size, n * ac.bin_s, amap, notes)

    # Local maxima separated by about one seat pitch.
    fp_y = max(3, int(round(py)) | 1)
    fp_x = max(3, int(round(px)) | 1)
    mx = ndimage.maximum_filter(smooth, size=(fp_y, fp_x), mode="nearest")
    peaks = (smooth >= mx) & mask
    peak_lbl, n_peaks = ndimage.label(peaks, structure=np.ones((3, 3)))
    if n_peaks == 0:
        notes.append("no local maxima survived; no seats found")
        return SeatGrid([], (py, px), amap.shape, ac.frame_size, n * ac.bin_s, amap, notes)

    # Discrete Voronoi: every masked cell joins its nearest peak.
    _, (iy, ix) = ndimage.distance_transform_edt(peak_lbl == 0, return_indices=True)
    owner = np.where(mask, peak_lbl[iy, ix], 0)

    raw: list[dict] = []
    for lab in range(1, n_peaks + 1):
        cells = np.argwhere(owner == lab)
        if len(cells) < min_cells:
            continue
        ys, xs = cells[:, 0], cells[:, 1]
        raw.append({
            "cells": [(int(a), int(b)) for a, b in cells],
            "bbox_px": (int(xs.min()) * GRID_CELL_PX, int(ys.min()) * GRID_CELL_PX,
                        (int(xs.max()) + 1) * GRID_CELL_PX, (int(ys.max()) + 1) * GRID_CELL_PX),
            "cy": float(ys.mean()), "cx": float(xs.mean()),
            "energy": float(amap[ys, xs].mean()),
        })
    if not raw:
        notes.append(f"all candidate seats had < {min_cells} cells; none kept")
        return SeatGrid([], (py, px), amap.shape, ac.frame_size, n * ac.bin_s, amap, notes)

    # Row-major ordering: cluster centroids into rows by y, then sort by x.
    ys = np.array([r["cy"] for r in raw])
    order = np.argsort(ys)
    rows: list[list[int]] = []
    for idx in order:
        if rows and abs(ys[idx] - ys[rows[-1][-1]]) <= py * 0.6:
            rows[-1].append(int(idx))
        else:
            rows.append([int(idx)])

    seats: list[Seat] = []
    sid = 1
    for r_i, row in enumerate(rows):
        for c_i, idx in enumerate(sorted(row, key=lambda k: raw[k]["cx"])):
            r = raw[idx]
            seats.append(Seat(
                seat_id=sid, row=r_i, col=c_i, cells=r["cells"], bbox_px=r["bbox_px"],
                centroid_px=(r["cx"] * GRID_CELL_PX + GRID_CELL_PX / 2,
                             r["cy"] * GRID_CELL_PX + GRID_CELL_PX / 2),
                energy=r["energy"],
            ))
            sid += 1

    notes.append(f"{len(seats)} seats in {len(rows)} rows")
    return SeatGrid(seats, (py, px), amap.shape, ac.frame_size, n * ac.bin_s, amap, notes)


# --- primary path: seats from person persistence ----------------------------

def discover_seats_from_persons(
    video: str | Path,
    ac: ActivityCube,
    start_s: float | None = None,
    accum_seconds: float = SEAT_ACCUM_SECONDS,
    n_samples: int = 48,
    min_occupancy: float = 0.45,
    iou_join: float = 0.35,
    conf: float = DET_CONF,
    verbose: bool = True,
) -> SeatGrid:
    """Discover seats as places a person persistently is.

    `min_occupancy` is the fraction of sampled frames in which a cluster must
    be occupied to count as a seat. Raising it drops transient positions
    (people walking, invigilators); lowering it admits them.
    """
    from .detector import detect_frames, iou as box_iou, sample_frames

    notes: list[str] = []
    start_s = ac.start_s if start_s is None else start_s
    span = min(accum_seconds, max(ac.n_bins * ac.bin_s, accum_seconds))
    frames = sample_frames(video, start_s, span, n_samples)
    if not frames:
        notes.append("no frames could be sampled for seat calibration")
        return SeatGrid([], (4.0, 4.0), ac.grid_shape, ac.frame_size, span,
                        ac.cube[: int(span / ac.bin_s)].mean(axis=0), notes)

    fds = detect_frames(frames, conf=conf, classes=[COCO_PERSON])
    n_frames = len(fds)
    if verbose:
        tot = sum(len(f.dets) for f in fds)
        print(f"  [seats] {n_frames} calibration frames, {tot} person detections",
              flush=True)

    # IoU agglomeration: one cluster per place a person keeps being.
    clusters: list[dict] = []
    for fd in fds:
        for d in fd.dets:
            best, best_iou = None, 0.0
            for c in clusters:
                v = box_iou(d.xyxy, c["box"])
                if v > best_iou:
                    best, best_iou = c, v
            if best is not None and best_iou >= iou_join:
                k = best["n"]
                best["box"] = tuple((np.array(best["box"]) * k + np.array(d.xyxy)) / (k + 1))
                best["n"] = k + 1
                best["frames"].add(round(fd.t_sec, 3))
                best["conf"] += d.conf
            else:
                clusters.append({"box": tuple(d.xyxy), "n": 1,
                                 "frames": {round(fd.t_sec, 3)}, "conf": d.conf})

    kept = [c for c in clusters if len(c["frames"]) / max(n_frames, 1) >= min_occupancy]
    notes.append(f"{len(clusters)} person clusters, {len(kept)} persistent "
                 f"(occupied in >= {min_occupancy:.0%} of {n_frames} sampled frames)")
    if not kept:
        notes.append("no cluster met the occupancy bar; no seats found")
        return SeatGrid([], (4.0, 4.0), ac.grid_shape, ac.frame_size, span,
                        ac.cube[: int(span / ac.bin_s)].mean(axis=0), notes)

    # Seat pitch, reported for the record and used by adjacency(): the median
    # persistent-person box is a direct read of how big one seat is here.
    boxes = np.array([c["box"] for c in kept], float)
    pw = float(np.median(boxes[:, 2] - boxes[:, 0])) / GRID_CELL_PX
    ph = float(np.median(boxes[:, 3] - boxes[:, 1])) / GRID_CELL_PX
    notes.append(f"median person box {ph:.1f} x {pw:.1f} cells "
                 f"({ph*GRID_CELL_PX:.0f} x {pw*GRID_CELL_PX:.0f} px)")

    H, W = ac.grid_shape
    n_bins = max(1, int(span / ac.bin_s))
    amap = ac.cube[:n_bins].mean(axis=0)

    raw = []
    for c in kept:
        x0, y0, x1, y1 = c["box"]
        cx0 = int(np.clip(x0 // GRID_CELL_PX, 0, W - 1))
        cx1 = int(np.clip(x1 // GRID_CELL_PX, 0, W - 1))
        cy0 = int(np.clip(y0 // GRID_CELL_PX, 0, H - 1))
        cy1 = int(np.clip(y1 // GRID_CELL_PX, 0, H - 1))
        cells = [(yy, xx) for yy in range(cy0, cy1 + 1) for xx in range(cx0, cx1 + 1)]
        if not cells:
            continue
        ys = np.array([p[0] for p in cells]); xs = np.array([p[1] for p in cells])
        raw.append({
            "cells": cells,
            "bbox_px": (int(x0), int(y0), int(x1), int(y1)),
            "cx": float((x0 + x1) / 2), "cy": float((y0 + y1) / 2),
            "energy": float(amap[ys, xs].mean()),
            "occ": len(c["frames"]) / max(n_frames, 1),
        })

    # Row-major ordering. seat_id is a spatial index over this camera view, not
    # the number printed on the partition -- see the note below.
    ys = np.array([r["cy"] for r in raw])
    order = np.argsort(ys)
    row_tol = ph * GRID_CELL_PX * 0.6
    rows: list[list[int]] = []
    for idx in order:
        if rows and abs(ys[idx] - ys[rows[-1][-1]]) <= row_tol:
            rows[-1].append(int(idx))
        else:
            rows.append([int(idx)])

    seats: list[Seat] = []
    sid = 1
    for r_i, row in enumerate(rows):
        for c_i, idx in enumerate(sorted(row, key=lambda k: raw[k]["cx"])):
            r = raw[idx]
            seats.append(Seat(seat_id=sid, row=r_i, col=c_i, cells=r["cells"],
                              bbox_px=r["bbox_px"], centroid_px=(r["cx"], r["cy"]),
                              energy=r["energy"]))
            sid += 1

    notes.append(f"{len(seats)} seats in {len(rows)} image rows")
    notes.append("seat_id is a spatial index over this camera view. The printed "
                 "seat numbers are legible on the partitions and could be OCR'd "
                 "to map seat_id -> the invigilator's own numbering; not done yet.")
    return SeatGrid(seats, (ph, pw), ac.grid_shape, ac.frame_size, span, amap, notes)


def discover_seats_multi(
    video: str | Path,
    ac: ActivityCube,
    n_windows: int = 6,
    accum_seconds: float = SEAT_ACCUM_SECONDS,
    merge_iou: float = 0.4,
    verbose: bool = True,
    **kwargs,
) -> SeatGrid:
    """Union of seats discovered in several calibration windows across the file.

    Over two hours candidates arrive, leave, and are replaced, so a single
    120 s window sees only whoever happened to be sitting then. Each window
    still follows the SEAT_ACCUM_SECONDS rule; this just runs the rule at
    several points and merges the results by box IoU.
    """
    from .detector import iou as box_iou

    total_s = ac.n_bins * ac.bin_s
    if total_s <= accum_seconds * 1.5 or n_windows <= 1:
        return discover_seats_from_persons(
            video, ac, accum_seconds=accum_seconds, verbose=verbose, **kwargs)

    starts = np.linspace(ac.start_s, ac.start_s + total_s - accum_seconds,
                         n_windows)
    merged: list[dict] = []
    all_notes: list[str] = []
    for w_i, s0 in enumerate(starts):
        g = discover_seats_from_persons(video, ac, start_s=float(s0),
                                        accum_seconds=accum_seconds,
                                        verbose=False, **kwargs)
        if verbose:
            print(f"  [seats] window {w_i+1}/{n_windows} @ {s0:.0f}s -> "
                  f"{len(g)} seats", flush=True)
        all_notes.append(f"window @{s0:.0f}s: {len(g)} seats")
        for s in g.seats:
            hit = None
            for m in merged:
                if box_iou(s.bbox_px, m["bbox"]) >= merge_iou:
                    hit = m
                    break
            if hit is None:
                merged.append({"bbox": tuple(float(v) for v in s.bbox_px),
                               "n": 1, "energy": s.energy, "windows": {w_i}})
            else:
                k = hit["n"]
                hit["bbox"] = tuple((np.array(hit["bbox"]) * k
                                     + np.array(s.bbox_px)) / (k + 1))
                hit["n"] = k + 1
                hit["energy"] = (hit["energy"] * k + s.energy) / (k + 1)
                hit["windows"].add(w_i)

    if not merged:
        return SeatGrid([], (4.0, 4.0), ac.grid_shape, ac.frame_size,
                        accum_seconds, ac.cube.mean(axis=0),
                        all_notes + ["no seats in any calibration window"])

    H, W = ac.grid_shape
    amap = ac.cube.mean(axis=0)
    boxes = np.array([m["bbox"] for m in merged], float)
    pw = float(np.median(boxes[:, 2] - boxes[:, 0])) / GRID_CELL_PX
    ph = float(np.median(boxes[:, 3] - boxes[:, 1])) / GRID_CELL_PX

    raw = []
    for m in merged:
        x0, y0, x1, y1 = m["bbox"]
        cx0 = int(np.clip(x0 // GRID_CELL_PX, 0, W - 1))
        cx1 = int(np.clip(x1 // GRID_CELL_PX, 0, W - 1))
        cy0 = int(np.clip(y0 // GRID_CELL_PX, 0, H - 1))
        cy1 = int(np.clip(y1 // GRID_CELL_PX, 0, H - 1))
        cells = [(yy, xx) for yy in range(cy0, cy1 + 1) for xx in range(cx0, cx1 + 1)]
        if not cells:
            continue
        raw.append({"cells": cells, "bbox_px": (int(x0), int(y0), int(x1), int(y1)),
                    "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "energy": m["energy"],
                    "windows": len(m["windows"])})

    ys = np.array([r["cy"] for r in raw])
    order = np.argsort(ys)
    row_tol = ph * GRID_CELL_PX * 0.6
    rows: list[list[int]] = []
    for idx in order:
        if rows and abs(ys[idx] - ys[rows[-1][-1]]) <= row_tol:
            rows[-1].append(int(idx))
        else:
            rows.append([int(idx)])

    seats: list[Seat] = []
    sid = 1
    for r_i, row in enumerate(rows):
        for _, idx in enumerate(sorted(row, key=lambda k: raw[k]["cx"])):
            r = raw[idx]
            seats.append(Seat(seat_id=sid, row=r_i, col=_, cells=r["cells"],
                              bbox_px=r["bbox_px"],
                              centroid_px=(r["cx"], r["cy"]), energy=r["energy"]))
            sid += 1

    all_notes.append(f"{len(seats)} distinct seats after merging {n_windows} "
                     f"calibration windows (IoU >= {merge_iou})")
    all_notes.append(f"median seat box {ph:.1f} x {pw:.1f} cells")
    all_notes.append("seat_id is a spatial index over this camera view, not the "
                     "number printed on the partition.")
    return SeatGrid(seats, (ph, pw), ac.grid_shape, ac.frame_size,
                    accum_seconds, amap, all_notes)
