"""Stage 1 front end: motion vectors straight out of the codec bitstream.

The decoder is asked for AV_FRAME_DATA_MOTION_VECTORS side data, which the
encoder already computed. Stage 1 therefore never materialises a pixel array --
`frame.to_ndarray()` is not called anywhere in this module. Grep for it before
believing otherwise.

The output is an *activity cube*: (T, H, W) float32, where T is one entry per
BIN_S seconds and H, W index GRID_CELL_PX-sized cells over the frame. It is
cached to .npz because a 2-hour file takes minutes to walk.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

import av
import numpy as np
from av.sidedata.motionvectors import MotionVectors
from av.video.frame import PictureType

from .config import BIN_S, GRID_CELL_PX

P_FRAME = int(PictureType.P)
B_FRAME = int(PictureType.B)


@dataclass
class ActivityCube:
    """Per-cell motion energy over time, plus the global motion that was removed."""

    cube: np.ndarray        # (T, H, W) float32, mean residual |mv| per cell per bin
    coverage: np.ndarray    # (T,) int32, MV-bearing frames that fed each bin
    global_mv: np.ndarray   # (T, 2) float32, median global motion (camera shake)
    bin_s: float
    fps: float
    duration_s: float
    frame_size: tuple[int, int]   # (width, height) in pixels
    start_s: float = 0.0
    source: str = ""

    @property
    def n_bins(self) -> int:
        return self.cube.shape[0]

    @property
    def grid_shape(self) -> tuple[int, int]:
        return self.cube.shape[1], self.cube.shape[2]

    def times(self) -> np.ndarray:
        """Bin centres in seconds, relative to the start of the source file."""
        return self.start_s + (np.arange(self.n_bins) + 0.5) * self.bin_s

    def cell_to_px(self, cy: int, cx: int) -> tuple[int, int, int, int]:
        """Cell index -> (x0, y0, x1, y1) pixel box."""
        return (
            cx * GRID_CELL_PX,
            cy * GRID_CELL_PX,
            (cx + 1) * GRID_CELL_PX,
            (cy + 1) * GRID_CELL_PX,
        )

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            path,
            cube=self.cube,
            coverage=self.coverage,
            global_mv=self.global_mv,
            meta=np.array(
                [self.bin_s, self.fps, self.duration_s,
                 self.frame_size[0], self.frame_size[1], self.start_s],
                dtype=np.float64,
            ),
            source=np.array([self.source]),
        )

    @classmethod
    def load(cls, path: str | Path) -> "ActivityCube":
        z = np.load(path, allow_pickle=False)
        m = z["meta"]
        return cls(
            cube=z["cube"], coverage=z["coverage"], global_mv=z["global_mv"],
            bin_s=float(m[0]), fps=float(m[1]), duration_s=float(m[2]),
            frame_size=(int(m[3]), int(m[4])), start_s=float(m[5]),
            source=str(z["source"][0]),
        )


def probe(path: str | Path) -> dict:
    """Container facts we need before deciding how to walk a file."""
    with av.open(str(path)) as c:
        st = c.streams.video[0]
        fps = float(st.average_rate) if st.average_rate else float(st.base_rate or 25)
        dur = float(c.duration / av.time_base) if c.duration else (
            float(st.duration * st.time_base) if st.duration else 0.0
        )
        return {
            "codec": st.codec_context.name,
            "width": st.codec_context.width,
            "height": st.codec_context.height,
            "fps": fps,
            "duration_s": dur,
            "frames": st.frames or None,
        }


def build_activity_cube(
    path: str | Path,
    start_s: float = 0.0,
    max_seconds: float | None = None,
    bin_s: float = BIN_S,
    stride: int = 1,
    verbose: bool = True,
) -> ActivityCube:
    """Walk the bitstream and accumulate residual motion energy per cell per bin.

    `stride` samples every Nth MV-bearing frame. Decoding is inherently
    sequential (a P-frame needs its predecessor), so stride saves the MV
    accumulation work, not the decode.
    """
    path = Path(path)
    info = probe(path)
    w, h = info["width"], info["height"]
    gw = (w + GRID_CELL_PX - 1) // GRID_CELL_PX
    gh = (h + GRID_CELL_PX - 1) // GRID_CELL_PX

    container = av.open(str(path))
    stream = container.streams.video[0]
    stream.thread_type = "AUTO"
    stream.codec_context.flags2 |= av.codec.context.Flags2.export_mvs
    tb = float(stream.time_base) if stream.time_base else 1.0 / info["fps"]

    if start_s > 0:
        container.seek(int(start_s / tb), stream=stream, backward=True, any_frame=False)

    end_s = None if max_seconds is None else start_s + max_seconds
    n_bins_hint = 256 if end_s is None else int(np.ceil((end_s - start_s) / bin_s)) + 2

    sums = np.zeros((n_bins_hint, gh, gw), dtype=np.float32)
    hits = np.zeros((n_bins_hint, gh, gw), dtype=np.int32)
    coverage = np.zeros(n_bins_hint, dtype=np.int32)
    gmv_sum = np.zeros((n_bins_hint, 2), dtype=np.float32)

    def grow(need: int):
        nonlocal sums, hits, coverage, gmv_sum
        if need < sums.shape[0]:
            return
        new = max(need + 1, sums.shape[0] * 2)
        pad = new - sums.shape[0]
        sums = np.concatenate([sums, np.zeros((pad, gh, gw), np.float32)])
        hits = np.concatenate([hits, np.zeros((pad, gh, gw), np.int32)])
        coverage = np.concatenate([coverage, np.zeros(pad, np.int32)])
        gmv_sum = np.concatenate([gmv_sum, np.zeros((pad, 2), np.float32)])

    t0 = time.time()
    n_decoded = n_mv = 0
    last_bin = -1
    first_ts = None

    for frame in container.decode(video=0):
        ts = float(frame.pts * tb) if frame.pts is not None else None
        if ts is None:
            continue
        if ts < start_s:
            continue
        if end_s is not None and ts >= end_s:
            break
        if first_ts is None:
            first_ts = ts
        n_decoded += 1

        pict = int(frame.pict_type)
        if pict not in (P_FRAME, B_FRAME):
            continue

        mvs = None
        for sd in frame.side_data:
            if isinstance(sd, MotionVectors):
                mvs = sd
                break
        if mvs is None:
            continue
        n_mv += 1
        if stride > 1 and (n_mv % stride):
            continue

        a = mvs.to_ndarray()
        if a.size == 0:
            continue

        scale = np.maximum(a["motion_scale"].astype(np.float32), 1.0)
        dx = a["motion_x"].astype(np.float32) / scale
        dy = a["motion_y"].astype(np.float32) / scale

        # Camera vibration: on a fixed CCTV mount most macroblocks are static,
        # so the median MV is the global component. Subtract it before scoring
        # so a shake does not light up every seat at once.
        gx = float(np.median(dx))
        gy = float(np.median(dy))
        mag = np.hypot(dx - gx, dy - gy)

        cx = np.clip(a["dst_x"].astype(np.int32) // GRID_CELL_PX, 0, gw - 1)
        cy = np.clip(a["dst_y"].astype(np.int32) // GRID_CELL_PX, 0, gh - 1)

        b = int((ts - start_s) // bin_s)
        if b < 0:
            continue
        grow(b)
        np.add.at(sums[b], (cy, cx), mag)
        np.add.at(hits[b], (cy, cx), 1)
        coverage[b] += 1
        gmv_sum[b] += (gx, gy)

        if verbose and b != last_bin and b % 120 == 0:
            el = time.time() - t0
            rate = n_decoded / el if el else 0
            print(f"  [mv] {path.name} bin {b} ({b*bin_s:.0f}s) "
                  f"{n_decoded} frames {rate:.0f} fps", flush=True)
            last_bin = b

    container.close()

    used = int(np.max(np.nonzero(coverage)[0]) + 1) if coverage.any() else 0
    sums, hits, coverage, gmv_sum = sums[:used], hits[:used], coverage[:used], gmv_sum[:used]
    cube = np.divide(sums, np.maximum(hits, 1), dtype=np.float32)
    gmv = gmv_sum / np.maximum(coverage, 1)[:, None]

    if verbose:
        el = time.time() - t0
        print(f"  [mv] {path.name}: {n_decoded} frames, {n_mv} with MVs, "
              f"{used} bins, {el:.1f}s ({n_decoded/max(el,1e-6):.0f} fps)", flush=True)

    return ActivityCube(
        cube=cube, coverage=coverage, global_mv=gmv.astype(np.float32),
        bin_s=bin_s, fps=info["fps"], duration_s=info["duration_s"],
        frame_size=(w, h), start_s=start_s, source=str(path),
    )


def cached_activity_cube(path: str | Path, cache_dir: str | Path = "cache",
                         **kwargs) -> ActivityCube:
    """build_activity_cube with an on-disk cache keyed by file + window + params."""
    path = Path(path)
    key = (f"{path.stem}_s{kwargs.get('start_s', 0.0):.0f}"
           f"_d{kwargs.get('max_seconds') or 'all'}"
           f"_b{kwargs.get('bin_s', BIN_S)}"
           f"_x{kwargs.get('stride', 1)}.npz")
    cache = Path(cache_dir) / key
    if cache.exists():
        if kwargs.get("verbose", True):
            print(f"  [mv] cache hit {cache}", flush=True)
        return ActivityCube.load(cache)
    cube = build_activity_cube(path, **kwargs)
    cube.save(cache)
    return cube
