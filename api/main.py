"""Stub API. Serves out/events.json as-is. No auth, no pagination, no styling.

Deliberately minimal -- this session's effort went into the pipeline. Run with:

    uvicorn api.main:app --reload
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException

app = FastAPI(title="REWIND", description="Exam-hall review prioritisation.")

EVENTS = Path("out/events.json")


@app.get("/events")
def get_events() -> dict:
    if not EVENTS.exists():
        raise HTTPException(404, "out/events.json not found; run pipeline_run.py")
    return json.loads(EVENTS.read_text())
