"""Stage 3: name the observed behaviour.

"Seat 14, flagged, review" is not an answer. "Seat 14, mobile phone usage,
03:12:40-03:13:05, confidence 0.87" is. This module turns Stage 2's detections
and tracks -- plus Stage 1's correlation shape -- into one of the named action
labels, or `unclassified_anomaly` when nothing matches confidently.

A Stage 1 flag is never dropped just because no rule matched. An unnamed
anomaly is still a minute of footage worth a reviewer's eyes, and silently
discarding it would hide a miss behind a clean-looking output.

This is a rule engine, not a trained classifier. With one example clip per
class there is not enough data to train one that would generalise, and a
learned model here would be a black box on top of an evidence tool. The clips
validate the rules; they do not fit weights.

Every label names an *observed behaviour*. None of them names an intent, and
none of them is a verdict. Deciding what a behaviour means is the reviewer's
job, and the system is built to hand them the evidence to do it.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import numpy as np

from .config import (
    BOOK_CONF,
    UNCLASSIFIED_MAX_CONF,
    COCO_BOOK,
    COCO_CELL_PHONE,
    COCO_PERSON,
    CROWD_MIN_PERSONS,
    CROWD_MIN_S,
    PHONE_CONF,
    PHONE_MIN_FRAMES,
    SEAT_EXCHANGE_MIN_HOLD_S,
    TALKING_MIN_CORR,
    TALKING_MIN_S,
    TRANSIT_MIN_DISPLACEMENT,
    TRANSIT_MIN_FRAMES,
)
from .cascade import WindowEvidence
from .correlate import window_corr
from .score import SeatScores
from .seats import SeatGrid


@dataclass
class Action:
    label: str
    confidence: float
    evidence: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"action_label": self.label,
                "confidence": round(float(self.confidence), 3),
                "evidence": self.evidence}


def _confidence(persistence: float, strength: float,
                w_persistence: float = 0.5, w_strength: float = 0.5) -> float:
    """Blend how *consistently* evidence appeared with how *strong* it was.

    Persistence is the share of the window's frames carrying the evidence;
    strength is the detector's own confidence. A single high-confidence frame
    and a long run of weak ones are both uncertain, for different reasons, and
    this scores both below a long run of confident frames. Capped below 1.0 --
    a rule engine should not claim certainty.
    """
    p = float(np.clip(persistence, 0.0, 1.0))
    s = float(np.clip(strength, 0.0, 1.0))
    return float(np.clip(w_persistence * p + w_strength * s, 0.0, 0.97))


# --- rules ------------------------------------------------------------------

def rule_mobile_phone(ev: WindowEvidence) -> Action | None:
    hits = [(t, d) for t, d in ev.dets_of(COCO_CELL_PHONE, PHONE_CONF)]
    if len(hits) < PHONE_MIN_FRAMES:
        return None
    seats = Counter()
    for _, d in hits:
        sid = ev.seat_of(d)
        if sid is not None:
            seats[sid] += 1
    seat_id = seats.most_common(1)[0][0] if seats else ev.candidate.seat_id
    frames_with = len({round(t, 3) for t, _ in hits})
    persistence = frames_with / max(ev.n_frames, 1)
    strength = float(np.mean([d.conf for _, d in hits]))
    return Action(
        "mobile_phone_usage",
        _confidence(persistence / 0.5, strength),
        {"rule": "cell_phone detected inside the seat region",
         "seat_id": seat_id,
         "frames_with_detection": frames_with,
         "frames_in_window": ev.n_frames,
         "mean_detection_conf": round(strength, 3),
         "detector_class": "cell phone (COCO 67)"},
    )


def rule_paper_pass(ev: WindowEvidence, grid: SeatGrid) -> Action | None:
    """A held rectangular object crossing a seat boundary.

    COCO has no `paper` or `chit` class. `book` is used as the nearest proxy
    for a held rectangular object, at a lowered confidence threshold because
    the target is small and usually partly occluded by a hand. This is an
    approximation, not a solved problem: any flat object -- an answer sheet, an
    admit card, a folded note, a real book -- lands in the same bucket, and the
    label says only that something crossed between seats.
    """
    tracks: dict[int, list[tuple[float, int | None, float]]] = {}
    for f in ev.frames:
        for d in f.dets:
            if d.cls_id == COCO_BOOK and d.conf >= BOOK_CONF and d.track_id is not None:
                tracks.setdefault(d.track_id, []).append((f.t_sec, ev.seat_of(d), d.conf))
    adj = grid.adjacency()

    best: Action | None = None
    for tid, obs in tracks.items():
        seq = [(t, s, c) for t, s, c in obs if s is not None]
        if len(seq) < 2:
            continue
        first_seat, last_seat = seq[0][1], seq[-1][1]
        if first_seat == last_seat:
            continue
        if last_seat not in adj.get(first_seat, []):
            continue
        n_a = sum(1 for _, s, _ in seq if s == first_seat)
        n_b = sum(1 for _, s, _ in seq if s == last_seat)
        persistence = (n_a + n_b) / max(ev.n_frames, 1)
        strength = float(np.mean([c for _, _, c in seq]))
        act = Action(
            "paper_pass",
            _confidence(persistence / 0.4, strength) * 0.85,  # proxy-class penalty
            {"rule": "book-class object crossed from one seat region to an "
                     "adjacent one",
             "from_seat": first_seat, "to_seat": last_seat,
             "track_id": tid,
             "frames_at_origin": n_a, "frames_at_destination": n_b,
             "mean_detection_conf": round(strength, 3),
             "detector_class": "book (COCO 73), used as a proxy for a held "
                               "sheet of paper -- approximate",
             "caveat": "COCO has no paper/chit class; any flat held object "
                       "matches this rule"},
        )
        if best is None or act.confidence > best.confidence:
            best = act
    return best


def rule_seat_exchange(ev: WindowEvidence, grid: SeatGrid) -> Action | None:
    """Two tracked people whose seat assignments swap and stay swapped."""
    series = ev.seat_track_series()
    adj = grid.adjacency()
    if len(series) < 2:
        return None

    def endpoints(obs: list[tuple[float, int | None]]):
        valid = [(t, s) for t, s in obs if s is not None]
        if len(valid) < 2:
            return None
        t_end = valid[-1][0]
        head = [s for t, s in valid if t <= valid[0][0] + SEAT_EXCHANGE_MIN_HOLD_S]
        tail = [s for t, s in valid if t >= t_end - SEAT_EXCHANGE_MIN_HOLD_S]
        if not head or not tail:
            return None
        start = Counter(head).most_common(1)[0][0]
        end = Counter(tail).most_common(1)[0][0]
        hold = sum(1 for s in tail if s == end) / len(tail)
        return start, end, hold, len(valid)

    ends = {tid: e for tid, obs in series.items() if (e := endpoints(obs))}
    tids = list(ends)
    best: Action | None = None
    for i, a in enumerate(tids):
        sa, ea, ha, na = ends[a]
        if sa == ea:
            continue
        for b in tids[i + 1:]:
            sb, eb, hb, nb = ends[b]
            if sb == eb:
                continue
            if not (sa == eb and sb == ea):
                continue
            if eb not in adj.get(ea, []) and ea != eb:
                pass  # adjacency is informative here, not required
            persistence = (na + nb) / max(2 * ev.n_frames, 1)
            strength = (ha + hb) / 2.0
            act = Action(
                "seat_exchange",
                _confidence(persistence / 0.5, strength),
                {"rule": "two tracked people ended the window in each other's "
                         "seat region, and held it",
                 "seat_a": sa, "seat_b": sb,
                 "track_a": a, "track_b": b,
                 "hold_fraction": round(strength, 3),
                 "min_hold_s": SEAT_EXCHANGE_MIN_HOLD_S,
                 "note": "seat assignment is recomputed every frame from the "
                         "tracked box, never fixed at first detection"},
            )
            if best is None or act.confidence > best.confidence:
                best = act
    return best


def rule_talking(ev: WindowEvidence, scores: SeatScores, grid: SeatGrid) -> Action | None:
    """Sustained joint activity between neighbours, with no object evidence.

    This is the weakest rule in the set and is deliberately last: it fires on
    the *absence* of object evidence plus a correlation shape, so it carries
    the least specific claim of any named label. Pose-based head orientation
    would sharpen it and is not implemented.
    """
    c = ev.candidate
    if c.duration_s < TALKING_MIN_S:
        return None
    if c.seat_id not in scores.seat_ids:
        return None
    best_pair, best_corr, best_lag = None, 0.0, 0.0
    for nb in ev.neighbour_ids:
        if nb not in scores.seat_ids:
            continue
        pc = window_corr(scores, c.seat_id, nb, c.i0, c.i1)
        if pc.corr > best_corr:
            best_pair, best_corr, best_lag = nb, pc.corr, pc.lag_s
    if best_pair is None or best_corr < TALKING_MIN_CORR:
        return None
    persistence = min(1.0, c.duration_s / (2 * TALKING_MIN_S))
    return Action(
        "talking_to_neighbour",
        _confidence(persistence, best_corr) * 0.8,  # no object evidence backs it
        {"rule": "sustained correlated activity with an adjacent seat and no "
                 "object-class evidence",
         "seat_id": c.seat_id, "neighbour_seat_id": best_pair,
         "correlation": round(best_corr, 3), "lag_s": round(best_lag, 2),
         "duration_s": round(c.duration_s, 2),
         "min_correlation": TALKING_MIN_CORR, "min_duration_s": TALKING_MIN_S,
         "caveat": "inferred from motion correlation, not from speech or pose"},
    )


def rule_staff_transit(ev: WindowEvidence) -> Action | None:
    """A person crossing the scene, rather than behaviour at a seat.

    Fires on how far a tracked person travels relative to their own apparent
    size, which is scale-free and so works at any depth in the frame.

    It does NOT test whether the person is in a seat. That was the obvious
    formulation and the measurements rejected it: someone walking past a row is
    inside the seat boxes they pass (measured unseated_frac 0.12 for a staff
    member crossing the aisle), while a candidate at a desk that seat discovery
    never found scores unseated 1.00 without moving. See config.py.

    This is the last rule tried. Any named seat behaviour outranks it, because
    a phone in a window where staff also walk through is still a phone.
    """
    persons = ev.person_tracks()
    seats = ev.seat_track_series()
    best = None
    for tid, dets in persons.items():
        if len(dets) < TRANSIT_MIN_FRAMES:
            continue
        cents = np.array([d.centroid for _, d in dets], float)
        diag = float(np.median([np.hypot(d.xyxy[2] - d.xyxy[0],
                                         d.xyxy[3] - d.xyxy[1])
                                for _, d in dets]))
        if diag <= 1.0:
            continue
        disp = float(np.max(np.linalg.norm(cents - cents.mean(axis=0), axis=1))) * 2 / diag
        if disp < TRANSIT_MIN_DISPLACEMENT:
            continue
        obs = seats.get(tid, [])
        unseated = (float(np.mean([s is None for _, s in obs])) if obs else 1.0)
        conf = _confidence(min(1.0, len(dets) / max(ev.n_frames, 1)),
                           min(1.0, disp / (2 * TRANSIT_MIN_DISPLACEMENT))) * 0.85
        act = Action("staff_or_transit", conf, {
            "rule": "a tracked person crossed the scene by more than "
                    f"{TRANSIT_MIN_DISPLACEMENT} of their own box diagonal",
            "track_id": tid,
            "displacement_box_diagonals": round(disp, 2),
            "unseated_fraction": round(unseated, 2),
            "frames_tracked": len(dets),
            "frames_in_window": ev.n_frames,
            "note": "movement across the scene, not behaviour at a seat -- "
                    "typically an invigilator or a candidate arriving or "
                    "leaving. Reported so it can be filtered out of a review "
                    "queue, not because it is of interest in itself.",
            "caveat": "threshold set from 5 hand-checked windows; provisional",
        })
        if best is None or act.confidence > best.confidence:
            best = act
    return best


def classify_window(ev: WindowEvidence, scores: SeatScores, grid: SeatGrid) -> Action:
    """Run every rule, take the most confident, keep the rest on the record."""
    considered: list[dict] = []
    fired: list[Action] = []
    for fn in (lambda: rule_mobile_phone(ev),
               lambda: rule_paper_pass(ev, grid),
               lambda: rule_seat_exchange(ev, grid),
               lambda: rule_talking(ev, scores, grid)):
        a = fn()
        if a is not None:
            fired.append(a)
            considered.append({"label": a.label, "confidence": round(a.confidence, 3)})

    # Tried only when no named seat behaviour matched: a phone in a window
    # where staff also walk through is still a phone.
    if not fired:
        t = rule_staff_transit(ev)
        if t is not None:
            return t

    if not fired:
        c = ev.candidate
        n_person = len({d.track_id for f in ev.frames for d in f.dets
                        if d.cls_id == 0 and d.track_id is not None})
        return Action(
            "unclassified_anomaly",
            # Deliberately capped below every named rule. This label reports
            # that no rule matched, so its confidence is confidence in the
            # *flag*, not in a name -- letting it outrank an actual detection
            # elsewhere in the same file would bury the finding.
            float(np.clip(c.mean_z / 40.0, 0.05, UNCLASSIFIED_MAX_CONF)),
            {"rule": "Stage 1 flagged this window; no Stage 3 rule matched",
             "seat_id": c.seat_id, "peak_z": round(c.peak_z, 2),
             "mean_z": round(c.mean_z, 2),
             "persons_tracked": n_person,
             "frames_in_window": ev.n_frames,
             "note": "kept deliberately -- an unnamed anomaly is still footage "
                     "worth reviewing, and dropping it would hide a miss"},
        )

    best = max(fired, key=lambda a: a.confidence)
    if len(considered) > 1:
        best.evidence["also_matched"] = [c for c in considered
                                         if c["label"] != best.label]
    return best


def count_unseated(
    frames: list["FrameDets"],
    grid: SeatGrid,
    min_iou: float = 0.25,
) -> list[tuple[float, int, tuple[float, float, float, float] | None]]:
    """People per frame who are *not* in a discovered seat.

    A hall full of seated candidates is not a crowd -- it is an exam. What
    makes `crowd_gathering` a distinct behaviour is people congregating who
    have no seat there: at a verification counter, a locker bank, a doorway.
    Subtracting the seated population is what keeps this rule from firing
    permanently on every occupied exam room.
    """
    from .detector import iou as box_iou

    seat_boxes = [tuple(float(v) for v in s.bbox_px) for s in grid.seats]
    out = []
    for f in frames:
        loose = []
        for d in f.dets:
            if d.cls_id != COCO_PERSON:
                continue
            if any(box_iou(d.xyxy, b) >= min_iou for b in seat_boxes):
                continue
            loose.append(d.xyxy)
        zone = None
        if loose:
            a = np.array(loose, float)
            zone = (float(a[:, 0].min()), float(a[:, 1].min()),
                    float(a[:, 2].max()), float(a[:, 3].max()))
        out.append((f.t_sec, len(loose), zone))
    return out


# WARNING -- this rule is not sound on scenes that have a seat grid, and is
# off by default for that reason (`--crowd never`). It defines a crowd by
# exclusion from the discovered seat set, and that set is incomplete: seat
# discovery only finds *persistently occupied* positions inside its calibration
# windows, so candidates at desks it never discovered are counted as "unseated".
#
# measured on file 06, a two-hour exam hall with ~28 numbered desks and 10
# discovered seats: 313 of 720 sweep frames carry >=4 "unseated" people, which
# produced 60 crowd_gathering events in a room where nobody is gathering.
#
# Two geometric discriminators were measured and both failed to separate the
# exam hall (06) from the genuine reception gathering (05):
#   * group bounding-box area, as a fraction of frame -- 06 p50=0.18 vs
#     05 p50=0.43. The exam hall's groups are *tighter*, the opposite of the
#     expected direction, so a compactness test would reject the true positive.
#   * distance from group centre to nearest seat -- 06 p50=0.052 vs 05 p50=0.081
#     of the frame diagonal, and unseated share of all people 0.25 vs 0.21.
#     Both overlap almost completely.
#
# The fix is not a threshold. Either seat-discovery recall has to improve so
# that "not in a seat" means something, or the rule needs a signal this module
# does not have -- sustained approach and dwell, or motion energy at the group
# location, which Stage 1 already computes per cell and could supply.
def classify_crowd(
    counts: list[tuple[float, int]],
    zone_id: str = "zone_full_frame",
    min_persons: int = CROWD_MIN_PERSONS,
    min_duration_s: float = CROWD_MIN_S,
) -> list[dict]:
    """Sustained congregation in a zone. Not a seat-grid rule.

    Runs on scenes with no seat structure at all -- a reception counter, a
    verification desk, a corridor. The seat-based rules cannot apply there and
    are not asked to.
    """
    if not counts:
        return []
    ts = np.array([c[0] for c in counts], float)
    ns = np.array([c[1] for c in counts], int)
    over = ns >= min_persons

    events: list[dict] = []
    i = 0
    while i < len(over):
        if not over[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(over) and over[j + 1]:
            j += 1
        dur = float(ts[j] - ts[i])
        if dur >= min_duration_s:
            peak = int(ns[i:j + 1].max())
            mean = float(ns[i:j + 1].mean())
            events.append({
                "zone_id": zone_id,
                "start_sec": float(ts[i]), "end_sec": float(ts[j]),
                "action_label": "crowd_gathering",
                "confidence": float(np.clip(
                    0.5 * min(1.0, dur / (3 * min_duration_s))
                    + 0.5 * min(1.0, (mean - min_persons + 1) / min_persons),
                    0.05, 0.97)),
                "evidence": {
                    "rule": "person count in the zone stayed at or above "
                            f"{min_persons} for at least {min_duration_s}s",
                    "peak_person_count": peak,
                    "mean_person_count": round(mean, 2),
                    "duration_s": round(dur, 2),
                    "min_persons": min_persons,
                },
            })
        i = j + 1
    return events


def classify_persistent_objects(
    sweep: list["FrameDets"],
    grid: SeatGrid,
    cls_id: int,
    label: str,
    min_conf: float,
    detector_class: str,
) -> list[dict]:
    """Turn a persistent object at a seat into a named event.

    Reported separately from the Stage 1 path and labelled as such in the
    evidence, because the two rest on different assumptions: this one says the
    object was *there*, not that anything changed.
    """
    from .config import SWEEP_MIN_HIT_FRAC, SWEEP_MIN_RUN
    from .detector import iou as box_iou

    if not sweep:
        return []
    seat_boxes = {s.seat_id: tuple(float(v) for v in s.bbox_px) for s in grid.seats}
    if not seat_boxes:
        return []

    times = [f.t_sec for f in sweep]
    per_seat: dict[int, list[tuple[float, float]]] = {sid: [] for sid in seat_boxes}
    for f in sweep:
        best: dict[int, float] = {}
        for d in f.dets:
            if d.cls_id != cls_id or d.conf < min_conf:
                continue
            cx, cy = d.centroid
            sid, sv = None, 0.0
            for s, box in seat_boxes.items():
                v = box_iou(d.xyxy, box)
                if v > sv:
                    sid, sv = s, v
            if sid is None or sv <= 0.0:
                for s, (x0, y0, x1, y1) in seat_boxes.items():
                    if x0 <= cx <= x1 and y0 <= cy <= y1:
                        sid = s
                        break
            if sid is not None:
                best[sid] = max(best.get(sid, 0.0), d.conf)
        for sid in seat_boxes:
            per_seat[sid].append((f.t_sec, best.get(sid, 0.0)))

    events: list[dict] = []
    for sid, series in per_seat.items():
        hits = np.array([c > 0 for _, c in series], bool)
        confs = np.array([c for _, c in series], float)
        i = 0
        while i < len(hits):
            if not hits[i]:
                i += 1
                continue
            j = i
            gap = 0
            while j + 1 < len(hits) and gap <= 1:
                j += 1
                gap = 0 if hits[j] else gap + 1
            while j > i and not hits[j]:
                j -= 1
            run = hits[i:j + 1]
            if run.size >= SWEEP_MIN_RUN and run.mean() >= SWEEP_MIN_HIT_FRAC:
                seg_conf = confs[i:j + 1][run]
                mean_conf = float(seg_conf.mean()) if seg_conf.size else 0.0
                events.append({
                    "seat_id": sid,
                    "start_sec": float(times[i]), "end_sec": float(times[j]),
                    "action_label": label,
                    "confidence": float(np.clip(
                        _confidence(run.mean(), mean_conf) * 0.9, 0.05, 0.9)),
                    "evidence": {
                        "rule": "persistent-object sweep: the object was "
                                "present at this seat across consecutive "
                                "sparse samples",
                        "detector_class": detector_class,
                        "samples_in_run": int(run.size),
                        "samples_with_detection": int(run.sum()),
                        "mean_detection_conf": round(mean_conf, 3),
                        "path": "persistent_object_sweep",
                        "note": "complements the Stage 1 change-point path, "
                                "which by construction cannot flag a behaviour "
                                "that was already underway and never changes",
                    },
                })
            i = j + 1
    return events
