"""Cross-seat correlation.

Two neighbours whose activity rises together, within a couple of seconds of
each other, are doing something *jointly*. One seat moving alone is a candidate
fidgeting; two adjacent seats moving in lockstep is an interaction. The lag
allowance matters -- a reply comes after a question, not simultaneously with
it -- so correlation is maximised over lags up to CORR_MAX_LAG_S.

Correlation is evidence, not a verdict. It feeds `classify.py`, which is where
a name gets attached.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import CORR_MAX_LAG_S
from .score import SeatScores
from .seats import SeatGrid


@dataclass
class PairCorr:
    seat_a: int
    seat_b: int
    corr: float
    lag_s: float


def _norm(x: np.ndarray) -> np.ndarray:
    x = x - x.mean()
    n = np.linalg.norm(x)
    return x / n if n > 1e-12 else np.zeros_like(x)


def lagged_corr(
    a: np.ndarray,
    b: np.ndarray,
    bin_s: float,
    max_lag_s: float = CORR_MAX_LAG_S,
) -> tuple[float, float]:
    """Best Pearson correlation of a and b over lags in +/- max_lag_s.

    Positive lag means b follows a.
    """
    if a.size < 3 or b.size < 3:
        return 0.0, 0.0
    max_lag = int(round(max_lag_s / bin_s))
    max_lag = max(0, min(max_lag, a.size - 2))
    an, bn = _norm(a.astype(np.float64)), _norm(b.astype(np.float64))
    best, best_lag = 0.0, 0
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            x, y = an[: an.size - lag], bn[lag:]
        else:
            x, y = an[-lag:], bn[: bn.size + lag]
        if x.size < 3:
            continue
        # Re-normalise the overlap; slicing breaks the whole-series normalisation.
        xs, ys = _norm(x), _norm(y)
        c = float(np.dot(xs, ys))
        if c > best:
            best, best_lag = c, lag
    return best, best_lag * bin_s


def window_corr(
    scores: SeatScores,
    seat_a: int,
    seat_b: int,
    i0: int,
    i1: int,
    max_lag_s: float = CORR_MAX_LAG_S,
    pad_bins: int = 2,
) -> PairCorr:
    """Correlation between two seats over one event window (bin indices)."""
    lo = max(0, i0 - pad_bins)
    hi = min(scores.z.shape[0], i1 + pad_bins)
    a = scores.z[lo:hi, scores.index_of(seat_a)]
    b = scores.z[lo:hi, scores.index_of(seat_b)]
    c, lag = lagged_corr(a, b, scores.bin_s, max_lag_s)
    return PairCorr(seat_a, seat_b, c, lag)


def adjacent_pairs(grid: SeatGrid, max_gap: float = 1.8) -> list[tuple[int, int]]:
    adj = grid.adjacency(max_gap=max_gap)
    seen: set[tuple[int, int]] = set()
    for a, ns in adj.items():
        for b in ns:
            seen.add((min(a, b), max(a, b)))
    return sorted(seen)


def correlate_all(
    scores: SeatScores,
    grid: SeatGrid,
    max_lag_s: float = CORR_MAX_LAG_S,
) -> list[PairCorr]:
    """Whole-file correlation for every adjacent pair. A survey, not a trigger."""
    out: list[PairCorr] = []
    for a, b in adjacent_pairs(grid):
        if a not in scores.seat_ids or b not in scores.seat_ids:
            continue
        c, lag = lagged_corr(scores.series(a), scores.series(b),
                             scores.bin_s, max_lag_s)
        out.append(PairCorr(a, b, c, lag))
    return sorted(out, key=lambda p: -p.corr)
