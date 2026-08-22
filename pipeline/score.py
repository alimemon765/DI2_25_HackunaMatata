"""Per-seat robust anomaly scoring.

Every score is relative to that seat's *own* rolling baseline: z = (x - median)
/ (1.4826 * MAD) over BASELINE_WINDOW_S. A seat near a doorway is busy all day
and a seat in the corner is not; comparing either against a hall-wide average
would flag the geometry rather than the behaviour.

Median and MAD throughout -- never mean and standard deviation. The events we
are looking for are exactly the outliers, and outliers wreck a mean.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .config import (
    ACTIVITY_TRANSFORM,
    BASELINE_WINDOW_S,
    MAD_FLOOR_FRAC_GLOBAL,
    MAD_FLOOR_FRAC_SEAT,
)
from .mv import ActivityCube
from .seats import SeatGrid

MAD_TO_SIGMA = 1.4826


def stabilise(x: np.ndarray, kind: str = ACTIVITY_TRANSFORM) -> np.ndarray:
    """Variance-stabilising transform. Monotone, so it reorders nothing."""
    if kind == "sqrt":
        return np.sqrt(np.maximum(x, 0.0))
    if kind == "log1p":
        return np.log1p(np.maximum(x, 0.0))
    return x


@dataclass
class SeatScores:
    seat_ids: list[int]
    times: np.ndarray      # (T,) bin centres, seconds into the source file
    activity: np.ndarray   # (T, S) mean motion energy per seat per bin
    z: np.ndarray          # (T, S) robust z, clipped at 0 below
    baseline: np.ndarray   # (T, S) rolling median
    scale: np.ndarray      # (T, S) rolling robust scale actually used
    bin_s: float

    def index_of(self, seat_id: int) -> int:
        return self.seat_ids.index(seat_id)

    def series(self, seat_id: int) -> np.ndarray:
        return self.z[:, self.index_of(seat_id)]


def seat_activity(ac: ActivityCube, grid: SeatGrid) -> tuple[list[int], np.ndarray]:
    """Reduce the (T, H, W) cube to (T, S) by averaging each seat's own cells."""
    seat_ids = [s.seat_id for s in grid.seats]
    T = ac.n_bins
    out = np.zeros((T, len(seat_ids)), np.float32)
    for j, s in enumerate(grid.seats):
        ys = np.array([c[0] for c in s.cells])
        xs = np.array([c[1] for c in s.cells])
        out[:, j] = ac.cube[:, ys, xs].mean(axis=1)
    return seat_ids, out


def robust_z(
    activity: np.ndarray,
    bin_s: float,
    window_s: float = BASELINE_WINDOW_S,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Rolling median/MAD z-score per column. Returns (z, baseline, scale)."""
    T, S = activity.shape
    w = max(3, int(round(window_s / bin_s)) | 1)   # odd, so the window is centred
    w = min(w, T if T % 2 else T - 1) or 3

    baseline = np.empty_like(activity, dtype=np.float32)
    resid_abs = np.empty_like(activity, dtype=np.float32)
    for j in range(S):
        baseline[:, j] = ndimage.median_filter(activity[:, j], size=w, mode="nearest")
    resid = activity - baseline
    for j in range(S):
        resid_abs[:, j] = ndimage.median_filter(np.abs(resid[:, j]), size=w,
                                                mode="nearest")

    scale = MAD_TO_SIGMA * resid_abs

    # Floors, so a permanently still seat cannot divide by ~zero.
    seat_med = np.median(activity, axis=0, keepdims=True)
    seat_mad = np.median(np.abs(activity - seat_med), axis=0, keepdims=True)
    seat_floor = MAD_FLOOR_FRAC_SEAT * MAD_TO_SIGMA * seat_mad
    global_floor = MAD_FLOOR_FRAC_GLOBAL * float(np.percentile(activity, 95))
    floor = np.maximum(seat_floor, max(global_floor, 1e-6))

    scale = np.maximum(scale, floor)
    z = np.clip(resid / scale, 0.0, None)
    return z.astype(np.float32), baseline, scale.astype(np.float32)


def score_seats(
    ac: ActivityCube,
    grid: SeatGrid,
    window_s: float = BASELINE_WINDOW_S,
) -> SeatScores:
    seat_ids, activity = seat_activity(ac, grid)
    if not seat_ids:
        empty = np.zeros((ac.n_bins, 0), np.float32)
        return SeatScores([], ac.times(), empty, empty, empty, empty, ac.bin_s)
    z, base, scale = robust_z(stabilise(activity), ac.bin_s, window_s)
    # `activity` is kept untransformed so evidence and plots stay in the
    # physical unit (mean residual motion-vector magnitude, px/frame); only the
    # scoring path is transformed.
    return SeatScores(seat_ids, ac.times(), activity, z, base, scale, ac.bin_s)
