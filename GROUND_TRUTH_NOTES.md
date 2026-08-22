# Ground-truth scrubbing notes

Each timestamp below was established by sweeping the **raw footage** at a fixed
interval and reading the frames, with no reference to `out/events.json`. Contact
sheets are in `out/demo/gt_*.png` so the reading can be checked.

| file | window | what was seen | confidence |
|---|---|---|---|
| 01 | 2-52 s | candidate seated at desk 20/21, hand raised to face across 11 consecutive 5 s samples; a staff member approaches at 57 s and she stands at 62 s | **inferred** - the posture and the staff response are clear, the object itself is not resolvable at this distance |
| 02 | 104-162 s | candidate reads a white sheet at 88-100 s, then holds a small dark object raised to her face across 13 consecutive 4 s samples, returning to paper at 164 s | **confirmed** |
| 04 | 4-18 s | foreground candidate rotated away from his own monitor toward the neighbour on his right, leaning across at 8 s and 14-18 s, 7 consecutive 2 s samples | **confirmed** |
| 05 | 11-101 s | 6-12 people clustered at the verification counter and lockers, thinning to 2-3 by 164 s | **confirmed** |

## Files with no timestamp, and why

* **03** - swept the full 282 s. The candidate handles an orange packet and
  paper; no phone is visible at any sample. The `cell phone` detections this
  file produces were verified earlier as a **computer mouse**
  (`out/demo/diag_03.png`). Recording a window here would be inventing one.
* **08** - swept the full 88 s at 3 s. Staff walk through at 7-25 s, candidates
  otherwise seated. No paper-take moment is identifiable. Consistent with
  `paper_pass` never having fired.
* **06 and 07** - **not scrubbed.** These are 2 h 08 m and 2 h 14 m. A coarse
  sweep of 07 at 150 s (53 frames) shows standing activity at roughly fifteen
  points; zooming the densest of them (7380-7610 s at 10 s) showed only staff
  moving between desks, no exchange. Locating a specific ten-second event in
  two hours by sampling is a needle-in-a-haystack search I cannot claim to have
  completed, and guessing a window would corrupt the very metric this file
  exists to enable. **These two need a human to scrub them** - which is also
  where the measurement is most valuable, since they hold 900 of the 921 events.
