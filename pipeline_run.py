#!/usr/bin/env python3
"""REWIND end to end: footage in, `out/events.json` out.

    python pipeline_run.py --video data/raw/07_seat_exchange.mp4
    python pipeline_run.py --all --clips

Stage 1 reads motion vectors over the whole file without decoding a pixel.
Stage 2 fully decodes at most CASCADE_TOP_PCT of it. Stage 3 names what Stage 2
saw. Every surviving event carries a named action label -- never a bare flag,
and never a verdict.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from pipeline import config as C
from pipeline.cascade import run_cascade, scan_zone_crowd, sweep_persistent_objects
from pipeline.classify import (
    classify_crowd,
    classify_persistent_objects,
    classify_window,
)
from pipeline.correlate import correlate_all
from pipeline.evaluate import evaluate_all
from pipeline.evidence import (
    export_clip,
    render_heatmap,
    render_seat_overlay,
    render_seat_timeline,
    write_timeline_json,
)
from pipeline.filters import apply_filters
from pipeline.fixtures import build_fixture_map, drop_fixtures
from pipeline.mv import cached_activity_cube, probe
from pipeline.score import score_seats
from pipeline.seats import discover_seats_multi
from pipeline.segment import budget_shortlist, segment_all

# One occupied seat is still a scene the seat rules apply to -- a lone
# candidate with a phone is exactly clip 03. Only a scene with no seat at all
# falls through to the zone/crowd path.
MIN_SEATS_FOR_GRID = 1


def _overlaps_existing(e: dict, events: list[dict], tiou: float = 0.3) -> bool:
    """Same seat, same label, overlapping in time -- already reported."""
    for o in events:
        if o.get("seat_id") != e.get("seat_id"):
            continue
        if o.get("action_label") != e.get("action_label"):
            continue
        lo = max(o["start_sec"], e["start_sec"])
        hi = min(o["end_sec"], e["end_sec"])
        inter = max(0.0, hi - lo)
        union = ((o["end_sec"] - o["start_sec"]) + (e["end_sec"] - e["start_sec"])
                 - inter)
        if union > 0 and inter / union >= tiou:
            return True
    return False


def process_video(
    video: Path,
    out_dir: Path,
    max_seconds: float | None = None,
    start_s: float = 0.0,
    want_clips: bool = False,
    crowd: str = "auto",
    verbose: bool = True,
) -> dict:
    name = video.name
    t_start = time.time()
    info = probe(video)
    if verbose:
        print(f"\n=== {name}  {info['codec']} {info['width']}x{info['height']} "
              f"@{info['fps']:.1f}fps  {info['duration_s']:.0f}s", flush=True)

    # --- Stage 1 -----------------------------------------------------------
    ac = cached_activity_cube(video, start_s=start_s, max_seconds=max_seconds,
                              verbose=verbose)
    fac, frep = apply_filters(ac)
    if verbose:
        print(f"  [filters] {frep.n_periodic} periodic cells suppressed "
              f"(trusted={frep.periodic_trusted}), {frep.n_gated} bins gated",
              flush=True)
        for n in frep.notes:
            print(f"  [filters] note: {n}", flush=True)

    grid = discover_seats_multi(str(video), fac, verbose=verbose)
    if verbose:
        for n in grid.notes:
            print(f"  [seats] {n}", flush=True)

    observed_s = ac.n_bins * ac.bin_s
    stage1: dict = {"n_seats": len(grid), "observed_seconds": observed_s}
    events: list[dict] = []

    if len(grid) >= MIN_SEATS_FOR_GRID:
        scores = score_seats(fac, grid)
        cands = segment_all(scores)
        total_seat_seconds = observed_s * max(len(grid), 1)
        short = budget_shortlist(cands, total_seat_seconds, C.CASCADE_TOP_PCT)
        promoted_s = sum(c.duration_s for c in short)
        stage1.update({
            "seat_seconds_observed": total_seat_seconds,
            "stage1_candidates": len(cands),
            "promoted_to_stage2": len(short),
            "promoted_seconds": promoted_s,
            "promoted_fraction_of_seat_seconds": (promoted_s / total_seat_seconds
                                                  if total_seat_seconds else 0.0),
            "frac_seat_seconds_over_z": float((scores.z > C.Z_THRESHOLD).mean()),
        })
        if verbose:
            print(f"  [stage1] {len(cands)} candidates -> {len(short)} promoted "
                  f"({promoted_s:.0f}s = "
                  f"{100*promoted_s/max(total_seat_seconds,1):.2f}% of seat-seconds)",
                  flush=True)

        # --- fixture map, before anything is believed ----------------------
        # The sweep spans the whole file, so it is also the cheapest place to
        # learn which "phones" are actually furniture. It must run *before*
        # Stage 2 so the same rejection applies inside the seat crops.
        sweep: list = []
        fixtures: list = []
        if C.SWEEP_ENABLED:
            sweep = sweep_persistent_objects(str(video), grid, observed_s,
                                             start_s=start_s, verbose=verbose)
            fixtures = build_fixture_map(sweep)
            n_dropped = drop_fixtures(sweep, fixtures)
            stage1["fixtures"] = {
                "n": len(fixtures),
                "sweep_detections_dropped": n_dropped,
                "detail": [f.describe() for f in fixtures[:12]],
            }
            if verbose:
                print(f"  [fixtures] {len(fixtures)} static small objects "
                      f"identified; {n_dropped} sweep detections dropped",
                      flush=True)

        # --- Stage 2 -------------------------------------------------------
        evidence = run_cascade(str(video), grid, short, fixtures=fixtures,
                               verbose=verbose)

        # --- Stage 3 -------------------------------------------------------
        for ev in evidence:
            act = classify_window(ev, scores, grid)
            c = ev.candidate
            e = {
                "video": name,
                "seat_id": c.seat_id,
                "start_sec": round(c.start_sec, 2),
                "end_sec": round(c.end_sec, 2),
                **act.to_dict(),
                "stage1": {"peak_z": round(c.peak_z, 2),
                           "mean_z": round(c.mean_z, 2),
                           "duration_s": round(c.duration_s, 2),
                           "salience": round(c.salience, 2)},
                "roi_px": list(ev.roi_px),
                "clip_path": None,
            }
            events.append(e)

        # Persistent-object events, now that fixtures are out of the way.
        # Deduplicated against the Stage 1 events so one behaviour is not
        # reported twice.
        if C.SWEEP_ENABLED:
            swept = (classify_persistent_objects(
                        sweep, grid, C.COCO_CELL_PHONE, "mobile_phone_usage",
                        C.PHONE_CONF * 0.6, "cell phone (COCO 67)")
                     + classify_persistent_objects(
                        sweep, grid, C.COCO_BOOK, "paper_pass_object_present",
                        C.BOOK_CONF, "book (COCO 73), proxy for a held sheet"))
            new = [e for e in swept if not _overlaps_existing(e, events)]
            for e in new:
                e["video"] = name
                e["clip_path"] = None
            events += new
            stage1["sweep"] = {"frames": len(sweep), "events": len(swept),
                               "kept_after_dedupe": len(new)}
            if verbose:
                print(f"  [sweep] {len(swept)} events, {len(new)} new after "
                      f"dedupe against Stage 1", flush=True)

        stage1["pair_correlations"] = [
            {"seat_a": p.seat_a, "seat_b": p.seat_b,
             "corr": round(p.corr, 3), "lag_s": round(p.lag_s, 2)}
            for p in correlate_all(scores, grid)[:12]
        ]

        # Evidence images
        render_heatmap(ac, grid, out_dir / "debug" / f"heatmap_{video.stem}.png",
                       title=f"{name} — Stage 1 motion energy")
        render_seat_overlay(str(video), grid,
                            out_dir / "debug" / f"seats_{video.stem}.png",
                            t_sec=start_s + min(60.0, observed_s / 2),
                            title=f"{name} — discovered seats")
        if len(scores.seat_ids):
            render_seat_timeline(scores.times, scores.z, scores.seat_ids,
                                 out_dir / "debug" / f"timeline_{video.stem}.png",
                                 z_threshold=C.Z_THRESHOLD, events=events)
    else:
        stage1["note"] = (f"only {len(grid)} persistent seat(s) found; the "
                          "seat-grid path does not apply to this scene")
        if verbose:
            print(f"  [stage1] {stage1['note']}", flush=True)

    # --- crowd path (zone-based, separate from the seat grid) --------------
    run_crowd = crowd == "always" or (crowd == "auto" and len(grid) < MIN_SEATS_FOR_GRID)
    if run_crowd:
        dur = observed_s if max_seconds else info["duration_s"]
        counts = scan_zone_crowd(str(video), duration_s=dur, verbose=verbose)
        crowd_events = classify_crowd(counts, zone_id=f"{video.stem}:full_frame")
        for e in crowd_events:
            e["video"] = name
            e["clip_path"] = None
        events += crowd_events
        stage1["crowd_scan"] = {"frames_sampled": len(counts),
                                "events": len(crowd_events)}

    # --- clips -------------------------------------------------------------
    if want_clips:
        for i, e in enumerate(events):
            p = export_clip(video, e["start_sec"], e["end_sec"],
                            out_dir / "clips" / f"{video.stem}_{i:03d}_"
                                                f"{e['action_label']}.mp4",
                            crop_px=tuple(e["roi_px"]) if e.get("roi_px") else None)
            e["clip_path"] = str(p) if p else None

    for e in events:
        e.pop("roi_px", None)

    stage1["elapsed_s"] = round(time.time() - t_start, 1)
    stage1["duration_s"] = info["duration_s"]
    if verbose:
        from collections import Counter
        print(f"  [stage3] {len(events)} events: "
              f"{dict(Counter(e['action_label'] for e in events))}", flush=True)
        print(f"  [done] {stage1['elapsed_s']}s", flush=True)
    return {"events": events, "stats": stage1, "duration_s": info["duration_s"]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", action="append", default=[],
                    help="path to a video; repeatable")
    ap.add_argument("--all", action="store_true", help="every file in data/raw")
    ap.add_argument("--max-seconds", type=float, default=None)
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--out", default="out")
    ap.add_argument("--clips", action="store_true", help="export evidence clips")
    ap.add_argument("--crowd", choices=["auto", "always", "never"], default="auto",
                    help="auto: only when no seat grid is found")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    videos = [Path(v) for v in args.video]
    if args.all:
        videos = sorted(p for p in Path("data/raw").iterdir()
                        if p.suffix.lower() in {".mp4", ".mkv", ".avi"})
    if not videos:
        ap.error("give --video or --all")

    out_dir = Path(args.out)
    (out_dir / "debug").mkdir(parents=True, exist_ok=True)
    (out_dir / "clips").mkdir(parents=True, exist_ok=True)

    all_events: list[dict] = []
    per_video: dict[str, list[dict]] = {}
    durations: dict[str, float] = {}
    stats: dict[str, dict] = {}

    for v in videos:
        try:
            r = process_video(v, out_dir, max_seconds=args.max_seconds,
                              start_s=args.start, want_clips=args.clips,
                              crowd=args.crowd, verbose=not args.quiet)
        except Exception as exc:  # one bad file must not lose the rest
            import traceback
            traceback.print_exc()
            stats[v.name] = {"error": f"{type(exc).__name__}: {exc}"}
            per_video[v.name] = []
            durations[v.name] = 0.0
            continue
        per_video[v.name] = r["events"]
        durations[v.name] = r["duration_s"]
        stats[v.name] = r["stats"]
        all_events += r["events"]

    payload = {
        "generated_by": "REWIND pipeline_run.py",
        "parameters": {k: getattr(C, k) for k in
                       ("GRID_CELL_PX", "SEAT_ACCUM_SECONDS", "BASELINE_WINDOW_S",
                        "Z_THRESHOLD", "CORR_MAX_LAG_S", "MIN_EVENT_S",
                        "PELT_PENALTY", "CASCADE_TOP_PCT", "BIN_S",
                        "ACTIVITY_TRANSFORM", "CASCADE_FPS")},
        "disclaimer": (
            "REWIND is decision support for review prioritisation. It names "
            "observed behaviour and does not determine intent. Every event is "
            "for a human reviewer to assess."),
        "stats": stats,
        "evaluation": evaluate_all(per_video, durations),
        "events": sorted(all_events, key=lambda e: (e.get("video", ""),
                                                    e.get("start_sec", 0.0))),
    }
    (out_dir / "events.json").write_text(json.dumps(payload, indent=2))
    write_timeline_json(all_events, out_dir / "timeline.json")
    print(f"\nwrote {out_dir/'events.json'}  ({len(all_events)} events)")

    la = payload["evaluation"]["label_accuracy"]
    if la["status"] == "measured":
        print(f"action-label accuracy (measured, file-level): "
              f"top={la['top_label_correct']:.0%}  present={la['label_present']:.0%}"
              f"  over {la['n_files_scored']} files")


if __name__ == "__main__":
    main()
