"""Nuisance rejection on the activity cube, before anything is scored.

Three nuisances, three answers:

* **Camera vibration** is already handled upstream in `mv.py`, which subtracts
  the per-frame *median* motion vector before taking magnitudes. On a fixed
  mount most macroblocks are static, so the median is the global component.
  What is left here is a cross-check, not the fix.
* **Periodic motion** -- oscillating fans, fluttering curtains, rotating
  signage. Detected per cell as a narrow-band peak in the temporal spectrum.
  The discriminator is narrowbandness, not frequency: people are broadband,
  machines are not. Motion faster than the BIN_S Nyquist (0.5 Hz at 1 s bins)
  is not aliased into a false event -- it averages into a *constant* raised
  floor inside each bin, and a constant floor is exactly what the per-seat
  median/MAD baseline in `score.py` subtracts off.
* **Illumination steps** -- lights switched, sun through a window, auto-gain.
  These move every cell at once, so bins where a large fraction of the frame
  moves together are gated out rather than scored.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .config import (
    ILLUM_FRAC,
    PERIODIC_MAX_CELL_FRAC,
    PERIODIC_MIN_HZ,
    PERIODIC_MIN_PROMINENCE,
)
from .mv import ActivityCube


@dataclass
class FilterReport:
    periodic_cells: np.ndarray            # (H, W) bool, True = suppressed
    illum_bins: np.ndarray                # (T,) bool, True = gated out
    periodic_freq_hz: np.ndarray          # (H, W) float, dominant freq per cell
    periodic_trusted: bool = True
    notes: list[str] = field(default_factory=list)

    @property
    def n_periodic(self) -> int:
        return int(self.periodic_cells.sum())

    @property
    def n_gated(self) -> int:
        return int(self.illum_bins.sum())


def detect_periodic_cells(
    cube: np.ndarray,
    bin_s: float,
    min_prominence: float = PERIODIC_MIN_PROMINENCE,
    min_hz: float = PERIODIC_MIN_HZ,
) -> tuple[np.ndarray, np.ndarray, bool, list[str]]:
    """Flag cells whose temporal signal is dominated by one narrow frequency."""
    notes: list[str] = []
    T, H, W = cube.shape
    if T < 16:
        notes.append(f"only {T} bins; periodicity test skipped (needs >=16)")
        return np.zeros((H, W), bool), np.zeros((H, W), np.float32), False, notes

    x = cube.reshape(T, -1).astype(np.float32)
    x = x - x.mean(axis=0, keepdims=True)

    # Hann window so a real periodic component does not smear across bins.
    win = np.hanning(T).astype(np.float32)[:, None]
    spec = np.fft.rfft(x * win, axis=0)
    power = (spec.real ** 2 + spec.imag ** 2)
    freqs = np.fft.rfftfreq(T, d=bin_s)

    power[0] = 0.0                       # drop DC; the mean was removed anyway
    band = freqs >= min_hz
    power[~band] = 0.0

    total = power.sum(axis=0)
    peak_idx = power.argmax(axis=0)

    # Energy in the peak and its two neighbours -- one narrow lobe.
    lo = np.clip(peak_idx - 1, 0, power.shape[0] - 1)
    hi = np.clip(peak_idx + 1, 0, power.shape[0] - 1)
    cols = np.arange(power.shape[1])
    lobe = power[peak_idx, cols] + power[lo, cols] + power[hi, cols]

    with np.errstate(divide="ignore", invalid="ignore"):
        prominence = np.where(total > 0, lobe / total, 0.0)

    periodic = (prominence >= min_prominence) & (total > 0)
    periodic = periodic.reshape(H, W)
    dom_freq = freqs[peak_idx].reshape(H, W).astype(np.float32)

    frac = periodic.mean()
    trusted = True
    if frac > PERIODIC_MAX_CELL_FRAC:
        trusted = False
        notes.append(
            f"{frac:.0%} of cells look periodic (> {PERIODIC_MAX_CELL_FRAC:.0%}); "
            "suppression NOT applied -- the window is probably too short for the "
            "spectrum to be meaningful"
        )
        periodic = np.zeros((H, W), bool)
    return periodic, dom_freq, trusted, notes


def detect_illumination_bins(cube: np.ndarray, frac: float = ILLUM_FRAC) -> np.ndarray:
    """Bins where most of the frame moves at once are lighting, not people."""
    T, H, W = cube.shape
    flat = cube.reshape(T, -1)
    # Per-cell robust "is this cell unusually active" test, then count cells.
    med = np.median(flat, axis=0)
    mad = np.median(np.abs(flat - med), axis=0)
    scale = np.maximum(1.4826 * mad, 1e-3)
    hot = (flat - med) / scale > 3.0
    return hot.mean(axis=1) >= frac


def apply_filters(ac: ActivityCube, inplace: bool = False) -> tuple[ActivityCube, FilterReport]:
    """Suppress periodic cells and gate illumination bins. Returns a new cube."""
    periodic, dom_freq, trusted, notes = detect_periodic_cells(ac.cube, ac.bin_s)
    illum = detect_illumination_bins(ac.cube)

    cube = ac.cube if inplace else ac.cube.copy()
    if periodic.any():
        cube[:, periodic] = 0.0

    # A gated bin is not zeroed -- zero would read as "unusually still" and is
    # itself an anomaly. It is replaced by the per-cell median so it scores as
    # ordinary, and the mask is carried forward for the record.
    if illum.any():
        med = np.median(cube[~illum], axis=0) if (~illum).any() else np.zeros(cube.shape[1:], np.float32)
        cube[illum] = med

    residual = float(np.abs(ac.global_mv).max()) if ac.global_mv.size else 0.0
    if residual > 0.5:
        notes.append(f"residual global motion up to {residual:.2f} px/frame "
                     "after median subtraction -- camera may be moving, not just shaking")

    out = ActivityCube(
        cube=cube, coverage=ac.coverage, global_mv=ac.global_mv, bin_s=ac.bin_s,
        fps=ac.fps, duration_s=ac.duration_s, frame_size=ac.frame_size,
        start_s=ac.start_s, source=ac.source,
    )
    return out, FilterReport(periodic, illum, dom_freq, trusted, notes)
