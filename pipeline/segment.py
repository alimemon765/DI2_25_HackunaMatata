"""Event boundaries by change-point detection.

Thresholding a z-series gives ragged edges: a run of z > 3.5 starts and stops
wherever noise happens to cross the line. PELT instead asks where the signal's
*statistics* change, so an event gets the boundaries the data supports. The
threshold then decides which of those segments are anomalous, rather than
deciding where they begin and end.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import ruptures as rpt

from .config import MIN_EVENT_S, PELT_PENALTY, Z_THRESHOLD
from .score import SeatScores


@dataclass
class Candidate:
    seat_id: int
    start_sec: float
    end_sec: float
    i0: int
    i1: int
    peak_z: float
    mean_z: float
    duration_s: float

    @property
    def salience(self) -> float:
        """Ranking key for the cascade: how much anomalous mass this window holds."""
        return float(self.mean_z * np.sqrt(max(self.duration_s, 1e-6)))

    def to_dict(self) -> dict:
        return {
            "seat_id": self.seat_id,
            "start_sec": round(self.start_sec, 3),
            "end_sec": round(self.end_sec, 3),
            "peak_z": round(self.peak_z, 3),
            "mean_z": round(self.mean_z, 3),
            "duration_s": round(self.duration_s, 3),
            "salience": round(self.salience, 3),
        }


def _changepoints(sig: np.ndarray, penalty: float) -> list[int]:
    """PELT breakpoints on a 1-D signal, returned as interior indices."""
    if sig.size < 8:
        return []
    try:
        algo = rpt.Pelt(model="l2", min_size=2, jump=1).fit(sig.astype(np.float64))
        bkps = algo.predict(pen=penalty)
    except Exception:
        return []
    return [b for b in bkps if 0 < b < sig.size]


def segment_seat(
    scores: SeatScores,
    seat_id: int,
    z_threshold: float = Z_THRESHOLD,
    penalty: float = PELT_PENALTY,
    min_event_s: float = MIN_EVENT_S,
) -> list[Candidate]:
    z = scores.series(seat_id)
    bounds = [0] + _changepoints(z, penalty) + [z.size]
    bin_s = scores.bin_s
    t = scores.times

    out: list[Candidate] = []
    for i0, i1 in zip(bounds[:-1], bounds[1:]):
        if i1 <= i0:
            continue
        seg = z[i0:i1]
        dur = (i1 - i0) * bin_s
        if dur < min_event_s:
            continue
        if float(seg.mean()) < z_threshold:
            continue
        out.append(Candidate(
            seat_id=seat_id,
            start_sec=float(t[i0] - bin_s / 2),
            end_sec=float(t[i1 - 1] + bin_s / 2),
            i0=int(i0), i1=int(i1),
            peak_z=float(seg.max()), mean_z=float(seg.mean()), duration_s=float(dur),
        ))
    return out


def segment_all(
    scores: SeatScores,
    z_threshold: float = Z_THRESHOLD,
    penalty: float = PELT_PENALTY,
    min_event_s: float = MIN_EVENT_S,
) -> list[Candidate]:
    out: list[Candidate] = []
    for sid in scores.seat_ids:
        out += segment_seat(scores, sid, z_threshold, penalty, min_event_s)
    return sorted(out, key=lambda c: -c.salience)


def top_fraction(cands: list[Candidate], pct: float, min_keep: int = 1) -> list[Candidate]:
    """The CASCADE_TOP_PCT shortlist that Stage 2 is allowed to look at.

    `pct` is a fraction of *seat-seconds observed*, not of candidates: the
    promise is that full decode touches at most that share of the footage.
    """
    if not cands:
        return []
    k = max(min_keep, int(round(len(cands) * pct)))
    return sorted(cands, key=lambda c: -c.salience)[:k]


def budget_shortlist(
    cands: list[Candidate],
    total_seat_seconds: float,
    pct: float,
    min_keep: int = 1,
) -> list[Candidate]:
    """Take candidates by salience until their combined duration hits the budget."""
    if not cands:
        return []
    budget = total_seat_seconds * pct
    ranked = sorted(cands, key=lambda c: -c.salience)
    picked: list[Candidate] = []
    spent = 0.0
    for c in ranked:
        if picked and spent + c.duration_s > budget:
            continue
        picked.append(c)
        spent += c.duration_s
        if spent >= budget:
            break
    while len(picked) < min_keep and len(picked) < len(ranked):
        picked.append(ranked[len(picked)])
    return picked
