"""Evaluation against `data/ground_truth.csv`.

The ground truth currently carries a label per *file*, derived from the
organisers' own filenames, and no timestamps -- nobody has scrubbed the videos
yet. That supports exactly one metric honestly:

* **action-label accuracy at file level** -- did the pipeline name this file's
  behaviour the way the filename says? `measured`.

The timing metrics below (recall at a review budget, temporal IoU,
false-events per hour) are implemented and tested against the schema, but they
report `unavailable` until `start_sec`/`end_sec` are filled in. They are not
estimated, defaulted, or quietly skipped: a metric with no ground truth behind
it prints as unavailable, because a plausible-looking number here would be the
easiest thing in the whole project to mistake for a result.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class GTRow:
    video: str
    start_sec: float | None
    end_sec: float | None
    seat_hint: str
    label: str
    type: str
    confidence_of_label: str

    @property
    def timed(self) -> bool:
        return self.start_sec is not None and self.end_sec is not None


def load_ground_truth(path: str | Path = "data/ground_truth.csv") -> list[GTRow]:
    rows: list[GTRow] = []
    p = Path(path)
    if not p.exists():
        return rows
    with p.open(newline="") as fh:
        for r in csv.DictReader(fh):
            def num(k):
                v = (r.get(k) or "").strip()
                return float(v) if v else None
            rows.append(GTRow(
                video=(r.get("video") or "").strip(),
                start_sec=num("start_sec"), end_sec=num("end_sec"),
                seat_hint=(r.get("seat_hint") or "").strip(),
                label=(r.get("label") or "").strip(),
                type=(r.get("type") or "").strip(),
                confidence_of_label=(r.get("confidence_of_label") or "").strip(),
            ))
    return rows


def temporal_iou(a: tuple[float, float], b: tuple[float, float]) -> float:
    lo = max(a[0], b[0])
    hi = min(a[1], b[1])
    inter = max(0.0, hi - lo)
    union = (a[1] - a[0]) + (b[1] - b[0]) - inter
    return inter / union if union > 0 else 0.0


def label_accuracy(results: dict[str, list[dict]],
                   gt: list[GTRow]) -> dict:
    """Did the pipeline's labels for each file include the expected one?

    Scored two ways, because they answer different questions:
      * `top_label_correct`  -- the highest-confidence event matches. Strict.
      * `label_present`      -- the expected label appears anywhere in the
                                file's events. This is the honest one while
                                ground truth is file-level: the truth says the
                                behaviour occurs somewhere in the file, not
                                that it is the only thing happening.
    """
    # Match by stem: a file that had to be re-encoded (08 had a damaged
    # MPEG-4 header) keeps its identity for scoring.
    by_stem = {Path(k).stem: v for k, v in results.items()}
    per_file: list[dict] = []
    for row in gt:
        events = results.get(row.video, by_stem.get(Path(row.video).stem))
        if events is None:
            per_file.append({"video": row.video, "expected": row.label,
                             "status": "not_run"})
            continue
        labels = [e.get("action_label") for e in events]
        top = None
        if events:
            top = max(events, key=lambda e: e.get("confidence", 0.0)).get("action_label")
        per_file.append({
            "video": row.video,
            "expected": row.label,
            "top_label": top,
            "n_events": len(events),
            "labels_seen": sorted(set(labels)),
            "top_label_correct": bool(top == row.label),
            "label_present": bool(row.label in labels),
            "status": "scored",
        })

    scored = [r for r in per_file if r["status"] == "scored"]
    n = len(scored)
    return {
        "metric": "action-label accuracy (file level, filename-derived truth)",
        "status": "measured" if n else "unavailable",
        "n_files_scored": n,
        "top_label_correct": (sum(r["top_label_correct"] for r in scored) / n
                              if n else None),
        "label_present": (sum(r["label_present"] for r in scored) / n
                          if n else None),
        "per_file": per_file,
    }


def recall_at_budget(events: list[dict], gt: list[GTRow], video: str,
                     tiou_threshold: float = 0.1) -> dict:
    """Share of timed ground-truth events matched by a shortlisted event."""
    timed = [g for g in gt if g.video == video and g.timed]
    if not timed:
        return {"metric": "recall@review-budget", "status": "unavailable",
                "reason": "no timed ground-truth rows for this video; "
                          "fill start_sec/end_sec in data/ground_truth.csv"}
    hits = 0
    detail = []
    for g in timed:
        best = 0.0
        for e in events:
            best = max(best, temporal_iou((g.start_sec, g.end_sec),
                                          (e["start_sec"], e["end_sec"])))
        detail.append({"gt": [g.start_sec, g.end_sec], "best_tiou": round(best, 3)})
        hits += best >= tiou_threshold
    return {"metric": "recall@review-budget", "status": "measured",
            "tiou_threshold": tiou_threshold,
            "recall": hits / len(timed), "n_gt": len(timed), "detail": detail}


def mean_tiou(events: list[dict], gt: list[GTRow], video: str) -> dict:
    timed = [g for g in gt if g.video == video and g.timed]
    if not timed:
        return {"metric": "mean temporal IoU", "status": "unavailable",
                "reason": "no timed ground-truth rows for this video"}
    vals = []
    for g in timed:
        vals.append(max([temporal_iou((g.start_sec, g.end_sec),
                                      (e["start_sec"], e["end_sec"]))
                         for e in events] or [0.0]))
    return {"metric": "mean temporal IoU", "status": "measured",
            "mean_tiou": float(np.mean(vals)), "n_gt": len(timed)}


def false_events_per_hour(events: list[dict], gt: list[GTRow], video: str,
                          duration_s: float, tiou_threshold: float = 0.1) -> dict:
    timed = [g for g in gt if g.video == video and g.timed]
    if not timed:
        return {"metric": "false events per hour", "status": "unavailable",
                "reason": "cannot separate false from true without timed "
                          "ground truth; the raw event rate is reported "
                          "instead as `events_per_hour`",
                "events_per_hour": (len(events) / (duration_s / 3600.0)
                                    if duration_s > 0 else None)}
    unmatched = 0
    for e in events:
        best = max([temporal_iou((g.start_sec, g.end_sec),
                                 (e["start_sec"], e["end_sec"])) for g in timed]
                   or [0.0])
        unmatched += best < tiou_threshold
    return {"metric": "false events per hour", "status": "measured",
            "false_events_per_hour": unmatched / (duration_s / 3600.0),
            "n_false": unmatched, "duration_s": duration_s}


def evaluate_all(results: dict[str, list[dict]],
                 durations: dict[str, float],
                 gt_path: str | Path = "data/ground_truth.csv") -> dict:
    gt = load_ground_truth(gt_path)
    out = {"ground_truth_rows": len(gt),
           "timed_rows": sum(g.timed for g in gt),
           "label_accuracy": label_accuracy(results, gt),
           "per_video": {}}
    gt_stems = {Path(g.video).stem: g.video for g in gt}
    for video, events in results.items():
        dur = durations.get(video, 0.0)
        video = gt_stems.get(Path(video).stem, video)
        out["per_video"][video] = {
            "recall_at_budget": recall_at_budget(events, gt, video),
            "mean_tiou": mean_tiou(events, gt, video),
            "false_events_per_hour": false_events_per_hour(events, gt, video, dur),
        }
    return out
