"""Human-readable evidence: heatmaps, timelines, clip export.

Nothing here decides anything. It exists so a reviewer can see why the pipeline
said what it said, and jump straight to the seconds worth watching.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

from .mv import ActivityCube
from .seats import SeatGrid


def render_heatmap(
    ac: ActivityCube,
    grid: SeatGrid | None,
    out_path: str | Path,
    title: str = "",
    accum_seconds: float | None = None,
) -> Path:
    """Time-averaged motion energy, with discovered seats drawn on top.

    This is the first sanity check of the whole system: if the desk layout is
    not visible here, Stage 1 has nothing to work with and no later stage can
    rescue it.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    n = ac.n_bins if accum_seconds is None else min(ac.n_bins, int(accum_seconds / ac.bin_s))
    amap = ac.cube[:n].mean(axis=0)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    w, h = ac.frame_size
    fig, ax = plt.subplots(figsize=(12, 12 * h / w))
    vmax = float(np.percentile(amap, 99.5)) or float(amap.max()) or 1.0
    ax.imshow(amap, cmap="inferno", vmin=0, vmax=vmax,
              extent=[0, w, h, 0], interpolation="nearest", aspect="equal")

    if grid is not None and len(grid):
        for s in grid.seats:
            x0, y0, x1, y1 = s.bbox_px
            ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fill=False,
                                   edgecolor="#39d0ff", linewidth=1.1, alpha=0.9))
            ax.text(x0 + 2, y0 - 3, str(s.seat_id), color="#39d0ff",
                    fontsize=7, fontweight="bold")

    n_seats = len(grid) if grid is not None else 0
    ax.set_title(f"{title}\n{n*ac.bin_s:.0f}s accumulated · {n_seats} seats discovered",
                 fontsize=10)
    ax.set_xticks([]); ax.set_yticks([])
    fig.tight_layout()
    fig.savefig(out_path, dpi=130, bbox_inches="tight")
    plt.close(fig)
    return out_path


def render_seat_timeline(
    times: np.ndarray,
    z: np.ndarray,
    seat_ids: list[int],
    out_path: str | Path,
    z_threshold: float = 3.5,
    events: list[dict] | None = None,
) -> Path:
    """Seat-by-second robust z-scores as an image, events marked."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(14, max(3.0, 0.22 * len(seat_ids))))
    im = ax.imshow(z.T, aspect="auto", cmap="magma", vmin=0, vmax=max(z_threshold * 2, 1),
                   extent=[times[0], times[-1], len(seat_ids) - 0.5, -0.5],
                   interpolation="nearest")
    ax.set_yticks(range(len(seat_ids)))
    ax.set_yticklabels([f"s{i}" for i in seat_ids], fontsize=6)
    ax.set_xlabel("seconds")
    ax.set_title(f"per-seat robust z (threshold {z_threshold})", fontsize=10)
    if events:
        for e in events:
            if e.get("seat_id") in seat_ids:
                y = seat_ids.index(e["seat_id"])
                ax.plot([e["start_sec"], e["end_sec"]], [y, y], color="#39d0ff", lw=2.2)
    fig.colorbar(im, ax=ax, label="z", fraction=0.02)
    fig.tight_layout()
    fig.savefig(out_path, dpi=130)
    plt.close(fig)
    return out_path


def write_timeline_json(events: list[dict], out_path: str | Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(events, indent=2))
    return out_path


def export_clip(
    video: str | Path,
    start_sec: float,
    end_sec: float,
    out_path: str | Path,
    pad_s: float = 2.0,
    crop_px: tuple[int, int, int, int] | None = None,
) -> Path | None:
    """Cut the evidence clip for one event. Returns None if ffmpeg fails."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ss = max(0.0, start_sec - pad_s)
    dur = max(0.5, (end_sec - start_sec) + 2 * pad_s)

    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{ss:.3f}", "-i", str(video),
           "-t", f"{dur:.3f}"]
    if crop_px is not None:
        x0, y0, x1, y1 = crop_px
        cmd += ["-vf", f"crop={max(x1-x0,16)}:{max(y1-y0,16)}:{x0}:{y0}"]
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24"]
    cmd += ["-an", str(out_path)]

    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=180)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return None
    return out_path if out_path.exists() else None


def render_seat_overlay(
    video: str | Path,
    grid: SeatGrid,
    out_path: str | Path,
    t_sec: float = 0.0,
    title: str = "",
) -> Path | None:
    """Discovered seat boxes drawn on a real frame. The calibration sanity check."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    from .detector import sample_frames

    got = sample_frames(video, t_sec, 1.0, 1)
    if not got:
        return None
    _, bgr = got[0]
    rgb = bgr[:, :, ::-1]

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    h, w = rgb.shape[:2]
    fig, ax = plt.subplots(figsize=(13, 13 * h / w))
    ax.imshow(rgb)
    for s in grid.seats:
        x0, y0, x1, y1 = s.bbox_px
        ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fill=False,
                               edgecolor="#39d0ff", linewidth=2.0))
        ax.text(x0 + 3, y0 + 18, str(s.seat_id), color="#0b0b0b", fontsize=12,
                fontweight="bold",
                bbox=dict(facecolor="#39d0ff", edgecolor="none", pad=1.5))
    ax.set_title(f"{title}\n{len(grid)} seats · frame at t={t_sec:.0f}s", fontsize=10)
    ax.set_xticks([]); ax.set_yticks([])
    fig.tight_layout()
    fig.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)
    return out_path
