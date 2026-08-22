#!/usr/bin/env python3
"""Redraw exported clips with their evidence burned in.

    python burn_overlays.py --limit 3          # verify a sample first
    python burn_overlays.py                    # all of them

Reads out/events.json and the Stage 2 evidence cache, writes to
out/clips_annotated/ and leaves the originals untouched.
"""
from __future__ import annotations

import argparse
import collections
import json
import time
from pathlib import Path

from pipeline.overlay import burn, load_evidence_index


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="out/events.json")
    ap.add_argument("--out", default="out/clips_annotated")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--label", default=None, help="only this action_label")
    ap.add_argument("--one-per-label", action="store_true")
    args = ap.parse_args()

    data = json.loads(Path(args.events).read_text())
    events = [e for e in data["events"] if e.get("clip_path")]
    if args.label:
        events = [e for e in events if e["action_label"] == args.label]
    if args.one_per_label:
        seen, picked = set(), []
        for e in events:
            if e["action_label"] not in seen:
                seen.add(e["action_label"])
                picked.append(e)
        events = picked
    if args.limit:
        events = events[: args.limit]

    idx = load_evidence_index()
    print(f"{len(idx)} cached Stage 2 windows, {len(events)} clips to annotate")

    out_dir = Path(args.out)
    stats = collections.Counter()
    t0 = time.time()
    written = []
    for n, e in enumerate(events, 1):
        stem = Path(e["video"]).stem
        key = (stem, e.get("seat_id"), round(e["start_sec"], 1),
               round(e["end_sec"], 1))
        w = idx.get(key)
        stats["with_evidence" if w else "text_only"] += 1
        p = burn(e, w, out_dir / Path(e["clip_path"]).name)
        if p:
            written.append(str(p))
            stats["written"] += 1
        else:
            stats["failed"] += 1
        if n % 50 == 0 or n == len(events):
            el = time.time() - t0
            print(f"  {n}/{len(events)}  {el:.0f}s  ({n/max(el,1e-6):.1f} clips/s)",
                  flush=True)

    print("\n" + json.dumps(dict(stats), indent=1))
    print(f"elapsed {time.time()-t0:.0f}s")
    for p in written[:10]:
        print("  ", p)


if __name__ == "__main__":
    main()
