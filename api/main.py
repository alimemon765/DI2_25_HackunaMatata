"""REWIND review API.

Serves the event manifest and the evidence clips to a review UI. It is a thin
reader over what `pipeline_run.py` produced -- there is no training code here,
no model, and no state. Swapping in a new run is a matter of pointing
`REWIND_OUT` at a different directory.

    uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

OUT = Path(os.environ.get("REWIND_OUT", "out"))
EVENTS = OUT / "events.json"
CLIPS = OUT / "clips"
CLIPS_ANNOTATED = OUT / "clips_annotated"

app = FastAPI(
    title="REWIND",
    description="Review prioritisation for exam-hall footage. Names observed "
                "behaviour; does not determine intent.",
)

# The UI runs on its own dev-server port (Vite defaults to 5173), so the API
# has to allow it explicitly. Kept to localhost origins -- this is a local
# review tool, not a public service.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _load() -> dict:
    if not EVENTS.exists():
        raise HTTPException(404, f"{EVENTS} not found; run pipeline_run.py first")
    return json.loads(EVENTS.read_text())


def _clip_url(event: dict) -> dict:
    """Attach URLs the browser can actually fetch.

    `clip_path` in the manifest is a repo-relative filesystem path, which is
    useless to a browser. The raw path is kept so the two can be reconciled.
    """
    e = dict(event)
    name = Path(event["clip_path"]).name if event.get("clip_path") else None
    # Only advertise a URL that will actually resolve. The manifest can name a
    # clip that is not on disk -- a re-run archives the previous run's clips
    # and re-exports them, so during a run the manifest and the directory
    # disagree. A UI cannot tell a slow load from a 404, so it should never be
    # handed a URL that is going to fail.
    e["clip_url"] = f"/clips/{name}" if name and (CLIPS / name).exists() else None
    e["clip_annotated_url"] = (f"/clips_annotated/{name}"
                               if name and (CLIPS_ANNOTATED / name).exists() else None)
    return e


@app.get("/events")
def get_events(
    video: str | None = Query(None, description="filter by source filename"),
    label: str | None = Query(None, description="filter by action_label"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    limit: int | None = Query(None, ge=1),
) -> dict:
    """The manifest, optionally filtered. Shape is unchanged from events.json."""
    data = _load()
    events = data["events"]
    if video:
        events = [e for e in events if e.get("video") == video]
    if label:
        events = [e for e in events if e.get("action_label") == label]
    if min_confidence:
        events = [e for e in events if e.get("confidence", 0) >= min_confidence]
    events = sorted(events, key=lambda e: -e.get("confidence", 0))
    if limit:
        events = events[:limit]
    data = dict(data)
    data["events"] = [_clip_url(e) for e in events]
    data["count"] = len(data["events"])
    return data


@app.get("/summary")
def get_summary() -> dict:
    """Counts the UI needs to render filters without pulling every event."""
    data = _load()
    labels: dict[str, int] = {}
    videos: dict[str, int] = {}
    for e in data["events"]:
        labels[e["action_label"]] = labels.get(e["action_label"], 0) + 1
        videos[e["video"]] = videos.get(e["video"], 0) + 1
    stats = data.get("stats", {})
    footage_s = sum(float(v.get("duration_s") or 0) for v in stats.values()
                    if isinstance(v, dict))
    return {
        "total_events": len(data["events"]),
        "total_footage_s": footage_s,
        "labels": dict(sorted(labels.items(), key=lambda kv: -kv[1])),
        "videos": dict(sorted(videos.items())),
        "parameters": data.get("parameters", {}),
        "disclaimer": data["disclaimer"],
        "evaluation": data.get("evaluation", {}).get("label_accuracy", {}),
    }


@app.get("/stats")
def get_stats() -> dict:
    return _load().get("stats", {})


@app.get("/health")
def health() -> dict:
    n_clips = len(list(CLIPS.glob("*.mp4"))) if CLIPS.exists() else 0
    n_ann = len(list(CLIPS_ANNOTATED.glob("*.mp4"))) if CLIPS_ANNOTATED.exists() else 0
    return {"events_json": EVENTS.exists(), "clips": n_clips,
            "clips_annotated": n_ann, "out_dir": str(OUT)}


# Video files. StaticFiles handles Range requests, which browsers require to
# seek within a video rather than download the whole file first.
#
# The directories are created rather than tested for. Mounting conditionally
# meant a directory produced *after* the server started was never served:
# burn_overlays.py created out/clips_annotated/ while uvicorn was already
# running, so every annotated clip 404'd even though the files were on disk
# and /health happily reported 921 of them.
CLIPS.mkdir(parents=True, exist_ok=True)
CLIPS_ANNOTATED.mkdir(parents=True, exist_ok=True)
app.mount("/clips", StaticFiles(directory=str(CLIPS)), name="clips")
app.mount("/clips_annotated", StaticFiles(directory=str(CLIPS_ANNOTATED)),
          name="clips_annotated")


@app.get("/debug/{name}")
def debug_image(name: str) -> FileResponse:
    """Heatmaps, seat overlays and timelines, for the evidence panel."""
    p = (OUT / "debug" / name).resolve()
    if not p.is_file() or (OUT / "debug").resolve() not in p.parents:
        raise HTTPException(404, "not found")
    return FileResponse(p)
